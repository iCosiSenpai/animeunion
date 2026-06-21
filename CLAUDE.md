# CLAUDE.md — AnimeUnion Docker (fonte unica di stato)

> **Leggi questo file per primo a ogni sessione.** È la fonte unica e vivente di: visione, stato,
> roadmap a step, regole, gotchas. La spec tecnica di dettaglio è in [PLAN.md](PLAN.md) (schema SQL,
> contratti, flussi). Design di sistema in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Contratto
> API col sito in [docs/API_ANIMEUNION.md](docs/API_ANIMEUNION.md).
>
> **Regola**: a fine di ogni step, aggiorna la sezione "Stato" e "Roadmap" qui sotto.

## Visione

"Radarr/Sonarr italiano per anime": l'utente segue un anime e ogni nuovo episodio viene scaricato
automaticamente (un episodio alla volta), rinominato e organizzato per Jellyfin. Integrazione
**ufficiale** con AnimeUnion via API (no scraping). App self-hosted in Docker, mono-utente.

## Stack (non negoziabile)

Backend: Node 20 + TS strict + Fastify + tRPC + Drizzle/better-sqlite3 + undici + pino.
Frontend: Next.js 15 App Router + shadcn/ui + Tailwind + TanStack Query + zustand.
Shared: `packages/shared` (zod + interfaccia `AnimeSource`). Video: ffmpeg-static (HLS→MP4).
Scheduler: setInterval (node-cron non usato). Lint: Biome. Test: Vitest (+ Playwright in futuro).
Monorepo npm workspaces: `apps/api`, `apps/web`, `packages/shared`.

## Stato attuale (2026-06-21)

