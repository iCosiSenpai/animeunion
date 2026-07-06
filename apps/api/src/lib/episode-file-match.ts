import { existsSync, readdirSync } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';

const VIDEO_EXT = new Set(['.mp4', '.mkv']);

/**
 * Elenca i file video nella cartella del path canonico che rappresentano lo STESSO episodio
 * (stessa stagione + numero), anche con naming diverso da quello dell'app: `S01E05.mp4`, `01.mp4`,
 * `E01.mp4`, `Nome Ep. 5.mp4`. Il file canonico (se esiste) e' sempre in testa. Per i film (path
 * senza SxxExx) NON si fa match loose (evita falsi positivi). Se il canonico ha un tag lingua
 * (SUB/DUB condividono la root) si accettano solo candidati con lo stesso tag, mai i nomi grezzi
 * (ambigui sulla lingua). Usato sia dal self-healing anti-duplicati (download-service) sia dallo
 * scanner duplicati (file-manager-service).
 */
export function listEpisodeFilesInDir(canonicalPath: string): string[] {
  const dir = dirname(canonicalPath);
  const canonBase = basename(canonicalPath);
  const canonExists = existsSync(canonicalPath);
  const found: string[] = canonExists ? [canonicalPath] : [];
  const se = canonBase.match(/S(\d{1,3})E(\d{1,4})/i);
  if (!se) {
    return found;
  }
  const season = Number(se[1]);
  const ep = Number(se[2]);
  const requiredTag = canonBase.match(/ - (?:SUB|DUB) ITA/i)?.[0]?.toUpperCase() ?? null;
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return found;
  }
  for (const name of entries) {
    if (!VIDEO_EXT.has(extname(name).toLowerCase())) {
      continue;
    }
    if (canonExists && name === canonBase) {
      continue; // gia' incluso in testa
    }
    if (requiredTag && !name.toUpperCase().includes(requiredTag)) {
      continue;
    }
    const cand = name.match(/S(\d{1,3})E(\d{1,4})/i);
    if (cand) {
      if (Number(cand[1]) === season && Number(cand[2]) === ep) {
        found.push(join(dir, name));
      }
      continue;
    }
    // Con tag richiesto non ci si fida dei nomi legacy senza SxxExx (ambigui sulla lingua).
    if (requiredTag) {
      continue;
    }
    // Naming legacy senza SxxExx: numero episodio grezzo. La stagione e' implicita nella cartella.
    const alt =
      name.match(/(?:^|[^A-Za-z0-9])(?:E|Ep\.?)\s*(\d{1,3})(?:\D|$)/i) ??
      name.match(/^(\d{1,3})\.[^.]+$/);
    if (alt && Number(alt[1]) === ep) {
      found.push(join(dir, name));
    }
  }
  return found;
}

/**
 * Trova un file video gia' presente che rappresenta lo STESSO episodio del path canonico (il
 * canonico se esiste, altrimenti il primo match legacy), o null. Non ri-scaricare (→ duplicare) una
 * libreria pre-esistente importata con naming diverso.
 */
export function findExistingEpisodeFile(canonicalPath: string): string | null {
  return listEpisodeFilesInDir(canonicalPath)[0] ?? null;
}
