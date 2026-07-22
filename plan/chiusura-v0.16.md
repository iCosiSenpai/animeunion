# Piano — Chiusura post-v0.16.0 e release v0.17.0

> **Fonte canonica del batch di chiusura.** Vive in `plan/` ed è durevole tra sessioni.
> Per riprendere: leggi `CLAUDE.md`, apri questo file e parti dal primo Task con `[ ]`.
>
> **Regola universale:** prima di implementare ogni Task si entra in plan mode, si verificano file,
> contratti e test coinvolti, si definiscono sotto-task a checkbox e si ottiene approvazione. Solo
> dopo si torna in modalità esecutiva. Ogni Task termina con le validazioni pertinenti e un commit
> dedicato, salvo esplicita decisione contraria dell'utente.
>
> **Cadenza:** i Task procedono in ordine. Prima di ciascuno l'agente svolge autonomamente una fase
> interna di plan mode; con autorizzazione globale già concessa può continuare nella stessa sessione
> senza chiedere cambi di modalità o nuove approvazioni, salvo blocchi reali o azioni esterne ad alto
> impatto.

## Obiettivo

Chiudere senza codice orfano o debiti dimenticati il batch nato da
`plan/doctor-premium-ux.md`, riallineare lo storico della v0.14.0, chiarire lo stato reale della
v0.16.0 e completare i residui registrati in `PLAN.md` e `CHANGELOG.md`: ricerca Premium,
assistenza prioritaria Telegram, update ottimistici della Libreria, onboarding, GitHub Pages,
gate E2E e release finale.

## Decisioni confermate

- Nessun residuo viene ignorato: ogni voce viene implementata, chiusa come operativa/manuale oppure
  documentata esplicitamente come bloccata da un input esterno.
- Lo Step 15 include sia la ricognizione delle feature Premium sia una mini-implementazione di ciò
  che i contratti attuali permettono.
- Prima della release va riconciliato lo stato versione: package a `0.16.0`, shared a `0.12.0`,
  CHANGELOG già contenente `0.16.0` e stato dichiarato non uniforme.
- L'utente ha autorizzato esplicitamente il 2026-07-22 commit e push su `main`, tag `v0.17.0`,
  GitHub Release, pubblicazione GHCR e deploy NAS. Le azioni restano sequenziali e vengono marcate
  complete solo dopo la verifica del rispettivo gate; branch protection richiede invece una
  decisione separata.

## AVANZAMENTO

- [x] **Task 0** — Regola universale plan-mode + governance del nuovo piano
- [x] **Task 1** — Bookkeeping v0.14.0 e riallineamento dei puntatori
- [x] **Task 2** — Riconciliazione dello stato versione
- [x] **Task 3** — Ricognizione feature Premium e richieste per l'admin AnimeUnion
- [x] **Task 4** — Assistenza prioritaria Telegram per utenti Premium
- [x] **Task 5** — Update ottimistici dopo le eliminazioni della Libreria
  - **Riaperto dopo review semantica e infine chiuso con verdetto `CLEAN`:** i gate precedenti
    restano evidenza storica; tutte le correzioni emerse nelle passate successive sono completate.
  - [x] Rendere `deleteFolder` conservativo: preservare una cartella che contiene righe attive
    `downloaded`/`external` non appartenenti allo scope target e riportare il motivo al client.
  - [x] Uniformare l'identità di serie al resolver (`membersOf`) nei delete backend e nei selector
    ottimistici, includendo relazioni, slug e override senza cancellare elementi estranei.
  - [x] Introdurre un coordinatore asincrono condiviso tra LibraryService e FileManagerService;
    serializzare le mutation filesystem concorrenti e rivalidare le protezioni sotto lock.
  - [x] Rendere il cestino fail-closed quando la root non è riconosciuta e rendere `moveToTrash`
    compensabile rispetto a errori di metadata o move, senza promettere recuperabilità falsa.
  - [x] Coprire SUB/DUB nella stessa cartella, membri serie risolti, link external concorrente,
    root cestino sconosciuta e failure metadata/move con test deterministici.
  - [x] Rieseguire test mirati, lint, typecheck, suite completa, build web, `git diff --check` e una
    review semantica finale; richiudere il Task solo senza blocker.
  - **Seconda review semantica:** il Task resta aperto fino alla chiusura anche dei casi seguenti.
  - [x] Proteggere i path fisici condivisi: un target non può rimuovere un file referenziato da una
    riga external/non-target, inclusi alias tramite symlink.
  - [x] Iniettare lo stesso coordinatore nelle finalizzazioni download, self-heal e Neural Export,
    mantenendo rete/render fuori lock e serializzando soltanto filesystem + update DB.
  - [x] Canonicalizzare target e root per il cestino e fallire chiuso sui symlink che escono dalle
    root configurate o quando il containment reale non è dimostrabile.
  - [x] Rendere FollowCard privo di hint API autorevoli e ripristinare correttamente anche l'assenza
    della cache statistiche durante il rollback ottimistico.
  - [x] Rendere esplicito il conteggio dei fallimenti cartella e ridurre il fanout di `membersOf`
    senza cambiare l'identità resolver.
  - [x] Coprire i nuovi interleaving/alias/errori con test, rieseguire tutti i gate e una nuova review
    semantica indipendente prima di richiudere il Task.
  - **Approfondimento operativo del secondo batch (terza passata):**
    - [x] Separare percorso logico e identità fisica nelle cancellazioni Library/FileManager, evitando
      sia alias attivi spezzati sia la rimozione ricorsiva di cartelle raggiunte solo via symlink.
    - [x] Confinare anche il namespace `.trash`, validare rigorosamente i metadata e rendere restore,
      empty e prune fail-closed rispetto a symlink/junction e parent fisici fuori root.
    - [x] Rileggere e rivalidare sotto il coordinatore lo stato dei self-heal download, senza
      sovrascrivere transizioni concorrenti verso `external` o altri stati attivi.
    - [x] Ripristinare l'assenza iniziale della cache stats e rappresentare correttamente gli orfani
      preservati; mantenere esplicita la readiness del reconcile iniziale del worker.
    - [x] Aggiungere test deterministici per alias/interleaving/failure cartella/cache assente, poi
      correggere format/import e completare tutti i gate prima della review finale.
  - **Review semantica indipendente dopo i gate (verdetto `NEEDS_CHANGES`):**
    - [x] Ripristinare davvero le query inizialmente assenti usando la rimozione TanStack reale e
      rendere componibili rollback di delete ottimistiche concorrenti.
    - [x] Limitare `deleteOrphans` a file regolari confinati, rifiutando directory e symlink/junction
      prima di qualunque move o delete ricorsivo.
    - [x] Rileggere queue ed episode file dentro il lock del reconcile iniziale e ignorare snapshot
      superati da cancellazioni o transizioni verso stati autorevoli.
    - [x] Rivalidare sorgente e job Neural prima del move/upsert e serializzare anche
      `unlinkExternal`, aggiornando contratti async, router e test.
    - [x] Propagare la Promise di readiness del worker attraverso scheduler e bootstrap, senza aprire
      l'API prima della riconciliazione iniziale.
    - [x] Coprire i nuovi casi con QueryClient reale e interleaving deterministici, rieseguire tutti i
      gate e una nuova review indipendente prima di richiudere il Task.
  - **Nuova review indipendente post-correzione (verdetto `NEEDS_CHANGES`, quinta passata):**
    - [x] Rendere atomica e coordinata la transizione Neural `queued` → `running`, senza resuscitare
      job cancellati durante recipe/dispatch e cancellando il worker remoto appena noto.
    - [x] Nel reconcile iniziale preservare gli episode file `downloaded`/`external` autorevoli ma
      terminalizzare la queue orfana, così non blocca permanentemente la concorrenza.
    - [x] Linearizzare `DownloadWorker.cancel()` con la finalizzazione `processing`, affinché un
      cancel riuscito non possa essere seguito da move e stato `completed`.
    - [x] Rifiutare in finalize Neural anche una qualità target diventata `downloaded`, oltre a
      `external`, salvo prova di ownership del job corrente.
    - [x] Aggiungere test deterministici per i quattro interleaving, rieseguire tutti i gate e una
      review semantica indipendente prima di richiudere il Task.
  - **Review semantica successiva (verdetto `NEEDS_CHANGES`, sesta passata):**
    - [x] Usare CAS `downloading` → `processing` dopo la verifica e coordinare `cancel` download con
      finalize, così un cancel riuscito precede ogni move e uno tardivo restituisce `false`.
    - [x] Impedire a timer, enqueue e `tryStartNext` di avviare job prima che reconcile e sweep
      abbiano completato la readiness del worker.
    - [x] Catturare una generazione immutabile DB/filesystem della sorgente Neural e respingere
      sostituzioni ABA allo stesso path prima di pubblicare l'output.
    - [x] Rifiutare fail-closed il trash di cartelle symlink/junction, incluse destinazioni relative
      che diventerebbero dangling dopo la move, senza azzerare il DB.
    - [x] Coprire i cinque casi con test deterministici, rieseguire tutti i gate e una review
      indipendente pulita prima di richiudere il Task.
  - **Review semantica successiva (verdetto `NEEDS_CHANGES`, settima passata):**
    - [x] Catturare la generazione dello startup in `tryStartNext` e, dopo il resolver asincrono,
      rivalidare generazione, `stopped`, readiness e pausa prima di prenotare qualunque queue.
    - [x] Coprire deterministicamente un resolver sospeso attraverso `stop()` e nuovo `start()`,
      quindi rieseguire tutti i gate e ottenere una review indipendente pulita.
