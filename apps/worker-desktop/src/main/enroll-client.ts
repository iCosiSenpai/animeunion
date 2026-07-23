import type { AppRouter } from '@animeunion/api/app-router';
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import type { EnrollOutcome } from '../shared/ipc';
import { normalizeBaseUrl } from '../shared/pairing';

/**
 * Chiama la mutation tRPC `neuralExport.enroll` sul NAS, sullo stesso endpoint `/trpc` che usa il
 * browser (relativo all'origine di AnimeUnion). Girando nel processo main (Node), non ci sono
 * vincoli CORS. `enroll` è una publicProcedure: non serve un token di sessione (salvo blocco UI).
 */
export async function callEnroll(
  animeunionUrl: string,
  workerUrl: string,
  token: string,
  name: string,
): Promise<EnrollOutcome> {
  const base = normalizeBaseUrl(animeunionUrl);
  if (!base) {
    return {
      ok: false,
      reachable: false,
      ffmpegCapable: false,
      message: 'Indirizzo di AnimeUnion non valido',
    };
  }
  const client = createTRPCClient<AppRouter>({
    links: [httpBatchLink({ url: `${base}/trpc` })],
  });
  try {
    const res = await client.neuralExport.enroll.mutate({ workerUrl, token, name });
    return {
      ok: res.enrolled,
      reachable: res.reachable,
      ffmpegCapable: res.ffmpegCapable,
      message: null,
    };
  } catch (error) {
    return {
      ok: false,
      reachable: false,
      ffmpegCapable: false,
      message: error instanceof Error ? error.message : 'Collegamento fallito',
    };
  }
}
