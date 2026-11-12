export interface SavedPlaylist {
	text: string;
	source: string; // URL, or file name
	isUrl: boolean;
	at: number;
}

export interface Progress {
	t: number;
	d: number;
	at: number;
}

// --- IndexedDB (playlists can be tens of MB, too big for localStorage) ---

function db(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const req = indexedDB.open("iptv", 1);
		req.onupgradeneeded = () => req.result.createObjectStore("kv");
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
	});
}

async function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>) {
	const d = await db();
	return new Promise<T>((resolve, reject) => {
		const req = run(d.transaction("kv", mode).objectStore("kv"));
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
	});
}

export const loadPlaylist = () =>
	tx<SavedPlaylist | undefined>("readonly", (s) => s.get("playlist")).catch(() => undefined);
export const savePlaylist = (p: SavedPlaylist) =>
	tx("readwrite", (s) => s.put(p, "playlist")).catch(() => undefined);
export const clearPlaylist = () =>
	tx("readwrite", (s) => s.delete("playlist")).catch(() => undefined);

// --- localStorage (small things) ---

export function readJSON<T>(key: string, fallback: T): T {
	try {
		const raw = localStorage.getItem(key);
		return raw ? (JSON.parse(raw) as T) : fallback;
	} catch {
		return fallback;
	}
}

export function writeJSON(key: string, value: unknown) {
	try {
		localStorage.setItem(key, JSON.stringify(value));
	} catch {
		/* storage full or unavailable */
	}
}

// --- Network helpers ---

export const viaProxy = (url: string) => "/api/stream?url=" + encodeURIComponent(url);

/** True when the browser would block this URL as mixed content. */
export const isMixed = (url: string) =>
	location.protocol === "https:" && url.startsWith("http://");

export const imageUrl = (url: string) => (isMixed(url) ? viaProxy(url) : url);

export async function fetchPlaylist(url: string): Promise<string> {
	let message = "Impossible de charger la playlist";
	if (!url.startsWith(location.origin + "/")) try {
		const res = await fetch("/api/playlist?url=" + encodeURIComponent(url));
		if (res.ok) return await res.text();
		message = await res.text();
	} catch {
		/* fall through to a direct attempt */
	}
	try {
		const res = await fetch(url);
		if (res.ok) return await res.text();
	} catch {
		/* CORS or network */
	}
	throw new Error(message);
}
