# API di integrazione — richieste in ingresso (stile Seerr)

> Rotte REST **fuori da tRPC** pensate per i servizi esterni (bot, automazioni, un'eventuale
> istanza Seerr/Jellyseerr o un plugin). Permettono di chiedere all'app di **seguire e scaricare**
> un anime. Tutto in **ontologia anime-native** (slug / MAL / AniList), non TMDB/TVDB: ogni
> cour/stagione è già una entry distinta, quindi non serve nessun layer di mappatura id né una
> traduzione delle stagioni.

Base path: `http://<host>:3001/api/integration` (la porta è quella dell'API, non della web UI).

## Autenticazione

Tutte le rotte richiedono l'header **`X-Api-Key`**. La chiave si genera nelle **Impostazioni →
Integrazioni** ("Genera chiave"): viene mostrata **una sola volta** (a riposo è salvata solo come
hash `scrypt`). Senza chiave valida → `401`.

```
X-Api-Key: auk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

## POST /api/integration/requests

Risolve l'anime, lo **segue** (status `watching` + auto-download) e, se richiesto, **accoda** gli
episodi già usciti (Regola #13: solo la stessa entry, un episodio alla volta).

### Body (JSON)

Almeno uno tra `slug`, `anilistId`, `malId`, `title`.

| Campo | Tipo | Note |
| --- | --- | --- |
| `slug` | string | **Preferito**: match esatto, popola la cache. |
| `anilistId` | number | Match esatto, **solo contro la cache locale** (vedi limitazione). |
| `malId` | number | Come sopra. |
| `title` | string | Match fuzzy via ricerca sull'API. |
| `season` | number | Con `title`: disambigua la stagione (1 = prima). |
| `language` | `SUB_ITA` \| `DUB_ITA` | Default: la lingua di config. |
| `download` | boolean | `false` = segui soltanto, niente accodamento. Default `true`. |

### Risposte

- `200` →
  ```json
  {
    "ok": true,
    "animeId": "…",
    "slug": "one-piece",
    "title": "One Piece",
    "seasonNumber": 1,
    "status": "followed",   // "already" se era già seguito
    "enqueued": 12           // episodi accodati da questa richiesta
  }
  ```
- `400` body non valido (`{ error: "invalid_request", issues: [...] }`)
- `401` chiave mancante o errata
- `404` anime non risolto (`{ error: "not_found", message }`)
- `412` download richiesto ma cartelle non configurate (`{ error: "precondition_failed", message }`)

### Esempio

```bash
curl -X POST http://<host>:3001/api/integration/requests \
  -H "X-Api-Key: <chiave>" \
  -H "content-type: application/json" \
  -d '{"slug":"one-piece"}'
```

## GET /api/integration/anime/:slug/status

Stato di disponibilità locale (per i caller che vogliono mostrare "disponibile"). Richiede che lo
slug sia già in cache (cioè che sia stato richiesto almeno una volta), altrimenti `404`.

- `200` → `{ "slug": "one-piece", "total": 1000, "downloaded": 120, "pending": 880 }`
- `401` / `404` come sopra.

```bash
curl http://<host>:3001/api/integration/anime/one-piece/status -H "X-Api-Key: <chiave>"
```

## Limitazione: id esterni

`anilistId`/`malId` risolvono **solo contro la cache locale**: l'API AnimeUnion non espone un lookup
per id esterno. Per il match robusto cross-sistema usa **`slug`** (esatto) o **`title`**. Gli id
esterni restano comodi quando l'anime è già stato sincronizzato/visitato nell'app.

## Note di sicurezza

- Header `X-Api-Key` redatto nei log. Hash a riposo (no chiave in chiaro in SQLite).
- L'app è mono-utente/self-hosted: tieni la porta dell'API sulla rete locale o dietro reverse-proxy.
- Possibile estensione futura **sopra** questa API (senza ridiscuterne le fondamenta): ricezione dei
  webhook Jellyseerr con un layer di mapping TMDB/TVDB→AnimeUnion, oppure un plugin/UI dedicata.
