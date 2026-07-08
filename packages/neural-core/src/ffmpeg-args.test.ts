import type { NeuralExportProfile } from '@animeunion/shared';
import { describe, expect, it } from 'vitest';
import { buildFfmpegArgs, escapeFilterPath } from './ffmpeg-args';

const xq: NeuralExportProfile = {
  id: 'xq',
  chain: ['a.glsl', 'b.glsl'],
  targetWidth: 1920,
  targetHeight: 1080,
  videoBitrate: '10M',
  videoCodec: 'libx264',
  audio: 'copy',
  faststart: true,
};

const xqplus: NeuralExportProfile = {
  ...xq,
  id: 'xqplus',
  targetWidth: 3840,
  targetHeight: 2160,
  videoBitrate: '35M',
};

describe('buildFfmpegArgs', () => {
  it('XQ: 1920x1080, bitrate 10M, audio copy, faststart', () => {
    const args = buildFfmpegArgs({
      profile: xq,
      inputPath: 'in.mp4',
      outputPath: 'out.mp4',
      shaderChainPath: 'chain.glsl',
    });
    const joined = args.join(' ');
    expect(joined).toContain('-init_hw_device vulkan');
    expect(joined).toContain('libplacebo=w=1920:h=1080:custom_shader_path=chain.glsl');
    expect(joined).toContain('hwupload');
    expect(joined).toContain('hwdownload');
    expect(args).toContain('-c:a');
    // -c:a copy
    expect(args[args.indexOf('-c:a') + 1]).toBe('copy');
    expect(args[args.indexOf('-b:v') + 1]).toBe('10M');
    expect(joined).toContain('-movflags +faststart');
    expect(args[args.length - 1]).toBe('out.mp4');
  });

  it('XQ+: 3840x2160, bitrate 35M', () => {
    const args = buildFfmpegArgs({
      profile: xqplus,
      inputPath: 'in.mp4',
      outputPath: 'out.mp4',
      shaderChainPath: 'chain.glsl',
    });
    const joined = args.join(' ');
    expect(joined).toContain('w=3840:h=2160');
    expect(args[args.indexOf('-b:v') + 1]).toBe('35M');
  });

  it('omette +faststart se faststart=false', () => {
    const args = buildFfmpegArgs({
      profile: { ...xq, faststart: false },
      inputPath: 'in.mp4',
      outputPath: 'out.mp4',
      shaderChainPath: 'chain.glsl',
    });
    expect(args.join(' ')).not.toContain('+faststart');
  });

  it('rispetta il videoCodec del profilo (fedelta al sito)', () => {
    const args = buildFfmpegArgs({
      profile: { ...xq, videoCodec: 'hevc_nvenc' },
      inputPath: 'in.mp4',
      outputPath: 'out.mp4',
      shaderChainPath: 'chain.glsl',
    });
    expect(args[args.indexOf('-c:v') + 1]).toBe('hevc_nvenc');
  });
});

describe('escapeFilterPath', () => {
  it('normalizza backslash Windows e protegge il colon del drive', () => {
    expect(escapeFilterPath('C:\\Users\\me\\chain.glsl')).toBe('C\\:/Users/me/chain.glsl');
  });
  it('lascia intatto un basename semplice', () => {
    expect(escapeFilterPath('chain.glsl')).toBe('chain.glsl');
  });
});
