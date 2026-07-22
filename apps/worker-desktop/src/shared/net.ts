/**
 * Rilevamento dell'IP LAN del PC, per proporre automaticamente l'URL del worker durante il pairing
 * (il NAS deve raggiungere il worker su quell'indirizzo). Logica pura: riceve l'output di
 * `os.networkInterfaces()` così è testabile senza toccare la rete.
 */
export interface NetInterfaceAddress {
  address: string;
  /** Node espone `family` come stringa ('IPv4'/'IPv6') o numero (4/6) a seconda della versione. */
  family: string | number;
  internal: boolean;
}

function isIPv4(family: string | number): boolean {
  return family === 'IPv4' || family === 4;
}

function isPrivate(ip: string): boolean {
  return /^192\.168\./.test(ip) || /^10\./.test(ip) || /^172\.(1[6-9]|2\d|3[01])\./.test(ip);
}

/**
 * Sceglie l'IPv4 LAN più probabile: scarta loopback/interne e IPv6, preferisce i range privati
 * comuni (192.168/10/172.16-31). Restituisce `null` se non c'è alcun IPv4 esterno.
 */
export function detectLanIp(
  interfaces: Record<string, NetInterfaceAddress[] | undefined>,
): string | null {
  const candidates: string[] = [];
  for (const addresses of Object.values(interfaces)) {
    for (const addr of addresses ?? []) {
      if (!addr.internal && isIPv4(addr.family)) {
        candidates.push(addr.address);
      }
    }
  }
  return candidates.find(isPrivate) ?? candidates[0] ?? null;
}
