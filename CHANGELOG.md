# Changelog

Tutte le modifiche rilevanti a questo progetto sono documentate in questo file.

Il formato segue [Keep a Changelog](https://keepachangelog.com/it/1.1.0/)
e il progetto aderisce al [Semantic Versioning](https://semver.org/lang/it/).

## [Unreleased]

### Da fare
- Test E2E (Playwright).
- Setup wizard migliorato (Step F, rimandato).

## [0.3.1] - 2026-06-21

### Fixed
- **Miglioramenti Accessibilità & UI**: convertito `aria-pressed` in `role="radiogroup"` per i componenti personalizzati (classificazione serie e selettore accento) risolvendo problemi di a11y e warning IDE.
- **Rifiniture UX & Gestore file**: consolidamento header di pagina (`PageHeader`), empty state condivisi e focus ring per button personalizzati.
- Aggiunti `aria-label` ai pulsanti solo icona per migliore supporto screen reader.

## [0.3.0] - 2026-06-21

### Added
- **Footer completo**: logo, social (Telegram/Instagram/TikTok), versione app, link Diagnostica,
  segnalazione bug; affordance dei link più chiara.
- **Telegram configurabile dall'app** (Impostazioni → Notifiche): bot token e chat id con
  **"Invia test"**, niente più `.env` obbligatorio (resta come fallback).
- **Centro notifiche potenziato**: notifiche cliccabili (→ scheda/coda), filtri, raggruppamento per
  giorno, lettura singola; nuovi tipi **sync completata** e **disco in esaurimento**.
- **Scoperta saga multi-stagione**: dal download "Trova tutte le stagioni e i correlati" esplora
  l'intero franchise (anche stagioni transitive S3/S4…), come opzione attivabile.
- **Temi anime**: colore accent (palette) + **sfondo wallpaper** (via wallhaven, SFW), in
  Impostazioni e nel wizard.
- **Animazioni & micro-interazioni** (con interruttore "No animazioni" + rispetto reduced-motion).
- **Pagina Statistiche** (catalogo, scaricati, spazio, coda) e **scorciatoie da tastiera** (g+tasto,
  `/`, `?`).
- **Notifica nuova stagione** per le serie seguite (`season_available`).
- **Blocco web UI con passcode** opzionale (Impostazioni → Sicurezza), imposto lato API.
- **PWA installabile** + **notifiche push del browser** (richiedono HTTPS).

### Changed / Hardening
- **Backup/restore** della configurazione (export/import JSON) in Impostazioni.
- **Token Telegram mascherato** verso il frontend (`config.getAll` non lo invia in chiaro).
- **Header di sicurezza** sul web (X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy).

### Migrazione da 0.2.x
- Nuove colonne/tabelle (`follow.known_relation_ids`, `push_subscription`) applicate **in automatico**
  all'avvio (migrazioni `0007`/`0008`). Nessuna azione manuale.
- **PWA/Push** funzionano solo via **HTTPS** (Tailscale / Cloudflare Tunnel / reverse proxy): vedi
  README. Il blocco web UI si recupera con `WEB_LOCK_DISABLED=true`.

## [0.2.0] - 2026-06-20

### Added
- **Conferma stagione al download**: alla prima richiesta di una serie/episodio l'app chiede
  "Confermi che è la Stagione X?" (numero modificabile, opzione **Special** → cartella `Specials`).
  Non si ripete se hai già scaricato da quella serie; pulsante "Vai alla serie".
- **Ricerca stile Spotlight** + **command palette ⌘K** (ricerca anime + azioni rapide).
- **Pagina Download "a contenitori"** stile qBittorrent: un riquadro per anime con avanzamento,
  **velocità ed ETA**, episodi espandibili, filtri di stato, "Scarica prima".
- **Resume dei download** interrotti (HTTP Range): non riscarica da capo dopo un'interruzione.
- **Centro notifiche in-app** (completati/falliti/nuovi episodi) con badge, più inoltro **Telegram**
  opzionale (`TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID` nel `.env`).
- **Follow con opzioni**: stato + auto-download **per-serie** + "scarica subito i già usciti";
  azioni rapide e badge "Auto" nella pagina Seguiti.
- **Pagina Diagnostica**: stato worker, **spazio libero per cartella**, ultima sync, connessione.

### Changed
- **Rilevamento stagioni/sequel** dallo slug quando l'API non fornisce `seriesId`/relazioni
  (con guardia anti-falsi-positivi), così i sequel finiscono nella serie/stagione corretta.
- **Retry intelligente**: gli errori permanenti (4xx, link scaduto, contenuto non video) falliscono
  subito; solo gli errori transitori vengono riprovati.
- **Pulizia automatica della coda**: i download terminati più vecchi di `queueRetentionDays`
  vengono rimossi periodicamente.

### Migrazione da 0.1.x
- Nuove tabelle/colonne (`series_override`, `notification`, `follow.auto_download`, progressi coda)
  applicate **in automatico** all'avvio. Nessuna azione manuale.

## [0.1.2] - 2026-06-20

### Added
- **Wizard di primo setup**: al primo accesso, finché non imposti almeno la cartella
  *Serie · SUB ITA*, l'app guida nella scelta delle cartelle di download (con browser) e avvia la
  prima sincronizzazione. Niente più download salvati in silenzio in `/data/anime`.
- **Pagina Download stile qBittorrent**: un riquadro per anime con avanzamento generale, numero di
  episodi, **velocità ed ETA**, righe per-episodio espandibili e filtro
  Tutti/In corso/Completati/Errori. Cliccando un titolo o un episodio si va alla scheda dell'anime.
- **Correzione manuale di stagione/serie** nel dettaglio anime ("Organizzazione file"), utile quando
  l'API non collega un sequel alla serie madre.

### Changed
- **Rilevamento stagioni/sequel** più robusto: quando l'API non fornisce `seriesId`/relazioni, la
  stagione e la serie madre vengono dedotte dallo slug (`-2nd-season`, `-season-N`, `-ii`,
  `-2`…) con una guardia anti-falsi-positivi. I sequel finiscono nella cartella della serie madre,
  `Season NN` corretta.
- I download vengono **bloccati con un messaggio chiaro** se le cartelle non sono ancora configurate.

### Migrazione da 0.1.1
- Nuove colonne/tabelle applicate **in automatico** all'avvio (nessuna azione manuale).
- Se la `config` è vuota, all'avvio comparirà il **wizard**: imposta le cartelle (es. `/media/Anime`).

## [0.1.1] - 2026-06-19

### Changed
- **Cartelle di download riviste** (configurabili nelle Impostazioni, non più nel `.env`):
  routing automatico per **tipo (serie/film) × lingua (SUB/DUB)** su cartelle separate; layout
  **Jellyfin** `<Titolo>/Season NN/<Titolo> - SxxExx.mp4` con titolo leggibile; film in cartella
  dedicata; suffisso lingua nel nome solo quando SUB e DUB condividono la stessa cartella. Aggiunto
  un **browser cartelle** nelle Impostazioni. Il `.env` ora contiene solo segreti + deploy; nel
  compose si monta il media su `/media`.

### Migrazione da 0.1.0
- I file scaricati con la vecchia struttura (`sub-ita/<slug>/Season NN/...`) risultano **orfani**
  alla scansione della Libreria: rimuovili da lì o spostali nella nuova struttura.

## [0.1.0] - 2026-06-19

Prima release pubblica: applicazione completa e self-hosted in Docker.

### Added
- **Catalogo AnimeUnion**: ricerca e filtri combinati (genere, tipo, stato, anno, stagione, lingua,
  ordinamento), home con sezioni (ultimi episodi, in evidenza, stagione, top, recenti, calendario),
  pagina dettaglio con relazioni e consigliati persistiti.
- **Integrazione API ufficiale v1.0.3/1.1.x** (no scraping): catalogo, preferiti R/W, watchlist,
  cronologia, profilo, ultimi-episodi, in-evidenza, news + **social login** device flow
  (Google/Discord) oltre a email/password.
- **Motore di download** event-driven con FSM (queued→downloading→processing→completed, retry con
  backoff, cancel, concorrenza configurabile), un episodio alla volta; download diretto dalla home
  per singolo episodio.
- **Segui & auto-download**: scheduler che accoda i nuovi episodi degli anime seguiti; pulsante
  Segui "stateful" con i 5 stati e descrizioni.
- **Renamer**: path `sub-ita|dub-ita/<serie>/Season NN/SXXEXX.mp4` con risoluzione serie/stagione e
  correzione della rinumerazione dei sequel.
- **Libreria**: scanner di `animePath`, statistiche, e **gestione file** (elimina episodio, stagione
  o intera serie + file orfani, con pulizia delle cartelle vuote).
- **Indicatore lingua** bandiera+icona (SUB/DUB) e stato di download per episodio nel dettaglio.
- **Hardening**: validazione dei download (rifiuto di pagine HTML "link scaduto"), watchdog stallo
  (60s), guardia spazio disco, gestione `429` (Retry-After/backoff), security headers + CORS
  allowlist, redaction dei segreti nei log, pulizia dei file `.part` orfani all'avvio.
- **Docker**: `Dockerfile` api (eseguito via `tsx`) e web (Next.js standalone), `docker-compose`
  (build da sorgente) + `docker-compose.ghcr.yaml` (immagini pronte), workflow di pubblicazione
  multi-arch (amd64+arm64) su GHCR.
- **Login premium** con logo, icone brand Google/Discord e layout curato.
- **148 test** (Vitest) su servizi core (catalog, download, renamer, library, auth, http-client).

### Note
- Il login **social Google/Discord** dipende dalla configurazione OAuth lato AnimeUnion; nel
  frattempo l'accesso avviene con email/password del proprio account AnimeUnion.
