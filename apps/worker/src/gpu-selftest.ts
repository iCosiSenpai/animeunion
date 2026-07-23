import { spawn } from 'node:child_process';

/**
 * Test GPU "vero" per il pulsante nella GUI: inizializza un device Vulkan ed esegue un upscale
 * libplacebo su una micro-clip lavfi (stessa pipeline del render reale, senza shader custom). Exit 0
 * significa che Vulkan+libplacebo girano davvero su questo hardware — più forte del semplice
 * feature-detect di `probeCapabilities`. Ritorna timing e coda stderr per diagnosticare i fallimenti.
 */

const SELFTEST_TIMEOUT_MS = 30_000;

export interface GpuSelfTestResult {
  ok: boolean;
  /** Durata del test in millisecondi. */
  durationMs: number;
  /** Messaggio pronto per la UI. */
  message: string;
  /** Coda dello stderr di ffmpeg (utile a capire perché è fallito). Vuoto se ok. */
  logTail: string;
}

export function runGpuSelfTest(ffmpegBin: string): Promise<GpuSelfTestResult> {
  // Sorgente sintetica → upload su GPU → upscale libplacebo 320x180 ⇒ 1280x720 → download.
  const args = [
    '-hide_banner',
    '-init_hw_device',
    'vulkan',
    '-f',
    'lavfi',
    '-i',
    'testsrc2=size=320x180:rate=5:duration=1',
    '-vf',
    'format=yuv420p,hwupload,libplacebo=w=1280:h=720,hwdownload,format=yuv420p',
    '-frames:v',
    '5',
    '-f',
    'null',
    '-',
  ];
  const start = Date.now();

  return new Promise<GpuSelfTestResult>((resolvePromise) => {
    let settled = false;
    let stderr = '';
    const finish = (result: GpuSelfTestResult): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolvePromise(result);
    };

    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(ffmpegBin, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    } catch {
      finish({
        ok: false,
        durationMs: Date.now() - start,
        message: 'ffmpeg non eseguibile',
        logTail: '',
      });
      return;
    }

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      finish({
        ok: false,
        durationMs: Date.now() - start,
        message: 'Timeout del test GPU (30s)',
        logTail: stderr.slice(-1500),
      });
    }, SELFTEST_TIMEOUT_MS);
    timer.unref?.();

    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
      if (stderr.length > 20_000) {
        stderr = stderr.slice(-20_000);
      }
    });
    child.on('error', () =>
      finish({
        ok: false,
        durationMs: Date.now() - start,
        message: 'ffmpeg non eseguibile',
        logTail: stderr.slice(-1500),
      }),
    );
    child.on('close', (code) => {
      const durationMs = Date.now() - start;
      if (code === 0) {
        finish({
          ok: true,
          durationMs,
          message: `GPU pronta — upscale Vulkan+libplacebo eseguito in ${(durationMs / 1000).toFixed(1)}s`,
          logTail: '',
        });
      } else {
        finish({
          ok: false,
          durationMs,
          message: `Test GPU fallito (ffmpeg exit ${code ?? 'sconosciuto'})`,
          logTail: stderr.slice(-1500),
        });
      }
    });
  });
}
