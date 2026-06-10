# Roadmap — AnimeUnion Docker (8 settimane → v0.1.0)

Sintesi delle milestone. Il piano completo (schema SQL, contratti, API) è in `PLAN.md`.

| Settimana | Tema | Deliverable |
|---|---|---|
| 0 | Fondazioni | Monorepo, CI verde (lint+typecheck), docs, `packages/shared` |
| 1 | Database + AnimeSource | Schema Drizzle, MockSource, ApiSource, rate-limiter; `npm run seed` |
| 2 | Backend tRPC (lettura) | Server Fastify + routers catalog/episode/calendar/follow/config/stats |
| 3 | Frontend shell | Navbar/footer, catalogo, dettaglio anime, about |
| 4 | Follow / Library / Calendar | Pagine frontend complete, toast, skeleton, empty state |
| 5 | Download engine | ffmpeg HLS→MP4, coda, retry, concorrenza, scheduler, pagina download |
| 6 | Renamer + Library scanner + Settings | Rinomina SXXEXX/numerico, scan libreria, pagina impostazioni |
| 7 | Docker / PWA / Notifiche | Dockerfile multi-arch, compose, PWA, Web Push |
| 8 | Test E2E + Release | Vitest/Playwright, beta, CHANGELOG, DEPLOYMENT, release v0.1.0 |

## Settimana 0 — Fondazioni (completata)

- [x] Config root: `package.json` (workspaces), `biome.json`, `tsconfig.base.json`
- [x] `.gitignore`, `.env.example`, `.nvmrc`, `LICENSE` (AGPL-3.0), `CHANGELOG.md`
- [x] `README.md`, `docs/` (ARCHITECTURE, API_ANIMEUNION, DEPLOYMENT, ROADMAP, CREDITS)
- [x] CI: `ci.yml` (lint + typecheck + test), `docker-publish.yml` (placeholder)
- [x] Issue/PR template
- [x] Landing page `docs/index.html` (GitHub Pages)
- [x] `docker-compose.yaml` (bozza)
- [x] `packages/shared`: interfaccia `AnimeSource` + contratti zod
- [x] Scheletro `apps/api` e `apps/web` (package.json + tsconfig)
- [x] `npm install`, CI verde, repo su GitHub, GitHub Pages attivo

## Settimana 1 — Database + AnimeSource (completata)

- [x] Schema Drizzle (10 tabelle) + prima migration, `createDb`/`runMigrations` (WAL, FK on)
- [x] MockSource deterministica (50 anime, 28 generi) + `npm run seed`
- [x] ApiSource sulle API ufficiali `/api/v1/integration` (undici + JWT Bearer + rate limiter), validata dal vivo
- [x] `lib/rate-limiter.ts` (token bucket), `lib/logger.ts` (pino), `config/env.ts`
- [~] ScraperSource fallback — rimandata post-v1 (l'API ufficiale è operativa)

## Settimana 2 — Backend tRPC, parte lettura (completata)

- [x] Server Fastify + plugin tRPC su `/trpc`, `GET /health`, porta da `API_PORT` (default 3001)
- [x] Router: catalog (search/bySlug/byGenre/bySeason/byYear/recent/topRated/sync/syncStatus), episode, calendar, follow, config, stats
- [x] Servizi: catalog (cache 24h + sync background + calendario), follow, config, auth (token JWT persistito, re-login a scadenza)
- [x] Factory source da `SOURCE_MODE` (mock/api) con retry automatico su 401
- [x] Mapping errori di dominio → TRPCError (NOT_FOUND, UNAUTHORIZED, BAD_GATEWAY, ...)
- [x] 48 test Vitest (servizi + integrazione router via createCaller)

## Post-v1 (orizzonti futuri)

- v0.2.0 — Sync watchlist bidirezionale sito ↔ app
- v0.3.0 — Sottotitoli (.ass/.srt insieme al video)
- v0.4.0 — Multi-utenza
- v0.5.0 — Integrazione Jellyfin/Plex via API
- v0.6.0 — Mobile companion (PWA avanzata / React Native)
- v0.7.0 — Gestione qualità (1080p/720p/480p)
- v0.8.0 — Scheduler avanzato (orari/giorni)
- v0.9.0 — Stable, auto-update via Watchtower
