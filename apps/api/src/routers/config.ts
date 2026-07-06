import {
  type AppConfig,
  SECRET_CONFIG_KEYS,
  SECRET_MASK,
  appInfoSchema,
  configKeySchema,
  configSetInputSchema,
} from '@animeunion/shared';
import { z } from 'zod';
import { APP_VERSION } from '../lib/version';
import { DOWNLOAD_DIR_KEYS } from '../services/config-service';
import { publicProcedure, router } from '../trpc';

// Non inviare mai i segreti in chiaro al FE: token impostato → SECRET_MASK, vuoto → ''.
// Il config-service resta veritiero lato server (il notifier legge il valore reale).
function redactSecrets(config: AppConfig): AppConfig {
  const out = { ...config };
  for (const key of SECRET_CONFIG_KEYS) {
    const value = out[key];
    if (typeof value === 'string') {
      (out[key] as string) = value ? SECRET_MASK : '';
    }
  }
  return out;
}

export const configRouter = router({
  appInfo: publicProcedure.output(appInfoSchema).query(() => ({ version: APP_VERSION })),

  getAll: publicProcedure.query(({ ctx }) => redactSecrets(ctx.services.config.getAll())),

  get: publicProcedure.input(z.object({ key: configKeySchema })).query(({ ctx, input }) => {
    const value = ctx.services.config.get(input.key);
    if (SECRET_CONFIG_KEYS.includes(input.key) && typeof value === 'string') {
      return { key: input.key, value: value ? SECRET_MASK : '' };
    }
    return { key: input.key, value };
  }),

  set: publicProcedure.input(configSetInputSchema).mutation(({ ctx, input }) => {
    // Guardia anti-maschera (bug A4): se il FE rimanda il placeholder di un segreto, non
    // sovrascrivere il valore reale nel DB. Il contratto "se invariato non modificare" non puo'
    // dipendere solo dal client. No-op: restituisci lo stato mascherato senza toccare il config.
    if (
      (SECRET_CONFIG_KEYS as readonly string[]).includes(input.key) &&
      input.value === SECRET_MASK
    ) {
      return { key: input.key, value: SECRET_MASK };
    }
    // Cambio di una cartella di download: i file gia' scaricati restano nella vecchia cartella
    // (non li spostiamo). Se ce ne sono, avvisa l'utente con una notifica.
    const isDownloadDir = (DOWNLOAD_DIR_KEYS as string[]).includes(input.key);
    const previous = isDownloadDir ? ctx.services.config.get(input.key) : null;
    const value = ctx.services.config.set(input.key, input.value);
    if (
      isDownloadDir &&
      typeof previous === 'string' &&
      typeof value === 'string' &&
      previous.trim() !== '' &&
      previous !== value
    ) {
      const affected = ctx.services.config.countDownloadsUnder(previous);
      if (affected > 0) {
        ctx.services.notifications.create({
          type: 'info',
          title: 'Cartella di download cambiata',
          body: `${affected} file restano nella cartella precedente (${previous}): non vengono spostati automaticamente. Spostali a mano oppure usa "Scansiona libreria" / "Gestore file".`,
        });
      }
    }
    return { key: input.key, value };
  }),

  downloadDirs: publicProcedure.query(({ ctx }) => ctx.services.config.downloadDirsStatus()),

  browseDir: publicProcedure
    .input(z.object({ path: z.string().optional() }))
    .query(({ ctx, input }) => ctx.services.config.browseDir(input.path)),
});
