# Batch "Potenziamenti diffusi" → v0.10.0

Branch: `feat/potenziamenti-diffusi` — ff-merged in `main`.
Tag: `v0.10.0` — GHCR multi-arch completato. Deploy NAS ok.
Test: **316** (+25 nel batch). Lint/typecheck/build web verdi.

## Step completati (0-17)

**0** Governance (branch, piano in `plan/`, puntatori).
**1** Bug dettaglio anime: conteggio episodi reale (`Math.max`), freschezza ONGOING (TTL 1h), poster robusto.
**2** Tema light/dark: palette light reale in `:root`, `color-scheme` dinamico, `theme-color` PWA.
**3** Toast iPhone + animazioni: `top-center` + safe-area offset, `reducedMotion` autorevole, transizione pagina.
**4** Home: card overlap (`carouselClassName lg:grid-cols-3`) + hero hi-res (banner full-bleed o backdrop sfocato).
**5** Popup overflow gestore file: `min-w-0 truncate` sulle righe episodio, `break-words` sui titoli.
**6** Pulsante "AnimeUnion" (logo AU SVG) nel dettaglio, link a `animeunion.tv/anime/<slug>`.
**7** Notifiche batching: `notifyDownloadComplete` coalescing per-anime (BATCH_WINDOW_MS=10min),
  test push/PWA (`push.test` router + pulsante UI).
**8** Coda gigante One Piece: `download.summary` aggregato server-side O(#anime + #attivi),
  espansione paginata on-demand, azioni di gruppo server-side.
**9** Ricerca: debounce 220ms, Enter→pagina risultati `/catalog?q=`, ricerca in-app con deep-link sezioni.
**10** Seguiti: "Elimina file scaricati" (voce rossa, riusa `library.deleteSeries`), "Smetti di seguire".
**11** Gestore file: relink dinamico (`refetchInterval` adattivo), rinomina serie, vista `/library/missing`.
**12** Gestore file multi-season: rilevamento stagioni da `FileEntry.extra`, flusso correlazioni.
**13** Collega senza scaricare (stato `external`): `linkExternalFolder`, badge "Esterno",
  `addMissing`/`scan` salta external. +14 test.
**14** Home personalizzabile: `homeLayout` config array, `resolveHomeOrder`, pannello standalone.
**15** Calendario potenziato: vista Settimana/Agenda, filtro "Solo seguiti", date reali.
**16** Wallpaper potenziato: toggle Sketchy, lente→anteprima, Scarica/Apri su wallhaven.
**17** Hardening (sub-step 17.1-17.11): indice DB, scoping gestore file, fairness round-robin,
  `library.unlinkExternal`, redazione push keys, rate-limit 60/min, cooldown 6h falliti,
  `nfo-service`, `jellyfin-service`, scaffolding E2E Playwright, release v0.10.0.
