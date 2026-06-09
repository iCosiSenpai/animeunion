# Claude Prompt — AnimeUnion Docker App (v3)

> Copia il contenuto di questo file e incollalo come primo messaggio in una nuova conversazione Claude.
> Assicurati che Claude abbia accesso al file system per scrivere codice.
> **Il piano completo è in `PLAN.md` nella stessa directory. Leggilo prima di iniziare.**

---

Stai per costruire da zero **AnimeUnion Docker** — l'applicazione ufficiale affiliata ad [AnimeUnion](https://animeunion.tv) per il download self-hosted di anime.

**Novità critica**: Matteo (l'amministratore di AnimeUnion) ha accettato di fornire l'API che abbiamo richiesto. **Lavoriamo direttamente con endpoint ufficiali**, non con scraping o mock.

## Chi sono

Sono Alessio. Lavoro in Apple, studio programmazione. Non sono un ingegnere senior ma leggo codice, architetto progetti e uso l'AI dove ho lacune. Ho un Synology NAS con Docker, Jellyfin, Caddy. Il progetto vive su GitHub: `iCosiSenpai/animeunion` (pubblico, AGPL-3.0).

## Visione

Creare un **"Radarr/Sonarr italiano per gli anime"**. Radarr e Sonarr automatizzano il download di film e serie TV — tu dici "seguo questa serie" e loro cercano, scaricano, rinominano, organizzano i file per Plex/Jellyfin. Ma NON supportano il mercato italiano, i fansub, né fonti in lingua italiana. Noi colmiamo questo vuoto, integrandoci ufficialmente con AnimeUnion.

**Il container serve principalmente ad automatizzare il download**: l'utente cerca un anime, clicca "Segui", e da quel momento ogni nuovo episodio viene scaricato automaticamente. Un episodio alla volta, alla massima velocità che il server AnimeUnion consente. **NON ci sarà un pulsante "Scarica intera serie"** — l'auto-download gestisce tutto.

## Sistema di Autenticazione (★★★★★ — OBBLIGATORIO)

L'autenticazione è **OBBLIGATORIA**. L'API di AnimeUnion non risponde senza login.

**Flusso**:
1. L'utente si registra su [animeunion.tv/registrati](https://animeunion.tv/registrati)
2. L'utente mette le credenziali nel `.env`:
   ```
   ANIMEUNION_EMAIL=suaemail@esempio.com
   ANIMEUNION_PASSWORD=sua_password
   ```
3. Al primo avvio, il backend chiama `POST /api/v1/auth/login` → riceve `accessToken` + `refreshToken`
4. I token vengono salvati in SQLite (tabella `auth`) — **MAI nel compose o in env**
5. Ogni richiesta API usa `Authorization: Bearer <accessToken>`
6. Se scade: refresh automatico via `POST /api/v1/auth/refresh`
7. Se scade anche il refresh: ri-login con le credenziali dalle env

**Il `.env` file NON va MAI committato. È nel `.gitignore`.**
Nel README va spiegato chiaramente.

## Stack (confermato, non negoziabile)

| Cosa | Scelta |
|---|---|
| Backend | Node.js 20 + TypeScript strict + Fastify + tRPC |
| Frontend | Next.js 15 App Router + shadcn/ui + Tailwind |
| Type safety | tRPC end-to-end + zod in `packages/shared` |
| Database | SQLite (better-sqlite3) via Drizzle ORM |
| HTTP client | undici (fetch per API AnimeUnion) |
| Video | ffmpeg-static (HLS→MP4) |
| Scheduler | node-cron |
| Logger | pino |
| Test | Vitest + Playwright |
| Container | Docker multi-arch (amd64+arm64) |
| Registry | ghcr.io/icosisenpai/animeunion |
| Lint | Biome |
| Tema | Auto-detect system preference (next-themes) |
| Notifiche | Web Push (browser + PWA) |
| Package manager | npm |

## Architettura (3 package npm)

1. **`packages/shared`** — tipi zod, AnimeSource interface. Niente runtime pesante.
2. **`apps/api`** — Fastify + tRPC + Drizzle. Routers → Services → Sources.
3. **`apps/web`** — Next.js 15 + shadcn/ui. PWA, Web Push.

## AnimeSource Interface (★★★★★ — il cuore del sistema)

Tutta la comunicazione con AnimeUnion passa da un'interfaccia `AnimeSource` con implementazioni intercambiabili:

- **`ApiSource`** (primaria) — chiama le REST API ufficiali con JWT auth. **Questa è la source di produzione.**
- **`ScraperSource`** (fallback) — parsa `__data.json` di SvelteKit se l'API è down.
- **`MockSource`** (CI) — dataset fittizio per test offline. Mai in produzione.

L'interfaccia è definita in `packages/shared/src/anime-source.ts`. Vedi `PLAN.md` sezione 6 per il contratto completo.

## Modello Dati (SQLite)

Tabelle: `anime`, `genre`, `anime_genre`, `episode`, `follow`, `download_queue`, `config`, `stats`, `auth`.

È una **cache locale del catalogo AnimeUnion** + **dati locali** (watchlist, coda download, config). Vedi `PLAN.md` sezione 5 per lo schema SQL completo.

La tabella `auth` contiene: `access_token`, `refresh_token`, `token_expires`, `user_email`.

## Roadmap (8 settimane)

| Sett | Cosa |
|---|---|
| 0 | Setup repo, CI/CD, documentazione, npm workspaces, packages/shared |
| 1 | Schema Drizzle + migration, MockSource, ApiSource, rate-limiter |
| 2 | Fastify + tRPC, tutti i routers lettura (catalog, episode, calendar), services |
| 3 | Frontend shell + prime pagine (catalog, catalog/[slug], about) |
| 4 | Follow, Library, Calendar frontend, toast, skeleton, empty states |
| 5 | Download engine (ffmpeg, coda, retry, concorrenza), scheduler cron, download page |
| 6 | Renamer (SXXEXX / 01,02,03), library scanner, settings page |
| 7 | Docker multi-arch, PWA, Web Push, docker-compose (con .env), test hardware reale |
| 8 | Test E2E, beta, CHANGELOG, DEPLOYMENT.md, landing page GitHub Pages, release v0.1.0 |

## Regole Ferree

1. **Mai scrivere codice per feature future**. Solo milestone corrente.
2. **tRPC è la legge**. Zero chiamate fetch/axios dal frontend.
3. **Il frontend non chiama mai direttamente AnimeUnion**. Passa sempre dal backend (proxy + cache + rate-limit).
4. **Docker from day one**. Ogni settimana il container builda.
5. **Test su servizi core**. Catalog, download, renamer DEVONO avere test.
6. **Spiegami passo passo**. Sono in learning mode: quando prendi una decisione architetturale, spiegamela brevemente.
7. **Nessun segreto nel codice**. Token, password, URL → solo in variabili d'ambiente o `.env` (gitignored).
8. **Le credenziali AnimeUnion (email/password) nel `.env`**, i token (access+refresh) in SQLite. MAI token in chiaro nel compose.
9. **Un commit = un task**. Messaggio in italiano, descrittivo.
10. **Niente commenti nel codice** a meno che la logica non sia ovvia.
11. **Niente emoji nel codice**.
12. **TypeScript strict**. Niente `any`. Usa `unknown` e type narrowing.
13. **Error handling**: mai `catch (e) {}` vuoto. Almeno `logger.error(e)`.
14. **NON implementare "Scarica intera serie"**. Si scarica un episodio alla volta, l'auto-download gestisce il resto.

## Convenzioni Codice

- File: kebab-case (`anime-card.tsx`, `download-engine.ts`)
- Funzioni: camelCase (`getAnimeBySlug`)
- Componenti React: PascalCase (`AnimeCard`)
- Variabili DB: snake_case
- Import order: `node:*` → esterni → `@animeunion/*` → `./` → `../`
- Commit in italiano

## Crediti (footer e pagina /about)

```
Powered by AnimeUnion (https://animeunion.tv) — Applicazione ufficiale affiliata.
Sviluppata con ❤️ da iCosiSenpai — https://github.com/iCosiSenpai/animeunion
```

## GitHub Pages

Creare una landing page in `docs/index.html` (HTML+CSS puro, Tailwind standalone) con:
- Hero: titolo, sottotitolo, logo AnimeUnion
- 3 feature card
- Spazio per 2/3 placeholder mascotte (SVG, da sostituire dopo)
- One-liner installazione
- Badge (licenza, CI, docker pulls)
- Deploy via GitHub Pages da branch `main` cartella `/docs`

## Per Iniziare — Settimana 0

Esegui i task nell'ordine. Dopo ogni task completato, mostrami un riepilogo e chiedimi conferma prima di procedere.

1. Crea il repo `iCosiSenpai/animeunion` pubblico su GitHub (se non esiste già)
2. Clona il repo in `/home/senpai/Coding/animeunion/`
3. Inizializza npm workspaces: root `package.json` con `"workspaces": ["apps/*", "packages/*"]`
4. Crea `.github/workflows/ci.yml` (Biome + typecheck + vitest)
5. Crea `.github/workflows/docker-publish.yml` (buildx multi-arch)
6. Crea `.github/ISSUE_TEMPLATE/` e `PULL_REQUEST_TEMPLATE.md`
7. Crea `biome.json` alla root
8. Crea `.gitignore` (ASSICURATI che includa `.env`, `*.db`, `node_modules`, `.next`, `drizzle/meta`)
9. Crea `.env.example` (template con `ANIMEUNION_EMAIL` e `ANIMEUNION_PASSWORD` commentati)
10. Crea `.nvmrc` → `20`
11. Crea `README.md` completo (metti in risalto AnimeUnion, spiega il .env, niente token in chiaro)
12. Crea `LICENSE` (AGPL-3.0)
13. Crea `docs/ARCHITECTURE.md`, `docs/API_ANIMEUNION.md`, `docs/DEPLOYMENT.md`, `docs/ROADMAP.md`, `docs/CREDITS.md`
14. Crea `docs/index.html` (landing page GitHub Pages placeholder con spazio mascotte)
15. Crea `docker-compose.yaml` (con `env_file: .env` e variabili `ANIMEUNION_EMAIL`, `ANIMEUNION_PASSWORD`)
16. Init `packages/shared/` con tipi zod e AnimeSource interface
17. Init `apps/api/package.json` con tutte le dipendenze
18. Init `apps/web/package.json` con tutte le dipendenze
19. `npm install` dalla root
20. Verifica CI verde (push iniziale su main)
21. Abilita GitHub Pages da Settings → Pages → branch `main` → `/docs`

**IMPORTANTE**: Leggi `PLAN.md` PRIMA di iniziare. Contiene il piano completo con schema SQL, interfacce, flussi, API specification.

---

*Prompt v3 generato il 2026-06-09 — post-chiamata con Matteo (API confermate)*
