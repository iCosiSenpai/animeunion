# Richiesta endpoint API — per Matteo (AnimeUnion Docker)

> **Aggiornamento (lato app, in attesa deploy v1.0.3):** Matteo ha confermato le shape finali di
> tutti gli endpoint qui sotto e li rilascia con la **v1.0.3** (non ancora deployata). L'app è già
> stata integrata e tollera i 404 finché l'API non è online (le sezioni nuove restano vuote senza
> errori). Shape finali confermate:
>
> - **A.1** `GET/POST /me/favorites`, `DELETE /me/favorites/:animeId` — R/W idempotente; la GET è
>   arricchita con `slug/title/coverImage/addedAt`. POST→201 (o 200 `{ alreadyExists:true }`),
>   404 se l'anime non esiste; DELETE→204.
> - **A.2** Scelto il **polling** `GET /me/favorites?updatedSince=ISO8601` (no webhook, più adatto
>   al self-hosting dietro NAT). Rate-limit 120 req/min per token.
> - **A.3** `GET /me/watchlist` e `GET /me/cronologia` — **sola lettura**, con `?updatedSince=`.
>   watchlist: `{ animeId, slug, status, updatedAt }` (`PLAN_TO_WATCH|WATCHING|ON_HOLD|COMPLETED|DROPPED`).
>   cronologia: `{ animeId, slug, episodeNumber, watchedAt, completed }` (max 1000). Nota: essendo
>   sola lettura, i cambi di stato fatti nell'app restano locali e non si propagano al sito.
> - **A.4** `GET /me` → `{ id, username, email, avatarUrl, role, createdAt }`.
> - **B.1** `GET /ultimi-episodi?limit=24` → `{ animeId, slug, title, coverImage, episodeNumber, language, releasedAt }`.
> - **B.2** `GET /in-evidenza` → `{ data: AnimeSummary[] }`.
> - **B.3** `GET /news?limit=5` → `{ title, url, slug, image, excerpt, publishedAt }`.
>
> ---

> Ciao Matteo! L'app ufficiale affiliata (AnimeUnion Docker) sta venendo bene: login,
> catalogo, dettaglio, episodi con i link video, calendario e generi funzionano già con gli
> endpoint `integration` che ci hai dato. Grazie davvero.
>
> Per fare il salto di qualità e **unire davvero il sito e l'app**, ci servirebbero alcuni
> endpoint in più. Te li elenco in ordine di priorità, ognuno con il **perché** e una **forma
> JSON suggerita** (puoi adattarla). Tutti autenticati con `Authorization: Bearer <token>` come
> gli altri. Host base: `https://api.animeunion.tv/api/v1/integration`.

---

## A. Dati utente — la richiesta più importante (unione profilo sito ↔ app)

**Obiettivo:** l'app deve poter usare i **Preferiti del sito** come elenco di anime da scaricare
in automatico. In pratica: l'utente mette un anime tra i preferiti sul sito → l'app lo vede e
scarica i nuovi episodi, senza che debba rifare tutto nell'app. Oggi questi dati non sono
esposti (`/me`, `/me/favorites`, `/watchlist`, ecc. rispondono 404).

### A.1 Preferiti (lettura + scrittura) ⭐
```
GET /integration/me/favorites
    200 -> { "data": [ { "animeId": "...", "slug": "...", "addedAt": "ISO8601" } ] }

POST /integration/me/favorites      Body: { "animeId": "..." }   -> 200/201
DELETE /integration/me/favorites/:animeId                         -> 204
```
*Perché:* è il cuore dell'integrazione. Con la **GET** l'app importa i preferiti e attiva
l'auto-download; con **POST/DELETE** il pulsante "Segui/Rimuovi" dell'app aggiorna anche i
preferiti sul sito (sincronizzazione bidirezionale, niente doppioni).

### A.2 Notifica dei cambiamenti (per il download "istantaneo") ⭐
Due opzioni, basta una:
- **Webhook (preferito):** un URL configurabile a cui il sito fa `POST` quando l'utente
  aggiunge/rimuove un preferito (o esce un nuovo episodio di un preferito):
  `POST <app_webhook_url>  { "event": "favorite.added", "userId": "...", "animeId": "..." }`.
- **Polling efficiente (alternativa):** un parametro su A.1, es.
  `GET /integration/me/favorites?updatedSince=ISO8601`, così l'app controlla ogni 5–10 minuti
  solo le novità invece di riscaricare tutta la lista.

*Perché:* senza una di queste, l'app può solo fare polling completo periodico (funziona, ma è
più lento e meno gentile col server).

### A.3 Watchlist e Cronologia (utile, non bloccante)
```
GET /integration/me/watchlist   -> { "data": [ { "animeId", "status", "updatedAt" } ] }
GET /integration/me/cronologia  -> { "data": [ { "animeId", "episodeNumber", "watchedAt" } ] }
```
*Perché:* per mostrare "Continua a guardare" e segnare gli episodi già visti (così l'app può
evitare di riscaricare ciò che hai già finito, se vuoi).

### A.4 Profilo (piccolo, per la UI)
```
GET /integration/me  -> { "id", "username", "email", "avatarUrl" }
```
*Perché:* mostrare nome utente/avatar nell'header dell'app.

---

## B. Home — per replicare la home del sito

L'app vorrebbe avere una home simile a quella del sito. Oggi possiamo già comporne una con
calendario, stagionali e "più votati", ma manca il pezzo principale: **gli ultimi episodi
usciti**.

### B.1 Ultimi episodi usciti ⭐
```
GET /integration/ultimi-episodi?limit=24
    200 -> { "data": [ {
              "animeId", "slug", "title", "coverImage",
              "episodeNumber", "language", "releasedAt": "ISO8601"
            } ] }
```
*Perché:* è il contenuto centrale di una home in stile AnimeUnion ("novità di oggi").

### B.2 In evidenza / Featured (opzionale)
```
GET /integration/in-evidenza  -> { "data": AnimeSummary[] }
```
*Perché:* per il carosello/hero in cima alla home.

### B.3 News (opzionale)
```
GET /integration/news?limit=5  -> { "data": [ { "title", "url", "publishedAt", "image" } ] }
```

---

## Riepilogo priorità
- ⭐ **Bloccanti per l'integrazione vera:** A.1 (preferiti R/W), A.2 (webhook o `updatedSince`),
  B.1 (ultimi episodi).
- **Molto utili:** A.3 (watchlist/cronologia), A.4 (profilo).
- **Opzionali:** B.2 (featured), B.3 (news).

Se per te è più comodo cambiare nomi/percorsi va benissimo: basta che ci accordiamo sulla forma
e sui nomi dei campi. Grazie mille!
