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

## Roadmap verso v0.16.0 — "Doctor sempre attivo + Premium visibile + UX rifinita" (ATTIVO)

> Piano vivo: **[plan/doctor-premium-ux.md](plan/doctor-premium-ux.md)** (fonte canonica).
> Branch: `feat/doctor-premium-ux` (da `main`). **Cadenza: un solo step per sessione.**
> All'inizio di ogni sessione: leggi CLAUDE.md → apri il piano → riprendi dal primo `[ ]`.

- [x] **Step 1** — Doctor attivo: monitoraggio continuo + auto-resolve + notifica ripristino
- [x] **Step 2** — Ripresa automatica download falliti per cartella read-only (dip. Step 1)
- [x] **Step 3** — Premium visibile e riusabile (meccanica + UI; il perk resta visibile da attivo)
- [x] **Step 4** — Premium nella sidebar
- [x] **Step 5** — Fix "Salva" pagina Aspetto (fetch→invalidate + Tema next-themes)
- [x] **Step 6** — Pagina "Aspetto" rifatta + filtri ricerca sfondo (incl. "Più votati")
- [x] **Step 7** — Pagina "Notifiche" rifatta + Discord (webhook) + PWA install stato-aware
- [x] **Step 7.5** — Setup più user-friendly: stepper etichettato + verifica cartelle live + Aspetto (Tema) + step Jellyfin opzionale + copy
- [x] **Step 8** — Neural Export: spostare tra Download e Pianificazione + spiegare + guida
- [x] **Step 9** — Upscale locale (scaricati + collegati) — con verifica tecnica preliminare
  (dec. B "solo scaricati": external rimandati a post-collaudo GPU)
- [x] **Step 10** — Audit "Verifica integrità download" + coerenza con upscale GPU
- [x] **Step 11** — FAQ/tutorial su GitHub + GitHub Pages
- [x] **Step 12** — Rimozione totale riferimenti a Plex (solo Jellyfin)
- [ ] **Step 13** — Statistiche oneste (episodi distinti, "Episodi totali" onesta)
- [ ] **Step 14** — Polish UI diffuso (Carica altri, empty state, hover sidebar, footer Doctor)
- [ ] **Step 15** — Ricerca feature Premium del sito + Assistenza prioritaria Telegram
- [ ] **Step 16** — Release v0.16.0

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

## Mini-batch "Rifiniture post-Step-1" — perk Premium + onboarding + backup cloud (COMPLETO)

> Piano archivio: **[plan/rifiniture-premium-onboarding.md](plan/rifiniture-premium-onboarding.md)**.
> Emerso dal collaudo dopo lo Step 1 di v0.15.0. **Chiuso 2026-07-09**: si riprende v0.15.0 (release).
> Provider cloud scelto: **Google Drive**.

- [x] **Step A** — Modalità test "nuovo utente" (dev workflow: `.env.newuser` + `dev:newuser`/`reset:newuser`) — 2026-07-07
- [x] **Step B** — Statistiche: catalogo vs libreria (frontend) — 2026-07-07
- [x] **Step C** — Download simultanei come perk Premium (gate su `premium.active`, sblocca `maxConcurrent`) — 2026-07-08
- [x] **Step D** — Backup su Google Drive (`drive.file`, bring-your-own OAuth client Desktop, HTTPS-free) — 2026-07-09

## Roadmap verso v0.15.0 — "Quality + Neural Export (Anime4K)" (COMPLETO — rilasciata 2026-07-09)

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
- [x] **Step finale** — Release v0.15.0 — 2026-07-09

## Stato attuale (2026-07-13)

**Batch attivo: v0.16.0 — "Doctor sempre attivo + Premium visibile + UX rifinita"** (piano
[plan/doctor-premium-ux.md](plan/doctor-premium-ux.md), branch `feat/doctor-premium-ux`). 16 step
pianificati + Step 7.5 inserito. **Step 1-12 + 7.5 COMPLETI (2026-07-17)** (Step 9 chiuso con
decisione B — "solo scaricati", vedi sotto); prossima sessione: Step 13 (statistiche oneste —
rietichettare "Episodi totali", contare episodi distinti). Cadenza un solo step per sessione.

