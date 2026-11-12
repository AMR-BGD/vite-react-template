# Lumio — lecteur IPTV

Application web façon plateforme de streaming pour lire une playlist IPTV (lien M3U) :
chaînes TV en direct, films et séries.

Construite avec React + Vite, et un Worker Cloudflare (Hono) qui sert de relais.

## Fonctionnalités

- Chargement d'une playlist par **lien M3U** ou **fichier .m3u** (mémorisée sur l'appareil)
- Tri automatique en **TV / Films / Séries** (séries regroupées par saisons et épisodes)
- Accueil avec mise en avant, rangées par catégorie, recherche, « Ma liste »
- Lecteur : HLS (`.m3u8`), MPEG-TS (`.ts`), MP4 ; zapping chaîne +/−, épisode suivant automatique
- Reprise de lecture pour les films et les épisodes
- Interface adaptée au mobile

## Android TV

Le dossier `android/` contient l'application Android TV : l'interface web est embarquée
dans l'APK, la lecture est confiée au lecteur natif (ExoPlayer), qui lit aussi les MKV,
l'audio AC3 et les flux `.ts`. Aucun serveur n'est nécessaire.

```bash
npm run build                          # interface web
cd android && ./gradlew assembleRelease
# → android/app/build/outputs/apk/release/app-release.apk
```

Il faut le SDK Android (`ANDROID_HOME`) et Java 17. L'APK est aussi construit par
GitHub Actions (workflow « Android TV APK », onglet Actions → artefact `lumio-tv`).

Installation sur la TV : activer « Sources inconnues », puis installer l'APK avec
l'appli *Downloader*, une clé USB, ou `adb install app-release.apk`.

Télécommande : flèches pour naviguer, OK pour ouvrir, Retour pour fermer. Pendant une
chaîne en direct, Haut / Bas (ou CH+ / CH−) changent de chaîne.

## Développement

```bash
npm install
npm run dev      # http://localhost:5173
npm run build
npm run deploy   # déploiement sur Cloudflare Workers
```

## Le relais (`src/worker/index.ts`)

- `GET /api/playlist?url=…` : télécharge la playlist (contourne le CORS).
- `GET /api/stream?url=…` : relaie un flux ou une image quand le navigateur ne peut pas y
  accéder directement (CORS, flux `http://` sur une page `https://`). Les manifestes HLS sont
  réécrits pour que les segments passent aussi par le relais.

Le relais n'accepte que les appels venant du site lui-même, mais tout le trafic vidéo relayé
transite par votre Worker : surveillez votre consommation si vous déployez publiquement.

## Limites

Les navigateurs ne décodent pas tous les formats (MKV, AVI, audio AC3/DTS…). Dans ce cas le
lecteur propose de copier le lien pour l'ouvrir dans VLC.

N'utilisez que des playlists dont vous avez les droits d'accès.
