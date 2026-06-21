// Token di sessione del blocco web UI, salvato in localStorage e inviato come header
// x-app-session su ogni richiesta tRPC.
const KEY = 'app_session';

export function getSessionToken(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function setSessionToken(token: string): void {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    localStorage.setItem(KEY, token);
  } catch {
    // storage non disponibile: si resterà sbloccati solo per la sessione corrente
  }
}

export function clearSessionToken(): void {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignora
  }
}
