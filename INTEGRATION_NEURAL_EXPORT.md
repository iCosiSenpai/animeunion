# INTEGRATION_NEURAL_EXPORT.md — Download neurale XQ/XQ+ nell'app di integrazione

> Contratto per l'app Docker self-hosted ("Sonarr/Radarr italiano") che usa
> `/api/v1/integration/*`. Obiettivo: offrire agli utenti **premium** il
> download episodi upscalato **XQ (1080p)** / **XQ+ (4K)** con **elaborazione
> interamente client-side** (la macchina dove gira il container). Zero carico
> sui server AnimeUnion — stessa filosofia dell'export neurale del sito.

## Architettura in una frase

L'app scarica l'MP4 sorgente (720p) dal CDN come già fa, e lo elabora in
locale con **ffmpeg + filtro `libplacebo`** eseguendo gli **stessi shader
Anime4K** (bloc97, MIT) usati dal player del sito: sono *mpv user shader*
nativi, non serve nessun runtime WebGL/browser. AnimeUnion fornisce: il
**gate premium** verificabile via API, gli **shader** serviti con sha256
pinnati, e il **profilo "ricetta"** (catene/risoluzioni/bitrate) così
l'output è identico a quello del sito.

## Flusso

1. **Login** come oggi (`POST /integration/auth/login` o device-flow social).
2. **Entitlement**: `GET /integration/me` ora risponde anche:
   ```json
   {
     "premium": { "tier": "MEGA_FAN", "active": true, "expiresAt": "..." } ,
     "features": { "neuralExport": true }
   }
   ```
   (`premium: null` se mai abbonato). **Usare `features.neuralExport`**, NON
   ragionare sui tier: la policy è centralizzata lato API e può cambiare.
   ⚠️ Il token dura 60gg ma l'abbonamento può scadere prima: **ri-verificare
   il flag prima di ogni export**, non solo al login.
3. **Ricetta**: `GET /integration/neural-export/profile` (auth Bearer, cache 6h):
   `version`, `requiredTiers`, `profiles[]` (id `xq`/`xqplus`, `chain[]` ordinata,
   `targetWidth/Height`, `videoBitrate`, `videoCodec`, `audio:"copy"`,
   `faststart`), `shaders[]` (`file`, `url`, `sha256`, `sizeBytes`), `license`,
   `reference` (template comando).
4. **Shader**: scaricarli da `https://api.animeunion.tv/static/anime4k/<file>`
   (pubblici, MIT), **verificare lo sha256** e cacharli in un volume; ri-scaricare
   solo se il profilo espone hash diversi (bump di `version`).
5. **Elaborazione** (per episodio): fetch MP4 sorgente → concatenare i file
   della `chain` **nell'ordine** in un unico `.glsl` → ffmpeg:
   ```bash
   ffmpeg -init_hw_device vulkan -i ep_001.mp4 \
     -vf "hwupload,libplacebo=w=1920:h=1080:custom_shader_path=xq_chain.glsl,hwdownload,format=yuv420p" \
     -c:v libx264 -b:v 10M -c:a copy -movflags +faststart ep_001_xq.mp4
   ```
   (XQ+: `w=3840:h=2160`, `-b:v 35M`, chain VL con doppio Upscale.)
   L'audio NON si ri-encoda mai (`-c:a copy`). `+faststart` obbligatorio.

## Requisiti hardware (dell'utente finale)

- **GPU con Vulkan nel container**: NVIDIA → `--gpus all` (nvidia-container-toolkit);
  Intel/AMD → `--device /dev/dri` + driver Mesa nel container.
- **CPU-only** (lavapipe/llvmpipe): funziona ma è molto lento, specialmente XQ+
  (modelli VL). Consigliato feature-detect all'avvio (probe: 2-3 secondi di clip
  con la chain XQ, misurare fps) e disabilitare/avvisare se sotto soglia.
- ffmpeg con `--enable-libplacebo` (o mpv come alternativa: `--glsl-shaders`
  accetta i file multipli separati da `:` senza concatenazione).
- ⚠️ Il template comando è **di riferimento, da validare sul target** (Linux+GPU):
  AnimeUnion lo mantiene coerente coi preset del sito ma non può testare ogni
  combinazione driver/build ffmpeg.

## Policy gate (importante)

Il gate è **cooperativo**, come sul sito (dove l'export neurale è gated solo
in UI): il sorgente SD è comunque scaricabile da ogni utente loggato e gli
shader sono open-source. Il valore premium è la **comodità one-click**.
L'app quindi: mostra XQ/XQ+ solo se `features.neuralExport === true`, e
ri-verifica il flag a ogni export. Nessun enforcement crittografico esiste né
è previsto prima della Fase 2 HLS/DRM.

## Licenza

Shader Anime4K © bloc97 e contributori, **MIT** (header nei file,
https://github.com/bloc97/Anime4K): l'app deve conservare l'attribution
(es. pagina "about"/log). ffmpeg/libplacebo: licenze proprie standard.

## Manutenzione lato AnimeUnion

- Ricetta e preset: [neural-export.service.ts](../apps/api/src/services/neural-export.service.ts)
  (single source of truth; il test [neural-export.test.ts](../apps/api/test/neural-export.test.ts)
  asserisce la coerenza con `EXPORT_PRESETS` del web e l'anti-drift delle copie shader).
- Shader serviti: `apps/api/assets/anime4k/` (copie verbatim di apps/web — vedi README lì).
- Cambi di catena/preset → bump `NEURAL_EXPORT_PROFILE_VERSION`.
