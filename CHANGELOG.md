# Changelog

Tutte le modifiche rilevanti a questo progetto sono documentate in questo file.

Il formato segue [Keep a Changelog](https://keepachangelog.com/it/1.1.0/)
e il progetto aderisce al [Semantic Versioning](https://semver.org/lang/it/).

## [Unreleased]

### Da fare
- Setup wizard migliorato (Step F, rimandato).
- GitHub Pages (landing pubblica + spazio mascotte).
- Esecuzione degli E2E Playwright in CI (scaffolding già presente).
- Gating reale del Premium (collegamento all'account del sito, da definire con l'admin).
- Update ottimistici e routing del cestino anche per `library.deleteSeries` (rimandati).

## [0.14.1] - 2026-07-07

Rifinitura del fix auto-download dopo diagnostica sul dato reale.

### Fixed
- **Auto-download: episodi listati in anticipo con `airDate` NULLA.** Il fix della v0.14.0 escludeva
  dalla soglia forward-only solo gli episodi con `airDate` *futura*, ma AnimeUnion pubblica i prossimi
  episodi con `airDate` **nulla** (verificato sul DB: Grand Blue S3 ep1 aveva `air_date = NULL`).
  Quelli, trattati come "gia' usciti", alzavano ancora la soglia e restavano esclusi. Ora un episodio
  conta come backlog **solo se gia' scaricato/external OPPURE con `airDate` passata**: un episodio
  listato in anticipo (airDate nulla, non scaricato) non alza piu' la soglia e viene scaricato quando
  esce. La protezione dal ri-download di massa resta per gli episodi posseduti o gia' datati.

## [0.14.0] - 2026-07-06

Affidabilita + hardening + anti-duplicati: fix del download engine e dell'auto-download, cifratura
dei segreti a riposo, scanner duplicati e rifiniture UX mobile.

### Fixed
- **Auto-download che saltava gli episodi appena usciti:** la soglia forward-only era ancorata al max
  numero episodio su TUTTI gli episodi in DB, inclusi quelli listati ma non ancora usciti (AnimeUnion
  annuncia gli episodi in arrivo con airDate futura). Attivando l'auto-download mentre l'ep1 era gia'
  annunciato, la soglia diventava 1 e l'ep1 restava escluso per sempre. Ora la soglia si ancora solo
  agli episodi GIA' USCITI (airDate <= adesso). La migration 0017 ripara i follow gia' mal-ancorati.
  Recupero immediato: "Scarica tutti gli episodi mancanti" non applica la soglia.
- **Backoff dei download annullato in single-flight:** dopo un errore transiente il job veniva
  ri-selezionato all'istante (retry a raffica), ignorando il backoff. Nuova colonna `retry_at`
  (migration 0016): `pickNext` salta i job in backoff finche' non scade.
- **Ri-download impossibile dopo cancel/failed:** `enqueue` restituiva la riga esistente per qualsiasi
  stato, anche terminale; ri-scaricare un episodio annullato non accodava nulla. Ora la riga terminale
  viene riattivata.
- **Timer spurio dell'auto-download:** il timeout 120s del ciclo non veniva azzerato, generando un
  warning ~2 min dopo ogni ciclo riuscito.
- **Impostazioni: doppio `id` "avanzate"** (HTML invalido); la sezione "Backup configurazione" e' stata
  spostata nel tab Backup, accanto al backup del DB.
- **Diagnostica:** spinner infinito su errore -> ora messaggio + "Riprova".

### Added
- **Scanner duplicati** nel gestore file: il bottone "Duplicati" elenca gli episodi presenti piu' volte
  con nomi diversi e li sposta nel cestino con un click, tenendo il file collegato/canonico. Chiude lo
  storico dei ~45 GB di doppioni sul NAS.
- **Spostamento file su touch:** nuovo folder picker (bottom sheet) per spostare file/cartelle anche su
  mobile, dove il drag-and-drop non e' disponibile (il drag su desktop resta).
- **Error states uniformi** (messaggio + "Riprova") nelle pagine Download, Libreria, Catalogo, Home e
  Diagnostica.
- **Download e Diagnostica nel menu mobile** ("Altro"): prima erano irraggiungibili da telefono.

### Security
- **Cifratura a riposo di tutti i segreti** (AES-256-GCM): oltre alla password AnimeUnion, ora anche i
  token di accesso e i segreti Telegram/Jellyfin sono cifrati nel DB (e quindi nei backup).
  `AUTH_ENCRYPT_KEY` e' obbligatoria in production (fail-closed).
- **CORS same-origin di default:** l'API non riflette piu' qualunque origin (`CORS_ORIGINS=*` per
  riabilitare il vecchio comportamento; una lista per restringere).
- **`TRUST_PROXY`:** il rate-limit REST per-IP vede l'IP reale del chiamante dietro un reverse proxy.
- **`browseDir` confinato** ai mount previsti (`/media`, `/data`) e alle cartelle di download
  configurate: non e' piu' una primitiva per enumerare l'intero filesystem.
- **Validazione dei backup prima del ripristino** (`PRAGMA integrity_check`): un backup corrotto viene
  messo in quarantena invece di mandare in crash-loop l'avvio.

### Changed
- Roadmap "Quality + GPU Upscaling Bridge" rinumerata a **v0.15.0** (bloccata su dipendenze esterne:
  endpoint XQ/XQ+ dall'admin + servizio GPU Windows).

## [0.13.8] - 2026-07-04

Anti-duplicati: il self-heal riconosce le librerie pre-esistenti con naming diverso.

### Fixed
- **Duplicati da naming legacy (causa radice dell'incidente del 2026-07-02):** `healPresent`
  (self-heal "non ri-scaricare se gia' presente") faceva match per **nome file esatto** (solo il path
  canonico `<Titolo> - SxxExx.mp4`). Le serie gia' possedute con naming diverso (`S01E05.mp4`,
  `01.mp4`, `E01.mp4`, `Nome Ep. 5.mp4`) non venivano riconosciute → ri-scaricate al path canonico →
  **duplicate**. Ora l'episodio gia' presente viene riconosciuto per **(stagione, numero)** nella
  cartella di destinazione, non per nome. Con SUB e DUB nella stessa root (nome con tag lingua) il
  match "loose" e' disattivato per sicurezza (un file senza tag e' ambiguo). Indagine sul NAS: 11
  serie, 182 file, ~45 GB di duplicati md5-identici, ripuliti a parte.

## [0.13.7] - 2026-07-02

Lingue sulle card, hero swipe, blocco landscape, orfani spiegati e download alla scelta stato.

### Added
- **Tag lingua (SUB/DUB) su tutte le card anime:** le locandine del catalogo/home mostrano ora le
  bandiere audio+sottotitoli (`availableLanguages`), non solo il tipo (TV/Film). Prima erano solo
  in "Ultimi episodi".
- **Hero: swipe su mobile** per cambiare slide (le frecce restano su desktop). L'hero e gli "ultimi
  episodi" sono sincronizzati col sito (feed ufficiale `/in-evidenza` + `/ultimi-episodi`).
- **Download alla scelta stato:** passando un seguito a «In corso» o «Da guardare» dal menu della
  card, l'app chiede se scaricare subito gli episodi mancanti (Sì/No).
- **Blocco landscape su telefono:** in orizzontale su schermi bassi compare l'invito a ruotare
  (l'app e' pensata in verticale); il PWA installato usa `orientation: portrait`. I tablet restano
  pienamente utilizzabili.
- **Controllo mancanti automatico:** entrando in «Episodi mancanti» il controllo parte da solo
  (niente clic manuale). L'elenco resta ordinato per titolo e numero episodio.

### Changed
- **Card episodio:** il tag «Ep. N» si sposta sotto la locandina (non piu' in sovrimpressione), cosi'
  non si accavalla con la lingua quando le card si rimpiccioliscono (3 per riga su mobile).
- **Seguiti:** i cinque stati restano nello stesso rettangolo (barra scorrevole in orizzontale su
  schermi stretti) invece di mandare «Completato/Droppato» a capo fuori dal riquadro.
- **Gestore file:** «non collegato» (ambra) e «Non importato» (azzurro) ora hanno colori distinti e
  leggibili a colpo d'occhio.
- **Orfani spiegati in libreria:** dopo la scansione un riquadro chiarisce che gli orfani sono di
  solito metadati/copertine/sigle (non episodi) e **non vanno eliminati** senza controllare; il
  pulsante di eliminazione e' meno invadente e la conferma lo ribadisce.

## [0.13.6] - 2026-07-02

Rete di sicurezza anti-overflow, rifiniture mobile e hero animata.

### Fixed
- **Nessuna schermata sfora piu' in orizzontale (presente e futura):** guardia globale
  `overflow-x: clip` su `html, body` in `globals.css`. `clip` (non `hidden`) non crea un contenitore
  di scroll e non rompe lo `sticky` della navbar; lo scroll verticale resta intatto. E' la rete di
  sicurezza per il classico "tutte le scritte vanno oltre lo schermo" anche su schermate nuove.
- **Titolo episodio non si comprime piu' in "Ep...":** nella lista episodi della scheda anime, su
  mobile titolo e metadati (stato + lingue) vanno su due righe; il titolo "Episodio XX" occupa la
  larghezza piena e non viene troncato quando la riga e' affollata. Da `sm` tornano su una riga.
- **Sidebar in landscape su mobile:** la sidebar desktop (visibile da `md`, quindi anche in
  landscape su telefono) rispetta la safe-area con `pl/pt = env(safe-area-inset-*)`, cosi' non
  finisce sotto la status bar / il notch.

### Changed
- **Popup che si chiudono allo scroll su mobile:** aprendo notifiche o coda download e scorrendo la
  pagina, il popover si chiude (hook `useCloseOnScroll`, attivo solo sotto `md`). Lo scroll interno
  al popover non lo chiude (gli eventi scroll annidati non raggiungono `window`).
- **Hero della home animata:** crossfade tra le slide con leggero zoom-out (Ken Burns) sullo sfondo
  e testo che entra dal basso ad ogni cambio. Rispetta l'interruttore animazioni (`useAnimationsOn`):
  a animazioni spente lo scambio e' immediato.

### Removed
- **"Mostra toast di prova"** dalle impostazioni Notifiche: verificava solo la posizione del toast
  in-app, non le notifiche push. Il test reale (push anche ad app chiusa, via `PushToggle`) resta.

## [0.13.5] - 2026-07-02

Rifiniture UI mobile e conteggio libreria.

### Fixed
- **Conteggio orfani corretto:** la scansione libreria non conta piu' come "orfani" gli asset di
  metadati Jellyfin/Kometa (sigle/backdrop/theme nelle cartelle `backdrops/`, `theme-music/`,
  `extrafanart/`, `trailers/`, `others/`): non sono episodi.
- **Lista episodi (scheda anime) non sfora piu' su mobile:** numero piu' stretto, pulsante
  "Scarica" solo-icona sotto `sm`, spaziature ridotte — la riga sta nella larghezza dello schermo.
- **Locandina piu' nitida su mobile:** la cover (sorgente ~460px) non viene piu' stirata a tutta
  larghezza (che su display retina la sgranava); e' vincolata a una larghezza vicina alla nativa e
  centrata, mentre da desktop riempie la colonna.
- **Ricerca su iOS:** la palette di ricerca e' ancorata in alto (sotto il notch) invece che a
  `12vh`, così input e primi risultati restano sopra la tastiera senza dover richiudere/riaprire.

## [0.13.4] - 2026-07-02

Chiude la seconda via di ri-download di massa, aggiunge il controllo attivo della libreria e
sistema diversi problemi di UI mobile.

### Fixed
- **Sync preferiti: niente piu' ri-download di massa.** `favorites-service` accodava tutti gli
  episodi non-external ad ogni sync (avvio + ogni 10 min) bypassando soglia forward-only e
  self-heal (con un bug: `status === 'completed'` non e' uno stato valido di `episode_file`,
  quindi non saltava nemmeno i `downloaded`). Ora la sync preferiti importa SOLO i follow; a
  scaricare i nuovi episodi pensa solo lo scheduler (`enqueueForAutoFollows`: forward-only +
  `healPresent`).
- **UI download mobile:** la riga episodio non sfora piu' in orizzontale (velocita'/ETA nascoste
  su mobile, barra progresso piu' stretta, colonna `%` allargata cosi' il simbolo non viene
  tagliato). La lista download non e' piu' in un contenitore a scroll dedicato: scorre col resto
  della pagina (via la "finestra" annidata, la scrollbar custom che si scontrava col testo e gran
  parte del jank/freeze su iOS Safari).
- **Titoli episodio vuoti:** in scheda anime un titolo vuoto (stringa "") ora ricade su
  "Episodio N" invece di lasciare la riga sbilanciata verso destra.

### Added
- **Controllo attivo integrita' libreria:** un tick periodico (`library.checkVanished`, ~ogni 15
  min) rileva gli episodi scaricati il cui file e' sparito dal disco (con la root raggiungibile),
  azzera lo stato e avvisa con una notifica in-app + push ("Episodi mancanti: ...").

## [0.13.3] - 2026-07-02

Patch di sicurezza dell'auto-download: evita di ri-scaricare file già presenti su disco.

### Fixed
- **Self-heal "in ingresso" nell'auto-download:** prima di accodare un episodio `not_downloaded`,
  il download-service ora controlla se il file esiste già su disco al path atteso (renamer) e in
  quel caso lo marca `downloaded` invece di ri-scaricarlo/sovrascriverlo (`download-service.ts`,
  `healPresent`, speculare a `healMissing`). Elimina il ri-download di massa quando il DB del
  container ha perso traccia di una libreria già presente (es. dopo un restore o una desync
  disco/DB): l'auto-download diventa idempotente rispetto al disco. Vale anche per l'azione
  manuale "Scarica episodi mancanti".

## [0.13.2] - 2026-07-02

Patch di affidabilità dell'auto-download: chiude un footgun silenzioso e rende visibile quando
l'interruttore globale è spento.

### Fixed
- **Soglia forward-only sempre ancorata:** i preferiti importati (`favorites-service.upsertFollow`)
  e le righe legacy pre-migrazione avevano `autoDownloadFromEp = null`. Portando poi il follow a
  "In corso" (`follow-service.updateStatus`, che non toccava la soglia) il follow diventava
  eleggibile con soglia nulla e il primo tick avrebbe auto-scaricato **l'intero backlog** già
  uscito. Ora la soglia viene fissata al max episodio all'import e all'ingresso in "watching"
  quando mai impostata; le soglie esistenti non vengono toccate.

### Added
- **Avviso auto-download globale spento:** banner nella pagina *Seguiti* quando l'interruttore
  globale `autoDownload` è off ma esistono serie impostate su "Auto" (con CTA alle Impostazioni),
  più una nota inline nel dialog *Segui*. Elimina il caso silenzioso in cui il badge "Auto" e la
  checkbox spuntata lasciavano credere che l'auto-download fosse attivo mentre il master era off.

## [0.13.1] - 2026-07-02

Batch di fix UX mobile + calendario potenziato, più una miglioria di performance sul refresh Jellyfin.

### Added
- **Calendario potenziato:** l'app mostra ora l'orario di uscita (`airTime`) e il numero
  dell'episodio in arrivo per ogni voce del calendario, esposti dall'API dopo il potenziamento
  admin. Le voci sono ordinate per orario di uscita.
- **"Ultimi episodi" espandibile:** nuovo pulsante "Mostra di più/meno" nella sezione home
  (carosello compresso a 10, poi griglia con tutti gli episodi caricati).

### Changed
- **Refresh Jellyfin mirato:** a fine download l'app rinfresca solo la libreria Jellyfin che
  contiene il file (`POST /Items/{id}/Refresh`) invece dell'intera libreria (`/Library/Refresh`).
  Evita la scansione completa dell'HDD ad ogni download, che sull'HDD meccanico condiviso satura
  l'I/O e rallenta drasticamente i download in corso. Debounce ora per-libreria.

### Fixed
- **Toast iOS/status bar:** i toast non si sovrappongono più alla status bar/notch su iPhone e
  PWA (override della variabile `--mobile-offset-top` di sonner con `env(safe-area-inset-top)`).
- **Anteprime sfondi accavallate:** nel selettore wallpaper le anteprime non collassano più su
  iOS Safari (è l'`<img>` a dare l'altezza della cella, non più il box con soli figli assoluti).
- **Titoli lunghi troncati:** i titoli lunghi in coda download, popover download e dettaglio
  anime ora vengono troncati con ellipsis invece di uscire dal riquadro (`min-w-0` mancante).
- **Numeri statistiche:** i numeri nella pagina Statistiche non vengono più tagliati con "…";
  rimpiccioliscono e al limite vanno a capo, senza perdere cifre.

## [0.13.0] - 2026-07-01

Batch "Mobile First + Rinforzo": UX mobile-first e rinforzo di robustezza/sicurezza trasversale.

### Added
- **Bottom sheet mobile:** nuovo wrapper `<ResponsiveDialog>` che usa `Sheet` (dal basso) su
  mobile < 640px e `Dialog` su desktop; applicato a SeriesOrganizationPanel, RelinkDialog,
  FolderActionsDialog, rinomina e nuova cartella.
- **Hook `useDownloadSummary`:** polling adattivo (1500ms se download attivi, 5000ms idle)
  centralizzato e riusato da `downloads-view` e `download-status`.
- **Error states:** `follows-view`, `calendar-view`, `stats-view` mostrano `EmptyState` con
  bottone "Riprova" in caso di errore query.
- **Cifratura password DB:** la password viene cifrata con AES-256-GCM se `AUTH_ENCRYPT_KEY`
  è in env; backward-compatible (senza chiave resta in chiaro con log warning).
- **VAPID guard:** se una chiave manca, il push service si disabilita con log critico
  invece di rigenerare le chiavi silenziosamente.

### Changed
- **Toast mobile:** CSS override con `env(safe-area-inset-top)` per eliminare l'overlap
  con la status bar su iOS/Android.
- **Polling condizionale in `anime-detail`:** la coda viene pollata solo se ci sono download
  attivi per quella serie.
- **`100dvh` su `downloads-view`:** altezza viewport corretta su mobile.
- **`FALLBACK_TOKEN_TTL`:** abbassato da 59 giorni a 1 ora.
- **`enqueueForAutoFollows` in batch:** batch da 5 con `Promise.allSettled` + timeout 120s.
- **`addMissing` con `inArray`:** controllo esistenza in coda in una sola query.
- **`scan()` concorrenza limitata:** `stat()` sui file con `p-limit(32)`.
- **`likeNeedle` escape wildcard:** i caratteri `%` e `_` vengono escapati correttamente.
- **`removeSeriesFolders` con `realpath`:** risoluzione symlink prima del path-confinement check.
- **`walk()` con `maxDepth = 20`:** limite di profondità per prevenire loop su symlink circolari.
- **Cache episodi in `getEpisodeFile`:** TTL 5 min; invalidata da `syncCatalog`.
- **LRU per `downloadAggregates`:** la Map è limitata a 500 entry (eviction delle 50 più vecchie).
- **`unreadCount()` SQL aggregato:** usa `COUNT(*)` invece di caricare tutti gli ID in memoria.

### Notes
- CLAUDE.md ridotto da 94k a ~18k con archivio in `docs/history/`.
- 355 test verdi; lint/typecheck/build web verdi.

## [0.12.0] - 2026-06-29

Batch "Super rinforzo": rinforzo trasversale di robustezza, sicurezza dei dati e qualità su
download, ricerca, gestore file, backend e frontend. Nessuna nuova feature di scoperta.

### Added
- **Ricerca FTS5:** nuovo motore di ricerca insensibile agli accenti ("naruto" trova "Narutò"),
  con ranking per rilevanza (bm25) e match anche su titolo inglese/giapponese (migrazione 0015,
  con fallback a LIKE se FTS5 non è disponibile).
- **Verifica integrità download:** opzione `verifyDownloads` che, dopo ogni download, valida il file
  con ffmpeg (decodifica completa) prima di finalizzarlo: i file corrotti vengono riscaricati invece
  di entrare in libreria.
- **Cestino del gestore file:** le eliminazioni finiscono in `.trash/` (recuperabili) invece di
  essere cancellate subito, con ripristino, "Svuota cestino" e pulizia automatica oltre
  `trashRetentionDays` (default 30 giorni). Attivo di default.
- **Backup automatico del database:** copia consistente schedulata (opt-in) di seguiti, coda,
  libreria e organizzazione file, con retention a N copie. Sezione Impostazioni → Backup con
  "Esegui backup ora", elenco copie e ripristino (applicato al riavvio del server).
- **Premium:** il tag "Premium" è ora cliccabile (→ animeunion.tv/premium) e una nuova sezione
  Impostazioni mostra le funzioni Premium proposte (vetrina, nessun blocco delle funzioni gratuite).

### Changed
- **Download URL sempre freschi:** prima di scaricare, l'URL viene ri-risolto dalla source (con
  fallback alla cache se irraggiungibile), evitando i fallimenti da "link scaduto".
