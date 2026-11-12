interface Base {
	id: string;
	name: string;
	logo: string;
	group: string;
}

export interface Stream extends Base {
	kind: "live" | "movie" | "episode";
	url: string;
	showId?: string;
	season?: number;
	episode?: number;
}

export interface Show extends Base {
	kind: "series";
	episodes: Stream[];
}

export type Entry = Stream | Show;

export interface Library {
	live: Stream[];
	movies: Stream[];
	shows: Show[];
	byId: Map<string, Entry>;
}

const VOD_EXT = /\.(mp4|mkv|avi|mov|wmv|flv|webm|m4v|mpg|mpeg)$/i;
const EPISODE = /^(.*?)[\s._|-]*\bS(\d{1,2})[\s._-]*E(\d{1,4})\b/i;
const EPISODE_X = /^(.*?)[\s._|-]+(\d{1,2})x(\d{1,4})\b/i;
const ATTR = /([\w-]+)="([^"]*)"/g;

export function parseM3U(text: string): Library {
	const lib: Library = { live: [], movies: [], shows: [], byId: new Map() };
	const shows = new Map<string, Show>();
	let attrs: Record<string, string> = {};
	let name = "";
	let extGroup = "";
	let pending = false;

	let pos = 0;
	const len = text.length;
	while (pos < len) {
		let end = text.indexOf("\n", pos);
		if (end === -1) end = len;
		const line = text.slice(pos, end).trim();
		pos = end + 1;
		if (!line) continue;

		if (line.startsWith("#EXTINF")) {
			attrs = {};
			for (const m of line.matchAll(ATTR)) attrs[m[1].toLowerCase()] = m[2];
			const comma = line.indexOf(",", Math.max(line.lastIndexOf('"'), 0));
			name = comma >= 0 ? line.slice(comma + 1).trim() : "";
			pending = true;
			continue;
		}
		if (line.startsWith("#EXTGRP:")) {
			extGroup = line.slice(8).trim();
			continue;
		}
		if (line.startsWith("#") || !pending) continue;
		pending = false;

		const url = line;
		const title = name || attrs["tvg-name"] || "Sans titre";
		const group = attrs["group-title"] || extGroup || "Autres";
		const logo = attrs["tvg-logo"] || "";
		extGroup = "";

		let id = url;
		for (let n = 2; lib.byId.has(id); n++) id = `${url}#${n}`;

		const path = url.split("?")[0];
		const isVod = VOD_EXT.test(path);
		const inSeries = /\/series\//i.test(path);
		const ep = inSeries || isVod ? (EPISODE.exec(title) ?? EPISODE_X.exec(title)) : null;

		if (inSeries || ep) {
			const showName = (ep?.[1] || title).trim() || title;
			const showId = `series:${group}:${showName.toLowerCase()}`;
			let show = shows.get(showId);
			if (!show) {
				show = { kind: "series", id: showId, name: showName, logo, group, episodes: [] };
				shows.set(showId, show);
				lib.shows.push(show);
				lib.byId.set(showId, show);
			}
			if (!show.logo) show.logo = logo;
			const s: Stream = {
				kind: "episode",
				id,
				name: title,
				logo,
				group,
				url,
				showId,
				season: ep ? Number(ep[2]) : 1,
				episode: ep ? Number(ep[3]) : show.episodes.length + 1,
			};
			show.episodes.push(s);
			lib.byId.set(id, s);
		} else {
			const s: Stream = {
				kind: isVod || /\/movie\//i.test(path) ? "movie" : "live",
				id,
				name: title,
				logo,
				group,
				url,
			};
			(s.kind === "movie" ? lib.movies : lib.live).push(s);
			lib.byId.set(id, s);
		}
	}

	for (const show of lib.shows)
		show.episodes.sort((a, b) => a.season! - b.season! || a.episode! - b.episode!);
	return lib;
}

/** Group entries by category, keeping the playlist order. */
export function groupBy<T extends Entry>(entries: T[]): [string, T[]][] {
	const map = new Map<string, T[]>();
	for (const e of entries) {
		const list = map.get(e.group);
		if (list) list.push(e);
		else map.set(e.group, [e]);
	}
	return [...map];
}
