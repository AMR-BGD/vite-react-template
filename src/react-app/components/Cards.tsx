import { useEffect, useRef, useState } from "react";
import type { Entry } from "../lib/m3u";
import { imageUrl } from "../lib/storage";

export type OpenFn = (entry: Entry, siblings: Entry[]) => void;

function hue(name: string) {
	let h = 0;
	for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
	return h;
}

export function Poster({ entry }: { entry: Entry }) {
	const [failed, setFailed] = useState(false);
	if (entry.logo && !failed)
		return (
			<img
				src={imageUrl(entry.logo)}
				alt=""
				loading="lazy"
				decoding="async"
				referrerPolicy="no-referrer"
				onError={() => setFailed(true)}
			/>
		);
	const h = hue(entry.name);
	return (
		<div
			className="poster-fallback"
			style={{ background: `linear-gradient(150deg, hsl(${h} 45% 30%), hsl(${(h + 50) % 360} 50% 14%))` }}
		>
			{entry.name}
		</div>
	);
}

interface CardProps {
	entry: Entry;
	pct?: number;
	label?: string;
	onClick: () => void;
}

export function Card({ entry, pct, label, onClick }: CardProps) {
	return (
		<button className={`card ${entry.kind === "live" ? "wide" : ""}`} onClick={onClick} title={entry.name}>
			<div className="card-img">
				<Poster entry={entry} />
				{entry.kind === "live" && <span className="badge">LIVE</span>}
				{pct !== undefined && (
					<div className="progress">
						<div style={{ width: `${pct}%` }} />
					</div>
				)}
			</div>
			<span className="card-title">{label ?? entry.name}</span>
		</button>
	);
}

const ROW_MAX = 24;

interface ListProps {
	title: string;
	entries: Entry[];
	onOpen: OpenFn;
	pct?: (e: Entry) => number | undefined;
	label?: (e: Entry) => string | undefined;
}

export function Row({ title, entries, onOpen, pct, label, onMore }: ListProps & { onMore?: () => void }) {
	const ref = useRef<HTMLDivElement>(null);
	if (!entries.length) return null;
	const scroll = (dir: number) =>
		ref.current?.scrollBy({ left: dir * ref.current.clientWidth * 0.85, behavior: "smooth" });
	return (
		<section className="row">
			<header>
				<h2>{title}</h2>
				{onMore && entries.length > 6 && (
					<button className="link" onClick={onMore}>
						Tout voir ({entries.length})
					</button>
				)}
			</header>
			<div className="row-wrap">
				<button className="row-arrow left" onClick={() => scroll(-1)} aria-label="Précédent">
					‹
				</button>
				<div className="row-track" ref={ref}>
					{entries.slice(0, ROW_MAX).map((e) => (
						<Card key={e.id} entry={e} pct={pct?.(e)} label={label?.(e)} onClick={() => onOpen(e, entries)} />
					))}
					{onMore && entries.length > ROW_MAX && (
						<button className={`card more ${entries[0].kind === "live" ? "wide" : ""}`} onClick={onMore}>
							<div className="card-img">
								<span>+{entries.length - ROW_MAX}</span>
							</div>
							<span className="card-title">Tout voir</span>
						</button>
					)}
				</div>
				<button className="row-arrow right" onClick={() => scroll(1)} aria-label="Suivant">
					›
				</button>
			</div>
		</section>
	);
}

/** Render lists progressively: returns how many items to show and a sentinel ref. */
export function useInfinite(step: number) {
	const [count, setCount] = useState(step);
	const ref = useRef<HTMLDivElement>(null);
	useEffect(() => {
		const el = ref.current;
		if (!el) return;
		const io = new IntersectionObserver(
			(e) => e[0].isIntersecting && setCount((c) => c + step),
			{ rootMargin: "800px" },
		);
		io.observe(el);
		return () => io.disconnect();
	}, [step, count]);
	return [count, ref] as const;
}

export function Grid({ title, entries, onOpen, pct, label, onBack }: ListProps & { onBack?: () => void }) {
	const [count, sentinel] = useInfinite(60);
	return (
		<section className="grid-view">
			<header>
				{onBack && (
					<button className="icon-btn" onClick={onBack} aria-label="Retour">
						←
					</button>
				)}
				<h2>{title}</h2>
				<span className="muted">{entries.length}</span>
			</header>
			{entries.length === 0 && <p className="empty">Rien à afficher ici pour le moment.</p>}
			<div className="grid">
				{entries.slice(0, count).map((e) => (
					<Card key={e.id} entry={e} pct={pct?.(e)} label={label?.(e)} onClick={() => onOpen(e, entries)} />
				))}
			</div>
			{count < entries.length && <div ref={sentinel} className="sentinel" />}
		</section>
	);
}