- [x] **Task 5.5** — Setup wizard desktop ampio e meno verticale
- [x] **Task 6** — Chiusura del miglioramento setup wizard / onboarding
- [x] **Task 7** — GitHub Pages live e gestione artwork ufficiale
- [ ] **Task 8** — E2E Playwright promossi a gate bloccante
- [ ] **Task 9** — Release finale e chiusura completa del batch

## Task 0 — Regola universale plan-mode + governance del nuovo piano

**Obiettivo:** rendere obbligatorio, per ogni progetto, l'approfondimento in plan mode prima di ogni
step e stabilire questo documento come unica fonte canonica della chiusura.

**Guida:**
- Creare `~/.kiro/steering/workflow.md` con `inclusion: always` e la regola universale concordata.
- Creare questo piano con avanzamento, dipendenze, test e demo di ogni Task.
- In `plan/doctor-premium-ux.md`, indicare che Step 15 e Step 16 proseguono qui.
- In `CLAUDE.md`, sostituire il puntatore al piano attivo con questo file senza perdere lo storico.
- Riallineare la checkbox stale dello Step 8 v0.14.0 in `plan/affidabilita-hardening.md` o delegarla
  esplicitamente al Task 1, senza lasciare ambiguità.

**Test:** nessun test software; verificare che lo steering venga incluso globalmente e che tutti i
puntatori al piano attivo siano coerenti.

**Demo:** una nuova sessione, in qualunque progetto, carica la regola universale; in AnimeUnion la
catena `CLAUDE.md` → questo piano porta senza ambiguità al primo Task aperto.

## Task 1 — Bookkeeping v0.14.0 e riallineamento dei puntatori

**Obiettivo:** eliminare gli stati storici contraddittori senza riscrivere la storia del progetto.

**Guida:**
- Marcare completato lo Step 8 in `plan/affidabilita-hardening.md`, annotando che v0.14.0 è già stata
  rilasciata e che il cambio allinea solo una checkbox stale.
- Controllare i piani con stati `[~]` o release già avvenute e riallinearli solo quando CHANGELOG,
  tag e `CLAUDE.md` ne provano il completamento.
- Conservare i dettagli storici; non eliminare diagnosi, incidenti o decisioni già spedite.

**Test:** ricerca finale delle checkbox di release storiche incoerenti e confronto con CHANGELOG/tag.

**Demo:** i piani archiviati raccontano lo stesso stato di CHANGELOG e repository.

## Task 2 — Riconciliazione dello stato versione

**Obiettivo:** determinare con prove se `v0.16.0` è già stata taggata/pubblicata o se esiste solo un
bump prematuro, quindi scegliere la prossima versione corretta e uniformare tutti i package.

**Guida:**
- Ispezionare `git status`, branch, log recente, tag locali/remoti e release, senza mutare il repo.
- Confrontare root, api, web, worker, neural-core e shared; spiegare il drift di shared `0.12.0`.
- Registrare nel piano il verdetto e la strategia: completare `0.16.0` se mai rilasciata, oppure usare
  una nuova versione se `0.16.0` è già pubblica e immutabile.
- Allineare i manifest e il lockfile solo dopo il verdetto.

**Test:** `npm run lint`, `npm run typecheck`, `npm run test` e controllo coerente delle versioni.

**Demo:** una tabella riporta versione corrente, tag/release esistente e versione finale scelta;
tutti i package intenzionalmente versionati risultano coerenti.

**Esito (verificato):**

| Voce | Stato accertato |
|---|---|
| Branch | `main`, allineato a `origin/main` prima degli edit locali |
| v0.16.0 | Tag locale/remoto sul commit `511c8aa` + GitHub Release pubblica (`Latest`) |
| HEAD iniziale | `e7b679c`, due commit documentali dopo il tag |
| Baseline manifest | root/api/web/worker/neural-core già `0.16.0`; shared riallineato da `0.12.0` a `0.16.0` |
| Lockfile | rigenerato e coerente per tutti i workspace |
| Prossima release | **v0.17.0**: v0.16.0 non viene riscritta |

Il drift di `packages/shared` era solo bookkeeping: il workspace è privato e veniva referenziato con
`*`, quindi non aveva rotto build o runtime, ma rendeva manifest e lockfile incoerenti. È stato
corretto sulla baseline 0.16.0; il bump a 0.17.0 resta centralizzato nel Task 9.

**Validazione:** `npm run lint`, `npm run typecheck` e `npm run test` verdi (**462/462**).

## Task 3 — Ricognizione feature Premium e richieste per l'admin AnimeUnion

