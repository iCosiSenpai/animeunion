'use client';

const REPO = 'https://github.com/iCosiSenpai/animeunion';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const details = `Errore: ${error.message ?? 'sconosciuto'}\nDigest: ${error.digest ?? '-'}`;
  const issueUrl = `${REPO}/issues/new?title=${encodeURIComponent(
    `Errore: ${(error.message ?? '').slice(0, 80)}`,
  )}&body=${encodeURIComponent(`\`\`\`\n${details}\n\`\`\``)}`;

  return (
    <html lang="it">
      <body
        style={{
          fontFamily: 'system-ui, sans-serif',
          display: 'flex',
          minHeight: '100vh',
          alignItems: 'center',
          justifyContent: 'center',
          margin: 0,
          background: '#0a0a0a',
          color: '#fafafa',
        }}
      >
        <div style={{ maxWidth: 480, padding: 24, textAlign: 'center' }}>
          <h2 style={{ fontSize: 20, fontWeight: 600 }}>Errore imprevisto</h2>
          <p style={{ color: '#a1a1aa', fontSize: 14 }}>
            L'applicazione ha riscontrato un problema. Riprova; se persiste, segnalalo (volontario).
          </p>
          <pre
            style={{
              textAlign: 'left',
              whiteSpace: 'pre-wrap',
              background: '#18181b',
              border: '1px solid #27272a',
              borderRadius: 8,
              padding: 12,
              fontSize: 12,
            }}
          >
            {details}
          </pre>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 12 }}>
            <button
              type="button"
              onClick={reset}
              style={{
                padding: '8px 16px',
                borderRadius: 8,
                border: 'none',
                background: '#fafafa',
                color: '#0a0a0a',
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              Riprova
            </button>
            <a
              href={issueUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                padding: '8px 16px',
                borderRadius: 8,
                border: '1px solid #3f3f46',
                color: '#fafafa',
                textDecoration: 'none',
              }}
            >
              Segnala su GitHub
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
