import {
  neuralExportJobViewSchema,
  neuralExportRequestSchema,
  neuralExportStatusSchema,
  neuralPairRequestSchema,
  neuralPairResultSchema,
  neuralPairingCodeSchema,
} from '@animeunion/shared';
import { z } from 'zod';
import { publicProcedure, router } from '../trpc';

export const neuralExportRouter = router({
  // Stato complessivo: entitlement + config + salute worker + profili disponibili.
  status: publicProcedure
    .output(neuralExportStatusSchema)
    .query(({ ctx }) => ctx.services.neuralExport.getStatus()),

  // Avvia l'upscale di un episodio SD gia' scaricato.
  export: publicProcedure
    .input(neuralExportRequestSchema)
    .mutation(({ ctx, input }) => ctx.services.neuralExport.exportEpisode(input)),

  // Genera un codice di abbinamento breve da mostrare in Impostazioni.
  createPairingCode: publicProcedure
    .output(neuralPairingCodeSchema)
    .mutation(({ ctx }) => ctx.services.neuralExport.createPairingCode()),

  // Completa l'abbinamento dall'app desktop: codice + URL LAN del worker + token.
  pair: publicProcedure
    .input(neuralPairRequestSchema)
    .output(neuralPairResultSchema)
    .mutation(({ ctx, input }) => ctx.services.neuralExport.pair(input)),

  // Coda degli export (per la UI).
  jobs: publicProcedure
    .output(z.array(neuralExportJobViewSchema))
    .query(({ ctx }) => ctx.services.neuralExport.listJobs()),

  cancel: publicProcedure
    .input(z.object({ jobId: z.string() }))
    .mutation(async ({ ctx, input }) => ({
      cancelled: await ctx.services.neuralExport.cancel(input.jobId),
    })),
});
