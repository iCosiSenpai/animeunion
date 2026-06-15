import type { Context } from './trpc';

export interface Scheduler {
  start(): void;
  stop(): void;
}

/**
 * Scheduler di polling dei preferiti del sito (v1.0.3).
 * All'avvio fa un import completo, poi sincronizza in modo incrementale via `?updatedSince=`
 * ad intervalli regolari (config `favoritesSyncMinutes`). Tollerante agli endpoint non ancora
 * deployati (le chiamate falliscono in modo silenzioso lato service).
 */
export function createScheduler(ctx: Context): Scheduler {
  const { services, logger } = ctx;
  let timer: NodeJS.Timeout | null = null;

  function intervalMs(): number {
    return services.config.get('favoritesSyncMinutes') * 60 * 1000;
  }

  return {
    start(): void {
      // Import iniziale (fire-and-forget: non blocca l'avvio del server).
      void services.favorites.importFromSite().catch((error) => {
        logger.debug({ err: error }, 'Import preferiti iniziale fallito');
      });
      timer = setInterval(() => {
        void services.favorites.pollUpdates().catch((error) => {
          logger.debug({ err: error }, 'Tick polling preferiti fallito');
        });
      }, intervalMs());
      // Non tenere vivo il processo solo per questo timer.
      timer.unref?.();
      logger.info(
        { everyMinutes: services.config.get('favoritesSyncMinutes') },
        'Scheduler preferiti avviato',
      );
    },

    stop(): void {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    },
  };
}