- **Affidabilità SQLite:** aggiunti i pragma `busy_timeout` (5s) e `synchronous = NORMAL` (oltre al
  WAL già attivo) per evitare errori `SQLITE_BUSY` quando il worker scrive mentre la UI legge.
- **Gestore file più sicuro:** rinomina e spostamento rifiutano la sovrascrittura di un elemento
  già esistente (niente più clobber silenzioso).
- Toast d'errore più coerenti nel gestore file; sfondo wallpaper gestito via variabile CSS.

### Notes
- I nuovi comportamenti sono configurabili in Impostazioni dove ha senso
  (`verifyDownloads`, `trashEnabled`/`trashRetentionDays`, backup DB).
- 342 test verdi (+26 nel batch); lint/typecheck/build web verdi.

## [0.11.0] - 2026-06-28

Batch "Auto-download affidabile + fix gestore file": due bug gravi raccolti dall'uso reale
(auto-download che non prendeva i nuovi episodi; perdita di file nel gestore file) più rifiniture
diffuse.

### Fixed
- **Perdita dati nel gestore file (P0):** il pulsante "Ri-scarica" cancellava la cartella prima di
  riscaricare (`files.remove` → `rm` ricorsivo); per uno Special non classificato i file venivano
  persi. Ora "Ri-scarica" riaccoda soltanto (i nuovi file sovrascrivono i vecchi, niente eliminazione
  anticipata) e `files.remove` rifiuta cartelle/file collegati come esterni.
