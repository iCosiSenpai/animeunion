# CLAUDE.md — AnimeUnion Docker (fonte unica di stato)

> **Leggi questo file per primo a ogni sessione.** È la fonte unica e vivente di: visione, stato,
> roadmap a step, regole, gotchas.
>
> **Ripresa di sessione (Regola #16):** Dopo aver letto CLAUDE.md, apri il file di piano del batch
> corrente in **`plan/`** (indicato in "Roadmap verso vX" qui sotto). Riprendi dall'ultimo step con
> `[ ]`. Non implementare nulla senza prima entrare in plan mode (Regola #14).
>
> **Processo (vincolante):** il piano vivo del batch corrente sta in **`plan/`** nel progetto
> (gitignored, durevole). I file in `~/.claude/plans/` sono **temporanei/effimeri**: la fonte è
> `plan/`. La sezione **"Roadmap verso vX"** qui sotto rimanda sempre al piano attivo in `plan/`.
> **Per ogni step si entra prima in plan mode** (approfondire → implementare a checkbox, Regola
> #14/#15). Quando "Roadmap verso vX" esiste con step `[ ]`, c'è lavoro da fare: leggi il piano.
>
> Spec tecnica: [PLAN.md](PLAN.md). Design: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
> Contratto API: [docs/API_ANIMEUNION.md](docs/API_ANIMEUNION.md).
> Storia batch: [docs/history/](docs/history/).

## Visione

"La tua libreria anime, sempre aggiornata": l'utente segue un anime e ogni nuovo episodio viene
scaricato automaticamente (un episodio alla volta), rinominato e organizzato per Jellyfin. Integrazione
**ufficiale** con AnimeUnion via API (no scraping). App self-hosted in Docker, mono-utente.

## Stack (non negoziabile)

Backend: Node 20 + TS strict + Fastify + tRPC + Drizzle/better-sqlite3 + undici + pino.
Frontend: Next.js 15 App Router + shadcn/ui + Tailwind + TanStack Query + zustand.
Shared: `packages/shared` (zod + interfaccia `AnimeSource`). Video: ffmpeg-static (HLS→MP4).
Scheduler: setInterval (node-cron non usato). Lint: Biome. Test: Vitest (+ Playwright in futuro).
Monorepo npm workspaces: `apps/api`, `apps/web`, `packages/shared`.

## Roadmap verso v0.14.0 — "Affidabilità + Hardening + Anti-duplicati" (COMPLETO)

> Piano archivio: **[plan/affidabilita-hardening.md](plan/affidabilita-hardening.md)**
> Branch: `feat/affidabilita-hardening` — ff-merged in `main` come `v0.14.0`.

- [x] **Step 1** — Bug download engine: backoff reale (`retry_at`, migr. 0016) + re-download dopo stato terminale
- [x] **Step 2** — Bug config/settings: timer auto-download, guardia maschera-segreti, doppio id impostazioni
- [x] **Step 3** — Hardening rete: CORS same-origin, `trustProxy`, `browseDir` confinato
- [x] **Step 4** — Cifratura a riposo: token + segreti config, `AUTH_ENCRYPT_KEY` obbligatoria in prod
- [x] **Step 5** — Validazione backup pre-ripristino (anti crash-loop)
- [x] **Step 6** — Scanner duplicati (backend + UI gestore file)
- [x] **Step 7** — UX: move su touch, error states (`<QueryError>`), `/downloads`+`/diagnostica` nel dock
- [x] **Step 7.5** — Fix auto-download: soglia forward-only ancorata agli episodi già usciti (migr. 0017)
- [x] **Step 8** — Release v0.14.0

## Mini-batch "Rifiniture post-Step-1" — perk Premium + onboarding + backup cloud (ATTIVO)

> Piano vivo: **[plan/rifiniture-premium-onboarding.md](plan/rifiniture-premium-onboarding.md)**.
> Emerso dal collaudo dopo lo Step 1 di v0.15.0. **v0.15.0 va IN PAUSA** finché non chiuso.
> Cadenza: un solo step per sessione. Provider cloud scelto: **Google Drive**.

- [x] **Step A** — Modalità test "nuovo utente" (dev workflow: `.env.newuser` + `dev:newuser`/`reset:newuser`) — 2026-07-07
- [x] **Step B** — Statistiche: catalogo vs libreria (frontend) — 2026-07-07
- [ ] **Step C** — Download simultanei come perk Premium (gate su `premium.active`, sblocca `maxConcurrent`)
- [ ] **Step D** — Backup su Google Drive (`drive.file`, bring-your-own OAuth client) — decision-gated

## Roadmap verso v0.15.0 — "Quality + Neural Export (Anime4K)" (IN PAUSA — vedi mini-batch sopra)

> Piano vivo: **[plan/quality-gpu-bridge.md](plan/quality-gpu-bridge.md)** (fonte canonica).
> **Cadenza concordata: un solo step per sessione** (nuova sessione per ogni step, per non bruciare
> token). All'inizio di ogni sessione: leggi CLAUDE.md → apri il piano → riprendi dal primo `[ ]`.

Architettura **rivista** dopo i due contratti dell'admin (`INTEGRATION_PREMIUM.md`,
`INTEGRATION_NEURAL_EXPORT.md`): NON più real-esrgan/Python, ma **Premium LIVE** su `/me`
(`premium`+`features.neuralExport`) e upscale con **ffmpeg + libplacebo + shader Anime4K (MIT)**,
identico al player del sito. Il NAS non ha GPU: il render gira su un **worker nativo Windows** (RTX
5070 Ti) via bridge LAN. App nativa Windows/macOS = **roadmap separata**, fuori scope. Dettagli e
razionale (incl. worker nativo vs container, nota CUDA/NVENC) nel piano.

- [x] **Step 1** — Wiring Premium + gate UI (estende `apiMeSchema`/`userProfileSchema` con
  `premium`+`features`; gate reale al posto dell'upsell statico). Fatto 2026-07-07.
- [x] **Step 2** — Schema "quality" (migr. **0018**): `episode_file` UNIQUE `(episode_id, language, quality)`.
  Fatto 2026-07-07 (enum `Quality`, renamer con tag qualità, DTO/config rimandati a Step 3 per Regola #1).
- [x] **Step 3+** — Engine Neural Export (Anime4K) — FATTO 2026-07-08 (tutto lo step in una sessione,
  deroga cadenza su richiesta utente): `packages/neural-core` (core riusabile) + `apps/worker`
  (servizio GPU Windows) + NAS bridge (`neural-export-service`, migr. **0019** `neural_export_job`,
  config worker) + UI (pannello Premium + azione "Migliora a XQ/XQ+"). 423 test verdi.
- [ ] **Step finale** — Release v0.15.0

## Stato attuale (2026-07-08)

**Versione corrente: v0.14.1 — affidabilità + hardening + anti-duplicati + fix auto-download.**
**v0.15.0 Step 1 (wiring Premium), Step 2 (schema "quality", migr. 0018) e Step 3+ (engine Neural
Export Anime4K) COMPLETI. Prossimo: Step finale (Release v0.15.0). Mini-batch "Rifiniture
post-Step-1": Step A+B fatti, restano C (download simultanei Premium) e D (backup Google Drive).**
- 423 test verdi, lint/typecheck verdi, build web ok
- v0.15.0 Step 3+ (2026-07-08): **engine Neural Export** (upscale XQ 1080p / XQ+ 4K con
  Anime4K/libplacebo). Tutto lo step in una sessione (deroga cadenza su richiesta utente). Nuovo
  workspace `packages/neural-core` (core riusabile: provisionShaders+sha256, buildShaderChain,
  buildFfmpegArgs pura, probeCapabilities, runUpscale) e `apps/worker` (servizio GPU nativo Windows,
  Fastify + auth token: `/health` feature-detect, `POST /jobs` multipart, `/result` stream). NAS:
  `neural-export-service` (recipe cache 6h + gate `hasNeuralExport` ri-verificato + bridge HTTP verso
  il worker: dispatch/poll/finalize) crea una **nuova riga** `episode_file` (quality XQ/XQPLUS,
  migr. **0019** `neural_export_job`) senza toccare la sorgente SD; config `neuralExportEnabled`/
  `neuralWorkerUrl`/`neuralWorkerToken` (secret). UI: pannello in Impostazioni›Premium (stato worker
  + coda + config + attribution MIT) e azione "Migliora a XQ/XQ+" nel dropdown episodio, gated su
  `neuralExport.status.available`. Fix collaterale: la lista episodi filtra `quality='SD'` (le
  upscalate non diventano voci separate). **Runtime worker (PC GPU)**: serve ffmpeg con
  `--enable-libplacebo`+Vulkan (la build gyan "essentials" presente NON ce l'ha → `probeCapabilities`
  degrada a `ok:false`, feature nascosta ma app intatta); vedi `apps/worker/README.md`.
- v0.15.0 Step 2 (2026-07-07): **schema "quality"** — `episode_file` ora UNIQUE
  `(episode_id, language, quality)` (migr. **0018**: `ADD COLUMN quality NOT NULL DEFAULT 'SD'` +
  swap dell'indice unico, nessun rebuild). Enum `Quality` (`SD`/`XQ`/`XQPLUS`) in `shared/enums.ts`;
  `catalog-service` `onConflict` target esteso a includere `quality`; renamer con param
  `quality?` (default SD → path invariato) e tag ` [XQ]`/` [XQPLUS]` per le upscalate, così non
  sovrascrivono la sorgente SD. Sorgente SD e future upscalate coesistono per lo stesso
  (episodio, lingua). DTO `episodeSummary`/`download` e chiavi config quality **rimandati a Step 3**
  (Regola #1: nessun consumer oggi). Solo schema+naming: nessun engine (Step 3, decision-gated).
- Mini-batch Step A (2026-07-07): **modalità collaudo "nuovo utente"** — l'auto-login parte perché
  `.env` ha le credenziali (`auth.status`→`getToken`); per testare da utente pulito usa
  `npm run reset:newuser && npm run dev:newuser` (env `.env.newuser` senza creds + DB isolato in
  `apps/api/data/newuser/`). Le credenziali dev restano per il lavoro sul codice; il test gira come
  nuovo utente.
- Mini-batch Step B (2026-07-07): **Statistiche riorganizzate** in "Catalogo AnimeUnion" (globale,
  mirrorato per la ricerca → non-zero per tutti) vs "La tua libreria" (personale, zero su app nuova);
  rimossa la barra "Avanzamento" fuorviante (scaricati/intero catalogo ~0%). Solo `stats-view.tsx`.
- v0.15.0 Step 1: `userProfileSchema`/`apiMeSchema` ora leggono `premium`
  (`{tier,active,expiresAt}` nullable) e `features` (passthrough tollerante, flag assente = false);
  campi difensivi (`.default().catch()` → fail-closed sul gating se lo shape del server cambia).
  Helper entitlement in shared: `isPremiumActive` (type-guard, usa solo `active`) e `hasNeuralExport`
  (usa solo `features`, mai i tier). Gate UI reale: nuova `PremiumStatusPanel` (stato attivo +
  entitlement) sostituisce l'upsell statico quando `premium.active`; `PremiumUpsell` resta fallback.
  Nessuna migrazione DB (il profilo è solo cache 5 min in `profile-service`). Prossimo: Step 2
  (schema "quality", migr. 0018). Piano: [plan/quality-gpu-bridge.md](plan/quality-gpu-bridge.md).
- v0.14.1: rifinitura del fix auto-download dopo diagnostica sul NAS — gli episodi in arrivo su
  AnimeUnion hanno `airDate` **nulla** (non futura), quindi `maxReleasedEpisode` ora conta come
  backlog solo gli episodi **già scaricati/external O con airDate passata**; un episodio listato in
  anticipo (airDate nulla, non scaricato) non alza più la soglia. AUTH_ENCRYPT_KEY va impostata sul
  NAS (fatto in deploy v0.14.0, altrimenti fail-closed).
- v0.14.0: fix **auto-download che saltava gli episodi appena usciti** — la soglia forward-only era
  ancorata al max episodio su TUTTI gli episodi (inclusi quelli in arrivo), quindi attivandolo mentre
  l'ep1 era annunciato la soglia diventava 1 e l'ep1 restava escluso per sempre. Ora
  `maxReleasedEpisode` + migr. 0017 riparano i follow già rotti. Recupero manuale: "Scarica mancanti"
  non applica la soglia. Inoltre: backoff download
  reale (`retry_at`, migr. 0016), re-download dopo stato terminale, cifratura a riposo di
  token/segreti (`AUTH_ENCRYPT_KEY` obbligatoria in prod), CORS same-origin, `trustProxy`, `browseDir`
  confinato, validazione backup pre-ripristino, **scanner duplicati** nel gestore file, move file su
  touch, error states uniformi, `/downloads`+`/diagnostica` nel dock mobile.
- v0.13.8: `healPresent` (`download-service`) riconosce un episodio gia' su disco per
  **(stagione, numero)** nella cartella, non solo al nome canonico `<Titolo> - SxxExx.mp4`. Chiude la
  causa radice dei duplicati: le serie gia' possedute con naming diverso (`S01E05.mp4`, `01.mp4`,
  `E01.mp4`, `Nome Ep. 5.mp4`) non vengono piu' ri-scaricate. Con SUB+DUB nella stessa root (nome con
  tag lingua) il match loose e' disattivato (un file senza tag e' ambiguo). Indagine NAS 2026-07-03:
  11 serie, 182 file, ~45 GB di duplicati md5-identici, spostati in `.dup-trash-20260703/` (NAS,
  reversibile). Vedi memoria `healpresent-filename-only-duplicates`.
- v0.13.7: `availableLanguages` (SUB/DUB) su AnimeCard; hero con swipe mobile (+ conferma sync col
  feed ufficiale); prompt download quando un follow passa a watching/plan_to_watch (follow-card);
  blocco landscape su telefono (overlay `.landscape-block` + manifest `orientation: portrait`);
  `/library/missing` auto-scan on mount; colori distinti "non collegato" (ambra) / "Non importato"
  (azzurro) nel gestore file; riquadro esplicativo orfani in libreria. Nota: l'incidente "delete
  gestore file" era un DUPLICATO (`Mission Yozakura Family 2` vs parent `.../Season 02`), non un
  bug: il delete funziona e sposta nel cestino.
- v0.13.6: `overflow-x: clip` globale su `html, body` (rete di sicurezza per "tutto va oltre lo
  schermo" su ogni schermata); titolo "Episodio XX" su due righe su mobile (niente piu' "Ep...");
  sidebar landscape rispetta la safe-area; `useCloseOnScroll` chiude notifiche/download allo scroll
  su mobile; hero home con crossfade+Ken Burns; rimosso "Mostra toast di prova" (test push reale
  resta in `PushToggle`).
- v0.13.4: chiude la 2a via di ri-download (sync preferiti import-only), `library.checkVanished`, UI download mobile.
- Incidente 2026-07-02: accendere l'auto-download con DB desync (molti episode_file `not_downloaded`
  ma file già su disco) e soglie forward-only a 0/null ha ri-scaricato il backlog. Per le serie col
  path canonico erano sovrascritture in-place; per quelle con naming legacy (`S01E05.mp4`, `01.mp4`,
  ...) erano invece VERI DUPLICATI (verificato sul NAS 2026-07-03: 11 serie, 182 file, ~45 GB
  md5-identici — la nota "solo sovrascritture, non duplicati" era inesatta). Fix v0.13.3:
  `healPresent` in `download-service` (solo path canonico). Fix v0.13.4: `favorites-service` non
  accoda piu' download. Fix v0.13.8: `healPresent` match per (stagione, numero), non per nome file —
  chiude la causa radice dei duplicati. Prima di riaccendere l'auto-download conviene SEMPRE una
  scansione + soglie al max.
- Aperto: locandina bassa qualità in libreria (#9, serve indagine URL immagine API); riempimento
  stagioni dimezzate = `download.addAll` per anime toccati (self-heal salta i presenti).
- Auto-download "non parte"/push "assenti": quasi sempre config/ambiente, non bug — master globale
  `autoDownload` (default off) + eleggibilità per-follow; push tutto implementato ma nascosto senza
  HTTPS. Vedi memoria `autodownload-eligibility-and-push-https`.
- Diagnosi download lento: contesa I/O sull'HDD pool2 condiviso con Jellyfin, NON un bug (vedi
  memoria `download-slow-jellyfin-io-contention`); mitigato col refresh Jellyfin per-libreria.
- Premium: **ora LIVE** — `GET /integration/me` ritorna `premium` (`{tier,active,expiresAt}` o null) +
  `features.neuralExport` (vedi `INTEGRATION_PREMIUM.md`/`INTEGRATION_NEURAL_EXPORT.md`). Il nostro
  `apiMeSchema` oggi però SCARTA quei campi (da estendere nello Step 1). Account utente già premium
  (grant da Matteo) → ramo premium testabile subito.
- **Batch attivo:** `v0.15.0 "Quality + Neural Export (Anime4K)"` — piano
  [plan/quality-gpu-bridge.md](plan/quality-gpu-bridge.md). Step 1-2-3 completi; prossimo lavoro:
  **Step finale** (Release v0.15.0). Cadenza: un solo step per sessione (Step 3 in deroga).

Funzioni principali operative: download automatico (1 episodio alla volta), FTS5 search, cestino
recuperabile, backup automatico DB, verifica integrità video, Jellyfin integration, nfo sidecar,
gestore file con collega-senza-scaricare, home personalizzabile, calendario, wallpaper.

## Storia batch precedenti

> Dettagli completi in [docs/history/](docs/history/).

| Versione | Batch | Data |
|---|---|---|
| v0.14.0 | Affidabilità + Hardening + Anti-duplicati | 2026-07-06 |
| v0.13.0 | Mobile First + Rinforzo | 2026-07-01 |
| v0.12.0 | [Super rinforzo](docs/history/batch-super-rinforzo-v0.12.0.md) | 2026-06-29 |
| v0.10.0 | [Potenziamenti diffusi](docs/history/batch-potenziamenti-diffusi-v0.10.0.md) | 2026-06|
| v0.11.x | [Auto-download affidabile + fix gestore file](docs/history/batch-auto-download-v0.11.x.md) | 2026-06 |
| v0.9.0  | [Seerr per AnimeUnion](docs/history/batch-seerr-v0.9.0.md) | 2026-06-25 |
| v0.5–v0.8 | Rifiniture, hardening, libreria, Docker, PWA | 2026-06 |
| v0.1–v0.4 | Fondamenta, download engine, catalogo, wizard | 2026-06 |

## Gotchas operativi

- **Workspace shared è una COPIA**, non un symlink: dopo modifiche a `packages/shared` esegui
  `npm install` prima di `npm run typecheck`/dev, altrimenti l'API non vede i nuovi export.
- **API live (al 2026-06-16)**: 12/13 endpoint v1.0.3/1.1.x operativi con token reale. Base path:
  `https://api.animeunion.tv/api/v1/integration`. Rate limit: 120 req/min per token.
  Solo `POST /me/favorites/sync` non deployato (non necessario).
- **Branch**: tutto il lavoro viene ff-merged in `main` e pushato su `origin/main`. Il batch corrente
  è `feat/mobile-first-rinforzo`.
- **Credenziali**: email/password in `.env` (gitignored); token in SQLite (`auth`). Mai segreti nel
  codice/compose. Account: `lookatale95@gmail.com`.
- **Credenziali NAS (deploy)**: in **`.secrets/nas.md`** (gitignored). L'alias `ssh nas` (a chiave)
  è il metodo preferito. Mai copiare credenziali in file tracciati.
- **Verifica sempre**: `npm run lint` + `npm run typecheck` + `npm run test` verdi prima di committare.
- **Download engine**: MP4 scaricato in `<target>.part.<queueId>`, rinominato atomicamente al path
  finale `SXXEXX.<lang>.mp4`. Worker event-driven: `tryStartNext()` su enqueue + tick 60s.
  `maxConcurrent` letto da config ad ogni decisione. `AbortController` per cancel.
- **Memoria progetto**: `~/.claude/projects/f--dev-animeunion/memory/` (vedi `MEMORY.md`).

## Regole Ferree

1. Mai codice per feature future: solo lo step corrente.
2. tRPC è la legge: zero `fetch`/`axios` dal frontend.
3. Il frontend non chiama mai direttamente AnimeUnion: sempre via backend (proxy + cache + rate-limit).
4. Docker-ready: il container deve poter buildare.
5. Test sui servizi core (catalog, download, renamer DEVONO avere test).
6. Spiega passo passo le scelte architetturali (l'utente è in learning mode).
7. Nessun segreto nel codice: token/password/URL solo in env o `.env` (gitignored).
8. Credenziali AnimeUnion in `.env`, token in SQLite. Mai token in chiaro nel compose.
9. Un commit = un task. Messaggio in italiano, descrittivo.
10. Niente commenti superflui (solo se la logica non è ovvia). Niente emoji nel codice.
11. TypeScript strict: niente `any`, usa `unknown` + narrowing.
12. Error handling: mai `catch {}` vuoto, almeno `logger.error/debug`.
13. **Niente "Scarica intera serie" cross-stagione**: un episodio alla volta; ammesso accodare gli
    episodi mancanti della stessa entry/stagione (`download.addMissing/addAll`).
14. **Ogni step di un batch va prima approfondito, poi implementato a checkbox**: (1) approfondire lo
    step nel file di piano con contesto tecnico verificato (file + righe, contratti, impatto sui
    test) e sotto-task a checkbox `- [ ]`; (2) implementare spuntando le checkbox; (3) chiudere con
    `lint`/`typecheck`/`test`/`build` verdi e un commit dedicato (Regola #9).
15. **Piano durevole in `plan/`, plan mode per ogni step**: il piano vivo del batch sta in `plan/`
    (gitignored, fonte canonica); `~/.claude/plans/` è solo temporaneo. CLAUDE.md "Roadmap verso vX"
    rimanda sempre al piano in `plan/`. **Prima di implementare uno step si entra in plan mode**
    (approfondimento Regola #14), poi si implementa. A fine step aggiorna AVANZAMENTO nel piano +
    "Roadmap verso vX" + "Stato attuale" in CLAUDE.md.
16. **Ripresa sessione — leggi sempre `plan/`**: all'inizio di ogni sessione, DOPO aver letto
    CLAUDE.md, apri il file di piano del batch corrente indicato in "Roadmap verso vX" (es.
    `plan/mobile-first-rinforzo.md`). Trova il primo step con `[ ]` nell'AVANZAMENTO e riprendi da
    lì. Non fare nulla senza aver letto il piano. Il piano è l'unica fonte di verità sullo stato
    degli step — non fidarti della memoria della sessione precedente.

## Convenzioni

File kebab-case; funzioni camelCase; componenti React PascalCase; colonne DB snake_case.
Import order: `node:*` → esterni → `@animeunion/*` → `./` → `../`. Commit in italiano.

## Crediti

Powered by AnimeUnion (https://animeunion.tv) — Applicazione ufficiale affiliata.
Sviluppata da iCosiSenpai — https://github.com/iCosiSenpai/animeunion
