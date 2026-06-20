import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Versione dell'app letta una sola volta da apps/api/package.json (fallback 'dev'). */
export const APP_VERSION: string = (() => {
  try {
    const pkgPath = resolve(dirname(fileURLToPath(import.meta.url)), '../../package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { version?: string };
    return pkg.version ?? 'dev';
  } catch {
    return 'dev';
  }
})();
