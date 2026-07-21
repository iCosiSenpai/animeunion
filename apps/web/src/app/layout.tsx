import { Providers } from '@/components/providers';
import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'AnimeUnion Docker',
  description:
    'Applicazione ufficiale affiliata ad AnimeUnion per il download self-hosted di anime.',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'AnimeUnion', statusBarStyle: 'black-translucent' },
  icons: { icon: '/favicon.ico', apple: '/icon-192.png' },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#242424' },
  ],
  // Necessario su iOS: senza viewport-fit=cover env(safe-area-inset-*) resta 0 e il
  // dock mobile (pb-safe-b) finirebbe sotto l'home indicator.
  viewportFit: 'cover',
  // PWA installata: disattiva il pinch-zoom per un comportamento da app nativa (scelta utente).
  // Tradeoff a11y: niente ingrandimento con le dita; rispettato nella PWA standalone, non nel
  // Safari mobile normale.
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="it" suppressHydrationWarning>
      <body className="font-sans">
        <Providers>{children}</Providers>
        {/* Invito a ruotare: visibile solo su telefono in landscape (vedi .landscape-block in
            globals.css). Copre il contenuto perche' l'app e' ottimizzata in verticale. */}
        <div className="landscape-block" aria-hidden="true">
          <span className="text-4xl" aria-hidden="true">
            📱
          </span>
          <p className="text-lg font-semibold">Ruota il telefono in verticale</p>
          <p className="max-w-xs text-sm text-muted-foreground">
            AnimeUnion è ottimizzato in modalità verticale su telefono.
          </p>
        </div>
      </body>
    </html>
  );
}
