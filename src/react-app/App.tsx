import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import "./App.css";
import { Grid, Poster, Row, useInfinite, type OpenFn } from "./components/Cards";
import Detail from "./components/Detail";
import Player from "./components/Player";
import Setup from "./components/Setup";
import { groupBy, parseM3U, type Entry, type Library, type Show, type Stream } from "./lib/m3u";
import {
	clearPlaylist,
	fetchPlaylist,
	loadPlaylist,
	readJSON,
	savePlaylist,
	writeJSON,
	type Progress,
} from "./lib/storage";

type Tab = "home" | "live" | "movies" | "series" | "list";
const TABS: [Tab, string][] = [
	["home", "Accueil"],
	["live", "TV"],
	["movies", "Films"],
	["series", "Séries"],
	["list", "Ma liste"],
];

interface Loaded {
	lib: Library;
	source: string;
	isUrl: boolean;
	featured: Entry | null;
}

function build(text: string, source: string, isUrl: boolean): Loaded {
	const lib = parseM3U(text);
	if (lib.byId.size === 0)
		throw new Error("Aucune chaîne trouvée : ce lien ne ressemble pas à une playlist M3U.");
	const pool = [...lib.movies.slice(0, 200), ...lib.shows.slice(0, 200)].filter((e) => e.logo);
	const featured = pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
	return { lib, source, isUrl, featured };
}

