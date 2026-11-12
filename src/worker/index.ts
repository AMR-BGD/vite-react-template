import { Hono, type Context } from "hono";

const app = new Hono<{ Bindings: Env }>();

const PRIVATE_HOST =
	/^(localhost|.*\.local|.*\.internal|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.|\[)/i;

/** Validate the `url` query param; only public http(s) targets, same-site callers. */
function target(c: Context): URL | null {
	if (c.req.header("sec-fetch-site") === "cross-site") return null;
	try {
		const u = new URL(c.req.query("url") ?? "");
		if (u.protocol !== "http:" && u.protocol !== "https:") return null;
		if (PRIVATE_HOST.test(u.hostname)) return null;
		return u;
	} catch {
		return null;
	}
}

function upstream(c: Context, url: URL) {
	const headers = new Headers();
	const range = c.req.header("range");
	if (range) headers.set("range", range);
	const ua = c.req.header("user-agent");
	if (ua) headers.set("user-agent", ua);
	return fetch(url.href, { headers, redirect: "follow" });
}

const proxied = (u: string, base: string) =>
	"/api/stream?url=" + encodeURIComponent(new URL(u, base).href);

/** Rewrite every URI of an HLS manifest so segments also go through the proxy. */
function rewriteManifest(text: string, base: string) {
	return text
		.split("\n")
		.map((line) => {
			const t = line.trim();
			if (!t) return line;
			if (t.startsWith("#"))
				return t.replace(/URI="([^"]+)"/g, (_, u) => `URI="${proxied(u, base)}"`);
			return proxied(t, base);
		})
		.join("\n");
}

// Fetch an M3U playlist (browsers can't because of CORS).
app.get("/api/playlist", async (c) => {
	const url = target(c);
	if (!url) return c.text("URL invalide", 400);
	try {
		const res = await upstream(c, url);
		if (!res.ok) return c.text(`Le serveur a répondu ${res.status}`, 502);
		return new Response(res.body, {
			headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
		});
	} catch {
		return c.text("Impossible de joindre le serveur", 502);
	}
});

// Relay a stream / image (fixes CORS and http streams on an https page).
app.get("/api/stream", async (c) => {
	const url = target(c);
	if (!url) return c.text("URL invalide", 400);
	let res: Response;
	try {
		res = await upstream(c, url);
	} catch {
		return c.text("Impossible de joindre le serveur", 502);
	}
	const type = res.headers.get("content-type") ?? "";
	const finalUrl = res.url || url.href;
	if (res.ok && (/mpegurl/i.test(type) || /\.m3u8$/i.test(new URL(finalUrl).pathname))) {
		return new Response(rewriteManifest(await res.text(), finalUrl), {
			headers: { "content-type": "application/vnd.apple.mpegurl", "cache-control": "no-store" },
		});
	}
	const headers = new Headers();
	for (const h of ["content-type", "content-length", "content-range", "accept-ranges", "cache-control"]) {
		const v = res.headers.get(h);
		if (v) headers.set(h, v);
	}
	return new Response(res.body, { status: res.status, headers });
});

export default app;
