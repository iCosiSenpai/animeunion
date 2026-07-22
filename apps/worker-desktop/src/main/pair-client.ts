import type { AppRouter } from '@animeunion/api/app-router';
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import { normalizeBaseUrl } from '../shared/pairing';
import type { PairOutcome } from '../shared/pairing';

/**
 * Chiama la mutation tRPC `neuralExport.pair` sul NAS, sullo stesso endpoint `/trpc` che usa il
 * browser (relativo all'origine di AnimeUnion). Girando nel processo main (Node), non ci sono
 * vincoli CORS. `pair` è una publicProcedure: non serve un token di sessione.
 */
export async function callPair(
  animeunionUrl: string,
  workerUrl: string,
  token: string,
  code: string,
): Promise<PairOutcome> {
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
    const res = await client.neuralExport.pair.mutate({ code, workerUrl, token });
    return {
      ok: res.paired,
      reachable: res.reachable,
      ffmpegCapable: res.ffmpegCapable,
      message: null,
    };
  } catch (error) {
    return {
      ok: false,
      reachable: false,
      ffmpegCapable: false,
      message: error instanceof Error ? error.message : 'Abbinamento fallito',
    };
  }
}