- **Auto-download dei nuovi episodi:** l'eligibilità dipendeva dallo stato d'onda dell'anime, quindi
  un anime in corso marcato per errore COMPLETED veniva escluso per sempre. Ora dipende dallo stato
  del seguito (con refresh sempre) ed è forward-only (migrazione 0014): accodati solo i nuovi episodi
  dal momento dell'attivazione, mai il backlog già su disco.
- Stato download disk-aware: un file cancellato a mano (es. sul NAS) non resta più "già scaricato" e
  può essere riscaricato; reset protetto dalla presenza della root (niente azzeramenti a disco offline).
- Gestore file: tag "Extra" riconosciuto anche nelle sottocartelle (backdrops/themes dentro una
  stagione) e conteggio stagioni robusto (niente falso "2 stagioni"); titoli lunghi nei popup che
  vanno a capo invece di essere tagliati.
- Impostazioni: "Salva" azzera il banner "Modifiche non salvate" anche per i campi mascherati.
- Sfondo wallpaper visibile sul tema chiaro (velo theme-aware).
- Toast di accodamento leggibili ("Episodio/N episodi in coda", niente id interno).

### Changed
- Stati dei seguiti con comportamento distinto (download e notifiche nuova stagione per stato) e
  toggle "scarica automaticamente" sempre usabile (non più disabilitato per le serie concluse).
