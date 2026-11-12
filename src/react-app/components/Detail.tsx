import { useEffect, useMemo, useState } from "react";
import type { Show, Stream } from "../lib/m3u";
import type { Progress } from "../lib/storage";
import { Poster } from "./Cards";

interface Props {
	entry: Stream | Show;
	progress: Record<string, Progress>;
	favorite: boolean;
	/** False while the player is on top: Escape then belongs to the player. */
	active: boolean;
	onFavorite: () => void;
	onPlay: (queue: Stream[], index: number) => void;
	onClose: () => void;
}

const pct = (p?: Progress) => (p ? Math.min(100, (p.t / p.d) * 100) : 0);

export default function Detail({ entry, progress, favorite, active, onFavorite, onPlay, onClose }: Props) {
	const show = entry.kind === "series" ? entry : null;
	const seasons = useMemo(
		() => (show ? [...new Set(show.episodes.map((e) => e.season!))] : []),
		[show],
	);

	// Resume the most recently watched episode, otherwise start at the first one.
	const resumeIndex = useMemo(() => {
		if (!show) return 0;
		let best = 0;
		let bestAt = 0;
		show.episodes.forEach((e, i) => {
			const p = progress[e.id];
			if (p && p.at > bestAt) {
				bestAt = p.at;
				best = p.t / p.d > 0.95 && i < show.episodes.length - 1 ? i + 1 : i;
			}
		});
		return best;
	}, [show, progress]);

	const [season, setSeason] = useState(() => show?.episodes[resumeIndex]?.season ?? seasons[0]);

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => active && e.key === "Escape" && onClose();
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [onClose, active]);

	const started = show ? !!progress[show.episodes[resumeIndex]?.id] : !!progress[entry.id];
	const play = () => (show ? onPlay(show.episodes, resumeIndex) : onPlay([entry as Stream], 0));
	const next = show?.episodes[resumeIndex];

	return (
		<div className="modal-backdrop" onClick={onClose}>
			<div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
				<button className="icon-btn modal-close" onClick={onClose} aria-label="Fermer">
					✕
				</button>
				<div className="modal-hero">
					<div className="modal-bg">
						<Poster entry={entry} />
					</div>
					<div className="modal-poster">
						<Poster entry={entry} />
					</div>
					<div className="modal-info">
						<span className="tag">{show ? "Série" : "Film"} · {entry.group}</span>
						<h2>{entry.name}</h2>
						{show && (
							<p className="muted">
								{seasons.length} saison{seasons.length > 1 ? "s" : ""} · {show.episodes.length} épisode
								{show.episodes.length > 1 ? "s" : ""}
							</p>
						)}
						<div className="actions">
							<button className="btn primary" onClick={play}>
								▶ {started ? "Reprendre" : "Lecture"}
								{show && next ? ` S${next.season} E${next.episode}` : ""}
							</button>
							<button className="btn" onClick={onFavorite}>
								{favorite ? "✓ Dans ma liste" : "+ Ma liste"}
							</button>
						</div>
						{!show && progress[entry.id] && (
							<div className="progress inline">
								<div style={{ width: `${pct(progress[entry.id])}%` }} />
							</div>
						)}
					</div>
				</div>

				{show && (
					<div className="episodes">
						{seasons.length > 1 && (
							<div className="chips">
								{seasons.map((s) => (
									<button key={s} className={`chip ${s === season ? "on" : ""}`} onClick={() => setSeason(s)}>
										Saison {s}
									</button>
								))}
							</div>
						)}
						<ul>
							{show.episodes.map((e, i) =>
								e.season !== season ? null : (
									<li key={e.id}>
										<button onClick={() => onPlay(show.episodes, i)}>
											<span className="ep-num">{e.episode}</span>
											<span className="ep-name">
												{e.name}
												{progress[e.id] && (
													<span className="progress inline">
														<span style={{ width: `${pct(progress[e.id])}%` }} />
													</span>
												)}
											</span>
											<span className="ep-play">▶</span>
										</button>
									</li>
								),
							)}
						</ul>
					</div>
				)}
			</div>
		</div>
	);
}
