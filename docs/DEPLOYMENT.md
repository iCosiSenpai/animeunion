# Deployment — AnimeUnion Docker

> **Placeholder (Settimana 0).** Questa guida verrà completata in Settimana 7,
> quando le immagini Docker multi-arch saranno pubblicate su GHCR.

## Prerequisiti (anteprima)

- Docker + Docker Compose
- Un account AnimeUnion ([animeunion.tv/registrati](https://animeunion.tv/registrati))

## Installazione (anteprima)

```bash
mkdir animeunion && cd animeunion
wget https://raw.githubusercontent.com/iCosiSenpai/animeunion/main/.env.example -O .env
# Compila .env con email e password AnimeUnion
wget https://raw.githubusercontent.com/iCosiSenpai/animeunion/main/docker-compose.yaml
docker compose up -d
```

## Da documentare in S7

- [ ] Configurazione variabili d'ambiente e volumi
- [ ] Guida per piattaforma: Synology DSM, QNAP, Ubuntu, macOS, Windows, Raspberry Pi
- [ ] Permessi volumi (PUID/PGID) e percorsi libreria
- [ ] Troubleshooting: porte, spazio disco, permessi
- [ ] Aggiornamento: `docker compose pull && docker compose up -d`
