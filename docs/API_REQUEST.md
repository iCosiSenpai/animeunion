# Richiesta endpoint API — AnimeUnion Docker

> **Aggiornamento:** le shape finali degli endpoint qui sotto sono state confermate dal team di
> AnimeUnion e rilasciate con la **v1.0.3**. L'app è già stata integrata e tollera i 404 finché
> l'API non è online (le sezioni nuove restano vuote senza errori). Shape finali confermate:
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

> L'app ufficiale affiliata (AnimeUnion Docker) sta venendo bene: login, catalogo, dettaglio,
> episodi con i link video, calendario e generi funzionano già con gli endpoint `integration` forniti.
>
> Per fare il salto di qualità e **unire davvero il sito e l'app**, ci servirebbero alcuni endpoint
> in più. Li elenchiamo in ordine di priorità, ognuno con il **perché** e una **forma JSON suggerita**
> (adattabile). Tutti autenticati con `Authorization: Bearer <token>` come gli altri. Host base:
> `https://api.animeunion.tv/api/v1/integration`.

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

---

## C. Follow-up Premium per l'app Docker (v0.17.0)

> Stato verificato sui contratti `INTEGRATION_PREMIUM.md` / `INTEGRATION_NEURAL_EXPORT.md` e sulla
> [pagina Premium ufficiale](https://animeunion.tv/premium). Contenuto della pagina pubblica
> riformulato per conformità alle restrizioni di licenza.

### Stato attuale

`GET /integration/me` è il punto di verità e oggi espone un solo flag applicativo:

```jsonc
{
  "premium": { "tier": "MEGA_FAN", "active": true, "expiresAt": "..." },
  "features": { "neuralExport": true }
}
```

L'app usa già correttamente `features.neuralExport` per XQ/XQ+. Per le altre funzioni non deve
inferire la policy dal tier: un flag assente equivale a `false`.

### Matrice di integrazione

| Funzione | Fonte/policy attuale | Stato nell'app Docker | Richiesta API |
|---|---|---|---|
| Neural Export XQ/XQ+ | `features.neuralExport` | Implementata e ri-verificata prima dell'export | Nessuna |
| Download simultanei | Gate locale su `premium.active`; non compare tra i flag | Implementata, ma la policy non è server-driven | Aggiungere `features.concurrentDownloads` o confermare esplicitamente il fallback su `premium.active` |
| Assistenza prioritaria Telegram | Pubblicizzata per i tier Premium; nessun URL/flag nel contratto | Da esporre senza inventare un contatto | Aggiungere `features.prioritySupport` e un link autorevole, es. `support.telegramUrl` |
| Calendario ICS | Pubblicizzato sul sito | L'app ha un calendario, ma nessun link ICS personale | Esporre un URL firmato/personale oppure un endpoint dedicato |
| Temi esclusivi | Pubblicizzati sul sito ("Prossimamente") | Nessun catalogo/entitlement di temi Premium | `features.exclusiveThemes` + catalogo temi a token letto a runtime — **integrazione nativa richiesta**, vedi §D |
| Watch Together / voce | Funzioni del sito con limiti per tier | Fuori scope dell'app self-hosted oggi | Eventuale deep-link o API solo se si vuole integrarli |
| Ricerca per immagine | Quote differenziate sul sito | Nessun endpoint integration | Esporre endpoint e quota residua solo se la funzione deve entrare nell'app |
| AI episodio / compagna AI | Funzioni dei tier superiori sul sito | Nessun contratto integration | Servono endpoint, quota/tokens e policy di privacy dedicati |
| Badge/coroncina tier | Funzione sociale del sito | L'app mostra già nome tier e scadenza | Nessuna, salvo URL profilo/deep-link |
| Download senza attese | Segnalato come funzione futura sul sito | Semantica non definita per l'app | Chiarire se riguarda CDN, code server o solo sito; poi esporre un flag |

### Correzioni richieste all'upsell dell'app

La vetrina attuale dell'app non deve presentare come perk ufficiali funzioni non presenti né nella
pagina pubblica né in `features`: priorità di coda, backup cloud, seguiti illimitati, SUB+DUB
automatico e statistiche avanzate. Il backup Google Drive resta una funzione self-hosted disponibile
indipendentemente dal Premium. Fino a nuovi flag, la UI deve distinguere chiaramente:

1. funzioni attive e autorizzate dal server;
2. vantaggi disponibili sul sito ma non ancora integrati nell'app;
3. idee future, che non vanno mostrate come promesse commerciali.

### Messaggio pronto per l'admin AnimeUnion

> Stiamo chiudendo la v0.17.0 dell'app Docker e vogliamo mantenere il gating interamente server-driven,
> come previsto da `INTEGRATION_PREMIUM.md`. Oggi `/integration/me.features` espone soltanto
> `neuralExport`, mentre l'app ha anche download simultanei e la pagina Premium pubblicizza assistenza
> prioritaria Telegram, calendario ICS e temi. Puoi confermarci/aggiungere questi campi opzionali?
>
> ```jsonc
> {
>   "features": {
>     "neuralExport": true,
>     "concurrentDownloads": true,
>     "prioritySupport": true,
>     "exclusiveThemes": false,
>     "calendarIcs": true
>   },
>   "support": { "telegramUrl": "https://t.me/..." },
>   "links": { "calendarIcsUrl": "https://..." }
> }
> ```
>
> I campi assenti resteranno `false`/nascosti. In particolare ci serve il link ufficiale del canale o
> bot per l'assistenza prioritaria: il link pubblico `https://t.me/aniuniontv` sembra il canale della
> community, quindi non vogliamo usarlo impropriamente come supporto. Puoi anche confermare se, fino
> all'arrivo di `features.concurrentDownloads`, il gate su `premium.active` è accettabile oppure va
> disabilitato?


---

## D. Stato della richiesta — inviata il 2026-07-26 (in attesa di risposta)

> Messaggio inviato all'admin (Matt). **Nessuna di queste voci è bloccante**: l'app funziona già
> oggi con `features.neuralExport` + fallback locali e tollera il 404 su tutto ciò che non è ancora
> esposto (le sezioni restano vuote/nascoste, fail-closed).

### Cosa abbiamo chiesto

| # | Richiesta | Forma | Comportamento dell'app se assente |
|---|---|---|---|
| 1 | `features.concurrentDownloads` **oppure** conferma del fallback su `premium.active` | flag in `/me` | Funziona: gate locale su `premium.active`. È una funzione dell'app Docker, **non** un perk del sito |
| 2 | `features.prioritySupport` + `support.telegramUrl` (link ufficiale, non il canale community) | flag + link in `/me` | Nessun contatto mostrato |
| 3 | `features.calendarIcs` + `links.calendarIcsUrl` (URL ICS personale) | flag + link in `/me` | Nessun link ICS nel calendario |
| 4 | `features.exclusiveThemes` + **catalogo temi** | flag in `/me` + manifest | Sezione "Temi Premium" vuota |

### Decisione sui temi (rettifica rispetto alla prima stesura della sezione C)

Posizione **cambiata**: non ci limitiamo a rimandare al sito. I **temi free restano i nostri**
(chiaro/scuro + accent + wallpaper, per tutti) e i **temi Premium di AnimeUnion vengono integrati
nativamente** nell'app per gli account con entitlement.

Requisito non negoziabile: le modifiche future dell'admin devono riflettersi **da sole** sul
container, senza release dell'app → serve un **endpoint/JSON letto a runtime**, non valori
hardcodati. Ordine di preferenza comunicato: (1) `GET /integration/themes` (rispetta anche
l'entitlement per-utente), (2) JSON statico su CDN con ETag/Last-Modified, (3) valori una volta
sola via chat — sconsigliato, perché perde l'auto-aggiornamento.

Shape minima richiesta, allineata a `AccentTheme` di `apps/web/src/lib/themes.ts`:

```jsonc
{
  "id": "sakura",
  "name": "Sakura",
  "tier": "FAN",                    // o un semplice flag di entitlement
  "primary": "330 80% 62%",         // HSL formato shadcn -> --primary / --ring
  "primaryForeground": "0 0% 100%",
  "swatch": "#F0529C",              // colore dello swatch nel selettore
  "backgroundUrl": "https://...",   // opzionale (stessa meccanica di themeBackgroundUrl)
  "mode": "dark"                    // opzionale: light | dark | both
}
```

Token extra sono tollerati (ignoriamo quelli non ancora applicabili, senza rompere nulla).
**Escluso** CSS/JS grezzo da iniettare: non validabile, a rischio di rompere il layout e di
introdurre stili di terze parti nell'app. I token restano leggeri e renderizzabili nativi.

Sul peso lato NAS: **nessun veto preventivo**. Il container gira con un limite di RAM dedicato,
quindi è l'hardware a segnalare eventuali problemi — non è un motivo per tenere i temi fuori.

### Impatto previsto lato app (task non ancora aperto, dipende dalla shape confermata)

- `packages/shared/src/contracts/theme.ts`: `themeAccentSchema` è un **enum chiuso** (7 chiavi),
  quindi un tema remoto non ci entra. Aggiungere un campo separato (es. `themePremiumId: string`,
  default `''`) che sovrascrive i token quando valorizzato **e** l'entitlement è attivo; l'enum
  free resta intatto (nessuna migrazione rischiosa sulla config esistente).
- `apps/api`: metodo nel source client + sync con cache SQLite (stesso pattern di
  `catalogSyncHours`) + route tRPC.
- `apps/web`: gruppo "Temi Premium" in `AppearanceSection`/`AccentPicker`, bloccato dietro
  `hasPremiumFeature('exclusiveThemes')`.

### Contesto dalla pagina pubblica (verificata il 2026-07-26)

`animeunion.tv/premium` risulta **"in arrivo, disponibile dal 1 agosto 2026"**. Tra i perk,
**"Temi esclusivi" è marcato "Prossimamente"** (come "Niente attese sui download di serie"):
oggi non c'è ancora nulla da integrare, quindi la richiesta non ha urgenza.

Fuori scope dichiarato: Watch Together, ricerca per immagine, AI episodio / "Yura" — funzioni del
sito, non dell'app self-hosted.
