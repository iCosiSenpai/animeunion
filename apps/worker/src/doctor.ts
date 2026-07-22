import { evaluateFfmpeg, resolveFfmpegPath } from './ffmpeg-readiness';

/**
 * Diagnostica ffmpeg del worker: risolve il binario (override `WORKER_FFMPEG_PATH` o PATH) e stampa
 * la readiness. Non richiede il token (a differenza dell'avvio del server): serve a capire in fretta
 * se il PC è pronto per il render. Exit 0 se pronto, 1 altrimenti.
 */
async function main(): Promise<void> {
  const ffmpegBin = resolveFfmpegPath({ override: process.env.WORKER_FFMPEG_PATH });
  const { capabilities, readiness } = await evaluateFfmpeg(ffmpegBin);

  console.log(`ffmpeg:        ${ffmpegBin}`);
  console.log(`ffmpegCapable: ${capabilities.ffmpegCapable}`);
  console.log(`libplacebo:    ${capabilities.hasLibplacebo}`);
  console.log(`vulkan:        ${capabilities.hasVulkan}`);
  console.log(`readiness:     [${readiness.level}] ${readiness.title}`);
  if (readiness.hint) {
    console.log(`hint:          ${readiness.hint}`);
  }

  process.exitCode = readiness.ok ? 0 : 1;
}

main().catch((error) => {
  console.error('Doctor fallito:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
