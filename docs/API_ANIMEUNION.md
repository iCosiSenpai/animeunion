# Specifica API AnimeUnion

> Base URL: `https://animeunion.tv/api/v1` (configurabile via `ANIMEUNION_API_URL`).
> Stato: API ufficiali confermate dall'amministratore (Matteo).

L'applicazione consuma queste API esclusivamente dal backend (`apps/api`), tramite
l'implementazione `ApiSource`. Il frontend non le chiama mai direttamente.

## 1. Endpoint pubblici (no auth)

```
GET  /api/v1/anime
     ?q=test                    # ricerca libera
     &page=1                    # paginazione (default 24)
     &genre=azione              # filtro per slug genere
     &type=TV                   # TV | MOVIE | OVA | ONA | SPECIAL
     &status=COMPLETED          # ONGOING | COMPLETED | UPCOMING
     &year=2026                 # anno
     &season=SPRING             # WINTER | SPRING | SUMMER | FALL
     -> { data: AnimeSummary[], meta: { page, perPage, total, hasMore } }

GET  /api/v1/anime/:slug
     -> AnimeDetail (con generi, episodi, raccomandati, relazioni)

GET  /api/v1/calendario
     -> CalendarEntry[] (settimana corrente, lunedi-domenica)

GET  /api/v1/stagionali?season=SPRING&year=2026
     -> AnimeSummary[] (tutti gli anime di una stagione)

GET  /api/v1/genres
     -> GenreDetail[] (tutti i generi disponibili)

GET  /api/v1/stats
     -> SiteStats (totali catalogo)

GET  /api/v1/search?q=bleach&limit=10
     -> AnimeSummary[] (ricerca rapida per autocomplete)
```

## 2. Endpoint autenticati (richiede `Authorization: Bearer <token>`)

```
POST /api/v1/auth/login
     Body: { email, password }
     -> { accessToken, refreshToken, expiresIn, user: { id, email, username } }

POST /api/v1/auth/refresh
     Body: { refreshToken }
     -> { accessToken, expiresIn }

GET  /api/v1/me/follows
     -> { animeId, slug, status, addedAt }[]

POST /api/v1/me/follows
     Body: { animeId, status }
     -> { id, animeId, status, addedAt }

PUT  /api/v1/me/follows/:animeId
     Body: { status }     # aggiorna solo lo status

DELETE /api/v1/me/follows/:animeId
     -> 204 No Content

GET  /api/v1/episodes/:id/download
     Header: Authorization: Bearer <token>
     -> { url: "https://...", expiresAt: "2026-06-10T00:00:00Z" }
     # URL temporaneo per download MP4
```

## 3. Flusso di autenticazione

1. L'utente inserisce email/password nel `.env`.
2. Al primo avvio il backend chiama `POST /auth/login` -> riceve `accessToken` + `refreshToken`.
3. I token vengono salvati in SQLite (tabella `auth`), mai nel compose o nelle env.
4. Ogni richiesta usa `Authorization: Bearer <accessToken>`.
5. Su `401`, il backend chiama `POST /auth/refresh` con il `refreshToken`.
6. Se anche il refresh è scaduto, ri-login con le credenziali dalle env.

## 4. Rate limiting (da rispettare)

- **Cache locale SQLite**: ogni richiesta di catalogo viene cachata; le successive colpiscono il DB locale.
- **Throttle**: max 1 richiesta API/secondo (configurabile in `rate_limit_ms`).
- **Sync periodico**: catalogo sincronizzato ogni 24h, non a ogni richiesta utente.
- **Auto-download**: controllo nuovi episodi ogni 6–12h, solo per anime seguiti.
- **Header `X-RateLimit-*`**: se restituiti dal server, l'app si adatta automaticamente.

> I tipi `AnimeSummary`, `AnimeDetail`, `EpisodeSummary`, `EpisodeDetail`, `GenreDetail`,
> `CalendarEntry`, `SiteStats` sono definiti formalmente in
> `packages/shared/src/anime-source.ts`.

## 5. Estensioni richieste (v3.1) — da concordare con Matteo

Queste aggiunte servono a (a) gestire anime con **sia Sub ITA che Dub ITA** e (b) **raggruppare le
stagioni** della stessa serie (su AnimeUnion ogni stagione è un'entry/slug distinto).

### 5.1 Lingue per episodio + download per lingua

Oggi `episode.language` è un valore singolo e il download ritorna un solo URL. Servono:

```
# Nel dettaglio anime, per ogni episodio: quali lingue sono disponibili
GET /api/v1/anime/:slug
    -> episodes[].languages: ["SUB_ITA", "DUB_ITA"]   # array, non valore singolo

# Download specifico per lingua
GET /api/v1/episodes/:id/download?lang=SUB_ITA   # oppure DUB_ITA
    Header: Authorization: Bearer <token>
    -> { url, expiresAt, language }
    # Se ?lang manca: ritorna la lingua di default dell'episodio.
    # Se la lingua richiesta non esiste: 404.
```

### 5.2 Raggruppamento in serie/stagioni

Per organizzare le stagioni nella stessa cartella Jellyfin a prescindere dall'ordine di download,
servirebbe (in ordine di preferenza):

```
# Opzione A (preferita): identificatore di serie + numero stagione sull'anime
GET /api/v1/anime/:slug
    -> seriesId: "naruto"          # stabile, condiviso fra tutte le stagioni della serie
       seasonNumber: 2             # numero stagione dentro la serie (1, 2, ...)

# Opzione B: endpoint che elenca tutte le stagioni di una serie
GET /api/v1/anime/:slug/seasons
    -> [{ slug, seasonNumber, title, episodeCount }]
```

**Fallback senza supporto API**: l'app ricostruisce la catena con le relazioni già presenti in
`AnimeDetail.relatedAnime` (`relationType` = PREQUEL/SEQUEL) e ordina per `seasonYear`. Meno affidabile
(non copre OVA/movie intermedi), per questo è preferibile l'opzione A.

> Lato app, questi dati alimentano le colonne `anime.series_id` / `anime.season_number` e la tabella
> `episode_file` (vedi `PLAN.md` §5).
