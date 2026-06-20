// Helper per aprire issue GitHub precompilate (segnalazione OPT-IN: nessun invio automatico).
// Usato dalla schermata d'errore e dal link "Feedback/bug app" nel footer.

export const GITHUB_REPO = 'https://github.com/iCosiSenpai/animeunion';

/** Costruisce l'URL di una nuova issue con titolo/corpo precompilati (URL-encoded). */
export function buildIssueUrl({ title, body }: { title: string; body: string }): string {
  return `${GITHUB_REPO}/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
}

/** Contesto pagina/browser, utile da allegare a una segnalazione. */
export function clientContext(): { path: string; userAgent: string } {
  return {
    path: typeof window !== 'undefined' ? window.location.pathname : '',
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
  };
}

/** Link "Feedback/bug app": issue precompilata con template e contesto client. */
export function feedbackIssueUrl(): string {
  const { path, userAgent } = clientContext();
  const body = [
    '**Tipo:** Feedback / bug app',
    '',
    '**Descrizione:**',
    '',
    '',
    '**Passi per riprodurre (se bug):**',
    '',
    '',
    '---',
    '```',
    `Pagina: ${path || '-'}`,
    `Browser: ${userAgent || '-'}`,
    '```',
  ].join('\n');
  return buildIssueUrl({ title: 'Feedback/bug app: ', body });
}
