'use client';

import { Button } from '@/components/ui/button';
import { navLinks } from '@/lib/nav';
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
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      {/* Sidebar desktop */}
      <aside
        className={cn(
          'fixed left-0 top-0 z-30 hidden h-screen flex-col border-r bg-card transition-all duration-200 md:flex',
          expanded ? 'w-56' : 'w-16',
        )}
      >
        <div className="flex h-14 items-center justify-center border-b px-2">
          <Button
            variant="ghost"
            size="icon"
            aria-label={expanded ? 'Comprimi menu' : 'Espandi menu'}
            title={expanded ? 'Comprimi menu' : 'Espandi menu'}
            onClick={() => setExpanded((v) => !v)}
            className="shrink-0"
          >
            {expanded ? <ChevronLeft className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
          </Button>
          <span
            className={cn(
              'ml-2 overflow-hidden whitespace-nowrap text-sm font-semibold transition-all duration-200',
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

      {/* Bottom bar mobile */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 flex items-center justify-around border-t bg-card px-2 pb-safe md:hidden">
        {navLinks.slice(0, 6).map((link) => {
          const Icon = ICONS[link.href] ?? Home;
          return (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                'flex flex-col items-center gap-0.5 rounded-md px-3 py-2 text-xs text-muted-foreground transition-colors hover:text-foreground',
                isActive(pathname, link.href) && 'text-foreground',
              )}
            >
              <Icon className="h-5 w-5" />
              <span className="text-[10px]">{link.label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