- **v0.16.0 Step 12 (2026-07-17): rimozione totale dei riferimenti a Plex (solo Jellyfin).** Scoperta:
  *non esisteva alcun codice Plex funzionale* — nessuna API/logica dedicata, solo copy e commenti (21
  hit). Ripuliti 14 file live tenendo solo Jellyfin: UI (`settings-view.tsx` titolo sezione + hint NFO,
  `about/page.tsx`, `manifest.webmanifest`), commenti codice (`config.ts`, `context.ts`,
  `download-fs.ts`), e docs (`docs/index.html`, `README.md`, `ARCHITECTURE.md`, `CREDITS.md`,
  `DEPLOYMENT.md`, `JELLYFIN.md`). Dove aveva senso ho tenuto "Kodi/Emby" come compatibilità di fatto
  degli `.nfo`, togliendo Plex come integrazione di prima classe. `CHANGELOG.md` e `PLAN.md` lasciati
  intatti (record storici). Grep finale sulle superfici live: 0 occorrenze. 457 test invariati,
  lint/typecheck/build web verdi.

- **v0.16.0 Step 11 (2026-07-17): FAQ su GitHub Pages + link dall'app.** Prima le funzioni che
  confondono (Push/PWA) rimandavano alle ancore del README su github.com e il Neural Export non aveva
  alcuna guida. Ora c'è una **pagina FAQ dedicata su Pages** — nuova `docs/faq.html` (stesso stile di
  `docs/index.html`: Tailwind CDN, palette slate/brand, `lang=it`) con sommario ad ancore e 7 sezioni:
  `#setup` (installazione, cartelle/volumi, wizard), `#https` (HTTPS/Tailscale), `#pwa-push` (app
  installabile + push), `#neural` (worker GPU: cos'è, perché serve una GPU, come si configura
  URL+token), `#jellyfin`, `#backup` (Google Drive), `#upscale` (upscale locale, solo scaricati).
  La landing `docs/index.html` ha un pulsante **«FAQ e guide»** → `faq.html`. I punti dell'app
  rimandano alla FAQ su `https://icosisenpai.github.io/animeunion/faq.html`: `install-button.tsx` e
  `push-toggle.tsx` → `#https` (prima ancore README), e `neural-export-panel.tsx` ha un **nuovo link**
  «Come si configura il worker?» → `#neural`. HTML statico, nessuna dipendenza/env/migrazione. 457
  test invariati, lint/typecheck/build web verdi.

