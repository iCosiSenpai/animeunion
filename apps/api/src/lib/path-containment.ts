import { realpath } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';

/** Path canonico di un elemento esistente; null se non è possibile dimostrarne la destinazione. */
export async function canonicalPath(path: string): Promise<string | null> {
  return realpath(resolve(path)).catch(() => null);
}

/** Containment a confine di segmento, valido anche quando root e candidate coincidono. */
export function pathIsInside(root: string, candidate: string): boolean {
  const rel = relative(root, candidate);
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

/**
 * Restituisce la root configurata che contiene un target esistente sia nel namespace logico sia in
 * quello fisico. La doppia verifica impedisce di operare su alias esterni che puntano dentro la root
 * e su symlink/junction interni che puntano fuori. Se target o root non sono canonicalizzabili, il
 * controllo fallisce chiuso.
 */
export async function canonicalRootFor(
  target: string,
  configuredRoots: readonly string[],
): Promise<string | null> {
  const absoluteTarget = resolve(target);
  const canonicalTarget = await canonicalPath(absoluteTarget);
  if (!canonicalTarget) {
    return null;
  }

  for (const configuredRoot of configuredRoots) {
    if (!configuredRoot) {
      continue;
    }
    const absoluteRoot = resolve(configuredRoot);
    if (!pathIsInside(absoluteRoot, absoluteTarget)) {
      continue;
    }
    const canonicalRoot = await canonicalPath(absoluteRoot);
    if (canonicalRoot && pathIsInside(canonicalRoot, canonicalTarget)) {
      return absoluteRoot;
    }
  }
  return null;
}
