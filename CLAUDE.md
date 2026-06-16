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

## Stato attuale (2026-06-16)

**Fatto:**
- Monorepo, CI (lint+typecheck+test), DB SQLite (10 tabelle), MockSource/ApiSource, rate-limiter.
- Auth: email/password + **social login device flow** (Google/Discord) — `auth-service`, router `auth`.
- Router lettura: catalog, episode, calendar, follow, config, stats + **home, library, profile**.
- Integrazione **7 endpoint v1.0.3** (preferiti R/W + sync, watchlist, cronologia, profilo,
  ultimi-episodi, in-evidenza, news) con scheduler di polling preferiti e auto-accodamento.
- Frontend scoperta: home (con sezioni nuove), catalogo, dettaglio, follows, calendar, about,
  badge profilo navbar, SocialLogin nella SetupScreen.

**In sospeso / non live:**
- Endpoint v1.0.3 + social **non ancora deployati** da Matteo (404 al 2026-06-16; shape confermate).
  Verifica live + merge del branch `feat/integrazione-api-v103-matteo` quando saranno online (STEP 5).

**Manca (il "motore"):** download engine/worker, renamer, library scanner, e 3 pagine sono stub
(`ComingSoon`): **Download, Libreria, Impostazioni**. `ffmpeg-static`/`node-cron` ancora inutilizzati.

## Roadmap a step (verso v0.1.0)

- [x] **STEP 0** — Questo `CLAUDE.md` come file unico; assorbito `CLAUDE_PROMPT.md`; `ROADMAP.md` → puntatore.
- [ ] **STEP 1** — Pagina **Impostazioni** cablata a `trpc.config` (Download, Pianificazione,
      Catalogo+sync ora, Nomi file, Lingua, Tema). ← in corso
- [ ] **STEP 2** — **Download engine** (PLAN §S5): `ffmpeg-bridge`, `download-engine`,
      `download-service`, router `download`, scheduler per follow `watching`, pagina `/downloads`,
      abilitare bottone Scarica nel dettaglio. Dipende dagli URL video reali di Matteo.
- [ ] **STEP 3** — **Renamer + serie/stagione + fix sequel** (PLAN §S6): SXXEXX/NUMERIC, cartelle
      `sub-ita/`+`dub-ita/`, `seriesId`/`seasonNumber`, correzione rinumerazione sequel.
- [ ] **STEP 4** — **Library scanner** + pagina `/library` (PLAN §S6).
- [ ] **STEP 5** — Verifica **live** API (7 endpoint + social) con credenziali + **merge** integrazione.
- [ ] **STEP 6** — Docker multi-arch + PWA + Web Push (PLAN §S7).
- [ ] **STEP 7** — Test E2E (Playwright) + CHANGELOG + DEPLOYMENT + release v0.1.0 (PLAN §S8).

## Gotchas operativi

- **Workspace shared è una COPIA**, non un symlink: dopo modifiche a `packages/shared` esegui
  `npm install` prima di `npm run typecheck`/dev, altrimenti l'API non vede i nuovi export.
- **API live**: gli endpoint v1.0.3 + social erano 404 al 2026-06-16. Il codice tollera i 404
  (degradazione graziosa). Base path: `https://api.animeunion.tv/api/v1/integration`.
- **Branch attivo**: `feat/integrazione-api-v103-matteo` (integrazione) → da cui parte
  `feat/settings-e-motore` (lavoro corrente). `main` non ha ancora questo lavoro.
- **Credenziali**: email/password in `.env` (gitignored); token in SQLite (tabella `auth`). Mai
  segreti nel codice/compose. L'utente usa l'account `lookatale95@gmail.com`.
- **Verifica sempre**: `npm run lint` + `npm run typecheck` + `npm run test` verdi prima di committare.
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