**Batch rifiniture v0.3.0 (branch `feat/rifiniture-post-v0.2.0` → `main`):** footer completo +
affordance link + fix UX (ricerca→⌘K, popup coda); **Telegram dall'app** (token in config, invia
test); **centro notifiche potenziato** (click→destinazione, filtri, raggruppo giorno, tipi
sync/disco); **scoperta saga multi-stagione** (`series.franchise` BFS fetch-and-cache, opzione "Trova
tutte le stagioni"); **temi anime** (accent palette + sfondo wallpaper via wallhaven); **animazioni**
(framer-motion, interruttore); **pagina Statistiche** + **scorciatoie tastiera**; **hardening** (token
Telegram mascherato in `config.getAll`, header sicurezza web, backup/restore config); **notifica nuova
stagione** (`season_available`, `season-watcher`); **blocco web UI con passcode** (scrypt + token
HMAC, guard tRPC, `WEB_LOCK_DISABLED`); **PWA + Web Push** (manifest+SW, VAPID, richiede HTTPS).
Migrazioni `0007` (`follow.known_relation_ids`) e `0008` (`push_subscription`). **197 test verdi.**
Step F (wizard migliorato) rimandato.

**Fatto:**
- Monorepo, CI (lint+typecheck+test), DB SQLite (10 tabelle), MockSource/ApiSource, rate-limiter.
- Auth: email/password + **social login device flow** (Google/Discord) — `auth-service`, router `auth`.
- Router lettura: catalog, episode, calendar, follow, config, stats + **home, library, profile**.
- Integrazione **endpoint v1.0.3/1.1.x** (preferiti R/W, watchlist, cronologia, profilo,
  ultimi-episodi, in-evidenza, news) con scheduler di polling preferiti e auto-accodamento.
  **Tutti LIVE al 2026-06-16 sera** (verificati con token reale: 12/13 rispondono, vedi sotto).
- Frontend scoperta: home (con sezioni nuove), catalogo, dettaglio, follows, calendar, about,
  badge profilo navbar, SocialLogin nella SetupScreen.
- **Configurazione conservativa e brand (STEP 2.5)**: `autoDownload` default `false`, `maxConcurrent`
  default 1 / max 3, formato file forzato a `SXXEXX`, nuovi settings `languageFallback`,
  `queueRetentionDays`, notifiche (toast in-app + card per provider futuri: Telegram/Discord/Web Push),
  logo/favicon/icon ufficiali da animeunion.tv, rimozione di ogni riferimento personale.
- **Frontend polish (STEP 2.6)**: layout sidebar collassabile + bottom bar mobile, navbar ridotta
  con widget download (`DownloadStatus`) e badge coda, pagina `/downloads` rifatta a dashboard
  con card poster, progress bar e azioni rapide; pagina follow con i 5 status e hint locali;
  setup screen espone il toggle auto-download.
- **Renamer full + serie/stagione + fix sequel (STEP 3)**: campi `seriesId`/`seasonNumber`
  propagati da shared/API/DB, tabella `anime_relation` per salvare PREQUEL/SEQUEL/SPIN_OFF,
  `SeriesResolverService` con fallback da dati API, relazioni o slug isolato, `RenamerService`
  che produce path `sub-ita|dub-ita/<seriesSlug>/Season NN/SXXEXX.mp4` e corregge sia
  numerazione assoluta che ripartita dei sequel.
- **Frontend polish post-STEP 3**: azioni globali in `/downloads`
  (pausa/ripresa, annulla tutti, riprova falliti, pulisci completati) collegate al backend;
  guard navigazione in Settings con dialog "salva, abbandona o rimani";
  home page restyle premium con hero, header a icone e CTA.
- **Catalogo completo e hero dinamica**: procedura `catalog.browse` con filtri combinati
  (query, genere, tipo, stato, anno, stagione, lingua, ordinamento) + endpoint `catalog.genres`;
  UI catalogo riscritta con tutti i filtri e pannello filtri mobile tramite Sheet.
- **Fix avvio TRPC**: passato da `httpBatchLink` a `httpLink` + `QueryClient` con `staleTime`,
  risolve l'errore `Unable to transform response from server` al primo caricamento.
- **Hero restyle**: cover a schermo intero (senza blur) con overlay gradiente scuro, badge
  "In evidenza", generi e score; confermato aggiornamento dai dati `/in-evidenza` del backend.
- **Card anime e skeleton migliorati**: overlay hover con "Vedi dettagli", badge score in alto a
  destra, generi nel footer; skeleton con titolo e metadati.
- **Library scanner + pagina `/library` (STEP 4)**: `library-service` scansiona `animePath`
  calcolando i path attesi tramite `RenamerService`, aggiorna `episode_file` per i file trovati,
  rileva orfani e missing; router `library.scan/list/stats`; pagina `/library` con statistiche,
  serie scaricate espandibili, bottone scan e toast. Watchlist/cronologia spostate sotto `meRouter`.
- **Controllo bug progetto + fix download engine (STEP 5)**: passata di review sui moduli core.
  Trovato e corretto un bug critico nel `download-worker`: `tryStartNext` prenotava il job
  (`status -> 'downloading'`) prima di chiamare `runOne`, ma `runOne` usciva subito se lo stato
  non era `'queued'` -> **il download non partiva mai nel path normale**. Fix: `runOne` ora si fida
  della prenotazione atomica; aggiunto clamp difensivo al calcolo `progress` (no `NaN`/overflow) e
  un test di regressione end-to-end (enqueue -> download reale -> `completed`/`downloaded`).
- **Post-STEP 5 — UX & robustezza (giu 2026, tutto su `main`):**
  - Home "Ultimi episodi": dialog al click (scarica quell'episodio via `download.addEpisodeRef`
    oppure vai alla serie). Fix dettaglio senza episodi su serie ONGOING (`episodeCount: null`
    rompeva il parse) + parsing episodi resiliente (`safeParse` per elemento).
  - Relazioni e Consigliati come card con copertina e **persistenti** dal percorso cache DB
    (`assembleDetailFromDb` rilegge `anime_relation`; nuova colonna `anime.recommendations`).
  - Indicatore lingua bandiera+icona (SVG inline) al posto del testo SUB/DUB.
  - Pulsante **Segui stateful** (mostra lo stato, lo cambia, smette di seguire); stato download
    per episodio nel dettaglio; badge "Seguito" sulle card.
  - **Gestione file** in `/library`: elimina episodio/stagione/serie e orfani (pulsanti rossi +
    conferma), con pulizia delle cartelle vuote.
  - **Quick wins (A)**: validazione download (rifiuta HTML "link scaduto" / sniff primi byte),
    avviso `animePath` non scrivibile o di default (`SetupBanner`), cleanup `.part` all'avvio.
  - **Hardening (D)**: redaction segreti nei log, security headers + CORS allowlist
    (`CORS_ORIGINS`), gestione 429 (Retry-After/backoff), watchdog stallo download (60s),
    guardia spazio disco (500 MiB), script `npm run dev:clean` (libera 3001/3000).
- **Download multi-directory (v0.1.1)**: le cartelle di download si configurano nelle
  **Impostazioni** (non nel `.env`) — Serie/Film × SUB/DUB, con browser cartelle e fallback a
  cascata; routing per (tipo×lingua); layout Jellyfin `<Titolo>/Season NN/<Titolo> - SxxExx.mp4`
  (titolo leggibile), film in cartella dedicata, suffisso lingua solo se SUB e DUB condividono la
  root. Compose: media montato su `/media`; `.env` solo segreti. `config.browseDir`/`downloadDirs`.
- **Wizard + download a contenitori + stagioni (v0.1.2)**: dopo il deploy v0.1.1 sul NAS sono
  emersi 3 problemi, risolti insieme. (A) **Rilevamento stagioni/sequel**: l'API spesso non dà
  `seriesId`/relazioni, quindi `series-resolver` deduce stagione+franchise dallo **slug**
  (`-2nd-season`/`-season-N`/`-ii`/trailing `-2..9`) con guardia "base esiste a catalogo"; aggiunto
  **override manuale** (tabella `series_override`, router `series`, pannello "Organizzazione file"
  nel dettaglio). (B) **Wizard di primo setup**: `seriesPathSub` default ora `''` (vuoto = non
  configurato) → l'`AuthGate` mostra `SetupWizard` finché non scegli le cartelle; download
  **bloccati** con messaggio chiaro se non configurato (niente più file in `/data/anime`).
  (C) **Pagina Download stile qBittorrent**: una card per anime con avanzamento/velocità/ETA, righe
  per-episodio espandibili, clic → scheda anime, filtro stati; nuove colonne
  `bytes_downloaded`/`total_bytes`/`speed_bps` su `download_queue`. Migrazione `0004` auto all'avvio.
- **Lotto migliorie (v0.2.0)**: (1) **coda robusta** — retention automatica (`queueRetentionDays`
  applicata da un tick scheduler), **retry intelligente** (4xx/link scaduto/contenuto non video
  falliscono subito; solo 5xx/stallo/rete riprovano — `PermanentDownloadError`), "Scarica prima"
  (`download.setPriority`). (2) **Resume download** via HTTP Range (`resumeFrom`, append su 206; i
  `.part` dei job riavviabili sopravvivono allo sweep). (3) **Centro notifiche** in-app (tabella
  `notification`, router, campanella) + canale **Telegram** (`lib/telegram`, env
  `TELEGRAM_BOT_TOKEN/CHAT_ID`, toggle `notifyTelegram`); hook sugli eventi del worker.
  (4) **Follow con opzioni** — colonna `follow.auto_download` (per-serie, null=default dallo stato),
  dialog Segui con "scarica subito i già usciti" (via conferma stagione) e toggle auto;
  `enqueueForAutoFollows` rispetta flag+stato+master; notifica `new_episode` all'auto-enqueue.
  (5) **Diagnostica** — router `health.status` (worker, spazio disco per cartella via `freeDiskBytes`,
  sync, auth) + pagina `/diagnostica`. (6) **Command palette ⌘K** (ricerca + azioni rapide) e
  **conferma stagione** obbligatoria al primo download (override + cartella `Specials`).
  Migrazioni `0004`/`0005`/`0006` auto all'avvio. Più rifiniture: DUB nascosto se assente, menu
  profilo (link a `animeunion.tv/profilo` + logout), segnalazione errori opt-in (GitHub issue
  precompilato, no telemetria), e finestra "scarica anche le relazioni" (`download.addAllBySlug`).
- **170 test verdi** (19 file).

**Endpoint v1.0.3/1.1.0/1.1.1 verificati live (12/13, base path
`https://api.animeunion.tv/api/v1/integration`):**
- `POST /auth/login` → 200 + JWT
- `POST /auth/social/{start,poll}` → 200, 4 stati (pending/slow_down/denied/expired/approved)
- `GET /me/favorites?updatedSince=...` → 200 (polling con `?updatedSince=ISO8601` supportato)
- `POST /me/favorites` (body `{animeId}`) → 200/201 (idempotente, 404 se anime inesistente)
- `DELETE /me/favorites/{id}` → 204 (idempotente)
- `GET /me/watchlist?updatedSince=...` → 200
- `GET /me/cronologia?updatedSince=...` → 200 (max 1000 più recenti)
- `GET /me` → 200 (profilo: id, username, email, avatarUrl, role, createdAt)
- `GET /ultimi-episodi?limit=...` → 200
- `GET /in-evidenza` → 200
- `GET /news?limit=...` → 200
- **Non deployato (404)**: `POST /me/favorites/sync` — non serve: GET + delta via `?updatedSince=`
  coprono già "import iniziale + sync incrementale".

**Manca:** Docker multi-arch + PWA + Web Push (STEP 6, i `Dockerfile` di api/web non esistono
ancora) e test E2E/release v0.1.0 (STEP 7). `ffmpeg-static`/`node-cron` ancora inutilizzati
(rinviati: il team di AnimeUnion conferma MP4 diretto, niente HLS; scheduler custom).
**Rimandato di proposito (D):** password/app-token per la web UI — è l'unico cambiamento che
potrebbe bloccare l'accesso, da fare con una scelta UX esplicita.

## Roadmap a step (verso v0.1.0)

- [x] **STEP 0** — Questo `CLAUDE.md` come file unico; assorbito `CLAUDE_PROMPT.md`; `ROADMAP.md` → puntatore.
- [x] **STEP 1** — Pagina **Impostazioni** cablata a `trpc.config` (Download, Pianificazione,
      Catalogo+sync ora, Lingua, Tema). `animePath` default `/data/anime` (rinominato
      da `downloadPath`).
- [x] **STEP 2** — **Download engine completo**: utility FS (`download-fs`), HTTP downloader
      MP4 (`http-downloader` con undici), worker event-driven con FSM (queued→downloading→
      processing→completed + failed/cancelled + retry + backoff), service tRPC-friendly,
      router `download` (7 procedure), scheduler per follow `watching` (auto-enqueue 30min),
      pagina `/downloads` con polling 1.5s e bottone Scarica per episodio nel dettaglio.
      `seasonNumber` hardcoded a 1 (la logica sequel/season e' rimandata a STEP 3).
      Test: 105 verdi (12 file, +38 nuovi per il motore).
- [x] **STEP 2.5** — **Configurazione conservativa e brand cleanup**: schema `AppConfig`
      (`autoDownload=false`, `maxConcurrent` 1..3 default 1, `languageFallback`,
      `queueRetentionDays`), notifiche (toast + card provider futuri), formato rinome
      forzato `SXXEXX`, rimozione riferimenti personali da docs/code, asset brand ufficiali.
- [x] **STEP 2.6** — **Frontend polish**: sidebar + bottom bar mobile, navbar con widget
      `DownloadStatus`, `/downloads` dashboard a card poster, status follow locali con hint,
      setup screen con toggle auto-download.
- [x] **STEP 3** — **Renamer + serie/stagione + fix sequel** (PLAN §S6): path
      `sub-ita|dub-ita/<seriesSlug>/Season NN/SXXEXX.mp4`, `seriesId`/`seasonNumber` reale,
      fallback da relazioni, correzione rinumerazione sequel.
- [x] **Frontend polish post-STEP 3** — Azioni globali in `/downloads`, guard navigazione
      Settings con save-and-continue, home premium con hero/icone/CTA.
- [x] **STEP 4** — **Library scanner** + pagina `/library` (PLAN §S6).
- [x] **STEP 5** — Verifica **live** API (12/13 endpoint + social) con credenziali reali ✅
      + **controllo bug del progetto** (fix critico download engine, vedi Stato) + **merge** del
      lavoro (`feat/settings-e-motore`) → `main`.
- [x] **Post-STEP 5** — Polish dettaglio/home/libreria (dialog episodi, relazioni+consigliati
      persistenti, lingua bandiera+icona, Segui stateful, stato download, gestione file) +
      **quick wins (A)** + **hardening backend (D)**. Vedi Stato. Tutto mergiato in `main`.
      Rimandato: password web UI (opzionale).
- [x] **STEP 6** — Docker: `Dockerfile` api (via `tsx`) e web (Next standalone), `docker-compose`
      (build) + `docker-compose.ghcr.yaml` (immagini) + workflow `docker-publish` (context root) +
      `.dockerignore` + credenziali AnimeUnion **opzionali** (login dalla web UI). **Build validata
      sul NAS** (fix: `.dockerignore` escludeva `src/components/anime`; API non pubblicata sull'host).
      **Restano (rinviati)**: PWA (manifest + service worker) e Web Push.
- [~] **STEP 7** — **README user-friendly + logo**, `CHANGELOG` 0.1.0, `DEPLOYMENT` completo, e
      **release `v0.1.0`** taggata (workflow GHCR multi-arch attivato, `DOCKER_PUBLISH_ENABLED=true`).
      Login premium (logo + icone Google/Discord). **Rimandati**: test E2E (Playwright).
      **Nota**: login social Google/Discord bloccato da `redirect_uri_mismatch` lato OAuth AnimeUnion
      (config di Matteo, non del container); usare email/password.

## Gotchas operativi

- **Workspace shared è una COPIA**, non un symlink: dopo modifiche a `packages/shared` esegui
  `npm install` prima di `npm run typecheck`/dev, altrimenti l'API non vede i nuovi export.
- **API live (al 2026-06-16 sera)**: i 12 endpoint v1.0.3/1.1.x sono tutti dispiegati e rispondono con
  token reale. Solo `POST /me/favorites/sync` non è deployato (non necessario). La shape dei
  contratti `packages/shared/src/contracts/me.ts` combacia con le risposte reali. Base path:
  `https://api.animeunion.tv/api/v1/integration`. Rate limit: 120 req/min per token.
- **Branch**: tutto il lavoro (integrazione API + STEP 2.5→5 + polish post-STEP 5 + quick wins +
  hardening) è **mergiato in `main`** (sempre fast-forward) e pushato su `origin/main`. I branch
  feature (`feat/quick-wins`, `feat/hardening`, ecc.) restano come riferimento ma sono già in `main`.
  Il prossimo step (STEP 6 — Docker/PWA) parte da `main`.
- **Credenziali**: email/password in `.env` (gitignored); token in SQLite (tabella `auth`). Mai
  segreti nel codice/compose. L'utente usa l'account `lookatale95@gmail.com`.
- **Verifica sempre**: `npm run lint` + `npm run typecheck` + `npm run test` verdi prima di committare.
- **Download engine**: il file MP4 viene scaricato in `<target>.part.<queueId>` e rinominato
  atomicamente (`fs.rename`) al path finale `SXXEXY.<lang>.mp4` SUBITO dopo il singolo download.
  Niente finestra `ep_NNN.mp4` esposta a Jellyfin/Plex. `seasonNumber=1` hardcoded (STEP 3).
- **Worker è event-driven**: `tryStartNext()` su enqueue + tick di sicurezza 60s. `maxConcurrent`
  letto da config ad ogni decisione (cambio live). `AbortController` per cancel su downloading.
- Memoria progetto (per Claude): `~/.claude/projects/f--dev-animeunion/memory/` (vedi `MEMORY.md`).

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
12. Error handling: mai `catch {}` vuoto, almeno `logger.error/​debug`.
13. **Niente "Scarica intera serie" cross-stagione**: un episodio alla volta; ammesso accodare gli
    episodi mancanti della stessa entry/stagione (`download.addMissing/addAll`).

## Convenzioni

File kebab-case; funzioni camelCase; componenti React PascalCase; colonne DB snake_case.
Import order: `node:*` → esterni → `@animeunion/*` → `./` → `../`. Commit in italiano.

## Crediti

Powered by AnimeUnion (https://animeunion.tv) — Applicazione ufficiale affiliata.
Sviluppata da iCosiSenpai — https://github.com/iCosiSenpai/animeunion
