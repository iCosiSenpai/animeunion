import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const ALGO = 'aes-256-gcm';
const PREFIX = 'aes256gcm:';

/** Deriva una chiave a 32 byte (AES-256) dalla stringa grezza via SHA-256. */
function deriveKey(raw: string): Buffer {
  return createHash('sha256').update(raw, 'utf8').digest();
}

/**
 * Cifra una stringa con AES-256-GCM.
 * Formato output: `aes256gcm:<iv_b64>:<ciphertext_b64>:<authtag_b64>`
 * Il prefisso permette di distinguere valori cifrati da plaintext legacy.
 */
export function encryptPassword(plain: string, key: string): string {
  const iv = randomBytes(12);
  const derived = deriveKey(key);
  const cipher = createCipheriv(ALGO, derived, iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString('base64')}:${ct.toString('base64')}:${tag.toString('base64')}`;
}

/**
 * Decifra una stringa cifrata con `encryptPassword`.
 * Se il valore non ha il prefisso `aes256gcm:`, lo restituisce invariato:
 * permette la migrazione trasparente da password in chiaro (backward compat).
 */
export function decryptPassword(stored: string, key: string): string {
  if (!stored.startsWith(PREFIX)) {
    return stored;
  }
  const parts = stored.split(':');
  // parts: ['aes256gcm', iv_b64, ct_b64, tag_b64]
  const ivB64 = parts[1];
  const ctB64 = parts[2];
  const tagB64 = parts[3];
  if (!ivB64 || !ctB64 || !tagB64) {
    throw new Error('Valore cifrato malformato: segmenti mancanti');
  }
  const iv = Buffer.from(ivB64, 'base64');
  const ct = Buffer.from(ctB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const derived = deriveKey(key);
  const decipher = createDecipheriv(ALGO, derived, iv);
  decipher.setAuthTag(tag);
  return decipher.update(ct).toString('utf8') + decipher.final('utf8');
}
