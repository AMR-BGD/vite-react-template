import { useState } from "react";

interface Props {
	onUrl: (url: string) => Promise<void>;
	onFile: (file: File) => Promise<void>;
}

export default function Setup({ onUrl, onFile }: Props) {
	const [url, setUrl] = useState("");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState("");

	const run = async (task: () => Promise<void>) => {
		setBusy(true);
		setError("");
		try {
			await task();
		} catch (e) {
			setError(e instanceof Error ? e.message : "Une erreur est survenue");
			setBusy(false);
		}
	};

	return (
		<main className="setup">
			<div className="setup-card">
				<div className="logo big">Lumio</div>
				<h1>Vos chaînes, films et séries au même endroit</h1>
				<p className="muted">
					Collez le lien M3U fourni par votre opérateur IPTV. La playlist reste enregistrée sur cet
					appareil uniquement.
				</p>
				<form
					onSubmit={(e) => {
						e.preventDefault();
						if (url.trim()) run(() => onUrl(url.trim()));
					}}
				>
					<input
						type="url"
						required
						placeholder="https://exemple.com/get.php?username=…&type=m3u_plus"
						value={url}
						onChange={(e) => setUrl(e.target.value)}
						disabled={busy}
						autoFocus
					/>
					<button className="btn primary" disabled={busy}>
						{busy ? "Chargement…" : "Charger la playlist"}
					</button>
				</form>
				{error && <p className="error">{error}</p>}
				<div className="setup-alt">
					<label
						className={`btn ${busy ? "disabled" : ""}`}
						tabIndex={0}
						onKeyDown={(e) => e.key === "Enter" && e.currentTarget.click()}
					>
						Importer un fichier .m3u
						<input
							type="file"
							accept=".m3u,.m3u8,.txt,audio/x-mpegurl"
							hidden
							disabled={busy}
							onChange={(e) => {
								const f = e.target.files?.[0];
								if (f) run(() => onFile(f));
							}}
						/>
					</label>
				</div>
			</div>
		</main>
	);
}