- Ricerca "Collega"/"Relink" del gestore file pre-compilata con il titolo della serie.

### Added
- Home: pulsante "Mostra di più" per sezione, con "Carica altri" (paginazione on-demand) per le
  sezioni paginate.

## [0.10.0] - 2026-06-27

Batch "Potenziamenti diffusi": bug-fix e potenziamenti raccolti dall'uso reale (dettaglio anime,
tema, toast/animazioni, home, popup, ricerca, seguiti, gestore file, calendario, wallpaper) più una
fase finale di hardening, tenuta della coda gigante e integrazione con i media server.

### Added
- **Pulsante "Apri su AnimeUnion"** nel dettaglio anime (logo AU).
- **Ricerca potenziata**: palette ⌘K con debounce, Invio → pagina risultati `/catalog?q=`, voci
  in-app cercabili (Gestore file, Informazioni, sezioni Impostazioni via deep-link).
- **Gestore file**: relink dinamico (la lista si aggiorna da sola durante i download), rinomina serie
  che preserva i collegamenti, vista dedicata `/library/missing`, multi-stagione alla riscarica
  instradata al flusso correlazioni.
- **Collega senza scaricare** (stato `external`): registra file già su disco senza spostarli né
  ri-scaricarli; **Scollega esterno** per dimenticarli senza toccarli.
