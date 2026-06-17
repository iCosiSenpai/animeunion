'use client';

import { DownloadStatus } from '@/components/downloads/download-status';
import { SearchBar } from '@/components/shared/search-bar';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { navLinks } from '@/lib/nav';
import { trpc } from '@/lib/trpc';
import { cn } from '@/lib/utils';
import { Menu } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { ThemeToggle } from './theme-toggle';

function ProfileBadge() {
  const profile = trpc.profile.me.useQuery(undefined, { retry: false });
  const user = profile.data;
  if (!user) {
    return null;
  }
  return (
    <div className="hidden items-center gap-2 sm:flex" title={user.username}>
      {user.avatarUrl ? (
        <img
          src={user.avatarUrl}
          alt={user.username}
          className="h-7 w-7 rounded-full object-cover"
        />
      ) : (
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-accent text-xs font-medium uppercase">
          {user.username.charAt(0)}
        </div>
      )}
      <span className="hidden text-sm font-medium lg:inline">{user.username}</span>
    </div>
  );
}

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Navbar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/60">
      <div className="container flex h-14 items-center gap-4">
        <Link href="/" className="flex shrink-0 items-center gap-2">
          <Image
            src="/logo.png"
            alt="AnimeUnion"
            width={140}
            height={30}
            className="h-7 w-auto object-contain"
            priority
          />
        </Link>

        <div className="ml-auto flex items-center gap-2">
          <div className="hidden w-48 sm:block lg:w-64">
            <SearchBar />
          </div>

          <DownloadStatus />

          <ProfileBadge />
          <ThemeToggle />

          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild className="md:hidden">
              <Button variant="ghost" size="icon" aria-label="Apri menu">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-72">
              <SheetTitle>Menu</SheetTitle>
              <div className="mt-4">
                <SearchBar />
              </div>
              <nav className="mt-4 flex flex-col gap-1">
                {navLinks.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setOpen(false)}
                    className={cn(
                      'rounded-md px-3 py-2 text-sm hover:bg-accent',
                      isActive(pathname, link.href) && 'bg-accent',
                    )}
                  >
                    {link.label}
                  </Link>
                ))}
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
