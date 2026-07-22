import { describe, expect, it } from 'vitest';
import { detectLanIp } from './net';

describe('detectLanIp', () => {
  it('scarta loopback e IPv6, preferisce un IPv4 privato', () => {
    const ip = detectLanIp({
      lo: [{ address: '127.0.0.1', family: 'IPv4', internal: true }],
      eth0: [
        { address: '::1', family: 'IPv6', internal: false },
        { address: '192.168.1.20', family: 'IPv4', internal: false },
      ],
    });
    expect(ip).toBe('192.168.1.20');
  });

  it('preferisce il range privato rispetto a un IPv4 pubblico', () => {
    const ip = detectLanIp({
      pub: [{ address: '8.8.8.8', family: 4, internal: false }],
      lan: [{ address: '10.0.0.5', family: 4, internal: false }],
    });
    expect(ip).toBe('10.0.0.5');
  });

  it('ricade sul primo IPv4 esterno se nessuno è privato', () => {
    const ip = detectLanIp({
      wan: [{ address: '203.0.113.7', family: 'IPv4', internal: false }],
    });
    expect(ip).toBe('203.0.113.7');
  });

  it('restituisce null senza IPv4 esterni', () => {
    const ip = detectLanIp({
      lo: [{ address: '127.0.0.1', family: 'IPv4', internal: true }],
      v6: [{ address: 'fe80::1', family: 'IPv6', internal: false }],
    });
    expect(ip).toBeNull();
  });
});
