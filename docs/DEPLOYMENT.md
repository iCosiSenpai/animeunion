# Deployment — AnimeUnion Docker

Guida self-hosted. Serve solo **Docker** (con Compose v2) e un account gratuito su
[animeunion.tv/registrati](https://animeunion.tv/registrati).

---

## 1. Installazione

Crea un `docker-compose.yml` (vedi il README per il blocco completo con immagini GHCR), montando il
tuo media sotto `/media`, poi:

```bash
docker compose up -d
```

In alternativa, da sorgente:

```bash
git clone https://github.com/iCosiSenpai/animeunion.git
cd animeunion
cp .env.example .env
docker compose up -d --build
```

Apri **`http://<ip-del-server>:7979`** e accedi con il tuo account AnimeUnion (email/password).

---

## 2. Cartelle di download (si configurano NELL'APP)

Le cartelle **non** stanno nel `.env`. Funziona così:

1. **Monta** il tuo media nel compose, una sola riga generica:
   ```yaml
   volumes:
     - ./data:/data
     - /volume2/NASHDD/Media:/media   # ← la TUA libreria
   ```
2. **Avvia** e vai in **Impostazioni → Cartelle di download**.
3. **Scegli** le cartelle con **Sfoglia** (naviga dentro `/media`):
   - *Serie · SUB ITA* → es. `/media/Video/Anime`
   - *Serie · DUB ITA* → es. `/media/Video/Anime DUB` (opzionale)
   - *Film · SUB ITA* → es. `/media/Video/Anime Movie` (opzionale)
   - *Film · DUB ITA* → es. `/media/Video/Anime Movie DUB` (opzionale)

Regole:
- I campi vuoti **ereditano** dalla cartella *Serie · SUB ITA*.
- Il download viene instradato automaticamente in base a **tipo (serie/film) × lingua (SUB/DUB)**.
- Se SUB e DUB finiscono nella **stessa** cartella, al nome file viene aggiunto un suffisso
  (` - SUB ITA`/` - DUB ITA`) così i due non si sovrascrivono. Con cartelle separate i nomi restano
  puliti.
- Struttura serie: `<cartella>/<Titolo>/Season NN/<Titolo> - S01E01.mp4` (compatibile Jellyfin/Plex).
  Film: `<cartella>/<Titolo>/<Titolo>.mp4`.

---

## 3. Variabili d'ambiente (`.env`) — solo segreti/deploy

| Variabile | Default | Note |
|---|---|---|
| `ANIMEUNION_EMAIL` / `ANIMEUNION_PASSWORD` | *(vuote)* | Opzionali. Vuote = login dalla web UI. |
| `WEB_PORT` | `7979` | Porta web sull'host. |
| `LOG_LEVEL` | `info` | `fatal`…`trace`. |
| `CORS_ORIGINS` | *(vuoto)* | Origin consentite (vuoto = LAN-friendly). |

L'API **non** è pubblicata sull'host (la usa solo il web sulla rete interna).

---

## 4. Volumi e backup

- `./data` → `/data` — database SQLite (`/data/animeunion.db`) e token. **Fai il backup di questa cartella.**
- `/media` → la tua libreria (serie/film). I file scaricati restano leggibili da Jellyfin/Plex.

Permessi su NAS: se vedi errori di scrittura, assicurati che l'utente del container possa scrivere
nelle cartelle montate.

---

## 5. Aggiornamento

```bash
docker compose pull && docker compose up -d     # immagini pronte
git pull && docker compose up -d --build         # da sorgente
```

---

## 6. Troubleshooting

- **`port is already allocated`** — cambia `WEB_PORT` in `.env` e riavvia.
- **Build lenta su NAS ARM** — usa le immagini pronte (GHCR) invece della build da sorgente.
- **Download falliti per spazio** — il worker rifiuta i download se restano < 500 MiB liberi.
- **Login Google/Discord in errore** — dipende dalla configurazione OAuth lato AnimeUnion; usa
  email/password.
- **Vecchi file `sub-ita/...`** — chi proveniva da una versione precedente troverà i vecchi file
  nella vecchia struttura: risulteranno "orfani" alla scansione della Libreria e possono essere
  rimossi da lì (oppure spostati manualmente nella nuova struttura).
- **Log**: `docker compose logs -f api` / `docker compose logs -f web`.

---

## 7. Note per piattaforma

- **Synology / QNAP** — immagini pronte; monta una cartella condivisa su `/media`.
- **Ubuntu / Debian / Raspberry Pi** — `docker compose up -d` (arm64 supportato).
- **Windows / macOS** — Docker Desktop.
