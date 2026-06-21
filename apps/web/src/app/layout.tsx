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