- **Home personalizzabile** (mostra/nascondi + riordina sezioni), **calendario** potenziato (oggi
  evidenziato, filtro "Solo i miei seguiti", vista settimana) e **wallpaper** con anteprima, download
  e filtro "Sketchy".
- **Notifiche anti-rumore**: coalescing per-anime; pulsanti "Invia notifica di test" (push) e "Mostra
  toast di prova".
- **Tenuta coda gigante** (One Piece): riassunto aggregato server-side, paginazione on-demand, azioni
  di gruppo, **fairness round-robin** tra serie nella scelta del prossimo download.
- **Integrazione Jellyfin/Plex**: sidecar `.nfo` + poster/fanart accanto ai video (opzionale),
  refresh automatico della libreria a fine download e "Prova connessione" in Impostazioni.
- **Rate-limit** sull'API in ingresso (`/api/integration/requests`), **scaffolding E2E Playwright**
  (job CI non bloccante).

### Changed
- **Tema chiaro/scuro** ora funzionante (palette light reale + `color-scheme`/`theme-color`
  dinamici); **toast** `top-center` con safe-area iPhone; **animazioni** con interruttore autorevole
  e transizioni/micro-interazioni visibili.
- **Dettaglio anime**: conteggio episodi reale per gli ONGOING, freschezza cache capata a 1h, poster
  robusto. **Home**: card non più accavallate e hero ad alta risoluzione (banner DB + fallback
  sfocato). **Popup** del gestore file che non sforano più con titoli lunghi.
- **Auto-download**: cooldown sui falliti permanenti (niente ri-accodi/notifiche ogni ciclo).
- Redazione delle chiavi Web Push (`p256dh`/`auth`) nei log.

### Database
- Migrazione `0013`: indice `idx_download_episode_file` su `download_queue` (azioni di gruppo veloci
  sulla coda gigante). Lo stato `external` non richiede migrazione (colonna `text` senza CHECK).

## [0.9.0] - 2026-06-25

### Added
- **Richieste in ingresso stile Seerr** (`POST /api/integration/requests`): un servizio esterno
  (bot, automazione, una futura istanza Seerr o plugin) può chiedere all'app di **seguire e
  scaricare** un anime, identificandolo in **ontologia anime** (`slug` / `anilistId` / `malId` /
  `title` + `season`), senza dipendere da TMDB/TVDB. Autenticazione con header **`X-Api-Key`**
  (generabile in **Impostazioni → Integrazioni**, mostrata una sola volta, salvata come hash). Riusa
  il flusso esistente di follow + download (un episodio alla volta, solo la stessa entry). Contratto
  completo in `docs/INTEGRATION_API.md`.
- **Stato di disponibilità** (`GET /api/integration/anime/:slug/status`): episodi scaricati/totali,
  per i caller che vogliono mostrare "disponibile".
- **Sezione "Integrazioni"** nelle Impostazioni per generare/rigenerare/revocare la chiave API.

### Changed
- Indici DB su `mal_id` e `anilist_id` (migrazione `0012`) per il lookup per id esterno.

### Note
- Il match per `anilistId`/`malId` avviene **solo contro la cache locale** (l'API AnimeUnion non
  espone un lookup per id esterno): per il match robusto cross-sistema usare `slug` o `title`.

## [0.8.0] - 2026-06-25

### Added
- **Libreria per serie/franchise**: SUB e DUB dello stesso anime, e le diverse stagioni dello
  stesso franchise, ora appaiono in **un'unica card** (badge lingue aggregati, contenuto annidato
  stagione → lingua → episodi); la pagina separa **Serie TV** dai **Film**.
- **Caroselli orizzontali nella Home** su mobile: le sezioni scorrono in orizzontale (con peek)
  invece di allungare lo scroll verticale; su desktop restano a griglia.
- **Documentazione integrazione Jellyfin** (`docs/JELLYFIN.md`): idee future (refresh dopo il
  download, sidecar NFO/artwork, scrobble, import "visto", ecc.) raccolte e prioritizzate per un
  batch successivo. Solo documentazione, nessuna implementazione.

### Changed
- **Auto-download consapevole dello stato**: per un anime **Completato** la spunta "scarica
  automaticamente i nuovi episodi" è disabilitata (una serie conclusa non ne riceve); per gli anime
  **in corso** il controllo periodico fa un **refresh attivo del catalogo**, così i nuovi episodi
  vengono rilevati anche senza il segnale del sito.
- **Gestore file**: le cartelle che non sono di contenuto (copertine, sigle, trailer…) mostrano il
  badge **"Extra"** invece di "Non importato"; gli **Special** sono ora classificati come contenuto.
- **PWA**: disabilitato il pinch-zoom sull'app installata (niente più zoom accidentale).

### Fixed
- **Titoli lunghi nei popup**: i titoli di anime/cartelle nei dialog ora vanno **a capo** invece di
  essere tagliati o uscire dal riquadro.
