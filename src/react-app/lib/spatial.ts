// D-pad / arrow-key navigation for TV remotes.

type Dir = "up" | "down" | "left" | "right";
const KEYS: Record<string, Dir> = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right" };
const FOCUSABLE =
	'button:not(:disabled):not([tabindex="-1"]), input:not([type="file"]):not(:disabled), select, [tabindex="0"]';

/** Only the top-most layer is navigable. */
const scope = (): HTMLElement =>
	document.querySelector<HTMLElement>(".player") ??
	document.querySelector<HTMLElement>(".modal-backdrop") ??
	document.body;

const candidates = (root: HTMLElement) =>
	[...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.getClientRects().length > 0);

function focus(el: HTMLElement) {
	el.focus({ preventScroll: true });
	el.scrollIntoView({ block: "center", inline: "nearest" });
}

/** Focus a sensible default, unless something in the current layer already has focus. */
export function focusFirst() {
	const root = scope();
	const cur = document.activeElement;
	if (cur && cur !== document.body && root.contains(cur)) return;
	const el =
		root.querySelector<HTMLElement>("[data-autofocus]") ??
		candidates(root.querySelector<HTMLElement>(".page") ?? root)[0] ??
		candidates(root)[0];
	if (el) focus(el);
}

function gap(a1: number, a2: number, b1: number, b2: number) {
	return Math.max(0, Math.max(a1, b1) - Math.min(a2, b2));
}

function move(dir: Dir, from: HTMLElement, root: HTMLElement) {
	const a = from.getBoundingClientRect();
	const horizontal = dir === "left" || dir === "right";
	const found: { el: HTMLElement; primary: number; cross: number }[] = [];
	for (const el of candidates(root)) {
		if (el === from) continue;
		const b = el.getBoundingClientRect();
		let primary: number;
		if (dir === "right") primary = b.left - a.right;
		else if (dir === "left") primary = a.left - b.right;
		else if (dir === "down") primary = b.top - a.bottom;
		else primary = a.top - b.bottom;
		if (primary < -4) continue;
		if (horizontal) {
			// stay on the same line
			if (gap(a.top, a.bottom, b.top, b.bottom) > 0) continue;
			found.push({ el, primary, cross: 0 });
		} else {
			// ignore items scrolled out of a row
			if (b.right <= 0 || b.left >= innerWidth) continue;
			const centers = Math.abs(a.left + a.width / 2 - (b.left + b.width / 2));
			found.push({ el, primary, cross: gap(a.left, a.right, b.left, b.right) + centers * 0.01 });
		}
	}
	if (!found.length) return;
	// Go to the nearest line, then to the closest item on that line.
	const nearest = Math.min(...found.map((f) => f.primary));
	const line = found.filter((f) => f.primary <= nearest + 24);
	line.sort((x, y) => x.cross - y.cross || x.primary - y.primary);
	focus(line[0].el);
}

export function onArrowKey(e: KeyboardEvent) {
	const dir = KEYS[e.key];
	if (!dir || e.altKey || e.ctrlKey || e.metaKey) return;
	const root = scope();
	const cur = document.activeElement as HTMLElement | null;
	if (!cur || cur === document.body || !root.contains(cur)) {
		e.preventDefault();
		return focusFirst();
	}
	if (cur.tagName === "VIDEO") return; // native seek / volume
	// keep cursor movement inside text fields
	if (cur.tagName === "INPUT" && (dir === "left" || dir === "right")) return;
	e.preventDefault();
	move(dir, cur, root);
}