- **v0.16.0 Step 10 (2026-07-17): audit "Verifica integrità download" + coerenza con upscale GPU.**
  Audit del flusso di verifica integrità. **Confermato:** il motore `verifyVideoFile`
  (`apps/api/src/lib/video-verify.ts`) fa un full-decode `ffmpeg -xerror -f null -` che cattura le
  corruzioni a metà file (non solo Content-Length), degrada in sicurezza se ffmpeg manca (`skipped`),
  ha timeout 120s ed è già testato (3 test). Il percorso **download** (`download-worker.ts:379-389`) è
  opt-in via `config.verifyDownloads` e verifica il `.part` prima della finalizzazione (su KO
  rimuove + riprova da zero). Il percorso **upscale GPU** (`neural-export-service.ts` `finalize`)
  verifica l'output **sempre** (a prescindere dal toggle) via `verify` iniettabile; su KO il job va in
  `error` senza creare la riga XQ e senza toccare la sorgente SD. **Coerenza download→upscale→verifica
  confermata.** **Gap colmati (audit + fix mirati):** aggiunto un test del ramo prima non coperto
  ("output upscalato corrotto → job error, nessuna XQ, SD intatta"; `makeService` ora accetta un
  `verifyImpl` per-test) e chiarita la copy del toggle in Impostazioni (gli upscale neurali XQ/XQ+
  sono sempre verificati, a prescindere dall'interruttore). Scartati per Regola #1: seam DI a
  `verifyVideoFile` nel download-worker (invasivo, motore già testato a parte) e la feature
  "re-verifica libreria on-demand" (non richiesta). Zero migrazioni/endpoint/env. 457 test verdi (+1),
  lint/typecheck/build web verdi.

- **v0.16.0 Step 9 (2026-07-17): upscale neurale locale — decisione B "solo scaricati".** Lo step
  chiedeva di estendere il download neurale (XQ/XQ+) anche agli anime **collegati senza scaricare**
  (`downloadStatus === 'external'`), con una **verifica tecnica preliminare bloccante**: confermare
  che il worker (ffmpeg+libplacebo) upscala correttamente file **non** provenienti dal download
  AnimeUnion. Quel collaudo end-to-end gira **solo sul PC con RTX 5070 Ti** dell'utente, non
  eseguibile in sessione. Dall'analisi del codice il fail-safe è garantito by design (l'output va
  sempre su `renamer.computeEpisodePath` → libreria dell'app, **mai** sull'originale collegato; unico
  punto di rottura `-c:a copy` su audio non-MP4-muxabile → fallimento **pulito per-job**, nessuna
  corruzione). **L'utente ha scelto B — "solo scaricati"**: finché il collaudo GPU su un external
  reale non è fatto, l'upscale sugli external **non si abilita**. Nessuna modifica al comportamento
  runtime: il gate `exportEpisode` (`neural-export-service.ts:420`) resta `downloaded` + `localPath`;
  aggiunto **solo un commento** al gate che spiega l'esclusione volontaria in attesa del collaudo.
  L'apertura agli external (opzione A) è **pronta e documentata** nel piano (backend gate + test +
  UI `anime-detail`) per una sessione futura dopo il collaudo. Zero migrazioni/endpoint; 456 test
  verdi (invariati), lint/typecheck/build web verdi.

- **v0.16.0 Step 9 (2026-07-17): upscale locale — decisione "solo scaricati" (opzione B).** Lo step
  aveva una **verifica tecnica preliminare bloccante**: confermare che il worker (ffmpeg+libplacebo)
  upscala correttamente MP4/MKV **non** provenienti dal download AnimeUnion (i file `external`,
  collegati senza scaricare). Quel collaudo end-to-end gira **solo sul PC con RTX 5070 Ti** dell'utente,
  non eseguibile in sessione. **Decisione utente: opzione B — restare a "solo scaricati"** finché il
  collaudo GPU su un external reale non è fatto. Nessun cambio al comportamento runtime: il gate
  `exportEpisode` (`neural-export-service.ts:420`) resta `downloaded` + `localPath`; aggiunto solo un
  **commento** che spiega l'esclusione volontaria degli `external` in attesa del collaudo (Regola #10).
  Dal codice il fail-safe è comunque garantito e documentato (output sempre su `renamer.computeEpisodePath`,
  mai sull'originale collegato; unico punto di rottura `-c:a copy` su audio non-MP4-muxabile →
  fallimento pulito per-job). L'apertura agli external (opzione A: gate + test + UI `anime-detail` con
  stato "Collegato") è **progettata e pronta** nel piano, da implementare in una sessione futura **dopo**
  il collaudo. Zero migrazioni, zero endpoint nuovi, zero cambi funzionali → 456 test verdi (invariati),
  lint/typecheck/build web verdi. Prossima sessione: Step 10 (audit "Verifica integrità download").

