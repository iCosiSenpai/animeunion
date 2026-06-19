# Deployment — AnimeUnion Docker

Guida all'installazione self-hosted. Serve solo **Docker** (con Docker Compose v2) e un account
gratuito su [animeunion.tv/registrati](https://animeunion.tv/registrati).

---

## Installazione

### Metodo 1 — Immagini pronte (consigliato)

Scarica immagini multi-arch da GHCR, senza build:

```bash
mkdir animeunion && cd animeunion
wget https://raw.githubusercontent.com/iCosiSenpai/animeunion/main/.env.example -O .env
wget https://raw.githubusercontent.com/iCosiSenpai/animeunion/main/docker-compose.ghcr.yaml -O docker-compose.yml
docker compose up -d
```

### Metodo 2 — Da sorgente

```bash
git clone https://github.com/iCosiSenpai/animeunion.git
cd animeunion
cp .env.example .env
docker compose up -d --build
```

Apri **`http://<ip-del-server>:7979`**.

### Primo accesso

Compare la schermata di login: accedi con **email e password del tuo account AnimeUnion**. Il token
viene generato e salvato in SQLite; gli accessi successivi sono automatici.

> Per saltare la schermata di accesso puoi compilare `ANIMEUNION_EMAIL`/`ANIMEUNION_PASSWORD` nel
> `.env` (auto-login). Sono opzionali.

---

## Variabili d'ambiente (`.env`)

| Variabile | Default | Note |
|---|---|---|
| `ANIMEUNION_EMAIL` / `ANIMEUNION_PASSWORD` | *(vuote)* | Opzionali. Vuote = login dalla web UI. |
| `WEB_PORT` | `7979` | Porta web sull'host. |
| `DOWNLOAD_PATH` | `./anime` | Cartella host della libreria (montata su `/data/anime`). |
| `ANIMEUNION_API_URL` | endpoint ufficiale | Di norma non si tocca. |
| `SOURCE_MODE` | `api` | `api` \| `mock` (offline). |
| `LOG_LEVEL` | `info` | `fatal`…`trace`. |
| `CORS_ORIGINS` | *(vuoto)* | Origin consentite separate da virgola; vuoto = riflette l'origin. |

L'API **non è pubblicata** sull'host (la raggiunge solo il web sulla rete interna). Per debug puoi
aggiungere `ports: ['3011:3001']` al servizio `api`.

---

## Volumi e percorsi

- `./data` → `/data` — database SQLite (`/data/animeunion.db`) e token.
- `${DOWNLOAD_PATH}` → `/data/anime` — libreria scaricata (è l'`animePath` di default; modificabile
  anche dalle **Impostazioni** dell'app, es. per puntare a un NAS).

Backup: copia la cartella `./data` (DB) e la libreria. Permessi: su NAS imposta l'utente/gruppo
proprietario delle cartelle montate se incontri errori di scrittura.

---

## Aggiornamento

```bash
# Immagini pronte
docker compose pull && docker compose up -d

# Da sorgente
git pull && docker compose up -d --build
```

---

## Troubleshooting

- **`port is already allocated` / porta occupata** — cambia `WEB_PORT` nel `.env` e riavvia
  (`docker compose up -d`). L'API non espone porte sull'host.
- **Build lenta su NAS ARM** — la prima build compila `better-sqlite3`; usa il **Metodo 1**
  (immagini pronte) per evitarlo.
- **"Nessuno spazio"/download falliti** — il worker rifiuta i download se restano < 500 MiB liberi;
  libera spazio o sposta `DOWNLOAD_PATH` su un volume più grande.
- **Login social Google/Discord in errore** — dipende dalla configurazione OAuth lato AnimeUnion;
  usa email/password.
- **Log**: `docker compose logs -f api` (backend) e `docker compose logs -f web` (frontend).
- **Health API**: `docker compose exec api node -e "fetch('http://127.0.0.1:3001/health').then(r=>r.text()).then(console.log)"`.

---

## Note per piattaforma

- **Synology / QNAP** — usa il Metodo 1; imposta `DOWNLOAD_PATH` su una cartella condivisa del NAS.
- **Ubuntu / Debian / Raspberry Pi** — `docker compose up -d` come sopra (arm64 supportato).
- **Windows / macOS** — Docker Desktop; il Metodo 1 funziona senza toolchain di build.
