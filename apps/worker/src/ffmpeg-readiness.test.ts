import type { NeuralWorkerCapabilities } from '@animeunion/shared';
import { describe, expect, it, vi } from 'vitest';
import { describeReadiness, evaluateFfmpeg, resolveFfmpegPath } from './ffmpeg-readiness';

const caps = (over: Partial<NeuralWorkerCapabilities> = {}): NeuralWorkerCapabilities => ({
  ffmpegCapable: true,
  hasLibplacebo: true,
  hasVulkan: true,
  fps: null,
  ...over,
});

describe('resolveFfmpegPath', () => {
  it('l override esplicito vince sempre, anche se non esiste', () => {
    const path = resolveFfmpegPath({
      override: 'C:/custom/ffmpeg.exe',
      candidates: ['C:/bundled/ffmpeg.exe'],
      exists: () => true,
    });
    expect(path).toBe('C:/custom/ffmpeg.exe');
  });

  it('sceglie il primo candidato esistente', () => {
    const path = resolveFfmpegPath({
      candidates: ['C:/a/ffmpeg.exe', 'C:/b/ffmpeg.exe'],
      exists: (p) => p === 'C:/b/ffmpeg.exe',
    });
    expect(path).toBe('C:/b/ffmpeg.exe');
  });

  it('usa il fallback quando nessun candidato esiste', () => {
    const path = resolveFfmpegPath({
      candidates: ['C:/a/ffmpeg.exe'],
      exists: () => false,
    });
    expect(path).toBe('ffmpeg');
  });

  it('ignora un override vuoto o solo spazi', () => {
    const path = resolveFfmpegPath({ override: '   ', candidates: [], exists: () => false });
    expect(path).toBe('ffmpeg');
  });
});

describe('describeReadiness', () => {
  it('ffmpeg assente → error, causa radice ffmpeg', () => {
    const r = describeReadiness(
      caps({ ffmpegCapable: false, hasLibplacebo: false, hasVulkan: false }),
    );
    expect(r.ok).toBe(false);
    expect(r.level).toBe('error');
    expect(r.title).toContain('ffmpeg');
    expect(r.hint).toBeTruthy();
  });

  it('ffmpeg senza libplacebo → error che cita libplacebo', () => {
    const r = describeReadiness(caps({ hasLibplacebo: false, hasVulkan: false }));
    expect(r.ok).toBe(false);
    expect(r.title).toContain('libplacebo');
  });

  it('libplacebo ok ma niente Vulkan → error che cita Vulkan', () => {
    const r = describeReadiness(caps({ hasVulkan: false }));
    expect(r.ok).toBe(false);
    expect(r.title).toContain('Vulkan');
  });

  it('tutto presente → ok senza hint', () => {
    const r = describeReadiness(caps());
    expect(r.ok).toBe(true);
    expect(r.level).toBe('ok');
    expect(r.hint).toBeNull();
  });
});

describe('evaluateFfmpeg', () => {
  it('esegue il probe iniettato e mappa la readiness', async () => {
    const probe = vi.fn(async () => caps({ hasVulkan: false }));
    const result = await evaluateFfmpeg('ffmpeg', probe);
    expect(probe).toHaveBeenCalledWith('ffmpeg');
    expect(result.capabilities.hasVulkan).toBe(false);
    expect(result.readiness.ok).toBe(false);
    expect(result.readiness.title).toContain('Vulkan');
  });
});