- **v0.16.0 Step 8 (2026-07-17): Neural Export spostato in sezione dedicata "Download Neurale".**
  Prima la config del worker GPU (`neuralExportEnabled`/`neuralWorkerUrl`/`neuralWorkerToken`) +
  `NeuralExportPanel` erano sepolti **inline nel tab Premium** di Impostazioni (`settings-view.tsx`,
  solo sotto `isPremiumActive`), poco scopribili e senza spiegazioni. Ora una **sezione di primo
  livello "Download Neurale"** (icona `Sparkles`) tra "Download" e "Pianificazione": nuovo `SectionId`
  `downloadNeurale` + voce in `SECTIONS`. La sezione è **didattica** (branch Premium): card "Cos'è il
  Download Neurale" (upscale XQ/XQ+ con shader Anime4K, sorgente SD intatta), card "Perché serve un PC
  con GPU" con lista passo-passo (avvia worker → incolla URL+token → Verifica worker → "Migliora a
  XQ/XQ+" dal catalogo), poi la config del worker (spostata 1:1, stessa maschera `SECRET_MASK` sul
  token) e `NeuralExportPanel`. Ramo non-Premium: spiegazione + rimando a `/premium`. Il **tab Premium**
  ora mostra una card "Download Neurale (XQ/XQ+)" che rimanda a `?section=downloadNeurale` (niente più
  config duplicata). Link interni aggiornati: `premium-view.tsx` ("Configura il worker" →
  `downloadNeurale`), command palette (nuova voce "Impostazioni: Download Neurale"), toast export in
  `anime-detail.tsx` ("vedi la coda in Impostazioni › Download Neurale"). **Guida/FAQ:** la sezione è
  auto-esplicativa; la FAQ GitHub Pages resta di competenza dello Step 11 (nessuna duplicazione,
  Regola #1). **Zero migrazioni, zero endpoint nuovi** (riuso di `config`/`neuralExport.*`). 456 test
  verdi (invariati, cambi solo frontend), lint/typecheck/build web verdi.

- **v0.16.0 Step 7.5 (2026-07-17): setup più user-friendly (login + wizard).** Step inserito prima
  dello Step 8 su richiesta utente ("miglioramento setup, sia design che informazioni, più user
  friendly"). Prima il wizard aveva 4 passi con pallini muti (`StepDots`), cartelle salvate senza
  alcun feedback di scrivibilità, Aspetto coi vecchi picker inline (senza scelta Tema), nessun setup
  Jellyfin. Ora `setup-wizard.tsx`: **`SetupStepper`** etichettato a 5 passi (Benvenuto·Cartelle·
  Aspetto·Jellyfin·Fine, numeri→spunta, `aria-current="step"`, label nascoste sotto `sm`); **step
  Cartelle a due tempi** — "Salva e verifica" rilegge `config.downloadDirs` e mostra un **badge** per
  ogni cartella configurata (verde "Scrivibile" / ambra "Non scrivibile / non montata") + banner che
  spiega il mapping `docker-compose`; il required non-scrivibile **segnala ma non blocca** (ogni
  modifica al percorso resetta la verifica); **Aspetto** riusa `AppearanceSection` dello Step 6 (Tema
  chiaro/scuro/sistema via `next-themes` `useTheme`, accent/sfondo/animazioni via `applyTheme`); **nuovo
  step Jellyfin opzionale** tra Aspetto e Fine (URL + API key + "Prova connessione" via
  `jellyfin.testConnection` con nome+versione/errore + toggle auto-refresh; "Salta" avanza senza
  salvare; salva su `jellyfinServerUrl`/`jellyfinApiKey` (solo se digitata, è segreto)/`jellyfinAutoRefresh`).
  Copy: benvenuto con box "Come funzionano le cartelle" (`/media`), messaggio finale rivisto,
  `setup-screen.tsx` con riga di contesto post-login. **Zero migrazioni, zero endpoint nuovi** (riuso
  di `config.downloadDirs`, `jellyfin.testConnection`, `AppearanceSection`). `auth-gate.tsx` intatto:
  la guardia resta `seriesPathSub`, lo step Jellyfin non blocca. 456 test verdi (invariati),
  lint/typecheck/build web verdi.

- **v0.16.0 Step 7 (2026-07-14): pagina "Notifiche" rifatta + Discord + PWA stato-aware.** Prima la
  sezione Notifiche era una lista piatta di `Field` (in-app/Telegram/push/PWA mischiati) con un blocco
  decorativo "Provider futuri › Discord". Ora un helper locale **`NotifyGroup`** (card bordata
  icona+titolo+descrizione, gemello di `Group` in `appearance-section.tsx`) raggruppa i controlli per
  **canale**: *Nell'app* (completamento, nuove stagioni), *Telegram*, *Discord*, *Push del browser*,
  *App installabile (PWA)*. **Discord è stato implementato per davvero** (decisione utente, non più solo
  etichetta): notifier webhook parallelo a Telegram — `apps/api/src/lib/discord.ts`
  (`createDiscordNotifier`: POST `{content}` al webhook, 204/2xx=ok, best-effort) + `discord.test.ts`
  (5 test con `MockAgent`); config shared **`notifyDiscord`** + **`discordWebhookUrl`** (secret,
  mascherato con `SECRET_MASK` come i token Telegram/Jellyfin); dispatch in `notification-service`
  (`config.get('notifyDiscord') && discord?.isConfigured()`); mutation `notifications.testDiscord`;
  wiring `context.ts` (`config.get('discordWebhookUrl') || resolvedEnv.DISCORD_WEBHOOK_URL`, env come
  fallback deploy). UI card Discord: toggle inoltro + Webhook URL mascherato (placeholder/rimuovi come
  Bot Token) + "Invia messaggio di test" + link guida webhook. **`install-button.tsx` reso stato-aware**:
  *installata* (`matchMedia('(display-mode: standalone)')`/`navigator.standalone` iOS + listener
  `appinstalled`, mostra conferma) / *installabile* (`deferred` → prompt) / *non supportata* (nota HTTPS
  + link guida). Zero migrazioni (tabella `config` key-value). 456 test verdi (+5 Discord),
  lint/typecheck/build web verdi.

- **v0.16.0 Step 6 (2026-07-14): pagina "Aspetto" rifatta + filtri ricerca sfondo.** Prima la sezione
  Aspetto era quattro `Field` grigi impilati (Tema/Accent/Sfondo/Animazioni come dropdown/swatch) senza
  anteprime, inline in `settings-view.tsx`. Ora è una **`appearance-section.tsx`** estratta (props
  discrete disaccoppiate da `AppConfig`, come `AccentPicker`/`WallpaperPicker`) con card di gruppo
  `Group`: **Tema** = 3 card cliccabili con **mini-mockup** (`ThemeMockup` — barra sidebar + righe
  contenuto nei colori del tema; 'system' = diagonale chiaro/scuro), applica subito via next-themes;
  **Accent** = `AccentPicker` + pill di anteprima nel colore `--primary`; **Sfondo** = `WallpaperPicker`;
  **Animazioni** = due card radio Attive/Disattive. A11y: `radiogroup`/`radio`+`aria-checked`, icone
  decorative `aria-hidden`, niente info solo-colore. Ricerca sfondo: nuovo `sorting` (`toplist`=Più
  votati / `favorites`=Più amati) esposto in `wallpaperSearchInputSchema` e onorato in `wallhaven.ts`
  (override esplicito + `topRange=1y` su toplist; default auto `q?relevance:toplist` invariato);
  controllo "Ordina per" nel Popover filtri + **badge preferiti** `Heart`+conteggio (`favorites`
  mappato dal DTO, `wallpaperSchema` esteso) sulle miniature. Nessuna migrazione/env. 451 test verdi
  (+4 wallhaven), lint/typecheck/build web verdi.
- **v0.16.0 Step 5 (2026-07-13): fix "Salva" pagina Aspetto.** Prima salvando accent/sfondo la barra
  "Salva" spariva ma il tema non cambiava a schermo fino a un reload: `saveChanges`
  (`settings-view.tsx`) faceva solo `utils.config.getAll.fetch()` (write-cache), e gli osservatori del
  tema (`app-theme.tsx` `staleTime 60s`, `animation-provider.tsx` `staleTime 10s`) non
  ri-renderizzavano. Ora dopo `fetch()`+`setDraft(fresh)` (che resta per resettare il draft sui
  segreti mascherati → niente banner "Modifiche non salvate" fantasma) c'è un
  `await utils.config.getAll.invalidate()` che forza il refetch/re-render di quegli osservatori →
  accent/sfondo/animazioni si applicano subito (stesso pattern di `backup-section.tsx`). Il **Tema**
  (chiaro/scuro/sistema) resta gestito da `next-themes` (preview istantanea, fuori dal draft): copy
  chiarita ("Si applica subito") per non farlo sembrare "non salva"; hint "Sfondo" allineato
  ("Si applica dopo il salvataggio"). Nessuna migrazione/env. 447 test verdi (invariati),
  lint/typecheck/build web verdi.
- **v0.16.0 Step 4 (2026-07-13): Premium nella sidebar.** Prima il Premium era solo un tab sepolto in
  Impostazioni (`?section=premium`), senza un accesso di primo livello. Ora c'è una **pagina dedicata
  `/premium`** (`app/(app)/premium/page.tsx` + `components/premium/premium-view.tsx`) che riusa i
  componenti già estratti: branch `isPremiumActive(trpc.profile.me)` → `PremiumStatusPanel` (stato +
  tier + funzioni sbloccate) con rimando "Configura il worker" a Settings, oppure `PremiumUpsell`;
  loading skeleton + `QueryError`. Voce **sidebar "Premium"** (icona `Crown`) via `nav.ts` (non
  `primary`: desktop rail + drawer "Altro" mobile) + `ICONS['/premium']`. Il **tab Settings›Premium**
  ora rimanda alla pagina (card compatta al posto di `PremiumStatusPanel`/`PremiumUpsell`) ma
  **mantiene la config del worker Neural Export** (Step 8 la sposterà). Command palette: voce
  "Premium" tra le azioni principali → `/premium`. Nessuna migrazione/env. 447 test verdi (invariati),
  lint/typecheck/build web verdi.

- **v0.16.0 Step 3 (2026-07-13): Premium visibile e riusabile.** Prima le voci sbloccate dal Premium
  perdevano ogni segno di essere un perk. Ora una **mappa `feature→entitlement` estendibile** in
  shared (`premiumFeatureSchema` enum `concurrentDownloads`/`neuralExport` + `hasPremiumFeature` che
  riusa `isPremiumActive`/`hasNeuralExport`, fail-closed — Regola #1: solo le due feature odierne) e
  una **primitiva UI riusabile** `apps/web/src/components/settings/premium-feature.tsx`
  (`PremiumUnlockedNote` = riga "Sbloccato col tuo piano Premium" con `Crown`; `PremiumLockedNote` =
  lock-pill estratto dal markup prima duplicato; `PremiumInlineBadge` = mini-badge "Premium" per le
  voci di menu). Cablata su **download simultanei** (`settings-view.tsx`: nota sotto il Select da
  attivo, `PremiumLockedNote` da bloccato) e sulle voci **"Migliora a XQ/XQ+"** del dropdown catalogo
  (`anime-detail.tsx`). Nessuna migrazione/env. 447 test verdi (+4), lint/typecheck verdi.
- **v0.16.0 Step 2 (2026-07-13): ripresa automatica download falliti per cartella read-only.** Chiude
  l'incidente Jellyfin read-only: prima i download falliti per cartella non scrivibile restavano
  `failed` per sempre anche dopo il fix dei permessi. Ora il motore **classifica** la causa del
  fallimento terminale (`classifyError` in `download-worker.ts`: `PermanentDownloadError`→`permanent`,
  errno FS `EACCES/EPERM/EROFS/ENOSPC/EIO/ENXIO` o nuovo `EnvironmentDownloadError`→`env`, resto
  →`other`) e la **persiste** in `download_queue.fail_kind` (migr. **0020**, nullable/additiva). Il
  Doctor, quando un check `writable`/`disk` transita critical→ok (nuovo callback `onWritableRestored`
  in `doctor-service`), chiama `download.resumeEnvFailed()` → `worker.retryEnvFailed()` che rimette in
  `queued` **solo** i `fail_kind='env'` (`retryAt=null`, riparte subito), lasciando fermi
  `permanent`/`other`; notifica in-app "Download ripresi" solo se `n>0`. Cablaggio in `context.ts`
  (download creato prima di doctor). 443 test verdi (+5), lint/typecheck/build web verdi. Regola #1
  rispettata: `fail_kind` è esattamente il consumer del segnale prodotto dallo Step 1.
- **v0.16.0 Step 1 (2026-07-13): Doctor attivo.** Nuovo `doctor-service` (in memoria, Regola #1:
  nessuna tabella) che generalizza il vecchio pattern `lowRoots` dello scheduler: `runChecks()`
  verifica scrivibilità cartelle download, spazio disco, connessione API, Jellyfin (solo se
  configurato); mantiene lo stato tra i tick e notifica solo le **transizioni** (ok→critical =
  `doctor_alert`; critical→ok = `doctor_resolved`, l'alert sparisce da solo). Lo scheduler ha un
  **tick Doctor** ogni 5 min (+ run ~20s dopo l'avvio) che **assorbe** il vecchio check disco a 6h
  (niente doppie notifiche `disk_low`). Shared: `doctorStateSchema` + 2 nuovi `NotificationType`.
  Router `doctor` (`state` query cheap + `run` mutation per il pulsante Aggiorna). Frontend: la
  pagina `/diagnostica` diventa **"Doctor"** con una card di stato monitorato in cima; `SetupBanner`
  ora è guidato dallo stato Doctor (auto-hide su ripristino, link → Doctor). Il segnale "cartella di
  nuovo scrivibile" è il gancio per lo Step 2. 438 test verdi, lint/typecheck/build web verdi.
  Formato del piano `plan/doctor-premium-ux.md` allineato agli altri (sotto-task a checkbox).

**Versione corrente: v0.15.0 — "Quality + Neural Export (Anime4K)".** Coesistenza SD/XQ/XQ+, upscale
via worker GPU esterno, Premium cablato sul profilo del sito, + rifiniture (download simultanei
Premium, backup Google Drive, statistiche oneste, workflow test "nuovo utente"). Rilasciata 2026-07-09
(bump root+api+web, ff-merge in `main`, push origin). **Deploy NAS: manuale (a carico utente)** — su
NAS servono `AUTH_ENCRYPT_KEY` (già impostata dal v0.14.0) e le migration 0018/0019 (auto all'avvio).
Il worker GPU (`apps/worker`) gira sul PC con RTX 5070 Ti, non sul NAS.
- 432 test verdi, lint/typecheck (tutti i workspace) verdi, build web ok
- Mini-batch Step D (2026-07-09): **backup su Google Drive** — `cloud-backup-service` con
  bring-your-own OAuth client **Desktop** (scope `drive.file`), flusso **HTTPS-free** (redirect
  loopback `http://127.0.0.1` + incolla-codice manuale, pattern rclone) perché l'app gira in HTTP e
  Google accetta redirect http solo su localhost. **Zero nuove dipendenze** (token exchange/refresh +
  upload multipart REST via `undici`). Config `gdrive*` (secret cifrati: `gdriveClientSecret`,
  `gdriveRefreshToken`); router `backup.google*`; scheduler `backupTick` fa il push best-effort dopo
  il backup locale (se `gdriveEnabled`+collegato); UI sotto-sezione in `backup-section.tsx`. Il push
  crea/riusa la cartella Drive "AnimeUnion Backups", carica il `.db` più recente e pota oltre
  `gdriveRetention`. Stato ultimo upload/errore in memoria (Regola #1: niente tabella nuova). 8 test
  MockAgent. Collaudo reale (client Desktop + upload) a carico utente.
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
- **Batch v0.15.0 CHIUSO e RILASCIATO (2026-07-09).** Piano archivio
  [plan/quality-gpu-bridge.md](plan/quality-gpu-bridge.md). Step 1-2-3 + mini-batch "Rifiniture
  post-Step-1" (A+B+C+D) + Step finale (release) completi. **Nessun batch attivo:** prossimo lavoro da
  decidere con l'utente (idee aperte: setup wizard Step F, GitHub Pages, E2E in CI — vedi CHANGELOG
  [Unreleased]).

Funzioni principali operative: download automatico (1 episodio alla volta), FTS5 search, cestino
recuperabile, backup automatico DB, verifica integrità video, Jellyfin integration, nfo sidecar,
gestore file con collega-senza-scaricare, home personalizzabile, calendario, wallpaper.

## Storia batch precedenti

> Dettagli completi in [docs/history/](docs/history/).

| Versione | Batch | Data |
|---|---|---|
| v0.15.0 | Quality + Neural Export (Anime4K) + rifiniture Premium | 2026-07-09 |
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
