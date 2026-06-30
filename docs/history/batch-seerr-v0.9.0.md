# Batch "Seerr per AnimeUnion" → v0.9.0

Branch: `feat/seerr-request-api` → `main`. Rilasciato v0.9.0.
Test: **255** verdi. Lint/typecheck/build web verdi.

## Step completati (0-4)

**0** Contratto shared `requests.ts` (`requestInputSchema`/`requestResultSchema`/`requestStatusSchema`).
**1** Auth `X-Api-Key` (`request-auth-service`, scrypt+hash) + rotta Fastify + router tRPC `requests`
  + card "Integrazioni" in Impostazioni + redazione header nei log.
**2** Risoluzione anime-native (`request-service.resolve`: slug/anilistId/malId→title+season)
  + migrazione 0012 (indici `idx_anime_mal`/`idx_anime_anilist`) + `catalog.findByExternalId`.
**3** `fulfill` = follow+auto + `download.addAllBySlug`, idempotente, `POST /api/integration/requests`.
**4** `GET /api/integration/anime/:slug/status` + docs `INTEGRATION_API.md`.

## Note

Limite onesto: gli id esterni risolvono solo contro la cache (l'API AnimeUnion non espone lookup per id).
