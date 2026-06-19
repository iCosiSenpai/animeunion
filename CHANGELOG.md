# Changelog

Tutte le modifiche rilevanti a questo progetto sono documentate in questo file.

Il formato segue [Keep a Changelog](https://keepachangelog.com/it/1.1.0/)
e il progetto aderisce al [Semantic Versioning](https://semver.org/lang/it/).

## [Unreleased]

### Da fare
- Test E2E (Playwright).
- PWA (manifest + service worker) e notifiche Web Push.

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
