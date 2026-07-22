import { describe, expect, it } from 'vitest';
import { buildWorkerUrl, normalizeBaseUrl } from './pairing';

describe('normalizeBaseUrl', () => {
  it('aggiunge http:// se manca lo schema', () => {
    expect(normalizeBaseUrl('nas:7979')).toBe('http://nas:7979');
    expect(normalizeBaseUrl('192.168.1.10:7979')).toBe('http://192.168.1.10:7979');
  });

  it('rimuove gli slash finali', () => {
    expect(normalizeBaseUrl('http://nas:7979/')).toBe('http://nas:7979');
    expect(normalizeBaseUrl('http://nas:7979///')).toBe('http://nas:7979');
  });

  it('conserva https e un eventuale path', () => {
    expect(normalizeBaseUrl('https://animeunion.example/app/')).toBe(
      'https://animeunion.example/app',
    );
  });

  it('restituisce null su input vuoto o non valido', () => {
    expect(normalizeBaseUrl('   ')).toBeNull();
    expect(normalizeBaseUrl('ftp://nas')).toBeNull();
    expect(normalizeBaseUrl('http://')).toBeNull();
  });
});

describe('buildWorkerUrl', () => {
  it('compone http://ip:porta', () => {
    expect(buildWorkerUrl('192.168.1.20', 8787)).toBe('http://192.168.1.20:8787');
  });
});
