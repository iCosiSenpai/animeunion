import { spawn } from 'node:child_process';
import electron from 'electron';
import esbuild from 'esbuild';
import { createServer } from 'vite';

/**
 * Dev loop: builda main+preload (CJS), avvia il dev server Vite del renderer, poi lancia Electron con
 * VITE_DEV_SERVER_URL. Chiudendo Electron termina anche Vite. Pensato per la macchina Windows con GPU.
 */
const mainBuild = {
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  external: ['electron'],
  sourcemap: true,
};

await esbuild.build({
  ...mainBuild,
  entryPoints: ['src/main/main.ts'],
  outfile: 'dist/main/main.cjs',
});
await esbuild.build({
  ...mainBuild,
  entryPoints: ['src/main/preload.ts'],
  outfile: 'dist/main/preload.cjs',
});

const server = await createServer({ configFile: 'vite.config.ts' });
await server.listen();
const info = server.resolvedUrls?.local?.[0];
if (!info) {
  throw new Error('Dev server Vite senza URL locale');
}

const child = spawn(electron, ['.'], {
  stdio: 'inherit',
  env: { ...process.env, VITE_DEV_SERVER_URL: info },
});

child.on('close', async () => {
  await server.close();
  process.exit(0);
});
