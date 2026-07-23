# @animeunion/worker-desktop — App desktop Windows (GPU)

App Electron con GUI che incorpora il worker Neural Export (`@animeunion/worker`), fa il probe
ffmpeg/GPU, e — dai task successivi — si abbina automaticamente al NAS (Task 5) e si distribuisce come
installer con auto-update (Task 6). Sostituisce il setup manuale (monorepo + Node + ffmpeg a mano +
NSSM + copia/incolla di URL e token).

## Struttura

- `src/shared/` — logica pura e testabile (stato UI, contratto IPC, menu del tray, config). Nessuna
  dipendenza da Electron: verificata con `tsconfig.json` + Vitest.
- `src/main/` — processo main Electron: lifecycle del worker, probe GPU, tray, IPC, autostart.
- `src/renderer/` — GUI React + Tailwind.

## Sviluppo (su Windows, con GPU)

```powershell
npm install                 # dalla root del monorepo
npm run dev -w @animeunion/worker-desktop
```

Per usare uno specifico ffmpeg in dev: imposta `WORKER_FFMPEG_PATH`. Senza binario imbarcato, l'app
ricade sull'ffmpeg del PATH (verifica con `npm run doctor -w @animeunion/worker`).

## Verifica logica pura (multipiattaforma)

```powershell
npx tsc -p apps/worker-desktop/tsconfig.json
npx vitest run apps/worker-desktop/src/shared
```

## Build / packaging

```powershell
npm run build -w @animeunion/worker-desktop   # vite (renderer) + esbuild (main/preload)
npm run dist  -w @animeunion/worker-desktop   # installer NSIS locale (non pubblica)
npm run release -w @animeunion/worker-desktop # build + pubblica su GitHub Releases (CI)
```

Prima del packaging:

- Posiziona una build ffmpeg con `libplacebo`+Vulkan in `vendor/ffmpeg/` (es. la release BtbN GPL
  indicata in `apps/worker/README.md`). Viene imbarcata in `resources/ffmpeg/`. **Includi anche i
  file di licenza** dell'ffmpeg (LICENSE/README, GPL): finiscono in `resources/ffmpeg/` con il resto.
- Le icone sono già pronte in `assets/` (`icon.png`, `tray.png`), rigenerabili con
  `node scripts/gen-icons.mjs`. Sostituiscile col branding definitivo mantenendo nomi/dimensioni.

**Firma:** l'installer è NON firmato per ora. Alla prima esecuzione Windows mostra SmartScreen
("Windows ha protetto il PC"): l'utente clicca **"Ulteriori informazioni"** → **"Esegui comunque"**
(in Edge/Chrome, sul download, "Mantieni").

**Auto-update:** l'app pacchettizzata controlla GitHub Releases via `electron-updater`
(`publish` in `electron-builder.yml`), scarica in background e installa al riavvio.

## Release dell'installer (checklist)

L'installer si costruisce solo su Windows (serve il binario Electron + una build ffmpeg reale) ed è
pubblicato dal workflow `Worker Desktop` (`.github/workflows/worker-desktop.yml`), gated. Codice,
pipeline e icone sono già pronti; restano tre passi una tantum:

1. **Scegli la build ffmpeg** con `libplacebo`+Vulkan per Windows. Deve essere una **release** BtbN
   (es. `ffmpeg-n7.1-latest-win64-gpl-7.1.zip`), **non** la master (la master fallisce l'init del
   filtro libplacebo — vedi `apps/worker/README.md`). Copia l'URL dello `.zip`.
2. **Imposta le repo variable** (Settings → Secrets and variables → Actions → Variables) oppure via
   CLI:

   ```bash
   gh variable set FFMPEG_LIBPLACEBO_URL --body "<url-zip-ffmpeg-libplacebo>"
   gh variable set WORKER_DESKTOP_PUBLISH_ENABLED --body "true"
   ```

3. **Crea e pusha il tag** per avviare la pubblicazione su GitHub Releases:

   ```bash
   git tag worker-desktop-v0.17.0
   git push origin worker-desktop-v0.17.0
   ```

Il workflow builda (renderer + main), imbarca ffmpeg, produce l'installer NSIS non firmato e lo
pubblica come Release; gli aggiornamenti successivi arrivano via `electron-updater`. In alternativa,
in locale su Windows: metti l'ffmpeg in `vendor/ffmpeg/` e lancia `npm run dist -w @animeunion/worker-desktop`.
