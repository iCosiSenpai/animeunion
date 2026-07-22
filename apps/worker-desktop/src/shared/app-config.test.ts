import { describe, expect, it } from 'vitest';
import { createDefaultConfig, generateToken } from './app-config';

describe('app-config', () => {
  it('generateToken produce hex della lunghezza attesa', () => {
    expect(generateToken(32)).toMatch(/^[0-9a-f]{64}$/);
    expect(generateToken(16)).toMatch(/^[0-9a-f]{32}$/);
  });

  it('generateToken è casuale', () => {
    expect(generateToken()).not.toBe(generateToken());
  });

  it('createDefaultConfig ha default sensati e token fresco', () => {
    const cfg = createDefaultConfig();
    expect(cfg.port).toBe(8787);
    expect(cfg.host).toBe('0.0.0.0');
    expect(cfg.animeunionUrl).toBe('');
    expect(cfg.autostart).toBe(true);
    expect(cfg.workerToken).toMatch(/^[0-9a-f]{64}$/);
  });

  it('createDefaultConfig applica gli override (config persistita)', () => {
    const cfg = createDefaultConfig({
      workerToken: 'fisso',
      animeunionUrl: 'http://nas:7979',
      autostart: false,
    });
    expect(cfg.workerToken).toBe('fisso');
    expect(cfg.animeunionUrl).toBe('http://nas:7979');
    expect(cfg.autostart).toBe(false);
    expect(cfg.port).toBe(8787);
  });
});
