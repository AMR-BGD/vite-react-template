// Bridge to the Android TV shell (android/), which plays streams with ExoPlayer.
import type { Stream } from "./m3u";
import type { Progress } from "./storage";

declare global {
	interface Window {
		AndroidTV?: { play(json: string): void };
		/** Called by the shell with progress of what was just watched. */
		__nativeProgress?: (list: { id: string; t: number; d: number }[]) => void;
		/** Called by the shell on the remote's Back key; false = nothing left to close. */
		__back?: () => boolean;
	}
}

export const isNative = () => !!window.AndroidTV;

const WINDOW = 100; // items kept on each side of the current one

export function playNative(queue: Stream[], index: number, resume?: Progress) {
	const tv = window.AndroidTV;
	if (!tv) return false;
	const start = Math.max(0, index - WINDOW);
	tv.play(
		JSON.stringify({
			index: index - start,
			positionMs: resume && resume.t < resume.d - 15 ? Math.round(resume.t * 1000) : 0,
			items: queue.slice(start, index + WINDOW + 1).map((s) => ({
				id: s.id,
				title: s.name,
				subtitle: s.group,
				url: s.url,
				live: s.kind === "live",
			})),
		}),
	);
	return true;
}
