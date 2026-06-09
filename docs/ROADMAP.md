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

## Settimana 0 — Fondazioni (in corso)

- [x] Config root: `package.json` (workspaces), `biome.json`, `tsconfig.base.json`
- [x] `.gitignore`, `.env.example`, `.nvmrc`, `LICENSE` (AGPL-3.0), `CHANGELOG.md`
- [x] `README.md`, `docs/` (ARCHITECTURE, API_ANIMEUNION, DEPLOYMENT, ROADMAP, CREDITS)
- [x] CI: `ci.yml` (lint + typecheck + test), `docker-publish.yml` (placeholder)
- [x] Issue/PR template
- [x] Landing page `docs/index.html` (GitHub Pages)
- [x] `docker-compose.yaml` (bozza)
- [ ] `packages/shared`: interfaccia `AnimeSource` + contratti zod
- [ ] Scheletro `apps/api` e `apps/web` (package.json + tsconfig)
- [ ] `npm install`, CI verde, repo su GitHub, GitHub Pages attivo

## Post-v1 (orizzonti futuri)

- v0.2.0 — Sync watchlist bidirezionale sito ↔ app
- v0.3.0 — Sottotitoli (.ass/.srt insieme al video)
- v0.4.0 — Multi-utenza
- v0.5.0 — Integrazione Jellyfin/Plex via API
- v0.6.0 — Mobile companion (PWA avanzata / React Native)
- v0.7.0 — Gestione qualità (1080p/720p/480p)
- v0.8.0 — Scheduler avanzato (orari/giorni)
- v0.9.0 — Stable, auto-update via Watchtower
