import { freeDiskBytes } from './lib/download-fs';
import { createSeasonWatcher } from './services/season-watcher';
import type { Context } from './trpc';

export interface Scheduler {
  start(): void;
  stop(): void;
}

const DOWNLOAD_AUTODOWNLOAD_MINUTES = 30;
const QUEUE_PURGE_HOURS = 6;
const TRASH_PRUNE_HOURS = 12;
const DISK_CHECK_HOURS = 6;
const SEASON_CHECK_HOURS = 12;
const SEASON_CHECK_STARTUP_MS = 2 * 60 * 1000; // prima passata ~2 min dopo l'avvio
// Soglia di avviso (1 GiB): più alta del hard-stop del worker (500 MiB) per avvisare prima.
const DISK_LOW_BYTES = 1024 * 1024 * 1024;

/**
 * Scheduler di polling dei preferiti del sito (v1.0.3) + auto-download per i follow
 * `watching`. All'avvio fa un import completo, poi sincronizza in modo incrementale
 * via `?updatedSince=` ad intervalli regolari (config `favoritesSyncMinutes`). Tollerante
 * agli endpoint non ancora deployati (le chiamate falliscono in modo silenzioso lato
 * service). Il worker di download e' event-driven: qui lo accendiamo e aggiungiamo
 * un tick periodico che accoda nuovi episodi per i follow `watching`.
 */
