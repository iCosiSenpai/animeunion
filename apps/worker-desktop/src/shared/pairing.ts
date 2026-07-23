/**
 * Helper puri per il pairing: normalizzazione dell'URL di AnimeUnion inserito dall'utente e
 * costruzione dell'URL LAN del worker. Nessun I/O: testabili in isolamento.
 */

/**
 * Normalizza l'indirizzo di AnimeUnion digitato dall'utente (lo stesso che apre nel browser):
 * aggiunge `http://` se manca lo schema, rimuove gli slash finali. Restituisce `null` se non è un
 * URL http(s) valido.
 */
export function normalizeBaseUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }
  // Se c'è già uno schema (qualsiasi), lo rispettiamo e accettiamo solo http(s); altrimenti http://.
  const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed);
  const withScheme = hasScheme ? trimmed : `http://${trimmed}`;
  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return null;
  }
  return `${parsed.origin}${parsed.pathname}`.replace(/\/+$/, '') || parsed.origin;
}

/** URL LAN del worker a partire da IP + porta. */
export function buildWorkerUrl(ip: string, port: number): string {
  return `http://${ip}:${port}`;
}
