# Batch "Super rinforzo" → v0.12.0 (2026-06-29)

Branch: `feat/super-rinforzo` — ff-merged in `main` a `5248588`
Tag: `v0.12.0` — GHCR multi-arch completato (run `28389552192`), deploy NAS ok.
Test: **342** (+26 nel batch). Lint/typecheck/build web verdi.

## Step completati (0-11)

**0** Governance (branch, piano in `plan/`, puntatori).
**1** Pragmas SQLite: `busy_timeout` + `synchronous=NORMAL` (anti `SQLITE_BUSY` con WAL).
**2** Guardia anti-sovrascrittura su `files.rename`/`files.move`.
**3** Verifica integrità video post-download con ffmpeg-static (`lib/video-verify.ts`,
  config `verifyDownloads`): file corrotto → riscaricato, non in libreria.
**4** Worker ri-risolve URL prima di scaricare (`getEpisodeFile({forceResolve})` + fallback cache).
**5** Ricerca FTS5: migrazione 0015 `anime_fts`, tokenizer `remove_diacritics`, ranking bm25,
  match su titolo eng/jpn, fallback LIKE. "naruto" trova "Narutò".
**6** Cestino recuperabile: `files.remove`→`.trash/`, restore/empty/prune,
  config `trashEnabled`/`trashRetentionDays`.
**7** Backup automatico DB: `db-backup-service` `.backup()` online + retention; ripristino via
  riavvio `applyPendingRestore`; router `backup.list/runNow/restore`.
**8** Premium upsell: tag "Premium" cliccabile (→ animeunion.tv/premium) + `PremiumUpsell` (no gating).
**9** `toastError` coerente + wallpaper via var CSS.
**10** Impostazioni: toggle verifica/cestino + sezione Backup.
**11** Release v0.12.0: CHANGELOG, bump, tag, push, GHCR, deploy NAS (api Up healthy, web HTTP 200
  su :7979, migrazioni ok). Restano verifiche manuali a runtime.