- **Ricerca da "Altro" su iOS**: la tastiera non si richiude più subito dopo l'apertura.

### Migrazione da 0.7.x
- Nessuna migrazione del database. Cambiano solo logica/UI e il contratto interno della libreria
  (raggruppamento per serie); nessuna azione manuale richiesta.

## [0.7.1] - 2026-06-22

### Fixed
- **iOS PWA**: i pannelli a comparsa dal basso (es. i filtri del catalogo) rispettano la
  safe-area inferiore e non finiscono più sotto l'home indicator dell'iPhone.
- **Gestore file**: i titoli lunghi nei risultati di ricerca dei dialog (collega orfano / collega
  cartella) ora si troncano e restano leggibili sugli schermi stretti.

## [0.7.0] - 2026-06-22

### Added
- **Ricerca e ordinamento nella Libreria**: campo di ricerca per titolo + ordinamento
  (alfabetico, ultimo aggiunto, dimensione, numero episodi) crescente/decrescente.
- **Flusso "Mancanti" azionabile**: il riepilogo della scansione mostra "Mancanti" come
  pulsante che apre un pannello con gli episodi mancanti raggruppati per anime; puoi
  **correggere la classificazione** (tipo/stagione/parte/serie madre) e **ri-scaricarli**.
- **Gestore file**: le cartelle **non importate dall'app** (senza file scaricati) sono mostrate
  in cima con un badge "Non importato".
- **Eliminazione completa dal disco**: nell'eliminare una stagione/serie puoi spuntare
  "elimina anche la cartella" per rimuovere pure i file non tracciati/extra rimasti.

### Fixed
- **File rimasti sul NAS dopo l'eliminazione**: l'app ora verifica che il file sia stato davvero
  rimosso e, se la cancellazione fallisce, **lo segnala** invece di marcarlo come non scaricato
  lasciandolo su disco.

## [0.6.1] - 2026-06-22

### Added
- **Avviso al cambio delle cartelle di download**: se cambi una cartella mentre ci sono già
  file scaricati al suo interno, una notifica avvisa che quei file non vengono spostati
  automaticamente (suggerendo "Scansiona libreria" / "Gestore file" o lo spostamento manuale).

### Changed
- **Validazione "Serie madre"**: la classificazione rifiuta una serie madre uguale a se stessa
  o che creerebbe un ciclo, con un messaggio chiaro.
- Gli URL di download firmati non compaiono più nei log (redazione).

### Fixed
- **Robustezza gestore file**: l'aggiornamento del database al rinomina/sposta/elimina avviene
  ora in un'unica transazione, evitando incoerenze con un download in corso in parallelo.

## [0.6.0] - 2026-06-22

### Added
- **Verifica d'integrità dei download**: i file troncati (meno byte del `Content-Length`
  dichiarato) e i contenuti testuali serviti al posto del video (pagine di errore senza
  firma video) vengono rifiutati, così non finiscono in libreria come `.mp4` rotti.
- **Self-healing all'avvio**: se il server si riavvia subito dopo aver spostato il file ma
  prima di registrarlo, al riavvio il download viene **finalizzato** (file già presente al
  posto giusto con la dimensione attesa) invece di risultare orfano.

### Changed
- **Resume sicuro**: un download interrotto riprende dal `.part` **solo** se l'URL della
  sorgente è ancora lo stesso. Gli URL AnimeUnion scadono, quindi un `.part` di un URL ormai
  diverso viene scartato e il download riparte pulito (niente file corrotti da concatenazione).
- Migrazione `0011` automatica (`download_queue.target_path/expected_bytes/source_url`).

### Fixed
- **Numerazione episodi delle stagioni divise quando la parte 1 è la serie base** (caso
  "Sakamoto Days"): scaricando il correlato come stagione 1 / parte 2 l'anteprima e il file
  ora continuano la numerazione (`S01E12`) invece di ripartire da `S01E01`. "War of
  Underworld" (stagione 4 divisa) resta corretto.
- Errori nello sweep dei file `.part` orfani all'avvio ora vengono **loggati** invece di
  essere silenziosamente ignorati.

## [0.5.3] - 2026-06-22

### Added
- **Icone ufficiali MyAnimeList e AniList** nei link esterni della scheda anime (al posto
  della generica icona "link esterno").

