import { Providers } from '@/components/providers';
import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import type { ReactNode } from 'react';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'AnimeUnion Docker',
  description:
    'Applicazione ufficiale affiliata ad AnimeUnion per il download self-hosted di anime.',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'AnimeUnion', statusBarStyle: 'black-translucent' },
  icons: { icon: '/favicon.ico', apple: '/icon-192.png' },
};

export const viewport: Viewport = {
  themeColor: '#242424',
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
      <body className={inter.className}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