export default function App() {
	const [booting, setBooting] = useState(true);
	const [data, setData] = useState<Loaded | null>(null);
	const [tab, setTab] = useState<Tab>("home");
	const [group, setGroup] = useState<{ tab: Tab; name: string } | null>(null);
	const [query, setQuery] = useState("");
	const [detail, setDetail] = useState<Stream | Show | null>(null);
	const [playing, setPlaying] = useState<{ queue: Stream[]; index: number } | null>(null);
	const [favorites, setFavorites] = useState<string[]>(() => readJSON("favorites", []));
	const [progress, setProgress] = useState<Record<string, Progress>>(() => readJSON("progress", {}));
	const [refreshing, setRefreshing] = useState(false);
	const [notice, setNotice] = useState("");
	const search = useDeferredValue(query.trim().toLowerCase());

	useEffect(() => {
		loadPlaylist().then((saved) => {
			if (saved) {
				try {
					setData(build(saved.text, saved.source, saved.isUrl));
				} catch {
					/* corrupted cache: fall back to setup */
				}
			}
			setBooting(false);
		});
	}, []);

	const install = async (text: string, source: string, isUrl: boolean) => {
		const loaded = build(text, source, isUrl);
		await savePlaylist({ text, source, isUrl, at: Date.now() });
		setData(loaded);
	};
	const loadUrl = async (url: string) => install(await fetchPlaylist(url), url, true);
	const loadFile = async (file: File) => install(await file.text(), file.name, false);

	const refresh = async () => {
		if (!data?.isUrl) return;
		setRefreshing(true);
		try {
			await loadUrl(data.source);
			setNotice("Playlist mise à jour");
		} catch (e) {
			setNotice(e instanceof Error ? e.message : "Échec de la mise à jour");
		}
		setRefreshing(false);
		setTimeout(() => setNotice(""), 3000);
	};

	const reset = async () => {
		if (!confirm("Retirer cette playlist de l'appareil ?")) return;
		await clearPlaylist();
		setData(null);
		setTab("home");
		setGroup(null);
		setQuery("");
	};

	const toggleFavorite = (id: string) =>
		setFavorites((f) => {
			const next = f.includes(id) ? f.filter((x) => x !== id) : [id, ...f];
			writeJSON("favorites", next);
			return next;
		});

	const onProgress = useCallback((id: string, t: number, d: number) => {
		setProgress((p) => {
			const next = { ...p, [id]: { t, d, at: Date.now() } };
			const ids = Object.keys(next);
			if (ids.length > 300)
				ids.sort((a, b) => next[a].at - next[b].at)
					.slice(0, ids.length - 300)
					.forEach((k) => delete next[k]);
			writeJSON("progress", next);
			return next;
		});
	}, []);

	const closePlayer = useCallback(() => setPlaying(null), []);
	const closeDetail = useCallback(() => setDetail(null), []);

	const lib = data?.lib;

	const open: OpenFn = (entry, siblings) => {
		if (entry.kind === "live") {
			const queue = siblings.filter((s): s is Stream => s.kind === "live");
			setPlaying({ queue, index: Math.max(0, queue.indexOf(entry)) });
		} else if (entry.kind === "episode") {
			const show = lib?.byId.get(entry.showId!) as Show | undefined;
			const queue = show?.episodes ?? [entry];
			setPlaying({ queue, index: Math.max(0, queue.indexOf(entry)) });
		} else setDetail(entry);
	};

	const pct = (e: Entry) => {
		const p = progress[e.id];
		return p ? Math.min(100, (p.t / p.d) * 100) : undefined;
	};
	const label = (e: Entry) =>
		e.kind === "episode" ? `${(lib?.byId.get(e.showId!) as Show)?.name ?? e.name} · S${e.season} E${e.episode}` : undefined;

	const continueWatching = useMemo(() => {
		if (!lib) return [];
		return Object.entries(progress)
			.filter(([, p]) => p.t / p.d < 0.95)
			.sort((a, b) => b[1].at - a[1].at)
			.map(([id]) => lib.byId.get(id))
			.filter((e): e is Entry => !!e)
			.slice(0, 20);
	}, [lib, progress]);

	const myList = useMemo(
		() => (lib ? favorites.map((id) => lib.byId.get(id)).filter((e): e is Entry => !!e) : []),
		[lib, favorites],
	);

	const groups = useMemo(
		() => ({
			live: lib ? groupBy<Entry>(lib.live) : [],
			movies: lib ? groupBy<Entry>(lib.movies) : [],
			series: lib ? groupBy<Entry>(lib.shows) : [],
		}),
		[lib],
	);

	const results = useMemo(() => {
		if (!lib || !search) return [];
		const out: Entry[] = [];
		for (const list of [lib.shows, lib.movies, lib.live] as Entry[][])
			for (const e of list) {
				if (e.name.toLowerCase().includes(search)) out.push(e);
				if (out.length >= 300) return out;
			}
		return out;
	}, [lib, search]);

	if (booting) return <div className="spinner" />;
	if (!data || !lib) return <Setup onUrl={loadUrl} onFile={loadFile} />;

	const go = (t: Tab) => {
		setTab(t);
		setGroup(null);
		setQuery("");
		window.scrollTo({ top: 0 });
	};
	const showGroup = (t: Tab, name: string) => {
		setGroup({ tab: t, name });
		setTab(t);
		window.scrollTo({ top: 0 });
	};
	const listProps = { onOpen: open, pct, label };

	let page;
	if (search) {
		page = <Grid key={search} title={`Résultats pour « ${query.trim()} »`} entries={results} {...listProps} />;
	} else if (group && group.tab === tab && tab !== "home" && tab !== "list") {
		const entries = groups[tab].find(([g]) => g === group.name)?.[1] ?? [];
		page = <Grid key={group.name} title={group.name} entries={entries} onBack={() => setGroup(null)} {...listProps} />;
	} else if (tab === "list") {
		page = <Grid title="Ma liste" entries={myList} {...listProps} />;
	} else if (tab === "home") {
		const f = data.featured;
		const mixed: [Tab, string, Entry[]][] = [];
		for (let i = 0; i < 4; i++)
			for (const t of ["movies", "series", "live"] as const)
				if (groups[t][i]) mixed.push([t, ...groups[t][i]]);
		page = (
			<>
				{f && (
					<section className="hero">
						<div className="hero-bg">
							<Poster entry={f} />
						</div>
						<div className="hero-content">
							<span className="tag">{f.kind === "series" ? "Série" : "Film"} · {f.group}</span>
							<h1>{f.name}</h1>
							<div className="actions">
								<button className="btn primary" onClick={() => open(f, [f])}>
									▶ Lecture
								</button>
								<button className="btn" onClick={() => toggleFavorite(f.id)}>
									{favorites.includes(f.id) ? "✓ Dans ma liste" : "+ Ma liste"}
								</button>
							</div>
						</div>
						<div className="hero-poster">
							<Poster entry={f} />
						</div>
					</section>
				)}
				<div className={f ? "rows overlap" : "rows"}>
					<Row title="Reprendre la lecture" entries={continueWatching} {...listProps} />
					<Row title="Ma liste" entries={myList} onMore={() => go("list")} {...listProps} />
					{mixed.map(([t, name, entries]) => (
						<Row key={t + name} title={name} entries={entries} onMore={() => showGroup(t, name)} {...listProps} />
					))}
				</div>
			</>
		);
	} else {
		page = (
			<Browse
				key={tab}
				title={TABS.find(([t]) => t === tab)![1]}
				groups={groups[tab]}
				onGroup={(name) => showGroup(tab, name)}
				listProps={listProps}
			/>
		);
	}

	return (
		<>
			<header className="topbar">
				<button className="logo" onClick={() => go("home")}>
					Lumio
				</button>
				<nav>
					{TABS.map(([t, name]) => (
						<button key={t} className={t === tab && !search ? "on" : ""} onClick={() => go(t)}>
							{name}
						</button>
					))}
				</nav>
				<input
					className="search"
					type="search"
					placeholder="Rechercher…"
					value={query}
					onChange={(e) => setQuery(e.target.value)}
				/>
				{data.isUrl && (
					<button className="icon-btn" onClick={refresh} disabled={refreshing} title="Actualiser la playlist">
						<span className={refreshing ? "spin" : ""}>⟳</span>
					</button>
				)}
				<button className="icon-btn" onClick={reset} title="Changer de playlist">
					⏏
				</button>
			</header>

			<main className={tab === "home" && !search && data.featured ? "page home" : "page"}>{page}</main>

			{notice && <div className="toast">{notice}</div>}

			{detail && (
				<Detail
					key={detail.id}
					entry={detail}
					progress={progress}
					favorite={favorites.includes(detail.id)}
					active={!playing}
					onFavorite={() => toggleFavorite(detail.id)}
					onPlay={(queue, index) => setPlaying({ queue, index })}
					onClose={closeDetail}
				/>
			)}

			{playing && (
				<Player
					queue={playing.queue}
					index={playing.index}
					resume={progress[playing.queue[playing.index].id]}
					onIndex={(index) => setPlaying({ queue: playing.queue, index })}
					onProgress={onProgress}
					onClose={closePlayer}
				/>
			)}
		</>
	);
}

interface BrowseProps {
	title: string;
	groups: [string, Entry[]][];
	onGroup: (name: string) => void;
	listProps: { onOpen: OpenFn; pct: (e: Entry) => number | undefined; label: (e: Entry) => string | undefined };
}

function Browse({ title, groups, onGroup, listProps }: BrowseProps) {
	const [count, sentinel] = useInfinite(6);
	return (
		<div className="rows">
			<header className="browse-head">
				<h1>{title}</h1>
				{groups.length > 1 && (
					<select value="" onChange={(e) => e.target.value && onGroup(e.target.value)}>
						<option value="">Catégories ({groups.length})</option>
						{groups.map(([name, list]) => (
							<option key={name} value={name}>
								{name} ({list.length})
							</option>
						))}
					</select>
				)}
			</header>
			{groups.length === 0 && <p className="empty">Cette playlist ne contient rien dans cette rubrique.</p>}
			{groups.slice(0, count).map(([name, entries]) => (
				<Row key={name} title={name} entries={entries} onMore={() => onGroup(name)} {...listProps} />
			))}
			{count < groups.length && <div ref={sentinel} className="sentinel" />}
		</div>
	);
}
