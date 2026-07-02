'use client';

import { SearchTrigger } from '@/components/layout/search-trigger';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { navLinks, primaryNavLinks, secondaryNavLinks } from '@/lib/nav';
import { useSidebar } from '@/lib/sidebar-store';
import { cn } from '@/lib/utils';
import {
  BarChart3,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Compass,
  Heart,
  Home,
  Info,
  Library,
  MoreHorizontal,
  Settings,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  '/': Home,
  '/catalog': Compass,
  '/follows': Heart,
  '/library': Library,
  '/calendar': Calendar,
  '/settings': Settings,
  '/statistiche': BarChart3,
  '/about': Info,
};

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Sidebar() {
  const pathname = usePathname();
  const expanded = useSidebar((s) => s.expanded);
  const toggle = useSidebar((s) => s.toggle);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreActive = secondaryNavLinks.some((link) => isActive(pathname, link.href));

  return (
    <>
      {/* Sidebar desktop */}
      <aside
        className={cn(
          // Safe-area: in landscape su telefono (larghezza >= md) la sidebar mostrata non deve
          // finire sotto la status bar / il notch. pt/pl = env(safe-area-inset-*).
          'fixed left-0 top-0 z-30 hidden h-screen flex-col border-r bg-card pl-[env(safe-area-inset-left)] pt-[env(safe-area-inset-top)] transition-all duration-200 md:flex',
          expanded ? 'w-56' : 'w-16',
        )}
      >
        <div className="flex h-14 items-center gap-2 border-b px-2">
          <Button
            variant="ghost"
            size="icon"
            aria-label={expanded ? 'Comprimi menu' : 'Espandi menu'}
            title={expanded ? 'Comprimi menu' : 'Espandi menu'}
            onClick={toggle}
            className="shrink-0"
          >
            {expanded ? <ChevronLeft className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
          </Button>
          <span
            className={cn(
              'overflow-hidden whitespace-nowrap text-sm font-semibold transition-all duration-200',
              expanded ? 'w-auto opacity-100' : 'w-0 opacity-0',
            )}
          >
            Menu
          </span>
        </div>

        <nav className="flex flex-1 flex-col gap-1 p-2">
          {navLinks.map((link) => {
            const Icon = ICONS[link.href] ?? Home;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  'flex items-center gap-3 rounded-md px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
                  isActive(pathname, link.href) && 'bg-accent text-foreground',
                )}
                title={link.label}
              >
                <Icon className={cn('shrink-0', expanded ? 'h-5 w-5' : 'h-6 w-6')} />
                <span
                  className={cn(
                    'whitespace-nowrap transition-opacity duration-200',
                    expanded ? 'opacity-100' : 'w-0 opacity-0',
                  )}
                >
                  {link.label}
                </span>
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Dock mobile: voci principali + "Altro" (drawer) */}
      <nav className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-around border-t bg-card px-2 pb-safe-b md:hidden">
        {primaryNavLinks.map((link) => {
          const Icon = ICONS[link.href] ?? Home;
          return (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                'flex min-h-[3rem] flex-col items-center justify-center gap-0.5 rounded-md px-3 py-2 text-xs text-muted-foreground transition-colors hover:text-foreground',
                isActive(pathname, link.href) && 'text-foreground',
              )}
            >
              <Icon className="h-5 w-5" />
              <span className="text-[10px]">{link.label}</span>
            </Link>
          );
        })}

        <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
          <SheetTrigger asChild>
            <button
              type="button"
              aria-label="Altro"
              className={cn(
                'flex min-h-[3rem] flex-col items-center justify-center gap-0.5 rounded-md px-3 py-2 text-xs text-muted-foreground transition-colors hover:text-foreground',
                moreActive && 'text-foreground',
              )}
            >
              <MoreHorizontal className="h-5 w-5" />
              <span className="text-[10px]">Altro</span>
            </button>
          </SheetTrigger>
          <SheetContent
            side="bottom"
            className="rounded-t-2xl"
            // Alla chiusura non riportare il focus sul trigger "Altro": ruberebbe il focus
            // all'input della ricerca (command palette) e su iOS la tastiera si richiuderebbe.
            onCloseAutoFocus={(e) => e.preventDefault()}
          >
            <SheetTitle>Altro</SheetTitle>
            <div className="mt-4">
              <SearchTrigger onOpen={() => setMoreOpen(false)} />
            </div>
            <nav className="mt-4 grid grid-cols-2 gap-2">
              {secondaryNavLinks.map((link) => {
                const Icon = ICONS[link.href] ?? Home;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setMoreOpen(false)}
                    className={cn(
                      'flex items-center gap-3 rounded-md px-3 py-3 text-sm hover:bg-accent',
                      isActive(pathname, link.href) && 'bg-accent',
                    )}
                  >
                    <Icon className="h-5 w-5 shrink-0 text-muted-foreground" />
                    <span className="truncate">{link.label}</span>
                  </Link>
                );
              })}
            </nav>
          </SheetContent>
        </Sheet>
      </nav>
    </>
  );
}
