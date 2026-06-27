import { z } from 'zod';

// Prova di connessione a un server Jellyfin (Impostazioni → Integrazioni). Può ricevere URL/chiave
// in chiaro per testare la bozza prima del salvataggio (come `testTelegram`).
export const jellyfinTestInputSchema = z
  .object({
    serverUrl: z.string().optional(),
    apiKey: z.string().optional(),
  })
  .optional();
export type JellyfinTestInput = z.infer<typeof jellyfinTestInputSchema>;

export const jellyfinTestResultSchema = z.object({
  ok: z.boolean(),
  serverName: z.string().optional(),
  version: z.string().optional(),
  error: z.string().optional(),
});
export type JellyfinTestResult = z.infer<typeof jellyfinTestResultSchema>;
