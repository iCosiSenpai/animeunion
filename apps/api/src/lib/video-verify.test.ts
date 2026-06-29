import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ffmpegPath from 'ffmpeg-static';
import { describe, expect, it } from 'vitest';
import { verifyVideoFile } from './video-verify';

const hasFfmpeg = Boolean(ffmpegPath);

describe('verifyVideoFile', () => {
  it('salta (ok) se ffmpeg non è disponibile', async () => {
    const res = await verifyVideoFile('qualunque.mp4', { ffmpegBin: null });
    expect(res.ok).toBe(true);
    expect(res.skipped).toBe(true);
  });

  it.runIf(hasFfmpeg)('un mp4 valido passa la verifica', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'au-vv-'));
    const valid = join(dir, 'valid.mp4');
    try {
      // Genera un mp4 valido di 1s con lo stesso binario ffmpeg (sorgente sintetica lavfi).
      const gen = spawnSync(ffmpegPath as string, [
        '-v',
        'error',
        '-f',
        'lavfi',
        '-i',
        'testsrc=duration=1:size=160x120:rate=12',
        '-pix_fmt',
        'yuv420p',
        valid,
      ]);
      expect(gen.status).toBe(0);

      const res = await verifyVideoFile(valid);
      expect(res.ok).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it.runIf(hasFfmpeg)('un file non-video fallisce la verifica', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'au-vv-'));
    const bad = join(dir, 'bad.mp4');
    try {
      writeFileSync(bad, 'questo non e un video, solo testo\n'.repeat(50));
      const res = await verifyVideoFile(bad);
      expect(res.ok).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
