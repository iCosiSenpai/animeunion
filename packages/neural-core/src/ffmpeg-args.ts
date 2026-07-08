import type { NeuralExportProfile } from '@animeunion/shared';

/**
 * Costruzione degli argomenti ffmpeg per l'upscale Anime4K via libplacebo. Funzione PURA: non esegue
 * nulla, quindi e' unit-testabile senza GPU. Ricetta allineata a INTEGRATION_NEURAL_EXPORT.md:
 *   ffmpeg -init_hw_device vulkan -i in.mp4 \
 *     -vf "hwupload,libplacebo=w=W:h=H:custom_shader_path=chain.glsl,hwdownload,format=yuv420p" \
 *     -c:v <codec> -b:v <bitrate> -c:a copy -movflags +faststart out.mp4
 * L'audio non si ri-encoda mai (`-c:a copy`); `+faststart` obbligatorio.
 */

export interface FfmpegArgsInput {
  profile: NeuralExportProfile;
  inputPath: string;
  outputPath: string;
  /**
   * Path del file catena `.glsl`. Consigliato passare un basename e impostare la cwd di ffmpeg alla
   * work dir: evita l'escaping di path Windows (drive `C:` e backslash) dentro il filtergraph.
   */
  shaderChainPath: string;
}

/**
 * Nel filtergraph ffmpeg `:` separa le opzioni e `\` e' un carattere di escape: un path Windows
 * (`C:\...`) va normalizzato. Backslash -> slash (ffmpeg li accetta su Windows), poi `:` -> `\:`.
 */
export function escapeFilterPath(path: string): string {
  return path.replace(/\\/g, '/').replace(/:/g, '\\:');
}

export function buildFfmpegArgs(input: FfmpegArgsInput): string[] {
  const { profile, inputPath, outputPath, shaderChainPath } = input;
  const filter = [
    'hwupload',
    `libplacebo=w=${profile.targetWidth}:h=${profile.targetHeight}:custom_shader_path=${escapeFilterPath(shaderChainPath)}`,
    'hwdownload',
    'format=yuv420p',
  ].join(',');

  const args = [
    '-hide_banner',
    '-y',
    '-init_hw_device',
    'vulkan',
    '-i',
    inputPath,
    '-vf',
    filter,
    '-c:v',
    profile.videoCodec,
    '-b:v',
    profile.videoBitrate,
    '-c:a',
    'copy',
  ];
  if (profile.faststart) {
    args.push('-movflags', '+faststart');
  }
  args.push(outputPath);
  return args;
}
