import { useEffect, useRef, useState } from "react";
import type { Stream } from "../lib/m3u";
import { isMixed, viaProxy, type Progress } from "../lib/storage";

type Engine = "native" | "hls" | "mpegts";
interface Attempt {
	engine: Engine;
	url: string;
}

function attemptsFor(s: Stream): Attempt[] {
	const path = s.url.split("?")[0].toLowerCase();
	let engines: Engine[];
	if (path.endsWith(".m3u8")) engines = ["hls"];
	else if (path.endsWith(".ts")) engines = ["mpegts", "hls"];
	else if (s.kind === "live") engines = ["hls", "mpegts", "native"];
	else engines = ["native"];

	const list: Attempt[] = [];
	if (!isMixed(s.url)) for (const engine of engines) list.push({ engine, url: s.url });
	const proxy = new URL(viaProxy(s.url), location.href).href;
	for (const engine of engines) list.push({ engine, url: proxy });
	return list;
}

/** Start one playback attempt. Calls `fail` once if it can't play. Returns a cleanup. */
function start(video: HTMLVideoElement, a: Attempt, live: boolean, fail: () => void) {
	let dead = false;
	let destroy = () => {};
	const giveUp = () => {
		if (dead) return;
		dead = true;
		fail();
	};
	const timer = setTimeout(giveUp, 20000);
	const onReady = () => clearTimeout(timer);
	video.addEventListener("loadeddata", onReady);

	(async () => {
		if (a.engine === "hls") {
			const { default: Hls } = await import("hls.js");
			if (dead) return;
			if (Hls.isSupported()) {
				const hls = new Hls();
				destroy = () => hls.destroy();
				hls.on(Hls.Events.ERROR, (_, data) => data.fatal && giveUp());
				hls.loadSource(a.url);
				hls.attachMedia(video);
				return;
			}
			// Safari plays HLS natively
		} else if (a.engine === "mpegts") {
			const { default: mpegts } = await import("mpegts.js");
			if (dead) return;
			if (!mpegts.isSupported()) return giveUp();
			const player = mpegts.createPlayer({ type: "mpegts", isLive: live, url: a.url });
			destroy = () => player.destroy();
			player.on(mpegts.Events.ERROR, giveUp);
			player.attachMediaElement(video);
			player.load();
			return;
		}
		video.addEventListener("error", giveUp);
		video.src = a.url;
	})().catch(giveUp);

	return () => {
		dead = true;
		clearTimeout(timer);
		video.removeEventListener("loadeddata", onReady);
		video.removeEventListener("error", giveUp);
		destroy();
		video.removeAttribute("src");
		video.load();
	};
}

interface Props {
	queue: Stream[];
	index: number;
	resume?: Progress;
	onIndex: (i: number) => void;
	onProgress: (id: string, t: number, d: number) => void;
	onClose: () => void;
}

export default function Player(props: Props) {
	// Remount for each stream so state (loading / error) starts fresh.
	return <PlayerView key={props.queue[props.index].id} {...props} />;
}

function PlayerView({ queue, index, resume, onIndex, onProgress, onClose }: Props) {
	const stream = queue[index];
	const live = stream.kind === "live";
	const videoRef = useRef<HTMLVideoElement>(null);
	const [status, setStatus] = useState<"loading" | "playing" | "error">("loading");
	const [retry, setRetry] = useState(0);
	const [idle, setIdle] = useState(false);
	const [copied, setCopied] = useState(false);
	const resumeAt = useRef(resume && resume.t < resume.d - 15 ? resume.t : 0);
	const report = useRef(onProgress);
	useEffect(() => {
		report.current = onProgress;
	});

	useEffect(() => {
		const video = videoRef.current!;
		const attempts = attemptsFor(stream);
		let i = 0;
		let cleanup = () => {};
		let stopped = false;
		const next = () => {
			cleanup();
			cleanup = () => {};
			if (stopped) return;
			if (i >= attempts.length) return setStatus("error");
			cleanup = start(video, attempts[i++], live, next);
		};
		next();

		let lastSave = 0;
		const save = () => {
			if (!live && video.duration > 60 && video.currentTime > 5)
				report.current(stream.id, video.currentTime, video.duration);
		};
		const onMeta = () => {
			if (resumeAt.current) video.currentTime = resumeAt.current;
		};
		const onData = () => {
			setStatus("playing");
			video.play().catch(() => {});
		};
		const onTime = () => {
			resumeAt.current = video.currentTime;
			if (Date.now() - lastSave > 5000) {
				lastSave = Date.now();
				save();
			}
		};
		video.addEventListener("loadedmetadata", onMeta);
		video.addEventListener("loadeddata", onData);
		video.addEventListener("timeupdate", onTime);
		return () => {
			stopped = true;
			save();
			video.removeEventListener("loadedmetadata", onMeta);
			video.removeEventListener("loadeddata", onData);
			video.removeEventListener("timeupdate", onTime);
			cleanup();
		};
	}, [stream, live, retry]);

	// Auto-hide the top bar
	useEffect(() => {
		let timer = setTimeout(() => setIdle(true), 3500);
		const wake = () => {
			setIdle(false);
			clearTimeout(timer);
			timer = setTimeout(() => setIdle(true), 3500);
		};
		window.addEventListener("pointermove", wake);
		window.addEventListener("pointerdown", wake);
		window.addEventListener("keydown", wake);
		return () => {
			clearTimeout(timer);
			window.removeEventListener("pointermove", wake);
			window.removeEventListener("pointerdown", wake);
			window.removeEventListener("keydown", wake);
		};
	}, []);

	const hasPrev = index > 0;
	const hasNext = index < queue.length - 1;
	const multi = queue.length > 1;

	return (
		<div className={`player ${idle && status === "playing" ? "idle" : ""}`}>
			<video
				ref={videoRef}
				controls
				playsInline
				autoPlay
				onEnded={() => !live && hasNext && onIndex(index + 1)}
			/>

			<div className="player-bar">
				<button className="icon-btn" onClick={onClose} aria-label="Retour" data-autofocus>
					←
				</button>
				<div className="player-title">
					<strong>{stream.name}</strong>
					<span>
						{live && <i className="live-dot" />}
						{live ? "En direct · " : ""}
						{stream.group}
					</span>
				</div>
				{multi && (
					<div className="player-nav">
						<button className="icon-btn" disabled={!hasPrev} onClick={() => onIndex(index - 1)}>
							{live ? "Chaîne −" : "◀ Précédent"}
						</button>
						<button className="icon-btn" disabled={!hasNext} onClick={() => onIndex(index + 1)}>
							{live ? "Chaîne +" : "Suivant ▶"}
						</button>
					</div>
				)}
			</div>

			{status === "loading" && <div className="spinner" />}

			{status === "error" && (
				<div className="player-error">
					<h2>Impossible de lire ce flux</h2>
					<p>
						Le flux est peut-être hors ligne, ou dans un format que le navigateur ne sait pas
						décoder (MKV, AVI, audio AC3…). Vous pouvez copier le lien et l'ouvrir dans VLC.
					</p>
					<div className="actions">
						<button
							className="btn primary"
							onClick={() => {
								setStatus("loading");
								setRetry((r) => r + 1);
							}}
						>
							Réessayer
						</button>
						<button
							className="btn"
							onClick={() =>
								navigator.clipboard?.writeText(stream.url).then(() => setCopied(true))
							}
						>
							{copied ? "Lien copié ✓" : "Copier le lien"}
						</button>
						<button className="btn" onClick={onClose}>
							Fermer
						</button>
					</div>
				</div>
			)}
		</div>
	);
}