**Obiettivo:** mappare tutte le feature Premium disponibili o candidate, evitando UI promessa ma non
supportata e preparando richieste API precise per ciò che manca.

**Guida:**
- Analizzare `INTEGRATION_PREMIUM.md`, `INTEGRATION_NEURAL_EXPORT.md`, `docs/INTEGRATION_API.md`, i
  contratti shared e le fonti pubbliche pertinenti.
- Produrre una matrice: feature, entitlement/flag, supporto attuale, lavoro app, endpoint o decisione
  richiesta all'admin.
- Distinguere capability già live, capability implementabili in modo cooperativo e capability da non
  mostrare finché manca un contratto server.
- Preparare domande concise per l'admin, inclusa l'eventuale introduzione di
  `features.prioritySupport` o equivalente.

**Test:** nessun test runtime; ogni affermazione tecnica deve avere una fonte verificabile nel repo o
nella documentazione ufficiale consultata.

**Demo:** tabella Premium completa e messaggio pronto da inviare all'admin AnimeUnion.

**Esito (verificato):** matrice e messaggio sono tracciati in `docs/API_REQUEST.md` §C. Fonti:
contratti integration locali e [pagina Premium ufficiale](https://animeunion.tv/premium), consultata
nel Task. Contenuto pubblico riformulato per conformità alle restrizioni di licenza.

Punti decisivi:
- `features.neuralExport` è l'unico entitlement API disponibile e l'integrazione è completa.
- I download simultanei sono oggi un gate locale su `premium.active`: serve
  `features.concurrentDownloads` o una conferma esplicita dell'admin.
- L'assistenza Telegram è pubblicizzata per i Premium, ma manca sia un flag sia il contatto di
  supporto; `https://t.me/aniuniontv` è il canale pubblico e non viene spacciato per help desk.
- La vecchia vetrina app contiene perk non contrattualizzati; il Task 4 la rende aderente alle fonti.
- Calendario ICS, temi, Watch Together, ricerca immagini e AI restano funzioni del sito finché non
  esistono endpoint/flag integration dedicati.

## Task 4 — Assistenza prioritaria Telegram per utenti Premium

**Obiettivo:** offrire un ingresso reale e non morto all'assistenza prioritaria, visibile in modo
coerente con l'entitlement Premium.

**Guida:**
- Definire con l'utente/admin l'URL Telegram ufficiale; non pubblicare placeholder cliccabili.
- Aggiungere una configurazione non segreta per l'URL solo se serve davvero un override self-hosted;
  preferire un dato ufficiale dal contratto se l'API lo introdurrà.
- Mostrare la voce nella pagina `/premium` agli account con Premium attivo, usando le primitive UI
  Premium esistenti e copy trasparente sul tipo di supporto.
- Se manca ancora l'URL, rendere la voce informativa e disabilitata con stato "in arrivo", senza link
  rotto; registrare il blocco esterno nel piano.
- Non confondere questo canale con Telegram notifier (`telegramBotToken`/`telegramChatId`).

**Test:** test dell'eventuale config e del gate entitlement; lint/typecheck/build web; controllo
manuale Premium/non-Premium e link esterno sicuro.

**Demo:** un utente Premium vede e usa il contatto ufficiale; un non-Premium vede l'upsell previsto;
nessun URL finto o segreto viene esposto.

**Esito:** la pagina `/premium` mostra agli account attivi una card dedicata e dichiara correttamente
che il contatto non è ancora esposto dall'API. Il solo CTA porta alla pagina Premium ufficiale; il
canale pubblico non viene presentato come help desk. La vetrina non-Premium è stata riscritta usando
solo vantaggi pubblicati da AnimeUnion e distingue quelli del sito da Neural Export nell'app. Rimossi
claim non contrattualizzati (priorità coda, cloud, seguiti illimitati, SUB+DUB e statistiche).
Download simultanei resta visibile agli attivi ma marcato come funzione sperimentale in attesa del
flag server. Nessuna config locale o URL placeholder introdotti.

**Validazione:** lint, typecheck e build web verdi. Blocco esterno residuo, con proprietario e
criterio di chiusura: AnimeUnion deve fornire il contatto dedicato/flag richiesto in
`docs/API_REQUEST.md` §C.

## Task 5 — Update ottimistici dopo le eliminazioni della Libreria

**Obiettivo:** far reagire immediatamente la Libreria alle eliminazioni mantenendo rollback corretto
in caso di errore e semantica coerente col cestino.

**Guida:**
- Mappare cache e mutation di `deleteEpisode`, `deleteEntry`, `deleteSeries` e `deleteOrphans`.
- Verificare nello stesso contesto la vecchia segnalazione "locandina Libreria a bassa qualità":
  stabilire se è ancora riproducibile, correggere la scelta URL/fallback se reale oppure chiuderla
  con evidenza se già risolta.
- Implementare snapshot, aggiornamento ottimistico, rollback e invalidazione finale con TanStack
  Query/tRPC, evitando cache divergenti tra Libreria, statistiche, catalogo e seguiti.
- Mantenere copy e toast coerenti con `trashEnabled` e con i file `external`, che non devono essere
  eliminati accidentalmente.

**Sotto-task verificabili:**
- [x] Mappare contratti, cache e consumer delle quattro mutation, inclusa `deleteSeries` dalla pagina
  Seguiti, e verificare lo stato Git iniziale per preservare le modifiche locali estranee.
- [x] Verificare la vecchia segnalazione sulla locandina: la pipeline corrente usa direttamente
  l'unico `coverImage` originale dell'API, senza URL thumbnail; cinque campioni correnti misurano
  400–460×584–650 px contro un rendering Libreria di 96/128 px, quindi il difetto non è
  riproducibile e non richiede un fallback artificiale.
- [x] Estrarre trasformazioni immutabili e type-safe per lista/statistiche della Libreria e coprirle
  con test mirati (episodio, entry, serie e preservazione degli `external`).
- [x] Collegare snapshot, cancellazione query, update ottimistico, rollback e invalidazione finale a
  `deleteEpisode`, `deleteEntry`, `deleteSeries` (anche dai Seguiti) e `deleteOrphans`.
- [x] Rafforzare servizio, copy e toast affinché un file `external` non venga mai cancellato e la
  rimozione dell'intera cartella venga saltata in sicurezza quando ne contiene uno.
- [x] Eseguire test mirati e suite completa, lint, typecheck e build; collaudare i percorsi success ed
  error/rollback e registrare qui esito ed evidenze finali.

**Test:** test mirati ove esiste infrastruttura frontend; in ogni caso lint/typecheck/test/build e
collaudo success/error con rollback.

**Demo:** la riga/card sparisce subito; simulando un errore ritorna nella posizione corretta e appare
un toast comprensibile.

**Esito:** le quattro eliminazioni pubblicano subito lista/statistiche o stato scansione aggiornati,
ripristinano lo snapshot esatto su errore e invalidano infine Libreria, download, catalogo e Seguiti.
`deleteEpisode`, `deleteEntry`, `deleteSeries` e `deleteOrphans` proteggono gli `external` e i target
non appartenenti allo scope anche attraverso alias fisici. Le mutation filesystem, le finalizzazioni
download e Neural Export condividono un coordinatore con revalidation; il cestino applica
containment logico/fisico e rifiuta cartelle symlink/junction non recuperabili. Cancellazione,
readiness e restart del worker sono linearizzati, inclusi verifica, move atomica e resolver Premium
sospesi. Neural Export respinge sostituzioni ABA della sorgente e target diventati autorevoli. La
segnalazione sulla cover è chiusa con l'evidenza dimensionale sopra. Review semantica finale:
`CLEAN`.

**Validazione:** `npm run lint` (**309 file**), `npm run typecheck` (api/web/worker/neural-core/shared),
`npm run test` (**49 file, 513 test**), `npm run build -w @animeunion/web` (**16 pagine**) e
`git diff --check` verdi. I test deterministici coprono rollback/cache assenti e concorrenti,
containment/alias/trash, stati autorevoli, cancel durante verifica e move, readiness/restart stale e
generazioni DB+filesystem Neural.

## Task 5.5 — Setup wizard desktop ampio e meno verticale

**Obiettivo:** sfruttare davvero lo spazio disponibile sui desktop senza peggiorare il flusso mobile
o duplicare logica e form dell'onboarding.

**Audit UX:** il wizard è vincolato a `max-w-lg`; cartelle, gruppi Aspetto e campi Jellyfin sono
sempre impilati in una sola colonna. Su desktop il risultato è stretto, molto alto e con scarso
contesto sul progresso. La login resta intenzionalmente focalizzata; il problema riguarda il wizard
multi-step successivo.

**Sotto-task verificabili:**
- [x] Verificare che `dev:newuser` sia davvero chiuso: nessun processo gestito, listener 3000/3001 o
  processo AnimeUnion `next dev`/`tsx watch` residuo.
- [x] Definire una composizione responsive unica: mobile a colonna, desktop con rail laterale del
  progresso e canvas di lavoro ampio, senza fork della logica di stato.
- [x] Rendere cartelle e Jellyfin griglie desktop, con azioni allineate e contenuti leggibili senza
  introdurre overflow orizzontale alle larghezze intermedie.
- [x] Aggiungere una variante `setup` esplicita ad Aspetto: titolo non duplicato e gruppi disposti in
  griglia solo nel wizard, lasciando invariata la pagina Impostazioni.
- [x] Preservare ordine DOM, `aria-current`, focus visibile, navigazione Indietro/Salta/Continua e
  layout mobile; validare lint, typecheck, test, build web e diff check.
- [x] Eseguire smoke visuale desktop/mobile con `dev:newuser`, registrare esito e richiudere il Task
  5.5 solo dopo conferma dell'utente.

**Direzione visuale:** una “cabina di configurazione” coerente con AnimeUnion: rail di avanzamento
scuro/soffuso a sinistra, passo attivo leggibile e area operativa luminosa a destra. Il rail è la sola
firma visiva; il resto resta sobrio, funzionale e basato sui token tema esistenti.

**Test:** controlli automatici frontend e smoke a viewport desktop/mobile sul DB `newuser` isolato.

**Demo:** a desktop le quattro cartelle e i controlli Aspetto sfruttano due colonne e il progresso è
sempre visibile; a mobile il wizard resta una singola colonna senza contenuti tagliati.

**Esito automatico:** il wizard usa `max-w-6xl`, rail persistente da `lg`, canvas fluido e griglie
responsive per cartelle, Aspetto e Jellyfin. La variante Aspetto delle Impostazioni resta invariata;
quella setup usa etichette Tema compatte per evitare clipping a 320/768/1024 px. Ordine DOM, ordine
visivo e Tab coincidono su tutte le action bar. La prima review ha riprodotto questi due blocker; dopo
la correzione la review indipendente finale è `CLEAN`.

**Validazione automatica:** `npm run lint` (**311 file**), typecheck di tutti i workspace con recheck
web finale, `npm run test` (**50 file/519 test**), build web (**16 pagine**), diagnostica editor e
`git diff HEAD --check` verdi. Un primo run concorrente aveva mandato in timeout il test FFmpeg;
il test isolato e due suite complete successive sono passati. Nessun listener 3000/3001 o processo
AnimeUnion `dev:newuser`/`next dev`/`tsx watch` risulta attivo. **Smoke utente confermato il
2026-07-21:** il nuovo layout desktop è approvato e il profilo isolato riparte correttamente dopo
`reset:newuser`; Task 5.5 chiuso.

## Task 6 — Chiusura del miglioramento setup wizard / onboarding

**Obiettivo:** verificare e completare il residuo "Setup wizard migliorato" senza duplicare quanto è
già stato consegnato nello Step 7.5.

**Audit iniziale:** lo Step 7.5 (`80c66af`) ha già consegnato stepper etichettato, verifica cartelle,
Aspetto, Jellyfin opzionale e riepilogo. Esiste però un gap comportamentale: `AuthGate` usa
`seriesPathSub` come unico completion marker, mentre “Salva e verifica” salva quel campo e invalida
la stessa query. Il wizard viene quindi smontato al primo salvataggio e gli step successivi non sono
raggiungibili. Il workflow isolato `newuser` e il prefill esistono già; manca uno stato esplicito che
distingua setup in corso, installazioni legacy già configurate e setup completato.

**Sotto-task verificabili:**
- [x] Ricostruire requisito storico, flusso AuthGate/SetupScreen/SetupWizard, contratti config,
  sincronizzazione iniziale, workflow `newuser` e copertura test esistente.
- [x] Aggiungere un completion marker tri-state alla config e una decisione di gate pura: i DB legacy
  con cartella base e marker assente restano configurati, mentre un setup esplicitamente iniziato
  resta nel wizard anche dopo il salvataggio delle cartelle.
- [x] Correggere il lifecycle del wizard: marcare l'inizio prima di salvare, preservare/prefillare la
  ripresa, mostrare errori recuperabili e marcare completato solo da “Entra nell'app”.
- [x] Coprire deterministicamente fresh install, setup in corso con cartella salvata, installazione
  legacy, cartella obbligatoria rimossa e round-trip del marker senza nuove dipendenze test.
- [x] Riallineare `PLAN.md` e `CHANGELOG.md` rimuovendo il residuo stale solo dopo la correzione;
  registrare esito e limitazioni del collaudo runtime nel presente piano.
- [x] Eseguire test mirati, lint, typecheck, suite completa, build web, `git diff --check` e review
  semantica finale; completare il Task solo in assenza di blocker.

**Guida:**
- Fare audit del wizard attuale rispetto al residuo storico: login, cartelle, Aspetto, Jellyfin,
  riepilogo finale, ripresa e messaggi d'errore.
- Chiudere solo gap reali; se il residuo è già soddisfatto dallo Step 7.5, documentarlo e rimuovere la
  voce stale invece di creare codice superfluo.
- Usare il workflow isolato `npm run reset:newuser && npm run dev:newuser` per il collaudo.

**Test:** lint/typecheck/test/build più smoke manuale completo da nuovo utente con DB isolato.

**Demo:** un nuovo utente termina l'onboarding senza conoscenze implicite e arriva a un'app pronta.

**Esito automatico:** il marker `setupCompleted` è `null` sui DB legacy, `false` durante il wizard e
`true` solo dopo “Entra nell'app”. La decisione di gate richiede sempre `seriesPathSub`, ma accetta
come completate le installazioni legacy che la possiedono; l'invalidazione dopo “Salva e verifica”
non smonta più il wizard. Aspetto, Jellyfin e riepilogo restano raggiungibili, gli errori di mutation
sono recuperabili e `InitialSync` resta l'unico proprietario dell'avvio catalogo dopo l'ingresso.
Review semantica indipendente: `CLEAN`.

**Validazione automatica:** test mirati **2 file/21 test**, `npm run lint` (**311 file**), typecheck di
tutti i workspace, `npm run test` (**50 file/519 test**), build web (**16 pagine**) e
`git diff HEAD --check` verdi. `npm run reset:newuser` ha azzerato esclusivamente il DB isolato e
preservato `.env.newuser`. **Smoke utente confermato il 2026-07-21:** login da installazione locale
vergine, intero wizard e ingresso nell'app verificati; Task 6 chiuso.

## Task 7 — GitHub Pages live e gestione artwork ufficiale

**Obiettivo:** rendere pubbliche landing e FAQ già presenti e chiudere in modo esplicito la gestione
degli asset ancora placeholder.

**Audit iniziale (2026-07-21):** `docs/` contiene soltanto `index.html` e `faq.html`; entrambi
caricano Tailwind a runtime da CDN e la landing dipende anche da badge immagine remoti. I link
relativi sono validi e gli anchor `#setup`, `#https`, `#pwa-push`, `#neural`, `#jellyfin`, `#backup`
e `#upscale` esistono; i link in-app a `#https` e `#neural` sono quindi sorgente-corretti. La riga
dei tre placeholder viene tagliata a 320/375 px, il riferimento al README del worker non è
cliccabile e mancano stylesheet locale, favicon e metadata canonical/Open Graph. Non esiste un
workflow Pages né un `CNAME`: la modalità scelta resta **Deploy from a branch**, `main` + `/docs`,
senza affiancarle un secondo deploy Actions.

La verifica GitHub iniziale in sola lettura riportava repository pubblico, branch predefinito `main`,
`has_pages: false`; `GET /repos/iCosiSenpai/animeunion/pages` rispondeva `404` prima
dell'attivazione. La URL attesa era `https://icosisenpai.github.io/animeunion/`. Gli asset branding
presenti nell'app non hanno nel repo una provenienza/autorizzazione specifica sufficiente a
dimostrarne il riuso sulla landing e non sono stati copiati implicitamente.

**Sotto-task verificabili:**
- [x] Auditare pagine, asset, link relativi, anchor consumati dall'app, configurazione repository e
  stato Pages remoto senza mutazioni.
- [x] Eliminare le dipendenze di rendering da CDN con uno stylesheet locale versionato e sostituire
  i placeholder con un fallback geometrico/testuale originale, rifinito e responsive, senza
  presentarlo come mascotte o artwork ufficiale.
- [x] Aggiungere favicon locale, metadata canonical/Open Graph, trattamento resiliente degli status
  link, wrapping mobile e link cliccabile alla guida worker, senza introdurre asset non autorizzati.
- [x] Validare sintassi HTML, file/fragment relativi, assenza di dipendenze runtime di rendering e
  resa statica a 320, 375, 768 px e desktop; registrare le evidenze in questa sezione.
- [x] Ottenuta conferma esplicita dell'utente, pubblicare i soli file approvati e abilitare Pages da
  `main` + `/docs`; nessuna azione remota è autorizzata dalla sola preparazione locale.
- [x] Dopo il deploy, verificare risposta pubblica di landing/FAQ e navigazione verso `#https` e
  `#neural`; aggiornare README/homepage solo quando la URL è realmente live.

**Esito locale (2026-07-21):** landing e FAQ usano il solo `docs/style.css`, senza JavaScript,
Tailwind CDN, font, immagini o badge remoti. La hero adotta un fallback astratto costruito in CSS e
marcato nel sorgente come non ufficiale; `docs/assets/favicon.svg` documenta la stessa provenienza.
Canonical, Open Graph/Twitter, skip link, focus visibile e reduced motion sono presenti. Gli status
sono link testuali, i path lunghi possono andare a capo e la guida worker punta al README corretto.
Il CTA installazione raggiunge il fragment GitHub generato dal titolo README con emoji.

**Validazione locale:** checker deterministico verde su **2 HTML**, **9 ID FAQ**, tutti i
file/fragment relativi e nessuna risorsa remota di rendering; Biome mirato, diagnostica CSS/SVG e
`git diff --check` verdi. Smoke Chromium servito dal sottopercorso reale `/animeunion/` a **320,
375, 768 e 1440 px**: **140 regole CSS** caricate, larghezza documento uguale alla viewport in tutte
le 8 combinazioni pagina/viewport, nessun errore o request esterna e navigazione `#https`/`#neural`
risolta. Snapshot landing/FAQ mobile e desktop ispezionati; il solo difetto visivo trovato, link Home
ridondante che comprimeva il brand FAQ a 320 px, è stato corretto e ricontrollato. Review semantica
indipendente finale: `CLEAN`.

**Pubblicazione e verifica live (2026-07-21):**
- Commit dedicato `225582c` (`docs: prepare GitHub Pages landing and FAQ`) con i soli quattro path
  Pages; push su `main` completato insieme al già autorizzato `28ccf22`, senza modifiche locali
  estranee.
- Pages pubblico in modalità `legacy`/Deploy from a branch, source `main` + `/docs`, HTTPS forzato,
  nessun `CNAME`; build `1107403214` e workflow `pages-build-deployment` `29850235294` verdi.
- Landing `https://icosisenpai.github.io/animeunion/` e FAQ
  `https://icosisenpai.github.io/animeunion/faq.html` rispondono `200`; anche `style.css` e
  `assets/favicon.svg` rispondono `200` e i quattro body pubblici hanno SHA-256 identico ai file del
  commit.
- Smoke Chromium live verde su landing e FAQ a 320/375/768/1440 px: nessun overflow o errore,
  risorse di rendering solo same-origin, canonical corretti e anchor pubblici `#https`/`#neural`
  risolti. La CI del push `29850159331` è `success` sia per lint/typecheck/test sia per E2E.
- README e homepage restano intenzionalmente invariati: il README mantiene il ruolo di guida
  installazione e `animeunion.tv` quello di sito affiliato; la Pages è già raggiunta dai link FAQ
  dell'app e un ulteriore link promozionale richiederebbe un commit documentale separato.

**Gestione artwork e blocchi esterni:**
- [x] In assenza di file e autorizzazione, adottare un fallback originale come stato pubblicabile e
  non riusare `apps/web/public/logo.png` o icone per semplice prossimità nel repository.
- L'eventuale sostituzione futura con logo/mascotte ufficiali ha come referente l'utente o l'admin
  AnimeUnion e come criterio di ingresso: file sorgente, conferma esplicita di riuso/pubblicazione,
  indicazioni trademark/licenza e testo alternativo. Non blocca il fallback professionale.
- [x] Pages abilitato su `main` + `/docs` dopo conferma esplicita; configurazione e URL pubbliche
  verificate. Ulteriori cambi remoti restano soggetti a nuova autorizzazione.

**Guida:**
- Verificare `docs/index.html`, `docs/faq.html`, link relativi, asset e link dall'app.
- Sostituire i placeholder solo con artwork ufficiale fornito/autorizzato; in assenza, mantenere un
  fallback professionale e registrare l'input esterno mancante senza link o immagini rotte.
- Preparare/verificare la configurazione Pages su `main` + `/docs`; l'attivazione nelle impostazioni
  GitHub richiede conferma e accesso esterno.
- Verificare la URL pubblica e gli anchor FAQ dopo il deploy.

**Test:** validazione HTML/link essenziali e verifica visiva desktop/mobile della pagina pubblicata.

**Demo:** landing e FAQ rispondono dalla URL GitHub Pages e tutti i link in-app arrivano a sezioni
esistenti.

## Task 8 — E2E Playwright promossi a gate bloccante

**Obiettivo:** rendere gli E2E affidabili abbastanza da bloccare regressioni reali in CI.

**Audit iniziale (2026-07-21):** esistono una sola configurazione Playwright e uno spec con tre
smoke. I test home/catalogo verificano soltanto titolo e `body`: con database `:memory:` non
configurato possono passare sul wizard invece che sul catalogo. Il check health prova solo `ok()` e
non il payload. In locale Playwright può riusare listener arbitrari; i server sono `tsx watch` e
`next dev`, l'API carica `.env` e non riceve `API_PORT` esplicito. Il mock dati è in-process ma
fornisce URL immagine esterni.

In CI il job usa un retry, `trace: on-first-retry`, solo reporter GitHub e tenta di caricare una
cartella report HTML non garantita; `continue-on-error: true` rende il job non bloccante. La run
`29850159331` ha avuto E2E verdi, ma resta una singola evidenza non bloccante. `main` non ha branch
protection (`404`) e non esistono ruleset: rendere il check richiesto è una futura mutazione remota
soggetta a conferma esplicita.

**Sotto-task verificabili:**
- [x] Tracciare config/spec/server/mock/script/workflow, stato CI e branch protection, preservando il
  working tree misto e il piano `AM`.
- [x] Eseguire una baseline isolata dell'assetto corrente con `CI=1`, retry zero e ripetizioni, per
  distinguere falsi positivi, flake e problemi di teardown prima delle modifiche.
- [x] Introdurre un lifecycle E2E deterministico: API non-watch senza caricamento `.env`, porte/env
  esplicite, web build + start di produzione, readiness HTTP e nessun riuso di listener locali.
- [x] Rafforzare gli smoke con payload health esatto, shell setup reale e bootstrap mock del catalogo
  seguito da una prova UI/API osservabile; impedire richieste a host asset esterni.
- [x] Usare retry zero e diagnostica sul primo fallimento (`trace`/screenshot/report HTML), un worker
  e stato condiviso controllato, senza aumentare timeout generici senza evidenza.
- [x] Rimuovere `continue-on-error`, aggiungere timeout job e artefatti coerenti
  `playwright-report`/`test-results`, così una failure E2E rende rossa la workflow.
- [x] Eseguire almeno dieci ripetizioni nella stessa invocazione e due invocazioni fresche
  consecutive, poi lint, typecheck, suite completa, build web, diff-check e review indipendente.
- [x] Creare un checkpoint locale del batch validato: commit `a2cde04`
  (`chore: checkpoint post-v0.16 closure work`), con working tree pulito e nessun push.
- [ ] Autorizzazione ricevuta: pushare il checkpoint e verificare una CI remota verde; rendere
  eventualmente il check E2E richiesto in branch protection solo con ulteriore conferma separata.

**Esito locale (2026-07-21):** Playwright possiede tre processi distinti e non riutilizzabili:
mock upstream locale su `3100`, API `tsx` non-watch su `3001` con database `:memory:` e source mock,
e build Next standalone su `3000`. Porte, credenziali fittizie e URL sono espliciti; `.env` non viene
caricato dallo script E2E. Readiness e teardown sono verificati su tutti i processi. Il browser
intercetta gli asset esterni del mock e la build non usa più `next/font/google`: il body adotta lo
stack locale Tailwind `font-sans`, eliminando anche la richiesta Google Fonts pre-browser rilevata
dalla prima review.

Gli smoke distinguono il wizard reale dal catalogo, richiedono il payload health esatto e avviano
esplicitamente `catalog.sync` via tRPC, attendendone il completamento prima di verificare nella UI
**50 risultati** ed `Edens Zero` con ordinamento deterministico per titolo. La configurazione usa
retry zero, un worker, trace e screenshot al primo fallimento, reporter HTML sempre prodotto e
reporter GitHub in CI. Il workflow non contiene più `continue-on-error`, ha timeout di 15 minuti e
carica `playwright-report` più `test-results` anche in caso di failure.

**Validazione locale finale:** la baseline pre-modifica era verde (**30/30** + **3/3**) ma con
assert falsi positivi e server dev/watch. La prima esecuzione rafforzata ha invece riprodotto il
catalogo vuoto, portando al bootstrap API esplicito; un secondo controllo ha eliminato la dipendenza
dall'ordine temporale delle card. Dopo la correzione Google Fonts emersa dalla review, il codice
finale ha superato `--repeat-each=10` (**30/30 in 37,4 s**) e due invocazioni fresche consecutive
(**3/3 in 25,9 s** e **3/3 in 25,7 s**), lasciando libere le porte `3000`, `3001` e `3100` dopo ogni
teardown. Verdi anche Biome (**314 file**), typecheck di api/web/worker/neural-core/shared, Vitest
(**50 file/519 test**), build Next (**16 pagine**), diagnostica editor e `git diff HEAD --check`.
Prima review semantica `NEEDS_CHANGES` per Google Fonts; seconda review post-fix: **`CLEAN`**.

**Stato remoto:** il checkpoint locale `a2cde04` contiene implementazione ed evidenze ed è un commit
avanti a `origin/main`. Non è stato ancora eseguito il push e non esiste una CI remota sul nuovo
gate; branch protection e ruleset restano assenti. L'utente ha autorizzato push e fasi release il
2026-07-22; Task 8 rimane aperto soltanto fino alla verifica della nuova CI.

**Rischi e vincoli:** nessuna nuova dipendenza è necessaria; `package-lock.json` e le modifiche
preesistenti restano fuori scope. Build/start devono terminare con Playwright senza lasciare processi
o porte 3000/3001/3100 occupate. Un retry che passa non è stabilità: il gate deve fallire alla prima
regressione. L'assenza attuale di branch protection non impedisce il gate nella workflow, ma non
viene rappresentata come protezione merge finché non è configurata e verificata remotamente.

**Guida:**
- Eseguire e stabilizzare gli smoke esistenti in modalità mock, eliminando dipendenze temporali e
  selettori fragili.
- Aggiungere retry/timeout solo dove motivato, senza mascherare errori applicativi.
- Rimuovere `continue-on-error: true` dal job `e2e` quando una run pulita è ripetibile.
- Verificare che la protezione branch richieda il job, se gestibile dal repository.

**Test:** più run locali consecutive di `npm run test:e2e`, suite standard completa e run CI verde.

**Demo:** una regressione E2E blocca la pipeline; il ramo sano passa stabilmente.

## Task 9 — Release finale e chiusura completa del batch

**Obiettivo:** pubblicare la versione determinata nel Task 2 e lasciare piani, documentazione,
immagini e deploy nello stesso stato verificabile.

**Audit iniziale (2026-07-21):** root e cinque workspace sono allineati a `0.16.0`; tag, GitHub
Release e immagini GHCR `latest`/`v0.16.0` confermano che la prossima versione è `0.17.0`. Il
checkpoint `a2cde04` è locale e `main` è avanti di un commit; l'ultima CI remota verde riguarda
`225582c`. Docker Publish è abilitato e parte su tag `v*`, pubblicando api/web multi-arch, ma non
dipende automaticamente dalla CI: la sequenza deve essere push → CI verde → tag. Pages è live da
`main` + `/docs`; branch protection e ruleset sono assenti.

`CHANGELOG.md`, `PLAN.md` §10bis e `CLAUDE.md` contengono residui ormai stale. Il lifecycle npm
`version` esegue `format` e `git add .`, quindi il bump viene applicato in modo esplicito ai manifest
e al lockfile, senza usarlo. I collaudi con account/credenziali o hardware reali non vengono simulati:
devono avere proprietario, ambiente e criterio di chiusura.

**Gap catalogo emerso dallo screenshot:** l'immagine coincide col primo fallimento E2E pre-fix e
non ci sono listener locali correnti, ma rivela un difetto reale. `InitialSync` avvia l'import
fire-and-forget senza osservarne la fine né invalidare `catalog.browse`/`filters`; una pagina già
risolta a zero può quindi restare su “Nessun anime trovato” dopo una sync riuscita. La correzione va
provata sul percorso automatico, non aggirata con bootstrap API nel test.

**Sotto-task verificabili:**
- [x] Auditare versioni, documenti, workflow CI/GHCR, Pages, stato remoto, consumer della sync e
  provenienza dello screenshot senza leggere segreti o mutare servizi esterni.
- [x] Rendere autorevole la sync iniziale: osservare anche una sync già in corso, gestire l'esito,
  invalidare le query catalogo al completamento e aggiornare lo smoke E2E affinché provi il percorso
  automatico da DB vuoto senza bootstrap API manuale.
- [x] Decidere e coprire la semantica di una sync con zero elementi, evitando che un falso successo
  renda fresco un catalogo vuoto o nasconda dati precedenti.
- [x] Portare root, api, web, worker, neural-core, shared e lockfile a `0.17.0` senza lifecycle npm
  invasivi; verificare che ogni fonte versione runtime sia coerente.
- [x] Trasformare `[Unreleased]` nel changelog v0.17.0 e riallineare `PLAN.md`, `CLAUDE.md` e questo
  piano, rimuovendo soltanto residui realmente chiusi e mantenendo espliciti i blocchi esterni.
- [x] Gestire l'audit npm production emerso dal build Docker senza `--force` o downgrade: applicare
  patch esatte e gli upgrade minimi Drizzle/node-cron, validare API scheduler/DB, lockfile, audit,
  suite e build, quindi documentare l'eventuale eccezione accettata prima della candidatura.
  - [x] Confermare che lockfile e albero risolvono con `npm ci --ignore-scripts`: **471 pacchetti**
    installati; il fallimento del `npm ci` ordinario resta isolato al download GitHub eseguito dal
    lifecycle di `ffmpeg-static@5.3.0`, non alla risoluzione npm.
  - [x] Ripristinare l'asset ufficiale `ffmpeg` b6.1.1 tramite la cache supportata dal pacchetto,
    ottenere un `npm ci` ordinario verde e verificare il binario; nessun mirror non verificato.
    Completato tramite `FFMPEG_BINARIES_URL` loopback effimero sui tre body ufficiali già presenti
    nella cache `ffmpeg-static`: asset gzip SHA-256 `8883A3DF…6D77`; FFmpeg 6.1.1 eseguibile,
    README e licenza presenti; server locale chiuso dopo le tre richieste.
  - [x] Applicare gli upgrade supportati con versioni esatte: Drizzle ORM `0.45.2`, node-cron
    `4.6.0`, undici `7.28.0`, Next `15.5.21` e drizzle-kit `0.31.10`; rimuovere
    `@types/node-cron` e validare il lock cross-platform senza override non supportati.
  - [x] Rieseguire `npm audit --omit=dev`: residuo confermato esclusivamente nel ramo Next con
    PostCSS `<8.5.10` (**1 moderate**) e Sharp `<0.35.0` (**2 high**). `npm audit fix --force`
    proporrebbe il downgrade distruttivo a Next 9.3.3 e non è stato eseguito.
  - [x] Sbloccare il residuo audit tramite accettazione esplicita del rischio. Proprietario patch:
    maintainer Next/upstream; criterio tecnico futuro: Next supportata con PostCSS ≥8.5.10 e Sharp
    ≥0.35.0.
    - [x] Accettazione ricevuta il 2026-07-22 e registrata in `SECURITY.md`, changelog, roadmap e
      stato corrente senza dichiarare le CVE risolte.
    - [x] Rieseguire audit/diff-check e review indipendente prima del commit release.
- [x] Classificare ed eseguire i collaudi runtime automatizzabili (Doctor, ripresa download,
  Premium, notifier, PWA, cestino, setup, Pages, E2E); per account, credenziali, GPU e NAS sono
  registrati sotto proprietario, ambiente, prova richiesta e stato senza dichiarare verde ciò che
  non è stato osservato.
- [x] Validare lint, typecheck, suite unit/integration, build web, E2E ripetuti, compose config e build
  Docker api/web; chiudere ogni failure e ottenere una review semantica finale `CLEAN`.
  - [x] Eseguire lint (**316 file**) e typecheck di tutti i workspace sulle dipendenze aggiornate;
    API, web, worker, neural-core e shared verdi a `0.17.0`.
  - [x] Eseguire l'intera suite Vitest e la build production web.
    - [x] Suite Vitest verde: **51 file, 530 test**, inclusi scheduler, Drizzle e FFmpeg reali.
    - [x] Lock npm cross-platform ripristinato con metadata registry ufficiali: **8** target SWC,
      **24** artifact Sharp e **10** libvips; nuovo `npm ci` verde e build Next 15.5.21 di
      **16 pagine** completata senza auto-patch o warning.
  - [x] Eseguire Playwright `--repeat-each=10` (**30/30**) e due invocazioni fresche consecutive
    (**3/3**, **3/3**); teardown verificato con porte `3000`, `3001` e `3100` libere.
  - [x] Validare `docker compose config`, build API/web e versione `0.17.0` dentro entrambe le
    immagini prodotte.
    - [x] `docker compose config --quiet` verde.
    - [x] Il fallback sorgente di `better-sqlite3` usa gli header inclusi nell'immagine Node sotto
      `/usr/local/include/node`, senza dipendere dal download degli header durante `node-gyp`.
    - [x] Immagini API/web ricostruite e ispezionate: root/API/web `0.17.0`, Next `15.5.21`, Drizzle
      `0.45.2`, node-cron `4.6.0`, undici `7.28.0`; SQLite in-memory e FFmpeg eseguibile verdi.
  - [x] Eseguire diff-check, controllo stato/porte e review semantica finale prima del verdetto.
    - [x] Prima review indipendente: `NEEDS_CHANGES` per audit production non accettato e metadata
      contraddittori tra changelog/stato manifest.
    - [x] Tenere le note sotto `[Unreleased]` e riallineare lo stato corrente in `CLAUDE.md`.
    - [x] Seconda review indipendente: `NEEDS_CHANGES` per classificazione/autorizzazioni stale,
      descrizione Sharp imprecisa e floor Node incompatibile con undici 7.28.0.
    - [x] Classificare l'audit come eccezione accettata non bloccante e registrare in modo uniforme
      l'autorizzazione già concessa per commit, push, tag, release e deploy NAS.
    - [x] Documentare con precisione Sharp nei runner Docker e portare il floor Node a `>=20.18.1`,
      con `.nvmrc` a `20.20.2` e lockfile coerente.
    - [x] Rieseguire diff-check, porte e review indipendente fino al verdetto `CLEAN`.
      Review semantica finale del candidato v0.17.0: **`CLEAN`** (2026-07-22).
- [ ] Autorizzazione ricevuta: creare il commit release e pushare `main`; attendere CI verde e
  chiudere il residuo remoto del Task 8 prima di creare il tag.
- [ ] Autorizzazione ricevuta: creare/pushare `v0.17.0`, verificare Docker Publish multi-arch, creare
  la GitHub Release e controllare tag `v0.17.0` + `latest` su entrambe le immagini GHCR.
- [ ] Autorizzazione ricevuta: aggiornare i servizi necessari sul NAS e svolgere smoke post-deploy;
  branch protection resta una mutazione remota separata e non autorizzata.

**Matrice collaudi (esito locale e gate reali al 2026-07-22):**

| Area | Evidenza automatizzata / locale | Gate reale: proprietario, ambiente e prova | Stato reale |
|---|---|---|---|
| Doctor | **Verde:** 9 test Doctor nella suite 530/530 | Utente/maintainer NAS; volumi reali; simulare mount assente/errato e verificare diagnosi e ripristino | **Non eseguito** |
| Ripresa download | **Verde:** 46 test download service, 28 worker e 2 scheduler, inclusi interleaving/restart | Utente; account/source e filesystem NAS; interrompere un download, riavviare e verificare ripresa senza duplicati | **Non eseguito** |
| Premium | **Verde:** parsing profilo, auth e gate entitlement con source mock nella suite | Utente + admin AnimeUnion; account Premium reale; osservare `/integration/me` e capability/UI effettive | **Non eseguito** |
| Telegram/Discord | **Verde:** notifier con `MockAgent` e 7 test notification service | Utente; token/chat Telegram e webhook Discord reali; ricevere entrambi i messaggi di test | **Non eseguito** |
| PWA/Push | **Verde:** 8 test push service, manifest/service worker e build Next 16 pagine | Utente; browser su deploy HTTPS; installare la PWA e ricevere una push reale | **Non eseguito** |
| Cestino/Libreria | **Verde:** 36 test FileManager, 38 Library e 8 rollback UI, inclusi containment e symlink | Utente/maintainer NAS; volumi e permessi reali; delete/restore/retention con junction o symlink rappresentativi | **Non eseguito** |
| Setup | **Verde:** gate tri-state, E2E fresh-state e build | Utente; profilo isolato `newuser`; completare login, wizard e ingresso nell'app | **Verificato il 2026-07-21**; nuovo deploy NAS non eseguito |
| Pages | **Verde:** checker/hash e smoke Chromium del Task 7; landing e FAQ pubbliche rispondono `200` | Nessuna credenziale; URL Pages live; verificare landing, FAQ e anchor | **Verificato**; artwork ufficiale resta opzionale |
| E2E | **Verde:** Playwright **30/30 + 3/3 + 3/3**, porte rilasciate | Maintainer repository; GitHub Actions dopo push autorizzato; job E2E bloccante verde | **Push autorizzato; in attesa di esecuzione e CI** |
| Drive/GPU/NAS | **Verde nei contratti:** servizi/core, typecheck, suite e immagini Docker locali | Utente; OAuth Drive, worker Windows GPU e NAS; backup/restore reale, job Neural e deploy con smoke | **Non eseguito** |

La classificazione locale è completa. Le evidenze reali non osservate restano esplicitamente aperte;
non sono state lette credenziali né mutati servizi esterni. L'eccezione audit Next è accettata e
non bloccante per v0.17.0; i gate remoti restano separati e non vengono compensati dai test locali
verdi.

**Sequenza remota obbligatoria:** commit release locale → push `main` → CI bloccante verde → creazione
e push `v0.17.0` → GHCR verde → GitHub Release → deploy NAS → smoke. Le autorizzazioni necessarie
sono già state ricevute; nessuna fase successiva può compensare una precedente non verificata.

**Guida:**
- Eseguire i collaudi runtime accumulati: Doctor, ripresa download, Premium, Telegram/Discord, PWA,
  cestino Libreria, setup, Pages ed E2E.
- Aggiornare CHANGELOG, manifest/lockfile, `CLAUDE.md`, `PLAN.md` §10bis e archivio storico.
- Assicurarsi che non rimangano checkbox aperte senza proprietario: eventuali dipendenze esterne
  devono avere stato, referente e criterio di chiusura espliciti.
- Eseguire commit release, push, tag, pubblicazione e deploy nella sequenza già autorizzata; non
  modificare branch protection.
- Verificare CI/GHCR multi-arch e aggiornare sul NAS solo i servizi necessari.

**Test:** lint, typecheck, unit/integration, build web, E2E bloccanti e smoke post-deploy.

**Demo:** release/tag e immagini GHCR disponibili, app live alla versione corretta, documentazione e
piani senza residui ambigui.

## Vincoli e blocchi esterni noti

- URL/handle ufficiale dell'assistenza Telegram: da ottenere dall'utente o dall'admin prima di
  pubblicare un link.
- Artwork ufficiale della mascotte: sostituibile solo quando viene fornito/autorizzato.
- Modifiche ulteriori a GitHub Pages e branch protection richiedono una nuova autorizzazione;
  commit, push, tag, GitHub Release, pubblicazione GHCR e deploy NAS di v0.17.0 sono già autorizzati.
- Le feature Premium non esposte dai contratti API non vengono simulate lato client come se fossero
  entitlement server autorevoli.
