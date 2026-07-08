import { spawn } from 'node:child_process';
import type { NeuralWorkerCapabilities } from '@animeunion/shared';

/**
 * Feature-detect del runtime ffmpeg: presenza del filtro `libplacebo` e inizializzabilita' di un
 * device Vulkan. Degrada in modo pulito (`ffmpegCapable:false`) se ffmpeg e' assente/non eseguibile,
 * senza lanciare — cosi' il worker resta up e la feature si nasconde invece di crashare.
 */

const PROBE_TIMEOUT_MS = 15_000;

interface RunResult {
  spawnOk: boolean;
  code: number | null;
  stdout: string;
  stderr: string;
}

function run(bin: string, args: string[], timeoutMs = PROBE_TIMEOUT_MS): Promise<RunResult> {
  return new Promise<RunResult>((resolvePromise) => {
    let settled = false;
    let stdout = '';
    let stderr = '';
    const finish = (result: RunResult): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolvePromise(result);
    };

    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    } catch {
      finish({ spawnOk: false, code: null, stdout: '', stderr: '' });
      return;
    }

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      finish({ spawnOk: true, code: null, stdout, stderr });
    }, timeoutMs);
    timer.unref?.();

    child.stdout?.on('data', (chunk: Buffer) => {
      if (stdout.length < 200_000) {
        stdout += chunk.toString();
      }
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      if (stderr.length < 20_000) {
        stderr += chunk.toString();
      }
    });
    child.on('error', () => finish({ spawnOk: false, code: null, stdout, stderr }));
    child.on('close', (code) => finish({ spawnOk: true, code, stdout, stderr }));
  });
}

export async function probeCapabilities(
  ffmpegBin: string | null | undefined,
): Promise<NeuralWorkerCapabilities> {
  const incapable: NeuralWorkerCapabilities = {
    ffmpegCapable: false,
    hasLibplacebo: false,
    hasVulkan: false,
    fps: null,
  };
  if (!ffmpegBin) {
    return incapable;
  }

  const filters = await run(ffmpegBin, ['-hide_banner', '-filters']);
  if (!filters.spawnOk) {
    return incapable;
  }
  const hasLibplacebo = /(^|\s)libplacebo(\s|$)/m.test(filters.stdout);

  // Probe Vulkan: inizializza il device e usa libplacebo su una micro-clip lavfi. Exit 0 = ok.
  let hasVulkan = false;
  if (hasLibplacebo) {
    const vk = await run(ffmpegBin, [
      '-hide_banner',
      '-init_hw_device',
      'vulkan',
      '-f',
      'lavfi',
      '-i',
      'color=c=black:s=64x64:d=0.1',
      '-vf',
      'hwupload,libplacebo=w=128:h=128,hwdownload,format=yuv420p',
      '-f',
      'null',
      '-',
    ]);
    hasVulkan = vk.spawnOk && vk.code === 0;
  }

  return {
    ffmpegCapable: true,
    hasLibplacebo,
    hasVulkan,
    fps: null,
  };
}
