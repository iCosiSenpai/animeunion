# Batch "Auto-download affidabile + fix gestore file" → v0.11.x (post-v0.10.0)

Branch: `feat/auto-download-affidabile-e-fix-gestore-file` — merged in `main`.
Test: **325** (+9). Lint/typecheck/build web verdi.

## Step completati (1-11)

**1** P0 perdita dati: "Ri-scarica" ora riaccoda soltanto (no eliminazione anticipata);
  `files.remove` rifiuta cartelle/file con episodi `external`. +1 test.
**2** "Salva" Impostazioni azzera banner "Modifiche non salvate" (refetch+reset draft).
**3** Toast accodamento leggibili ("Episodio/N episodi in coda").
**4** Sfondo wallpaper visibile su tema chiaro (overlay velo theme-aware 55%/80%).
**5** Popup gestore file: titoli lunghi vanno a capo invece di essere tagliati.
**6** Tag "Extra" depth-agnostic + conteggio stagioni robusto (`FileEntry.content`). +1 test.
**7** Ricerca "Collega"/"Relink" pre-compilata col titolo della serie.
**8** Stato download disk-aware/self-healing: file cancellato manualmente → riaccodato. +3 test.
**9** Auto-download: migrazione 0014 (`follow.auto_download_from_ep`), soglia per-follow,
  eligibilità da stato seguito (non da `anime.status`). +4 test.
**10** Stati seguiti distinti + toggle auto-download sempre usabile. +1 test.
**11** Home "Mostra di più" per sezione con paginazione on-demand.
