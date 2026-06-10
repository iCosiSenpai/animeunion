import { Providers } from '@/components/providers';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import type { ReactNode } from 'react';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'AnimeUnion Docker',
  description:
    'Applicazione ufficiale affiliata ad AnimeUnion per il download self-hosted di anime.',
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
