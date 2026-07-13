import { type PremiumFeature, type UserProfile, hasPremiumFeature } from '@animeunion/shared';
import { describe, expect, it } from 'vitest';

// Test della mappa entitlement `feature -> come si sblocca` in packages/shared (me.ts). La logica
// e' pura, la testiamo dal suite api come gli altri helper (isPremiumActive/hasNeuralExport).

function profile(over: Partial<UserProfile> = {}): UserProfile {
  return {
    id: 'u1',
    username: 'tester',
    email: 'a@b.it',
    avatarUrl: null,
    role: 'USER',
    createdAt: '2026-01-01T00:00:00.000Z',
    premium: null,
    features: {},
    ...over,
  };
}

const ALL: PremiumFeature[] = ['concurrentDownloads', 'neuralExport'];

describe('hasPremiumFeature', () => {
  it('premium attivo sblocca i download simultanei', () => {
    const p = profile({
      premium: { tier: 'MEGA_FAN', active: true, expiresAt: '2026-12-01T00:00:00.000Z' },
    });
    expect(hasPremiumFeature(p, 'concurrentDownloads')).toBe(true);
  });

  it('neural export dipende dal flag features, non dal solo premium', () => {
    const activeNoNeural = profile({
      premium: { tier: 'FAN', active: true, expiresAt: '2026-12-01T00:00:00.000Z' },
      features: { neuralExport: false },
    });
    expect(hasPremiumFeature(activeNoNeural, 'neuralExport')).toBe(false);

    const withNeural = profile({
      premium: { tier: 'ULTRA_FAN', active: true, expiresAt: '2026-12-01T00:00:00.000Z' },
      features: { neuralExport: true },
    });
    expect(hasPremiumFeature(withNeural, 'neuralExport')).toBe(true);
  });

  it('premium scaduto (active:false) non da diritti', () => {
    const lapsed = profile({
      premium: { tier: 'FAN', active: false, expiresAt: '2026-01-01T00:00:00.000Z' },
      features: { neuralExport: true },
    });
    expect(hasPremiumFeature(lapsed, 'concurrentDownloads')).toBe(false);
    // hasNeuralExport guarda solo il flag features, indipendente da active
    expect(hasPremiumFeature(lapsed, 'neuralExport')).toBe(true);
  });

  it('profilo null/undefined e fail-closed su ogni feature', () => {
    for (const f of ALL) {
      expect(hasPremiumFeature(null, f)).toBe(false);
      expect(hasPremiumFeature(undefined, f)).toBe(false);
    }
  });
});
