import { AuthGate } from '@/components/auth/auth-gate';
import { CommandPalette } from '@/components/layout/command-palette';
import { Footer } from '@/components/layout/footer';
import { Navbar } from '@/components/layout/navbar';
import { PageTransition } from '@/components/layout/page-transition';
import { SetupBanner } from '@/components/layout/setup-banner';
import { Sidebar } from '@/components/layout/sidebar';
import type { ReactNode } from 'react';

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGate>
      <div className="flex min-h-screen">
        <Sidebar />
        <div className="flex flex-1 flex-col md:pl-16">
          <Navbar />
          <SetupBanner />
          <main className="container flex-1 py-6 pb-24 md:pb-6">
            <PageTransition>{children}</PageTransition>
          </main>
          <Footer />
        </div>
      </div>
      <CommandPalette />
    </AuthGate>
  );
}
