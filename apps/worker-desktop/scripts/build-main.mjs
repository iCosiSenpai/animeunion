import esbuild from 'esbuild';

/**
 * Bundle del processo main e del preload in CJS (dist/main/*.cjs). Il worker (@animeunion/worker) e le
 * sue dipendenze pure (neural-core, shared, fastify, pino) vengono inclusi nel bundle; solo `electron`
 * resta esterno (fornito dal runtime).
 */
const shared = {
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  external: ['electron'],
  sourcemap: true,
  logLevel: 'info',
};

await esbuild.build({
  ...shared,
  entryPoints: ['src/main/main.ts'],
  outfile: 'dist/main/main.cjs',
});

await esbuild.build({
  ...shared,
  entryPoints: ['src/main/preload.ts'],
  outfile: 'dist/main/preload.cjs',
});