### Changed
- **Scorciatoia ricerca**: su Windows/Linux mostra `Ctrl K` invece di `⌘K` (rilevamento
  piattaforma; l'handler già accettava entrambe).
- **Popup download**: in cima il file effettivamente in corso, poi i successivi nell'ordine
  di richiesta.

### Fixed
- **Popup che uscivano dai bordi**: i dialog ora non traboccano più in orizzontale
  (`overflow-x` sul contenitore) e i campi del dialog "Classifica" si impilano su mobile
  (niente più bottone "Film"/percorso tagliati).
- **PWA iOS**: la barra dell'app (logo/icone) non si scontra più con la status bar
  dell'iPhone (safe-area superiore applicata alla navbar).
- **Popup notifiche e popup download**: ora scrollano correttamente quando l'elenco è lungo
  (vincolo di altezza spostato sul viewport dello `ScrollArea`).
- **Tag "Scaricato" persistente**: eliminando un anime dalla libreria o operando dal gestore
  file, le schede anime aggiornano subito lo stato episodi (invalidazione cache del catalogo);
  i tag "In corso"/"In coda" erano già dinamici.

## [0.5.2] - 2026-06-21

### Added
- **Link MyAnimeList e AniList** nella scheda anime (quando l'API fornisce gli ID).
- **About**: sezioni "Perché AnimeUnion Docker" e "Privacy e cookie" (i cookie sono
  gestiti da AnimeUnion, non da questa app self-hosted).
- **Stagioni divise in parti** (es. "War of Underworld" 1 e 2): campo "Parte" nel
  dialog di classificazione con **numerazione episodi continua** (part 1 1..N,
  part 2 N+1..). Migrazione `0010` (`series_override.part_number`) automatica.
- **Gestore file**: cartella → "Collega a AnimeUnion" con apertura scheda anime e
  **ri-scarica** (elimina e riaccoda); strumenti cartella **"Rinomina secondo lo
  schema"** e **"Elimina cartelle vuote"**.
- **Navigazione mobile ibrida**: dock con voci principali + drawer "Altro".

### Changed
- **Loghi** leggermente più grandi (navbar, footer, login/wizard).

### Fixed
- **Popup che uscivano dai bordi** su schermi stretti: i dialog ora restano dentro
  lo schermo con scroll quando troppo alti.
- **iOS PWA**: aggiunto `viewport-fit=cover` così il dock rispetta la safe-area e non
  collide più con la barra di sistema; corretto il "mix" desktop/mobile da overflow.
- **Sidebar desktop**: il toggle non sparisce più quando si espande (niente
  sovrapposizione con la navbar).
- **Gestore file**: OP/ED e contenuti in cartelle extra (`Specials`, `backdrops`,
  `theme-music`…) non sono più segnalati come "non collegato" (badge **Extra**).
- **404 anime**: messaggio spiegato con azioni "Torna al catalogo" / "Cerca ancora".

## [0.5.0] - 2026-06-21

### Added
- **Gestore file incorporato**: sfoglia, rinomina, sposta, elimina, crea cartelle e
  **ricollega file orfani** a un episodio, confinato alle root media.
- **Classificazione e anteprima al download**: dialog "Classifica e scarica" con
  tipo (tv/movie/special), stagione, serie madre/destinazione e **anteprima live**
  del path prima di accodare.
- **Override del tipo di serie** (`kind`) su `series_override` per forzare film,
  special o stagione; migrazione `0009` applicata automaticamente.

### Changed
- **Brand cleanup**: nuovo slogan "La tua libreria anime, sempre aggiornata";
  rimossi i riferimenti "Radarr/Sonarr" da README, about e docs.
- **Download simultaneo bloccato a 1** (worker hardcoded) con UI "Premium" e
  messaggio "in arrivo con il Premium".
- **Impostazioni a sezioni navigabili** (rail desktop + pill mobile) al posto
  della lista piatta.
- **Fondazione di design condivisa**: `PageHeader`, `EmptyState`, card/skeleton
  raffinati, safe-area e scala z-index coerenti.
- **UX mobile**: eliminato il "sandwich" di barre, save-bar sopra il dock e
  footer raggiungibile su telefono.
- **PWA/HTTPS**: guida semplificata (Tailscale consigliato) con card in-app
  "Perché serve HTTPS?".
- **Accessibilità**: `aria-label` su pulsanti solo-icona, focus ring visibili e
  semantica `radiogroup` per toggles personalizzati.

### Fixed
- **Destinazione sequel**: i sequel (es. SAO Alicization) possono atterrare nella
  cartella del franchise scegliendo la serie madre.
- **Warning IDE** su componenti toggles/accessibilità.

## [0.3.2] - 2026-06-21

### Fixed
- **Miglioramenti Accessibilità & UI**: convertito `aria-pressed` in `role="radiogroup"` per i componenti personalizzati (classificazione serie e selettore accento) risolvendo problemi di a11y e warning IDE.
- **Rifiniture UX & Gestore file**: consolidamento header di pagina (`PageHeader`), empty state condivisi e focus ring per button personalizzati.
- Aggiunti `aria-label` ai pulsanti solo icona per migliore supporto screen reader.

## [0.3.0] - 2026-06-21

### Added
- **Footer completo**: logo, social (Telegram/Instagram/TikTok), versione app, link Diagnostica,
  segnalazione bug; affordance dei link più chiara.
- **Telegram configurabile dall'app** (Impostazioni → Notifiche): bot token e chat id con
  **"Invia test"**, niente più `.env` obbligatorio (resta come fallback).
- **Centro notifiche potenziato**: notifiche cliccabili (→ scheda/coda), filtri, raggruppamento per
  giorno, lettura singola; nuovi tipi **sync completata** e **disco in esaurimento**.
- **Scoperta saga multi-stagione**: dal download "Trova tutte le stagioni e i correlati" esplora
  l'intero franchise (anche stagioni transitive S3/S4…), come opzione attivabile.
- **Temi anime**: colore accent (palette) + **sfondo wallpaper** (via wallhaven, SFW), in
  Impostazioni e nel wizard.
- **Animazioni & micro-interazioni** (con interruttore "No animazioni" + rispetto reduced-motion).
- **Pagina Statistiche** (catalogo, scaricati, spazio, coda) e **scorciatoie da tastiera** (g+tasto,
  `/`, `?`).
- **Notifica nuova stagione** per le serie seguite (`season_available`).
- **Blocco web UI con passcode** opzionale (Impostazioni → Sicurezza), imposto lato API.
- **PWA installabile** + **notifiche push del browser** (richiedono HTTPS).

### Changed / Hardening
- **Backup/restore** della configurazione (export/import JSON) in Impostazioni.
- **Token Telegram mascherato** verso il frontend (`config.getAll` non lo invia in chiaro).
- **Header di sicurezza** sul web (X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy).

### Migrazione da 0.2.x
- Nuove colonne/tabelle (`follow.known_relation_ids`, `push_subscription`) applicate **in automatico**
  all'avvio (migrazioni `0007`/`0008`). Nessuna azione manuale.
- **PWA/Push** funzionano solo via **HTTPS** (Tailscale / Cloudflare Tunnel / reverse proxy): vedi
  README. Il blocco web UI si recupera con `WEB_LOCK_DISABLED=true`.

## [0.2.0] - 2026-06-20

### Added
- **Conferma stagione al download**: alla prima richiesta di una serie/episodio l'app chiede
  "Confermi che è la Stagione X?" (numero modificabile, opzione **Special** → cartella `Specials`).
  Non si ripete se hai già scaricato da quella serie; pulsante "Vai alla serie".
- **Ricerca stile Spotlight** + **command palette ⌘K** (ricerca anime + azioni rapide).
- **Pagina Download "a contenitori"** stile qBittorrent: un riquadro per anime con avanzamento,
  **velocità ed ETA**, episodi espandibili, filtri di stato, "Scarica prima".
- **Resume dei download** interrotti (HTTP Range): non riscarica da capo dopo un'interruzione.
- **Centro notifiche in-app** (completati/falliti/nuovi episodi) con badge, più inoltro **Telegram**
  opzionale (`TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID` nel `.env`).
- **Follow con opzioni**: stato + auto-download **per-serie** + "scarica subito i già usciti";
  azioni rapide e badge "Auto" nella pagina Seguiti.
- **Pagina Diagnostica**: stato worker, **spazio libero per cartella**, ultima sync, connessione.

### Changed
- **Rilevamento stagioni/sequel** dallo slug quando l'API non fornisce `seriesId`/relazioni
  (con guardia anti-falsi-positivi), così i sequel finiscono nella serie/stagione corretta.
- **Retry intelligente**: gli errori permanenti (4xx, link scaduto, contenuto non video) falliscono
  subito; solo gli errori transitori vengono riprovati.
- **Pulizia automatica della coda**: i download terminati più vecchi di `queueRetentionDays`
  vengono rimossi periodicamente.

### Migrazione da 0.1.x
- Nuove tabelle/colonne (`series_override`, `notification`, `follow.auto_download`, progressi coda)
  applicate **in automatico** all'avvio. Nessuna azione manuale.

## [0.1.2] - 2026-06-20

### Added
- **Wizard di primo setup**: al primo accesso, finché non imposti almeno la cartella
  *Serie · SUB ITA*, l'app guida nella scelta delle cartelle di download (con browser) e avvia la
  prima sincronizzazione. Niente più download salvati in silenzio in `/data/anime`.
- **Pagina Download stile qBittorrent**: un riquadro per anime con avanzamento generale, numero di
  episodi, **velocità ed ETA**, righe per-episodio espandibili e filtro
  Tutti/In corso/Completati/Errori. Cliccando un titolo o un episodio si va alla scheda dell'anime.
- **Correzione manuale di stagione/serie** nel dettaglio anime ("Organizzazione file"), utile quando
  l'API non collega un sequel alla serie madre.

### Changed
- **Rilevamento stagioni/sequel** più robusto: quando l'API non fornisce `seriesId`/relazioni, la
  stagione e la serie madre vengono dedotte dallo slug (`-2nd-season`, `-season-N`, `-ii`,
  `-2`…) con una guardia anti-falsi-positivi. I sequel finiscono nella cartella della serie madre,
  `Season NN` corretta.
- I download vengono **bloccati con un messaggio chiaro** se le cartelle non sono ancora configurate.

### Migrazione da 0.1.1
- Nuove colonne/tabelle applicate **in automatico** all'avvio (nessuna azione manuale).
- Se la `config` è vuota, all'avvio comparirà il **wizard**: imposta le cartelle (es. `/media/Anime`).

## [0.1.1] - 2026-06-19

### Changed
- **Cartelle di download riviste** (configurabili nelle Impostazioni, non più nel `.env`):
  routing automatico per **tipo (serie/film) × lingua (SUB/DUB)** su cartelle separate; layout
  **Jellyfin** `<Titolo>/Season NN/<Titolo> - SxxExx.mp4` con titolo leggibile; film in cartella
  dedicata; suffisso lingua nel nome solo quando SUB e DUB condividono la stessa cartella. Aggiunto
  un **browser cartelle** nelle Impostazioni. Il `.env` ora contiene solo segreti + deploy; nel
  compose si monta il media su `/media`.

### Migrazione da 0.1.0
- I file scaricati con la vecchia struttura (`sub-ita/<slug>/Season NN/...`) risultano **orfani**
  alla scansione della Libreria: rimuovili da lì o spostali nella nuova struttura.

## [0.1.0] - 2026-06-19

Prima release pubblica: applicazione completa e self-hosted in Docker.

### Added
- **Catalogo AnimeUnion**: ricerca e filtri combinati (genere, tipo, stato, anno, stagione, lingua,
  ordinamento), home con sezioni (ultimi episodi, in evidenza, stagione, top, recenti, calendario),
  pagina dettaglio con relazioni e consigliati persistiti.
- **Integrazione API ufficiale v1.0.3/1.1.x** (no scraping): catalogo, preferiti R/W, watchlist,
  cronologia, profilo, ultimi-episodi, in-evidenza, news + **social login** device flow
  (Google/Discord) oltre a email/password.
- **Motore di download** event-driven con FSM (queued→downloading→processing→completed, retry con
  backoff, cancel, concorrenza configurabile), un episodio alla volta; download diretto dalla home
  per singolo episodio.
- **Segui & auto-download**: scheduler che accoda i nuovi episodi degli anime seguiti; pulsante
  Segui "stateful" con i 5 stati e descrizioni.
- **Renamer**: path `sub-ita|dub-ita/<serie>/Season NN/SXXEXX.mp4` con risoluzione serie/stagione e
  correzione della rinumerazione dei sequel.
- **Libreria**: scanner di `animePath`, statistiche, e **gestione file** (elimina episodio, stagione
  o intera serie + file orfani, con pulizia delle cartelle vuote).
- **Indicatore lingua** bandiera+icona (SUB/DUB) e stato di download per episodio nel dettaglio.
- **Hardening**: validazione dei download (rifiuto di pagine HTML "link scaduto"), watchdog stallo
  (60s), guardia spazio disco, gestione `429` (Retry-After/backoff), security headers + CORS
  allowlist, redaction dei segreti nei log, pulizia dei file `.part` orfani all'avvio.
- **Docker**: `Dockerfile` api (eseguito via `tsx`) e web (Next.js standalone), `docker-compose`
  (build da sorgente) + `docker-compose.ghcr.yaml` (immagini pronte), workflow di pubblicazione
  multi-arch (amd64+arm64) su GHCR.
- **Login premium** con logo, icone brand Google/Discord e layout curato.
- **148 test** (Vitest) su servizi core (catalog, download, renamer, library, auth, http-client).

### Note
- Il login **social Google/Discord** dipende dalla configurazione OAuth lato AnimeUnion; nel
  frattempo l'accesso avviene con email/password del proprio account AnimeUnion.