export function createScheduler(ctx: Context): Scheduler {
  const { services, logger } = ctx;
  const timers: NodeJS.Timeout[] = [];

  function intervalMs(): number {
    return services.config.get('favoritesSyncMinutes') * 60 * 1000;
  }

  return {
    start(): void {
      // Worker download event-driven (tick interno di sicurezza 60s, unref).
      services.download.start();

      // Import iniziale (fire-and-forget: non blocca l'avvio del server).
      void services.favorites.importFromSite().catch((error) => {
        logger.debug({ err: error }, 'Import preferiti iniziale fallito');
      });
      const favTimer = setInterval(() => {
        void services.favorites.pollUpdates().catch((error) => {
          logger.debug({ err: error }, 'Tick polling preferiti fallito');
        });
      }, intervalMs());
      favTimer.unref?.();
      timers.push(favTimer);

      // Auto-enqueue per i follow watching/auto-download (status-aware: rinfresca gli ONGOING,
      // salta i COMPLETED — vedi download-service.enqueueForAutoFollows). Ora è async.
      const autoEnqueue = async () => {
        try {
          const enqueued = await services.download.enqueueForAutoFollows();
          if (enqueued > 0) {
            logger.info({ enqueued }, 'Auto-enqueue follow: nuovi episodi accodati');
          }
        } catch (error) {
          logger.debug({ err: error }, 'Tick auto-enqueue watching fallito');
        }
      };
      const dlTimer = setInterval(
        () => void autoEnqueue(),
        DOWNLOAD_AUTODOWNLOAD_MINUTES * 60 * 1000,
      );
      dlTimer.unref?.();
      timers.push(dlTimer);

      // Pulizia coda: rimuove i job terminali più vecchi di queueRetentionDays.
      const purge = () => {
        try {
          services.download.purgeOldTerminal();
        } catch (error) {
          logger.debug({ err: error }, 'Tick pulizia coda fallito');
        }
      };
      purge();
      const purgeTimer = setInterval(purge, QUEUE_PURGE_HOURS * 60 * 60 * 1000);
      purgeTimer.unref?.();
      timers.push(purgeTimer);

      // Pulizia cestino: elimina definitivamente le voci oltre trashRetentionDays.
      const pruneTrash = () => {
        if (!services.config.get('trashEnabled')) {
          return;
        }
        void services.files
          .pruneTrash(services.config.get('trashRetentionDays'))
          .then((removed) => {
            if (removed > 0) {
              logger.info({ removed }, 'Cestino: voci scadute eliminate');
            }
          })
          .catch((error) => {
            logger.debug({ err: error }, 'Tick pulizia cestino fallito');
          });
      };
      pruneTrash();
      const trashTimer = setInterval(pruneTrash, TRASH_PRUNE_HOURS * 60 * 60 * 1000);
      trashTimer.unref?.();
      timers.push(trashTimer);

      // Backup automatico del DB (opt-in): crea una copia consistente e pota oltre la retention.
      // Tick orario; esegue il backup solo se è passato l'intervallo dall'ultimo (best-effort:
      // la cadenza è guidata dal numero di backup recenti, vedi db-backup-service).
      let lastBackupMs = 0;
      const backupTick = () => {
        if (!services.config.get('dbBackupEnabled')) {
          return;
        }
        const intervalMs = services.config.get('dbBackupIntervalHours') * 60 * 60 * 1000;
        if (Date.now() - lastBackupMs < intervalMs) {
          return;
        }
        lastBackupMs = Date.now();
        void services.backup
          .runBackup()
          .then(() => services.backup.pruneBackups(services.config.get('dbBackupRetention')))
          .then((removed) => {
            if (removed > 0) {
              logger.debug({ removed }, 'Backup DB: copie vecchie eliminate');
            }
          })
          .catch((error) => {
            logger.warn({ err: error }, 'Backup DB automatico fallito');
          });
      };
      backupTick();
      const backupTimer = setInterval(backupTick, 60 * 60 * 1000);
      backupTimer.unref?.();
      timers.push(backupTimer);

      // Avviso spazio disco basso: debounced (notifica solo alla transizione ok->low per cartella).
      const lowRoots = new Set<string>();
      const checkDisk = async () => {
        try {
          for (const root of services.config.distinctDownloadRoots()) {
            const free = await freeDiskBytes(root);
            if (free == null) {
              continue;
            }
            if (free < DISK_LOW_BYTES) {
              if (!lowRoots.has(root)) {
                lowRoots.add(root);
                services.notifications.create({
                  type: 'disk_low',
                  title: 'Spazio su disco in esaurimento',
                  body: `Cartella ${root}: ${Math.round(free / 1024 / 1024)} MiB liberi`,
                });
              }
            } else {
              lowRoots.delete(root); // tornata sopra soglia: riarma l'avviso
            }
          }
        } catch (error) {
          logger.debug({ err: error }, 'Tick check disco fallito');
        }
      };
      void checkDisk();
      const diskTimer = setInterval(() => void checkDisk(), DISK_CHECK_HOURS * 60 * 60 * 1000);
      diskTimer.unref?.();
      timers.push(diskTimer);

      // Nuove stagioni delle serie seguite (batch a rotazione, refresh forzato del dettaglio).
      const seasonWatcher = createSeasonWatcher({
        db: ctx.db,
        catalog: services.catalog,
        notifications: services.notifications,
        config: services.config,
        logger,
      });
      const seasonCheck = () => {
        void seasonWatcher.checkNewSeasons().catch((error) => {
          logger.debug({ err: error }, 'Tick season-watcher fallito');
        });
      };
      const seasonStartup = setTimeout(seasonCheck, SEASON_CHECK_STARTUP_MS);
      seasonStartup.unref?.();
      timers.push(seasonStartup);
      const seasonTimer = setInterval(seasonCheck, SEASON_CHECK_HOURS * 60 * 60 * 1000);
      seasonTimer.unref?.();
      timers.push(seasonTimer);

      logger.info(
        {
          favoritesEveryMinutes: services.config.get('favoritesSyncMinutes'),
          downloadEveryMinutes: DOWNLOAD_AUTODOWNLOAD_MINUTES,
        },
        'Scheduler avviato',
      );
    },

    stop(): void {
      for (const t of timers) {
        clearInterval(t);
      }
      timers.length = 0;
      services.download.stop();
    },
  };
}
