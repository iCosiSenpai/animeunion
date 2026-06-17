# Specifica API AnimeUnion — per il team di AnimeUnion

> **Scopo**: documento di riferimento per il team di AnimeUnion con l'elenco completo di
> **endpoint** e **token/autenticazione** necessari affinché *AnimeUnion Docker* (l'app ufficiale
> affiliata) possa funzionare in modo nativo, senza scraping.
>
> **Host API**: `https://api.animeunion.tv/api/v1` (configurabile lato app via `ANIMEUNION_API_URL`).
> **Formato**: JSON (`Content-Type: application/json; charset=utf-8`) per ogni risposta.
> **Lingua dati**: italiano dove disponibile (campi `*Ita`), con fallback ENG/JPN.
>
> L'app consuma queste API **solo dal backend** (`apps/api`, implementazione `ApiSource`).
> Il frontend non le chiama mai direttamente: il backend fa da proxy + cache + rate-limit.

---

## 0. Legenda priorità

| Simbolo | Significato |
|---|---|
| ✅ | Già presente sul backend del sito (verificato live, vedi §10) — basta esporlo/documentarlo ufficialmente |
| 🆕 | **Da creare** — non risponde ancora |
| ⭐ | **Critico** per il download automatico (cuore dell'app) |

---

## 1. Autenticazione e token ⭐

L'accesso alle API è **obbligatorio** e basato su token Bearer. L'utente finale crea un
account su [animeunion.tv/registrati](https://animeunion.tv/registrati), inserisce
email/password nel `.env` del container, e il backend ottiene i token automaticamente.

### 1.1 Endpoint

```
POST /api/v1/auth/login                                                   🆕 ⭐
     Body:  { "email": "...", "password": "..." }
     200 -> {
              "accessToken":  "<jwt>",
              "refreshToken": "<jwt>",
              "expiresIn":    900,                 // secondi di vita dell'accessToken
              "user": { "id": "...", "email": "...", "username": "..." }
            }
     401 -> credenziali errate

POST /api/v1/auth/refresh                                                 🆕 ⭐
     Body:  { "refreshToken": "<jwt>" }
     200 -> { "accessToken": "<jwt>", "expiresIn": 900 }
     401 -> refresh token scaduto/invalido (l'app rifà il login)
```

Tutte le richieste autenticate viaggiano con header:

```
Authorization: Bearer <accessToken>
```

### 1.2 Flusso lato app

1. Primo avvio → `POST /auth/login` con le credenziali dal `.env`.
2. Token salvati in SQLite (tabella `auth`), **mai** nel compose o nelle env.
3. Ogni richiesta usa `Authorization: Bearer <accessToken>`.
4. Su `401` → `POST /auth/refresh` con il `refreshToken`.
5. Se anche il refresh è scaduto → ri-login con le credenziali del `.env`.

### 1.3 Da concordare con il team di AnimeUnion

- **Durata token**: proposta `accessToken` 15 min, `refreshToken` lungo (≥ 30 giorni).
- **Token applicativo dedicato (opzionale ma preferito)**: trattandosi di un'app
  *ufficiale affiliata*, sarebbe ideale un **API key / service token per-app** rilasciato
  dal team, da affiancare (o sostituire) al login email/password. Permette di revocare
  l'accesso dell'app senza toccare gli account utente e di applicare un rate-limit dedicato.
- **Quali endpoint richiedono auth**: vedi colonna "Auth" nelle tabelle seguenti. Va bene
  anche rendere autenticato *tutto* (catalogo incluso), basta saperlo.

---

## 2. Catalogo

### 2.1 Lista / ricerca anime ✅

```
GET /api/v1/anime
    Auth: no (o sì, da decidere)
    Query:
      q=naruto              # ricerca testuale libera
      page=1                # paginazione
      perPage=24            # default 24
      genre=azione          # slug genere
      type=TV               # TV | MOVIE | OVA | ONA | SPECIAL
      status=COMPLETED      # ONGOING | COMPLETED | UPCOMING
      year=2026
      season=SPRING         # WINTER | SPRING | SUMMER | FALL
      sort=recent           # recent | score | title (da concordare)
    200 -> {
             "data": AnimeSummary[],
             "meta": { "page": 1, "perPage": 24, "total": 5800, "hasMore": true }
           }
```

> **Nota**: oggi `GET /anime` risponde già `{ "data": [...] }`. Va aggiunto il blocco
> `meta` con `page/perPage/total/hasMore` (oggi assente) e i filtri di query sopra,
> se non già tutti supportati.

### 2.2 Dettaglio anime ✅ (+ campi 🆕)

```
GET /api/v1/anime/:slug
    Auth: no
    200 -> AnimeDetail
```

Campi **già restituiti** (verificati live):
`id, slug, title, titleIta, titleEng, titleJpn, synopsis, synopsisEng, type, status,
season, seasonYear, episodeCount, episodeDuration, coverImage, bannerImage, trailerUrl,
studio, source, ageRating, score, anilistId, malId, createdAt, updatedAt, genres[], relationsFrom[]`

Campi **da aggiungere** 🆕 (vedi §4 e §5):
`seriesId, seasonNumber, availableLanguages[]`

> **Episodi**: oggi NON sono inclusi in questa risposta (lista separata, §3.1). Per l'app
> va bene così; se preferisci includerli inline, va comunicato.

### 2.3 Generi ✅

```
GET /api/v1/genres
    Auth: no
    200 -> GenreDetail[]   // { id, slug, name, nameEng, malId }
```

---

## 3. Episodi ⭐

### 3.1 Lista episodi di un anime ✅ (+ campo lingue 🆕)

```
GET /api/v1/anime/:slug/episodes
    Auth: no
    200 -> { "data": EpisodeSummary[] }
```

Campi **già restituiti** (verificati live):
`id, animeId, number, title, titleIta, thumbnail, duration, airDate, isFiller, createdAt, updatedAt`

Campo **da aggiungere** 🆕 ⭐:
```
languages: ["SUB_ITA", "DUB_ITA"]   // array delle lingue disponibili per QUEL episodio
```

> È il dato chiave per gestire anime con sia Sub ITA sia Dub ITA: l'app deve sapere,
> episodio per episodio, quali lingue esistono.

### 3.2 Dettaglio singolo episodio ✅

```
GET /api/v1/anime/:slug/episodes/:number
    Auth: no
    200 -> EpisodeSummary (con languages[])
```

### 3.3 URL di download/streaming per lingua 🆕 ⭐ (l'endpoint più importante)

Questo è ciò che permette il download automatico. Oggi **non esiste** un endpoint che
restituisca la sorgente video.

```
GET /api/v1/anime/:slug/episodes/:number/source?lang=SUB_ITA       🆕 ⭐
    Auth: SÌ (Authorization: Bearer <accessToken>)
    Query:
      lang=SUB_ITA | DUB_ITA      # se omesso -> lingua di default dell'episodio
    200 -> {
             "url":       "https://.../playlist.m3u8",  // HLS (preferito) o MP4 diretto
             "format":    "hls",                         // "hls" | "mp4"
             "language":  "SUB_ITA",
             "expiresAt": "2026-06-10T00:00:00Z"         // null se non temporaneo
           }
    404 -> lingua richiesta non disponibile per quell'episodio
    401 -> non autenticato
```

Note per il team di AnimeUnion:
- L'app converte l'HLS in MP4 con ffmpeg, quindi un **`.m3u8` va benissimo** (anzi è
  preferito a un MP4 monolitico).
- Se gli URL sono **firmati e a scadenza**, indicare `expiresAt`: l'app rigenera l'URL
  prima di scaricare.
- In alternativa all'identificazione per `:slug/:number` si può usare l'ID episodio:
  `GET /api/v1/episodes/:id/source?lang=...` — scegli tu, basta che sia coerente.
- **Un episodio alla volta**: l'app NON scarica intere serie in parallelo. Serve solo la
  sorgente del singolo episodio richiesto.

---

## 4. Doppia lingua (Sub ITA + Dub ITA) ⭐

Riepilogo di cosa serve, lato API, per gestire le due lingue (l'app crea due librerie
Jellyfin separate: `/sub-ita` e `/dub-ita`):

1. `availableLanguages: ["SUB_ITA","DUB_ITA"]` a livello di **anime** (§2.2) — per i badge.
2. `languages: [...]` a livello di **episodio** (§3.1) — perché non tutti gli episodi
   hanno entrambe.
3. `?lang=` sull'endpoint **source** (§3.3) — per scaricare la lingua giusta.

Enum lingue: `SUB_ITA`, `DUB_ITA`.

---

## 5. Raggruppamento serie / stagioni ⭐

Su AnimeUnion ogni stagione è un'entry/slug distinto (es. `re-zero-...-4th-season`).
L'app deve capire che entry diverse sono la **stessa serie** per organizzarle in
`NomeSerie/Season 01`, `Season 02`, ... a prescindere dall'ordine di download.

### 5.1 Opzione A — preferita 🆕

Aggiungere all'oggetto anime (in `GET /anime/:slug` e idealmente in `AnimeSummary`):

```
seriesId:     "naruto"     // identificatore STABILE condiviso da tutte le stagioni della serie
seasonNumber: 2            // numero della stagione dentro la serie (1, 2, 3, ...)
```

### 5.2 Opzione B — alternativa 🆕

```
GET /api/v1/anime/:slug/seasons
    200 -> [ { "slug": "...", "seasonNumber": 1, "title": "...", "episodeCount": 24 }, ... ]
```

### 5.3 Fallback senza supporto API (già possibile oggi)

L'anime espone già `relationsFrom[]` con `relationType` = `PREQUEL | SEQUEL | SPIN_OFF |
CHARACTER | SAME_UNIVERSE`. L'app può ricostruire la catena PREQUEL/SEQUEL e ordinare per
`seasonYear`. È **meno affidabile** (non copre bene OVA/movie intermedi): per questo
l'Opzione A resta preferibile.

> Lato app questi dati alimentano `anime.series_id` / `anime.season_number` e il renamer.

---

## 6. Endpoint secondari (utili, non bloccanti per la v0.1)

### 6.1 Calendario settimanale 🆕

```
GET /api/v1/calendario
    Auth: no
    200 -> CalendarEntry[]    // { day: "LUNEDI", date: "ISO8601", anime: AnimeSummary[] }
```
> Esiste la pagina `/calendario` sul sito ma l'endpoint API `GET /api/v1/calendario`
> oggi risponde **404**. Va esposto.

### 6.2 Anime stagionali 🆕

```
GET /api/v1/stagionali?season=SPRING&year=2026
    Auth: no
    200 -> AnimeSummary[]
```
> Anche qui esiste la pagina `/stagionali` ma l'endpoint API risponde **404**.
> (In alternativa basta che `GET /anime?season=..&year=..` filtri correttamente.)

### 6.3 Ricerca rapida (autocomplete) 🆕

```
GET /api/v1/search?q=bleach&limit=10
    Auth: no
    200 -> AnimeSummary[]
```
> Oggi **404**. In alternativa è sufficiente `GET /anime?q=..&perPage=10`.

### 6.4 Statistiche catalogo 🆕

```
GET /api/v1/stats
    Auth: no
    200 -> { "totalAnime": 5800, "totalEpisodes": 120000 }
```
> Oggi **404**.

---

## 7. Watchlist / Follows (opzionale — serve solo per il sync v0.2) 🆕

Non necessari per la v0.1 (l'app tiene la watchlist in locale). Servono solo se si vuole
il **sync bidirezionale** sito ↔ app in futuro.

```
GET    /api/v1/me/follows            -> { animeId, slug, status, addedAt }[]
POST   /api/v1/me/follows            Body: { animeId, status } -> { id, animeId, status, addedAt }
PUT    /api/v1/me/follows/:animeId   Body: { status }
DELETE /api/v1/me/follows/:animeId   -> 204 No Content
```
Tutti con `Authorization: Bearer <token>`. Enum status:
`plan_to_watch | watching | on_hold | completed | dropped`.

---

## 8. Tipi di riferimento (shape JSON)

> Sono i tipi formalizzati in `packages/shared/src/anime-source.ts`. I nomi campo
> rispecchiano quelli **già restituiti** dal backend del sito.

```ts
AnimeSummary {
  id: string; slug: string; title: string; titleIta: string | null;
  coverImage: string | null; type: string; status: string;
  seasonYear: number | null; score: number | null;
  genres: GenreSummary[];
  availableLanguages: ("SUB_ITA" | "DUB_ITA")[];   // 🆕
  seriesId?: string; seasonNumber?: number;         // 🆕 (§5)
}

AnimeDetail extends AnimeSummary {
  titleEng, titleJpn, synopsis, synopsisEng, bannerImage, trailerUrl, studio,
  episodeCount, episodeDuration, malId, anilistId, season, source, ageRating,
  genres: GenreDetail[]; relatedAnime: RelatedAnime[];   // = relationsFrom
}

EpisodeSummary {
  id: string; animeId: string; number: number;
  title: string | null; titleIta: string | null; thumbnail: string | null;
  duration: string | null; airDate: string | null; isFiller: boolean;
  languages: ("SUB_ITA" | "DUB_ITA")[];            // 🆕 ⭐
}

GenreDetail { id, slug, name, nameEng, malId }

RelatedAnime { id, slug, title, titleIta, coverImage, type, seasonYear, relationType }
```

### Enum

| Campo | Valori |
|---|---|
| `type` | `TV` `MOVIE` `OVA` `ONA` `SPECIAL` |
| `status` | `ONGOING` `COMPLETED` `UPCOMING` |
| `season` | `WINTER` `SPRING` `SUMMER` `FALL` |
| `language` | `SUB_ITA` `DUB_ITA` |
| `relationType` | `PREQUEL` `SEQUEL` `SPIN_OFF` `CHARACTER` `SAME_UNIVERSE` |

---

## 9. Rate limiting (da rispettare lato app)

L'app è progettata per essere "gentile" col server:
- **Cache locale SQLite**: ogni richiesta di catalogo viene cachata; le successive
  colpiscono il DB locale.
- **Throttle**: max ~1 richiesta/secondo (configurabile, token bucket).
- **Sync periodico**: catalogo sincronizzato ogni 24h, non a ogni richiesta utente.
- **Auto-download**: controllo nuovi episodi ogni 6–12h, solo per anime seguiti.
- **Header `X-RateLimit-*`**: se li restituisci (`Limit`, `Remaining`, `Reset`), l'app si
  adatta automaticamente. Indica i limiti che preferisci.

---

## 10. Checklist sintetica per il team di AnimeUnion

**Da creare (bloccanti per la v0.1):**
- [ ] 🆕 ⭐ `POST /auth/login` + `POST /auth/refresh` (token Bearer) — §1
- [ ] 🆕 ⭐ `GET /anime/:slug/episodes/:number/source?lang=` (URL HLS/MP4) — §3.3
- [ ] 🆕 ⭐ campo `languages[]` per episodio in `GET /anime/:slug/episodes` — §3.1
- [ ] 🆕 campo `availableLanguages[]` sull'anime — §2.2 / §4
- [ ] 🆕 ⭐ `seriesId` + `seasonNumber` sull'anime (o `GET /anime/:slug/seasons`) — §5
- [ ] 🆕 blocco `meta { page, perPage, total, hasMore }` in `GET /anime` — §2.1

**Da esporre (probabilmente facili, le pagine esistono già):**
- [ ] 🆕 `GET /calendario` — §6.1
- [ ] 🆕 `GET /stagionali` (o filtri su `/anime`) — §6.2
- [ ] 🆕 `GET /stats` — §6.4

**Già presenti (verificato live — solo da confermare/documentare):**
- [x] ✅ `GET /anime` (lista + filtri)
- [x] ✅ `GET /anime/:slug` (dettaglio + `relationsFrom`)
- [x] ✅ `GET /anime/:slug/episodes`
- [x] ✅ `GET /anime/:slug/episodes/:number`
- [x] ✅ `GET /genres`

**Opzionale (post-v1):**
- [ ] 🆕 `GET/POST/PUT/DELETE /me/follows` (sync watchlist) — §7
- [ ] 🆕 Token/API key dedicata per l'app ufficiale — §1.3

---

## 11. Stato attuale verificato dal vivo (2026-06-10)

> Verifica fatta interrogando `https://api.animeunion.tv/api/v1` con uno User-Agent
> browser. Serve al team di AnimeUnion come fotografia di cosa già risponde, **non** è una richiesta.

| Endpoint | Stato | Note |
|---|---|---|
| `GET /api/v1/anime` | **200** | ritorna `{ data: [...] }`, manca `meta` |
| `GET /api/v1/anime/:slug` | **200** | include `relationsFrom`, **non** include gli episodi |
| `GET /api/v1/anime/:slug/episodes` | **200** | `{ data: [...] }`, **manca** `languages` |
| `GET /api/v1/anime/:slug/episodes/:number` | **200** | dettaglio episodio |
| `GET /api/v1/genres` | **200** | ok |
| `GET /api/v1/news`, `/fansub` | **200** | non usati dall'app |
| `GET /api/v1/calendario` | **404** | da esporre |
| `GET /api/v1/stagionali` | **404** | da esporre |
| `GET /api/v1/search` | **404** | da esporre (o usare `?q=`) |
| `GET /api/v1/stats` | **404** | da esporre |
| `*/source?lang=` (video) | **assente** | **da creare — il più importante** |
| `auth/*`, `me/follows` | **da creare** | non verificati |

⚠️ **Importante**: l'host reale è `https://api.animeunion.tv/api/v1` — diverso da
`https://animeunion.tv/api/v1` indicato in versioni precedenti dei doc. Va allineato
`ANIMEUNION_API_URL` nel `docker-compose.yaml`/`.env`.

---

## 12. Endpoint v1.0.3 — dati utente e home (confermati, in attesa deploy)

> Il team di AnimeUnion ha confermato le shape finali e li rilascia con la **v1.0.3**. L'app è già integrata
> (vedi `apps/api/src/sources/api-source.ts` + servizi `favorites`/`home`/`profile`) e tollera i
> 404 finché l'API non è online. Base path: `…/api/v1/integration`.

### 12.1 Preferiti — fonte di verità per l'app ⭐
```
GET    /me/favorites[?updatedSince=ISO8601]
       200 -> { data: [ { animeId, slug, title, coverImage, addedAt } ] }
POST   /me/favorites      Body { animeId }
       201 -> { ok, animeId, addedAt }   |   200 -> { ok, alreadyExists: true }   |   404 anime inesistente
DELETE /me/favorites/:animeId
       204 (idempotente)
```
L'app importa i preferiti all'avvio + polling `?updatedSince=` (config `favoritesSyncMinutes`, default
10 min) e li usa come lista di auto-download. Il pulsante "Segui/Rimuovi" propaga via POST/DELETE.

### 12.2 Watchlist e Cronologia (sola lettura)
```
GET /me/watchlist[?updatedSince=]  -> { data: [ { animeId, slug, status, updatedAt } ] }
GET /me/cronologia[?updatedSince=] -> { data: [ { animeId, slug, episodeNumber, watchedAt, completed } ] }  // max 1000
```
Status watchlist: `PLAN_TO_WATCH | WATCHING | ON_HOLD | COMPLETED | DROPPED`. La cronologia alimenta
"Continua a guardare" (arricchita con titolo/cover dalla cache locale).

### 12.3 Profilo
```
GET /me -> { id, username, email, avatarUrl, role, createdAt }
```

### 12.4 Home
```
GET /ultimi-episodi?limit=24 -> { data: [ { animeId, slug, title, coverImage, episodeNumber, language, releasedAt } ] }
GET /in-evidenza             -> { data: AnimeSummary[] }
GET /news?limit=5            -> { data: [ { title, url, slug, image, excerpt, publishedAt } ] }
```

Rate-limit: tutti i GET rientrano nei 120 req/min per token.

---

## 13. Social login — device flow (v1.1.x)

> Per gli utenti registrati con **Google/Discord** (senza password, non possono usare
> `/integration/auth/login`). Pattern device flow (`gh auth login` / smart-TV). Integrato lato app
> in `auth-service` + UI `SetupScreen`. Il `device_code` resta segreto sul backend, mai esposto al
> browser. Base path: `…/api/v1/integration/auth/social`.

```
POST /auth/social/start   body { provider: "google" | "discord" }
  200 -> { device_code (segreto), user_code, verification_uri,
           verification_uri_complete, expires_in, interval }
  400 -> provider non abilitato

POST /auth/social/poll    body { device_code }   (ogni `interval` secondi)
  -> { status: "pending" }                         continua
   | { status: "slow_down" }                       allarga l'intervallo
   | { status: "denied" } | { status: "expired" }  ricomincia da /start
   | { status: "approved", token, expires_in: 5184000, user: {...} }
```

Note: pairing valido 10 min; token **one-time sul poll** (consegnato solo alla prima `approved`);
il token è identico a quello email/password (Bearer, 60 gg), quindi il resto dell'integrazione non
cambia — email/password e social sono **alternativi** per ottenere il token.

---

*Documento per il team di AnimeUnion — aggiornato il 2026-06-16. Allineato a `PLAN.md` §5–§7 e
`packages/shared/src/anime-source.ts`. §12 = endpoint v1.0.3 (dati utente + home); §13 = social login.*
