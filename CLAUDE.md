# CLAUDE.md — AnimeUnion Docker (fonte unica di stato)

> **Leggi questo file per primo a ogni sessione.** È la fonte unica e vivente di: visione, stato,
> roadmap a step, regole, gotchas. La spec tecnica di dettaglio è in [PLAN.md](PLAN.md) (schema SQL,
> contratti, flussi). Design di sistema in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Contratto
> API col sito in [docs/API_ANIMEUNION.md](docs/API_ANIMEUNION.md).
>
> **Regola**: a fine di ogni step, aggiorna la sezione "Stato" e "Roadmap" qui sotto.

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

## Stato attuale (2026-06-24)

**Batch rifiniture IN CORSO (branch `feat/follow-status-aware-e-rifiniture`, non ancora merge/
release):** piano a step in `~/.claude/plans/dobbiamo-potenziare-la-logica-parallel-pnueli.md`
(vedi banner "AVANZAMENTO" in cima). **Regola #14** attiva: ogni step prima approfondito (checkbox)
poi implementato + commit dedicato. **Fatti: Step 0-4.** **0** regola di processo (`683787e`).
**1** follow status-aware: per gli anime `COMPLETED` la spunta auto-download e' disabilitata/
oscurata (con nota); `enqueueForAutoFollows` ora e' async, esclude i COMPLETED e per gli ONGOING fa
refresh attivo del catalogo (`getBySlug forceRefresh`) per rilevare i nuovi episodi (`94d3afd`).
**2** polish mobile: zoom PWA off (`viewport maximumScale/userScalable`), fix tastiera ricerca iOS
(drawer "Altro" `onCloseAutoFocus` preventDefault), caroselli orizzontali in Home (`CardCarousel`,
solo Home) (`18d158e`). **3** popup: `DialogTitle` con `break-words/leading-tight/pr-6` + rimosso
`truncate` dai titoli dinamici (`4fca848`). **4** gestore file: contenuto = Season/Special/OVA/ONA
(+Movie); resto = Extra (nuovo `isExtraEntry` su `segs[1]`); UI badge "Extra" vs "Non importato";
gli Special passano a contenuto (`7890843`). **227 test verdi**, lint/typecheck/build web verdi a
ogni step. **PROSSIMO: Step 5** (libreria: una card per serie/franchise con SUB+DUB e stagioni
unite + split TV/Film; tocca il contratto shared `library.ts`) → poi **Step 6** (doc Jellyfin).
Restano solo verifiche manuali a runtime (annotate nel piano).

## Stato precedente (2026-06-22)

**Fase 5 rifiniture frontend (branch `feat/fase-5-rifiniture`, v0.7.1):** patch mirata — l'audit ha
confermato che la Fase 5 era **in gran parte gia' coperta** dalle fasi 1-4 (a11y icon-only completa,
focus-trap via Radix, dialog responsive puliti grazie alla base di Fase 1, command palette non
collide con la safe-area). Restavano due fix: **5A** `pb-safe-b` nella variante `bottom` del `Sheet`
([sheet.tsx](apps/web/src/components/ui/sheet.tsx)) cosi' i bottom-sheet (filtri catalogo) non vanno
sotto l'home indicator iOS (rimosso il duplicato nel drawer "Altro"); **5B** troncamento dei titoli
lunghi nei risultati di ricerca dei dialog del gestore file. Solo CSS, **222 test verdi**,
lint/typecheck/build verdi. **Roadmap a fasi completata** (Fasi 1-5 rilasciate v0.5.3 -> v0.7.1).

**Fase 4 potenziamento Libreria & Gestore file (branch `feat/fase-4-libreria-gestore-file`,
v0.7.0):** richiesta principale dell'utente. **4A Eliminazione affidabile**: `removeFiles` usa sempre
`localPath`, verifica che il file sia davvero sparito e conta i fallimenti (`failedFiles`) senza
marcare "non scaricato" cio' che resta su disco; opzione `deleteFolder` che rimuove ricorsivamente la
cartella serie (`<root>/<primo-segmento>`, confinata) compresi file non tracciati/extra. **4B**
`FileEntry.managed` per le cartelle (contiene un file tracciato) + ordinamento "non importate" in cima
+ badge UI. **4C Flusso Mancanti**: `missingEntries` ora porta `animeId`/`episodeFileId`; "Mancanti"
diventa un pulsante -> `missing-dialog.tsx` con classificazione (`ClassifyFields`) e ri-scarica in
blocco (`download.addMissing`). **4D**: ricerca + ordinamento libreria (alfabetico/ultimo aggiunto/
dimensione/episodi, asc/desc), client-side su `library.list`. Shared:
`libraryDeleteResult.failedFiles`, `deleteFolder` negli input delete, `FileEntry.managed`. **222 test
verdi** (nuovi: deleteFolder, missingEntries arricchiti, managed+sort). Lint/typecheck/test/build
verdi. Nota: un flake una-tantum su `follow-service` sotto carico parallelo non riproducibile (file
non toccato). **Prossima:** Fase 5 (rifiniture frontend + a11y).

