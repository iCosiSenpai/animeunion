import type { AppRouter } from '@animeunion/api/app-router';
import { createTRPCClient, httpLink } from '@trpc/client';

/**
 * Scansione best-effort della sottorete /24 dell'IP LAN per trovare il NAS AnimeUnion, sondando
 * `/trpc/health.identify` (openProcedure, nessuna auth). Gira nel processo main (Node): niente
 * vincoli CORS. Ritorna gli URL base trovati. Se non trova nulla (porta insolita o subnet diversa),
 * l'utente inserisce l'indirizzo a mano — lo scan è un aiuto, non l'unico modo.
 */

const CONCURRENCY = 48;
const PROBE_TIMEOUT_MS = 700;

export async function discoverNasUrls(lanIp: string, ports: number[]): Promise<string[]> {
  const prefix = lanIp.replace(/\.\d+$/, '');
  if (prefix === lanIp || ports.length === 0) {
    return []; // non è un IPv4 su cui possiamo dedurre la /24
  }

  const targets: string[] = [];
  for (let host = 1; host <= 254; host++) {
    const ip = `${prefix}.${host}`;
    if (ip === lanIp) {
      continue;
    }
    for (const port of ports) {
      targets.push(`http://${ip}:${port}`);
    }
  }

  const found = new Set<string>();
  let cursor = 0;
  const runner = async (): Promise<void> => {
    while (cursor < targets.length) {
      const url = targets[cursor++];
      if (url && (await isAnimeUnion(url))) {
        found.add(url);
      }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, () => runner()));
  return [...found];
}

async function isAnimeUnion(base: string): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const client = createTRPCClient<AppRouter>({
      links: [
        httpLink({
          url: `${base}/trpc`,
          fetch: (input, init) => fetch(input, { ...init, signal: controller.signal }),
        }),
      ],
    });
    const res = await client.health.identify.query();
    return res?.app === 'animeunion';
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
