import { describe, expect, it } from 'vitest';
import { type GpuReadiness, type WorkerRuntimeStatus, deriveDesktopStatus } from './status';

const running: WorkerRuntimeStatus = { state: 'running', port: 8787, host: '0.0.0.0', error: null };
const gpuOk: GpuReadiness = { ok: true, level: 'ok', title: 'Pronto', hint: null };
const gpuBad: GpuReadiness = {
  ok: false,
  level: 'error',
  title: 'GPU Vulkan non disponibile',
  hint: 'Aggiorna i driver',
};

describe('deriveDesktopStatus', () => {
  it('worker in errore → overall error con messaggio', () => {
    const s = deriveDesktopStatus(
      { state: 'error', port: null, host: null, error: 'EADDRINUSE' },
      null,
    );
    expect(s.overall).toBe('error');
    expect(s.headline).toContain('EADDRINUSE');
    expect(s.canRender).toBe(false);
  });

  it('worker in avvio → starting', () => {
    const s = deriveDesktopStatus({ state: 'starting', port: null, host: null, error: null }, null);
    expect(s.overall).toBe('starting');
    expect(s.canRender).toBe(false);
  });

  it('worker fermo → stopped', () => {
    const s = deriveDesktopStatus({ state: 'stopped', port: null, host: null, error: null }, gpuOk);
    expect(s.overall).toBe('stopped');
    expect(s.canRender).toBe(false);
  });

  it('worker su ma probe GPU non ancora fatto → starting (in verifica)', () => {
    const s = deriveDesktopStatus(running, null);
    expect(s.overall).toBe('starting');
    expect(s.headline).toContain('Controllo');
    expect(s.canRender).toBe(false);
  });

  it('worker su ma GPU non pronta → blocked col titolo del problema', () => {
    const s = deriveDesktopStatus(running, gpuBad);
    expect(s.overall).toBe('blocked');
    expect(s.headline).toBe('GPU Vulkan non disponibile');
    expect(s.canRender).toBe(false);
  });

  it('worker su e GPU pronta → ready con porta, canRender true', () => {
    const s = deriveDesktopStatus(running, gpuOk);
    expect(s.overall).toBe('ready');
    expect(s.headline).toContain('8787');
    expect(s.canRender).toBe(true);
  });
});