**Fase 3 hardening backend (branch `feat/fase-3-hardening`, v0.6.1):** patch mirata (gran parte della
Fase 3 era gia' coperta: scheduler tutto in try/catch, `setOverride` gia' valida l'esistenza, no
ri-accodamento dei completati). **3A** `setOverride` rifiuta serie madre = se stessa e 2-ciclo
(`PreconditionError`). **3B** `syncMovedPaths`/`syncDeletedPaths` del gestore file ora in
`db.transaction` (read+update atomici). **3C** redazione `downloadUrl`/`sourceUrl` nei log
([logger.ts](apps/api/src/lib/logger.ts)). **3D** avviso al cambio di una cartella di download con file
esistenti sotto la vecchia root (hook in `config.set` + `config.countDownloadsUnder`, notifica `info`).
Rimandato di proposito: cooldown per i 4xx permanenti nell'auto-enqueue (il retry dei `failed` ogni
30min e' voluto). **220 test verdi** (nuovi: self-parent/ciclo, `countDownloadsUnder`). Lint/typecheck/
test/build verdi. **Prossime:** Fase 4 Libreria/Gestore file, Fase 5 rifiniture.

**Fase 2 robustezza download (branch `feat/fase-2-robustezza-download`, v0.6.0):** dal piano a fasi.
Migrazione `0011` (`download_queue.target_path/expected_bytes/source_url`). **Self-healing al riavvio**
(`reconcileOrphans`: se il file e' gia' al `target_path` con la dimensione attesa, crash tra rename e
commit, la riga viene finalizzata invece di marcata failed). **Resume sicuro**: il `.part` si riprende
solo se `source_url` salvato == URL ri-risolto (gli URL AnimeUnion scadono; altrimenti si scarta il
parziale e si riparte da zero). **Integrita'**: il downloader rifiuta i troncamenti (`bytesDownloaded
!= Content-Length`) e i contenuti testuali senza firma video (helper `looksLikeVideoStart`/
`looksLikeText`). **Sweep `.part`**: errori loggati invece che ingoiati. **Fix numerazione parti**: in
`previousPartsEpisodeCount` la serie base/root conta come parte 1 quando la stagione corrente e' la sua
(Sakamoto Days parte 2 -> `S01E12`; War of Underworld season 4 con override su entrambe le parti resta
corretto). Nota: la guardia disco pre-move del piano e' stata scartata (l'`atomicMove` e' un rename
same-volume, non consuma spazio). **217 test verdi** (nuovi: renamer Sakamoto, http-downloader
troncamento/testo, worker self-healing/resume sicuro). Lint/typecheck/test/build verdi. **Prossime:**
Fase 3 hardening, Fase 4 Libreria/Gestore file, Fase 5 rifiniture.

**Fase 1 accorgimenti UX (branch `feat/accorgimenti-fase-1-ux`, v0.5.3):** fix bug UI a basso
rischio dal piano a fasi (`plans/proponimi-un-piano-di-flickering-pelican.md`). **Popup overflow**
risolto alla radice (`DialogContent` con `overflow-x-hidden` + `ClassifyFields` con griglie
`grid-cols-1 sm:grid-cols-N` e campo percorso che va a capo); **safe-area iOS top** sulla navbar
(`pt-safe-t`, il dock in basso già usava `pb-safe-b`); **scorciatoia `Ctrl K`** su Windows/Linux
(hook `use-shortcut-label`, l'handler già accettava ctrl+meta); **popup notifiche/download ora
scrollano** (vincolo altezza spostato sul viewport dello `ScrollArea` via `viewportClassName`);
**icone ufficiali MAL/AniList** (`brand-icons.tsx`); **popup download** ordina il file in corso in
cima; **tag "Scaricato" persistente** risolto invalidando `catalog` nelle mutation di
delete/relink/file-manager (i tag "In corso"/"In coda" erano già dinamici via polling 2s).
**212 test verdi.** Lint/typecheck/test/build verdi. **Prossime fasi (dal piano):** Fase 2
robustezza download + migrazione `0011` (Sakamoto Days), Fase 3 hardening, Fase 4 potenziamento
Libreria/Gestore file, Fase 5 rifiniture diffuse.

## Stato precedente (2026-06-21)

**Batch "altri accorgimenti" (branch `feat/accorgimenti-ux-file-manager-part`, v0.5.2):** fix
**overflow popup** (DialogContent responsive `w-[calc(100%-2rem)]` + `max-h-[85dvh]` scroll); **nav
mobile ibrida** (dock voci principali + drawer "Altro", hamburger navbar rimosso); **iOS PWA**
`viewportFit:'cover'` (la safe-area ora funziona, dock non collide con la barra di sistema) + padding
container responsive contro l'overflow ("mix" desktop/mobile); **sidebar desktop** con stato in
`sidebar-store` + `AppMain` (toggle non più coperto/sovrapposto); **link MAL/AniList** nella scheda
anime (dati già presenti); **404 anime spiegato** (`EmptyState` + CTA); **About** con sezioni
"Perché" e "Privacy e cookie"; **gestore file**: niente falsi orfani per gli extra (`Specials`/
`backdrops`/`theme-music` → badge "Extra", colonna shared `FileEntry.extra`), cartella → "Collega a
AnimeUnion"/"Ri-scarica", strumenti "Rinomina secondo lo schema" e "Elimina cartelle vuote";
**stagioni divise in parti** (`series_override.part_number`, migrazione `0010`, offset episodi
continuo nel renamer, campo "Parte" nel dialog Classifica) — risolve War of Underworld 1/2; **loghi**
leggermente più grandi. **212 test verdi.** Lint/typecheck/test/build verdi. **Rimandato:** GitHub
Pages (landing + mascotte).

**Batch UX/UI + gestore file (branch `feat/rifiniture-ux-gestore-file`):** brand cleanup (via
"Radarr/Sonarr", nuovo claim "La tua libreria anime, sempre aggiornata"); **download simultaneo
bloccato a 1** (worker hardcoded, UI "Premium" — config `maxConcurrent` resta per compat); **fix
chrome mobile** (token spacing safe-area/dock in tailwind, save bar solo se dirty e sopra il dock,
footer raggiungibile); **Impostazioni a sezioni navigabili** (rail desktop + pill mobile, niente
lista piatta); **classificazione al download** (`series_override.kind` tv/movie/special +
migrazione `0009`, `series-resolver.resolveWith`, `renamer.previewPath`, `series.previewPath`;
dialog "Classifica e scarica" con tipo+stagione+serie madre+**anteprima path live**; risolve i casi
SAO sequel/film); **gestore file incorporato** (`file-manager-service` + router `files`,
list/rename/move/delete/mkdir/**relink orfano**, guardie root-confined, sync `episode_file`; UI
`/library/files` con drag&drop + banner di avviso); **PWA/HTTPS** guida semplificata (Tailscale) +
card in-app "Perché serve HTTPS"; **header coerenti** (`PageHeader`/`EmptyState`) su pagine
principali; pass a11y (aria-label icon-only, focus ring). Migrazione `0009` (`series_override.kind`).
**207 test verdi.** Tutti i comandi lint/typecheck/build verdi. Rilasciato come `v0.5.0`.

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
- [x] **STEP 7** — **README user-friendly + logo**, `CHANGELOG` 0.5.0, `DEPLOYMENT` completo, e
      **release `v0.5.0`** taggata (workflow GHCR multi-arch attivato, `DOCKER_PUBLISH_ENABLED=true`).
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
14. **Ogni step di un batch va prima approfondito, poi implementato a checkbox**: (1) approfondire lo
    step nel file di piano con contesto tecnico verificato (file + righe, contratti, impatto sui
    test) e sotto-task a checkbox `- [ ]`; (2) implementare spuntando le checkbox; (3) chiudere con
    `lint`/`typecheck`/`test`/`build` verdi e un commit dedicato (Regola #9).

## Convenzioni

File kebab-case; funzioni camelCase; componenti React PascalCase; colonne DB snake_case.
Import order: `node:*` → esterni → `@animeunion/*` → `./` → `../`. Commit in italiano.

## Crediti

Powered by AnimeUnion (https://animeunion.tv) — Applicazione ufficiale affiliata.
Sviluppata da iCosiSenpai — https://github.com/iCosiSenpai/animeunion
