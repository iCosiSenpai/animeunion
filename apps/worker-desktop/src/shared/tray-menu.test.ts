import { describe, expect, it } from 'vitest';
import type { DesktopStatus } from './status';
import { buildTrayTemplate, trayStatusLabel } from './tray-menu';

function status(over: Partial<DesktopStatus> = {}): DesktopStatus {
  return {
    overall: 'ready',
    headline: 'Pronto — in ascolto sulla porta 8787',
    worker: { state: 'running', port: 8787, host: '0.0.0.0', error: null },
    gpu: { ok: true, level: 'ok', title: 'Pronto', hint: null },
    canRender: true,
    ...over,
  };
}

describe('tray menu', () => {
  it('trayStatusLabel usa la headline', () => {
    expect(trayStatusLabel(status())).toBe('Pronto — in ascolto sulla porta 8787');
  });

  it('include voce di stato disabilitata, Apri, Riavvia ed Esci', () => {
    const items = buildTrayTemplate(status());
    const ids = items.map((i) => i.id);
    expect(ids).toEqual(['status', 'sep-1', 'open', 'restart', 'sep-2', 'quit']);
    expect(items.find((i) => i.id === 'status')?.enabled).toBe(false);
    expect(items.find((i) => i.id === 'quit')?.enabled).toBe(true);
  });

  it('disabilita Riavvia mentre il worker è in avvio', () => {
    const items = buildTrayTemplate(
      status({
        overall: 'starting',
        worker: { state: 'starting', port: null, host: null, error: null },
      }),
    );
    expect(items.find((i) => i.id === 'restart')?.enabled).toBe(false);
  });
});
