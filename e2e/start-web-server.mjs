import { cp, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const appRoot = path.resolve('apps/web');
const serverRoot = path.join(appRoot, '.next', 'standalone', 'apps', 'web');
const serverFile = path.join(serverRoot, 'server.js');

await cp(path.join(appRoot, 'public'), path.join(serverRoot, 'public'), {
  force: true,
  recursive: true,
});
await mkdir(path.join(serverRoot, '.next'), { recursive: true });
await cp(path.join(appRoot, '.next', 'static'), path.join(serverRoot, '.next', 'static'), {
  force: true,
  recursive: true,
});

process.env.HOSTNAME = process.env.E2E_WEB_HOST ?? '127.0.0.1';
process.env.PORT = process.env.E2E_WEB_PORT ?? '3000';
process.chdir(serverRoot);
await import(pathToFileURL(serverFile).href);
