# CLAUDE.md — AnimeUnion Docker (fonte unica di stato)

> **Leggi questo file per primo a ogni sessione.** È la fonte unica e vivente di: visione, stato,
> roadmap a step, regole, gotchas.
>
> **Ripresa di sessione (Regola #16):** Dopo aver letto CLAUDE.md, apri il file di piano del batch
> corrente in **`plan/`** (indicato in "Roadmap verso vX" qui sotto). Riprendi dall'ultimo step con
> `[ ]`. Non implementare nulla senza prima entrare in plan mode (Regola #14).
>
> **Processo (vincolante):** il piano vivo del batch corrente sta in **`plan/`** nel progetto
> (gitignored, durevole). I file in `~/.claude/plans/` sono **temporanei/effimeri**: la fonte è
> `plan/`. La sezione **"Roadmap verso vX"** qui sotto rimanda sempre al piano attivo in `plan/`.
> **Per ogni step si entra prima in plan mode** (approfondire → implementare a checkbox, Regola
> #14/#15). Quando "Roadmap verso vX" esiste con step `[ ]`, c'è lavoro da fare: leggi il piano.
>
> Spec tecnica: [PLAN.md](PLAN.md). Design: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
> Contratto API: [docs/API_ANIMEUNION.md](docs/API_ANIMEUNION.md).
> Storia batch: [docs/history/](docs/history/).

## Visione

"La tua libreria anime, sempre aggiornata": l'utente segue un anime e ogni nuovo episodio viene
scaricato automaticamente (un episodio alla volta), rinominato e organizzato per Jellyfin. Integrazione
**ufficiale** con AnimeUnion via API (no scraping). App self-hosted in Docker, mono-utente.

## Stack (non negoziabile)

Backend: Node 20 + TS strict + Fastify + tRPC + Drizzle/better-sqlite3 + undici + pino.
Frontend: Next.js 15 App Router + shadcn/ui + Tailwind + TanStack Query + zustand.
Shared: `packages/shared` (zod + interfaccia `AnimeSource`). Video: ffmpeg-static (HLS→MP4).
Scheduler: setInterval (node-cron non usato). Lint: Biome. Test: Vitest (+ Playwright in futuro).
Monorepo npm workspaces: `apps/api`, `apps/web`, `packages/shared`.

## Roadmap verso v0.13.0 — "Mobile First + Rinforzo" (COMPLETO)

> Piano archivio: **[plan/mobile-first-rinforzo.md](plan/mobile-first-rinforzo.md)**
> Branch: `feat/mobile-first-rinforzo` — ff-merged in `main` come `v0.13.0`.

- [x] **Step 0** — Governance: branch, piano in `plan/`, Regola #16 aggiunta, CLAUDE.md trimmed
- [x] **Step 1** — CLAUDE.md trimming: archivio in `docs/history/`, file ridotto da 94k a ~18k
- [x] **Step 2** — Toast mobile fix (status bar overlap, safe-area CSS definitivo)
- [x] **Step 3** — Bottom sheet mobile (`<ResponsiveDialog>` wrapper per i dialog principali)
- [x] **Step 4** — Polling condizionale + error states + `useDownloadSummary` hook + `100dvh`
- [x] **Step 5** — Hardening P0: password cifratura, VAPID guard, `FALLBACK_TOKEN_TTL` 1h, uncaught handler
- [x] **Step 6** — Hardening P1: `enqueueForAutoFollows` batch, `addMissing` inArray, `scan` concorrenza, `likeNeedle` escape
- [x] **Step 7** — Hardening P2: `removeSeriesFolders` realpath, `walk()` depth limit, episodi cache, Map LRU
- [x] **Step 8** — Release v0.13.0

## Batch successivo pianificato: v0.14.0 — "Quality + GPU Upscaling Bridge"

> Piano separato in `plan/quality-gpu-bridge.md` (da creare quando si inizia il batch).
> **Dipendenze esterne:** endpoint XQ/XQ+ dall'admin AnimeUnion + Windows GPU service sul PC.

Step pianificati: GPU service Windows (Python FastAPI + real-esrgan-ncnn-vulkan) → DB upscale →
backend bridge NAS↔GPU (ibrido locale/cloud) → quality nel download engine (XQ/XQ+) → UI quality
+ upscale per-serie → premium gate → release v0.14.0.

## Stato attuale (2026-07-02)

**Versione corrente: v0.13.7 — tag lingua su tutte le card, hero swipe, blocco landscape, orfani spiegati, download alla scelta stato.**
- 363 test verdi, lint/typecheck verdi, build web ok
- v0.13.7: `availableLanguages` (SUB/DUB) su AnimeCard; hero con swipe mobile (+ conferma sync col
  feed ufficiale); prompt download quando un follow passa a watching/plan_to_watch (follow-card);
  blocco landscape su telefono (overlay `.landscape-block` + manifest `orientation: portrait`);
  `/library/missing` auto-scan on mount; colori distinti "non collegato" (ambra) / "Non importato"
  (azzurro) nel gestore file; riquadro esplicativo orfani in libreria. Nota: l'incidente "delete
  gestore file" era un DUPLICATO (`Mission Yozakura Family 2` vs parent `.../Season 02`), non un
  bug: il delete funziona e sposta nel cestino.
- v0.13.6: `overflow-x: clip` globale su `html, body` (rete di sicurezza per "tutto va oltre lo
  schermo" su ogni schermata); titolo "Episodio XX" su due righe su mobile (niente piu' "Ep...");
  sidebar landscape rispetta la safe-area; `useCloseOnScroll` chiude notifiche/download allo scroll
  su mobile; hero home con crossfade+Ken Burns; rimosso "Mostra toast di prova" (test push reale
  resta in `PushToggle`).
- v0.13.4: chiude la 2a via di ri-download (sync preferiti import-only), `library.checkVanished`, UI download mobile.
- Incidente 2026-07-02: accendere l'auto-download con DB desync (molti episode_file `not_downloaded`
  ma file già su disco) e soglie forward-only a 0/null ha ri-scaricato/sovrascritto il backlog (NON
  duplicati: sovrascritture in-place). Fix v0.13.3: `healPresent` in `download-service`. Fix v0.13.4:
  `favorites-service` non accoda piu' download (bypassava soglia+self-heal); i download passano SOLO
  da `enqueueForAutoFollows`. Prima di riaccendere l'auto-download conviene SEMPRE una scansione + soglie al max.
- Aperto: locandina bassa qualità in libreria (#9, serve indagine URL immagine API); riempimento
  stagioni dimezzate = `download.addAll` per anime toccati (self-heal salta i presenti).
- Auto-download "non parte"/push "assenti": quasi sempre config/ambiente, non bug — master globale
  `autoDownload` (default off) + eleggibilità per-follow; push tutto implementato ma nascosto senza
  HTTPS. Vedi memoria `autodownload-eligibility-and-push-https`.
- Diagnosi download lento: contesa I/O sull'HDD pool2 condiviso con Jellyfin, NON un bug (vedi
  memoria `download-slow-jellyfin-io-contention`); mitigato col refresh Jellyfin per-libreria.
- Premium: `GET /me` ancora `role: USER`, nessun endpoint premium lato API (`/me/subscription` 404).
- **Batch attivo:** nessuno. Prossimo: `v0.14.0 "Quality + GPU Upscaling Bridge"`

Funzioni principali operative: download automatico (1 episodio alla volta), FTS5 search, cestino
recuperabile, backup automatico DB, verifica integrità video, Jellyfin integration, nfo sidecar,
gestore file con collega-senza-scaricare, home personalizzabile, calendario, wallpaper.

## Storia batch precedenti

> Dettagli completi in [docs/history/](docs/history/).

| Versione | Batch | Data |
|---|---|---|
| v0.13.0 | Mobile First + Rinforzo | 2026-07-01 |
| v0.12.0 | [Super rinforzo](docs/history/batch-super-rinforzo-v0.12.0.md) | 2026-06-29 |
| v0.10.0 | [Potenziamenti diffusi](docs/history/batch-potenziamenti-diffusi-v0.10.0.md) | 2026-06|
| v0.11.x | [Auto-download affidabile + fix gestore file](docs/history/batch-auto-download-v0.11.x.md) | 2026-06 |
| v0.9.0  | [Seerr per AnimeUnion](docs/history/batch-seerr-v0.9.0.md) | 2026-06-25 |
| v0.5–v0.8 | Rifiniture, hardening, libreria, Docker, PWA | 2026-06 |
| v0.1–v0.4 | Fondamenta, download engine, catalogo, wizard | 2026-06 |

## Gotchas operativi

- **Workspace shared è una COPIA**, non un symlink: dopo modifiche a `packages/shared` esegui
  `npm install` prima di `npm run typecheck`/dev, altrimenti l'API non vede i nuovi export.
- **API live (al 2026-06-16)**: 12/13 endpoint v1.0.3/1.1.x operativi con token reale. Base path:
  `https://api.animeunion.tv/api/v1/integration`. Rate limit: 120 req/min per token.
  Solo `POST /me/favorites/sync` non deployato (non necessario).
- **Branch**: tutto il lavoro viene ff-merged in `main` e pushato su `origin/main`. Il batch corrente
  è `feat/mobile-first-rinforzo`.
- **Credenziali**: email/password in `.env` (gitignored); token in SQLite (`auth`). Mai segreti nel
  codice/compose. Account: `lookatale95@gmail.com`.
- **Credenziali NAS (deploy)**: in **`.secrets/nas.md`** (gitignored). L'alias `ssh nas` (a chiave)
  è il metodo preferito. Mai copiare credenziali in file tracciati.
- **Verifica sempre**: `npm run lint` + `npm run typecheck` + `npm run test` verdi prima di committare.
- **Download engine**: MP4 scaricato in `<target>.part.<queueId>`, rinominato atomicamente al path
  finale `SXXEXX.<lang>.mp4`. Worker event-driven: `tryStartNext()` su enqueue + tick 60s.
  `maxConcurrent` letto da config ad ogni decisione. `AbortController` per cancel.
- **Memoria progetto**: `~/.claude/projects/f--dev-animeunion/memory/` (vedi `MEMORY.md`).

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
12. Error handling: mai `catch {}` vuoto, almeno `logger.error/debug`.
13. **Niente "Scarica intera serie" cross-stagione**: un episodio alla volta; ammesso accodare gli
    episodi mancanti della stessa entry/stagione (`download.addMissing/addAll`).
14. **Ogni step di un batch va prima approfondito, poi implementato a checkbox**: (1) approfondire lo
    step nel file di piano con contesto tecnico verificato (file + righe, contratti, impatto sui
    test) e sotto-task a checkbox `- [ ]`; (2) implementare spuntando le checkbox; (3) chiudere con
    `lint`/`typecheck`/`test`/`build` verdi e un commit dedicato (Regola #9).
15. **Piano durevole in `plan/`, plan mode per ogni step**: il piano vivo del batch sta in `plan/`
    (gitignored, fonte canonica); `~/.claude/plans/` è solo temporaneo. CLAUDE.md "Roadmap verso vX"
    rimanda sempre al piano in `plan/`. **Prima di implementare uno step si entra in plan mode**
    (approfondimento Regola #14), poi si implementa. A fine step aggiorna AVANZAMENTO nel piano +
    "Roadmap verso vX" + "Stato attuale" in CLAUDE.md.
16. **Ripresa sessione — leggi sempre `plan/`**: all'inizio di ogni sessione, DOPO aver letto
    CLAUDE.md, apri il file di piano del batch corrente indicato in "Roadmap verso vX" (es.
    `plan/mobile-first-rinforzo.md`). Trova il primo step con `[ ]` nell'AVANZAMENTO e riprendi da
    lì. Non fare nulla senza aver letto il piano. Il piano è l'unica fonte di verità sullo stato
    degli step — non fidarti della memoria della sessione precedente.

## Convenzioni

File kebab-case; funzioni camelCase; componenti React PascalCase; colonne DB snake_case.
Import order: `node:*` → esterni → `@animeunion/*` → `./` → `../`. Commit in italiano.

## Crediti

Powered by AnimeUnion (https://animeunion.tv) — Applicazione ufficiale affiliata.
Sviluppata da iCosiSenpai — https://github.com/iCosiSenpai/animeunion
