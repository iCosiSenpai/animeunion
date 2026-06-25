# Integrazione Jellyfin — idee e futuro

> **Stato: solo documentazione.** Nessuna di queste idee è implementata. Questo file raccoglie le
> direzioni possibili per dare più senso all'app collegandola a Jellyfin (e, dove gli `.nfo` lo
> permettono, anche a Plex/Kodi/Emby). Si decide e si implementa in un batch successivo, una idea
> alla volta, con i suoi test (Regola #5) e il suo commit (Regola #9).

L'app oggi scarica e organizza i file in un layout già pensato per Jellyfin/Plex
(`<root>/<Serie>/Season NN/<Serie> - SxxExx.mp4`, film in cartella propria, speciali in `Specials/`
— vedi [renamer-service.ts](../apps/api/src/services/renamer-service.ts)). Il passo successivo è
**chiudere il cerchio** con il media server: aggiornarlo quando arrivano/spariscono episodi,
arricchire i metadati, e (in prospettiva) ricevere richieste di download.

## Principi comuni (valgono per tutte le idee)

- **Config + segreti.** URL server e API key vivono in `AppConfig`
  ([config.ts](../packages/shared/src/contracts/config.ts)), non nel codice. Le API key vanno
  aggiunte a `SECRET_CONFIG_KEYS` ([config.ts:48](../packages/shared/src/contracts/config.ts#L48))
  così sono mascherate verso il frontend, esattamente come `telegramBotToken`.
- **Best-effort, mai bloccante.** Ogni chiamata a Jellyfin è fire-and-forget: in caso di errore si
  logga (`logger.error/debug`, Regola #12) e si va avanti. Un media server irraggiungibile non deve
  mai bloccare un download.
- **Nessun nuovo loop di sync.** Quasi tutte queste idee sono "broadcast" agganciate a eventi già
  esistenti (fine download, eliminazione file, riclassifica), non polling.
- **Mono-utente**, coerente col resto dell'app.

### Dove si aggancia (punti di estensione già pronti)

| Esigenza | Punto di aggancio esistente |
| --- | --- |
| Azione dopo un download | `worker.on('complete', …)` in [context.ts:131](../apps/api/src/context.ts#L131) (dà `episodeFileId`; il worker emette anche `localPath`/`bytes`) |
| Layout su disco / dove mettere gli `.nfo` | [renamer-service.ts:150-186](../apps/api/src/services/renamer-service.ts#L150) |
| Metadati per gli `.nfo` | tabella `anime` ([schema.ts:12-47](../apps/api/src/db/schema.ts#L12)): `malId`, `anilistId`, `synopsis`, `score`, `studio`, `coverImage`, `bannerImage`, `seriesId`, `seasonNumber` + generi via `anime_genre` |
| Pulsante "Prova connessione" | pattern `testTelegram` in [notification-service.ts](../apps/api/src/services/notification-service.ts) |
| Stato di salute del servizio | router [health.ts](../apps/api/src/routers/health.ts) + UI [diagnostics-view.tsx](../apps/web/src/components/settings/diagnostics-view.tsx) |
| Eliminazione / spostamento file | [file-manager-service.ts](../apps/api/src/services/file-manager-service.ts) |

Config nuove previste (quando si implementerà): `jellyfinServerUrl`, `jellyfinApiKey` (secret),
`jellyfinAutoRefresh`, `jellyfinLibraryId`.

---

## Tier 1 — Candidati n.1 per il prossimo batch

Le due idee con il miglior rapporto valore/sforzo. Sono complementari: la #1 tiene Jellyfin
aggiornato, la #4 lo rende **corretto** (i metadati anime di default su Jellyfin sono notoriamente
imprecisi). Si possono fare insieme.

### #1 — Refresh di Jellyfin dopo il download

A fine job, chiamata all'API Jellyfin per far comparire subito il nuovo episodio.

- **Come.** Agganciare l'hook `worker.on('complete', …)`
  ([context.ts:131](../apps/api/src/context.ts#L131)). Usare un **refresh mirato** alla cartella/item
  (es. `POST /Items/{id}/Refresh`), non un `Library/Refresh` globale, per non martellare il server a
  ogni episodio.
- **Config.** `jellyfinServerUrl` + `jellyfinApiKey` (+ eventuale `jellyfinLibraryId`).
- **Sforzo:** basso. **Valore:** alto.
- **Pro:** i nuovi episodi appaiono subito senza scan periodici di Jellyfin.
  **Contro:** richiede server raggiungibile e una mappatura cartella→libreria.

### #4 — Sidecar NFO + artwork

Scrivere accanto ai video i file metadati standard, attingendo ai dati già in DB.

- **File generati.** `tvshow.nfo` (cartella serie), `season.nfo` (cartella `Season NN`), `<file>.nfo`
  per episodio, più `poster.jpg`/`fanart.jpg` (da `coverImage`/`bannerImage`).
- **Mappatura metadati.** `malId`/`anilistId` → `<uniqueid>`; `synopsis` → `<plot>`; `genres` →
  `<genre>`; `score` (0-100) → `<rating>` riscalato a 0-10; `studio` → `<studio>`; titoli →
  `<title>`/`<originaltitle>`.
- **Come.** Estendere il renamer ([renamer-service.ts:150-186](../apps/api/src/services/renamer-service.ts#L150))
  per emettere i sidecar accanto al `.mp4` finale.
- **Sforzo:** medio. **Valore:** alto.
- **Pro chiave:** **funziona anche senza server Jellyfin né API key** — sono file locali, validi pure
  per Plex/Kodi/Emby. Risolve alla radice il matching anime sbagliato.
  **Contro:** va mantenuto allineato quando i metadati cambiano (vedi #11).

---

## Tier 2 — Completare il loop (sincronia robusta)

### #6 — Test connessione + card in /diagnostica

- Pulsante "Prova connessione Jellyfin" in Impostazioni (clone di `testTelegram`) e una riga Jellyfin
  in `health.status`/`/diagnostica` (raggiungibile, ultimo refresh, eventuali errori).
- **Sforzo:** basso. **Da costruire per primo:** è la base condivisa di tutte le feature server-side
  (senza un modo per verificare URL+API key, le altre idee sono cieche).

### #10 — Refresh anche su elimina/sposta/rinomina

- Lo stesso refresh mirato della #1, agganciato anche alle operazioni del gestore file
  ([file-manager-service.ts](../apps/api/src/services/file-manager-service.ts)), così Jellyfin non
  tiene **voci-fantasma** quando il contenuto sparisce o si riorganizza.
- **Sforzo:** basso (dopo la #1). **Valore:** medio. Chiude il loop "aggiungi *e* togli".

### #11 — NFO rigenerati su riclassifica

- Quando cambia `series_override` (tipo/stagione/parte) o si sposta un file dal gestore, rigenerare
  gli `.nfo` interessati + refresh, così la correzione si riflette subito in Jellyfin.
- **Sforzo:** basso/medio. Tie-in diretto con la #4 (senza, gli `.nfo` restano "vecchi").

---

## Tier 3 — Bidirezionale (stato di visione)

### #2 — Scrobble stato "visto" (push, da Jellyfin all'app)

- Webhook in ingresso da Jellyfin (richiede il plugin **Webhook** lato Jellyfin): alla visione,
  aggiornare cronologia/visione su AnimeUnion e marcare il follow.
- **Sforzo:** medio. **Prerequisito:** rotta in ingresso + plugin Webhook configurato.

### #12 — Import "visto/continua" (pull, da Jellyfin all'app)

- Leggere i resume-point/played da Jellyfin per alimentare il "Continua a guardare" in-app e,
  opzionalmente, spingerli nella cronologia AnimeUnion.
- **Sforzo:** medio. Complementa la #2 (push↔pull): utile se l'utente guarda da Jellyfin e vuole
  ritrovare il punto nell'app.

### #3 — Deep-link "Guarda su Jellyfin"

- Pulsante da scheda/libreria che apre l'item direttamente in Jellyfin (serve una mappatura
  libreria/itemId).
- **Sforzo:** medio.

---

## Tier 4 — Estensioni a lungo termine

### #15 — Richieste in ingresso stile Seerr ✅ IMPLEMENTATO (in ontologia anime)

> **Fatto** (branch `feat/seerr-request-api`). Realizzato **non** piegandosi al mondo Seerr/TMDB ma
> restando in **ontologia anime-native** (slug / MAL / AniList). Vedi
> [docs/INTEGRATION_API.md](INTEGRATION_API.md) per il contratto completo.

- **Cosa fa.** Una rotta REST **fuori da tRPC** — `POST /api/integration/requests` accanto a
  `/health` in [index.ts](../apps/api/src/index.ts), auth header **`X-Api-Key`** — risolve l'anime,
  lo **segue** (watching + auto-download) e ne **accoda** gli episodi già usciti riusando il flusso
  esistente (`follow-service.add` + `download.addAllBySlug`, **Regola #13**). C'è anche
  `GET /api/integration/anime/:slug/status` per la disponibilità (scaricati/totali).
- **Perché i due "nodi aperti" si sono sciolti.** Esistevano **solo** perché Seerr ragiona in
  **TMDB/TVDB**:
  - *Nodo #1 (mapping id)* → la richiesta parla **slug / anilistId / malId / title**, non TMDB.
    Nessun layer di mappatura. (`anime` ha già `malId`/`anilistId`, ora indicizzati per il lookup —
    migrazione `0012`.) **Limite onesto:** gli id esterni risolvono solo contro la **cache locale**
    (l'API AnimeUnion non espone lookup per id); per il match robusto si usa `slug` o `title`.
  - *Nodo #2 (stagioni)* → in ontologia anime **ogni cour è già una entry/slug**, quindi la richiesta
    punta direttamente al pezzo giusto. Con `title`+`season` c'è una disambiguazione best-effort via
    `series-resolver`; per la stagione esatta basta passare lo `slug`.
- **Auth.** `request-auth-service` (clone del pattern `lock-service`: `scrypt` + `timingSafeEqual`,
  hash a riposo, niente chiave in chiaro in SQLite). Generazione/revoca in **Impostazioni →
  Integrazioni**, chiave mostrata una sola volta. Header redatto nei log.
- **Estensioni possibili SOPRA questa API** (non necessarie ora): ricezione dei **webhook
  Jellyseerr** con un layer di mapping TMDB/TVDB→AnimeUnion (riapre i due nodi, da valutare solo se
  si vuole interop col mondo Seerr esistente); un **plugin Jellyfin**/UI dedicata come "front door"
  alternativa. La web UI dell'app resta la vetrina di scoperta primaria.

---

## Valutate e accantonate (per ora)

- **Collection/BoxSet per franchise** — raggruppare in Jellyfin tutte le stagioni+film di uno stesso
  `seriesId` (rispecchia la "card per franchise" della libreria). Valore medio, rimandato.
- **Dedup pre-download** — interrogare Jellyfin per saltare un episodio già presente altrove. Nicchia.
- **Follow → preferito in Jellyfin** — marcare come "favorite" le serie seguite. Valore basso.
- **Onboarding libreria** — helper che crea in Jellyfin la libreria "Anime" puntata alle cartelle di
  download al primo setup. Priorità bassa.
- **Compatibilità Emby/Kodi** — non una feature: gli `.nfo`/poster della #4 sono già standard
  Kodi/Jellyfin/Emby, e l'API refresh/collection è Emby-compatibile. Beneficio "gratis" della #4.
