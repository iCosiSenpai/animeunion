// Prepara il collaudo "nuovo utente": (1) crea .env.newuser da .env.newuser.example se manca,
// (2) svuota il DB isolato (apps/api/data/newuser) così l'app riparte pulita. Dependency-free.
import { copyFileSync, existsSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const envFile = join(root, '.env.newuser');
const envExample = join(root, '.env.newuser.example');
// Deve combaciare con DATABASE_PATH in .env.newuser.example (relativo a apps/api).
const newuserDataDir = join(root, 'apps', 'api', 'data', 'newuser');

if (!existsSync(envFile)) {
  if (!existsSync(envExample)) {
    console.error('Manca .env.newuser.example: impossibile creare .env.newuser.');
    process.exit(1);
  }
  copyFileSync(envExample, envFile);
  console.log('Creato .env.newuser da .env.newuser.example.');
} else {
  console.log('.env.newuser già presente: lo lascio invariato.');
}

if (existsSync(newuserDataDir)) {
  rmSync(newuserDataDir, { recursive: true, force: true });
  console.log('DB "nuovo utente" azzerato (apps/api/data/newuser rimossa).');
} else {
  console.log('Nessun DB "nuovo utente" da azzerare: già pulito.');
}

console.log('Pronto. Avvia con: npm run dev:newuser');
