'use client';

import { Button } from '@/components/ui/button';
import { navLinks } from '@/lib/nav';
import { cn } from '@/lib/utils';
import { Calendar, Compass, Heart, Home, Info, Library, Menu, Settings, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

const ICONS: Record<string, React.ReactNode> = {
  '/': <Home className="h-5 w-5" />,
  '/catalog': <Compass className="h-5 w-5" />,
  '/follows': <Heart className="h-5 w-5" />,
  '/library': <Library className="h-5 w-5" />,
  '/calendar': <Calendar className="h-5 w-5" />,
  '/settings': <Settings className="h-5 w-5" />,
  '/about': <Info className="h-5 w-5" />,
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
        <div className="flex h-14 items-center justify-center border-b">
          <Button
            variant="ghost"
            size="icon"
            aria-label={expanded ? 'Comprimi menu' : 'Espandi menu'}
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>

        <nav className="flex flex-1 flex-col gap-1 p-2">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
                isActive(pathname, link.href) && 'bg-accent text-foreground',
              )}
              title={link.label}
            >
              {ICONS[link.href]}
              <span
                className={cn(
                  'whitespace-nowrap transition-opacity duration-200',
                  expanded ? 'opacity-100' : 'w-0 opacity-0',
                )}
              >
                {link.label}
              </span>
            </Link>
          ))}
        </nav>
      </aside>

      {/* Bottom bar mobile */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 flex items-center justify-around border-t bg-card px-2 pb-safe md:hidden">
        {navLinks.slice(0, 6).map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              'flex flex-col items-center gap-0.5 rounded-md px-3 py-2 text-xs text-muted-foreground transition-colors hover:text-foreground',
              isActive(pathname, link.href) && 'text-foreground',
            )}
          >
            {ICONS[link.href]}
            <span className="text-[10px]">{link.label}</span>
          </Link>
        ))}
      </nav>
    </>
  );
}
