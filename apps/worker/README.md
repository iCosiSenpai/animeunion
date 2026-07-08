# @animeunion/worker — Worker Neural Export (GPU)

Servizio HTTP headless che esegue l'upscale **Anime4K/libplacebo** (XQ 1080p / XQ+ 4K) sul PC con
GPU. Il NAS scarica l'MP4 sorgente (720p) come sempre e delega il render al worker via LAN; il worker
non ha bisogno del token AnimeUnion (gli shader Anime4K sono pubblici, MIT).

## Requisiti

- **GPU con Vulkan** (qui: RTX 5070 Ti, driver NVIDIA nativo Windows).
- **ffmpeg con `--enable-libplacebo` + Vulkan.** `ffmpeg-static` NON basta (build generica). Opzioni
  su Windows (verificate su RTX 5070 Ti, 2026-07-08):
  - **BtbN release branch** via winget: `winget install BtbN.FFmpeg.GPL.8.1` — **funziona** con la
    ricetta (`hwupload,libplacebo,hwdownload`), upscale 1080p reale ok.
  - build **"full"** di gyan.dev (`ffmpeg-git-full`), che include `--enable-libplacebo`+`--enable-vulkan`.
  - ⚠️ **Evitare la BtbN _master_** (`BtbN.FFmpeg.GPL`): compila libplacebo ma il filtro fallisce
    l'init del graph ("Error initializing filters") — usare un branch di release.

  Verifica:

  ```powershell
  ffmpeg -hide_banner -filters | Select-String libplacebo
  # probe Vulkan end-to-end (deve uscire con codice 0):
  ffmpeg -hide_banner -init_hw_device vulkan -f lavfi -i color=c=black:s=64x64:d=0.1 `
    -vf "hwupload,libplacebo=w=128:h=128,hwdownload,format=yuv420p" -f null -
  ```

## Configurazione (`.env.worker` nella root, oppure variabili d'ambiente)

| Variabile | Default | Note |
|---|---|---|
| `WORKER_TOKEN` | — (**obbligatorio**) | Token condiviso col NAS (config `neuralWorkerToken`). |
| `WORKER_PORT` | `8787` | Porta di ascolto. |
| `WORKER_HOST` | `0.0.0.0` | Interfaccia (LAN). |
| `WORKER_FFMPEG_PATH` | `ffmpeg` | Path all'ffmpeg libplacebo (o nel PATH). |
| `WORKER_SHADER_CACHE` | `./data/shaders` | Cache shader verificati (sha256). |
| `WORKER_WORK_DIR` | `./data/work` | File temporanei dei job. |
| `WORKER_JOB_RETENTION_HOURS` | `24` | Pulizia file dei job scaduti. |

## Avvio

```powershell
npm run start -w @animeunion/worker
```

Per farlo girare come servizio Windows: usare **NSSM** o un'attivita' del **Task Scheduler** che
lancia `npm run start -w @animeunion/worker` all'avvio (con le variabili d'ambiente impostate).

## API (auth: `Authorization: Bearer <WORKER_TOKEN>` su ogni rotta)

- `GET /health` → `{ ok, ffmpegCapable, hasLibplacebo, hasVulkan, fps }` (feature-detect, cache 30s).
- `POST /jobs` (multipart: file `source` = MP4, campo `payload` = JSON `{ profile, shaders }`) →
  `202 { jobId }`. Avvia il render async (concorrenza 1).
- `GET /jobs/:id` → `{ id, state, progress, error }` (`queued`|`running`|`done`|`error`).
- `GET /jobs/:id/result` → stream `video/mp4` quando `state=done`.
- `DELETE /jobs/:id` → annulla + pulizia.

## Licenza shader

Shader Anime4K © bloc97 e contributori — **MIT** (https://github.com/bloc97/Anime4K). Il worker li
scarica da `https://api.animeunion.tv/static/anime4k/` verificandone lo sha256 pinnato nella ricetta.
