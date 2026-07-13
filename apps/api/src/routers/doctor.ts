import { doctorStateSchema } from '@animeunion/shared';
import { publicProcedure, router } from '../trpc';

export const doctorRouter = router({
  /** Snapshot dello stato monitorato (non riesegue i controlli: è economico). */
  state: publicProcedure.output(doctorStateSchema).query(({ ctx }) => {
    return ctx.services.doctor.getState();
  }),
  /** Forza subito una nuova esecuzione dei controlli (usato dal pulsante "Aggiorna"). */
  run: publicProcedure.output(doctorStateSchema).mutation(({ ctx }) => {
    return ctx.services.doctor.runChecks();
  }),
});
