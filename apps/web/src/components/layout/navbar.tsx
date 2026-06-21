'use client';

import { DownloadStatus } from '@/components/downloads/download-status';
import { NotificationBell } from '@/components/layout/notification-bell';
import { SearchTrigger } from '@/components/layout/search-trigger';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { navLinks } from '@/lib/nav';
import { clearSessionToken } from '@/lib/session';
import { trpc } from '@/lib/trpc';
import { cn } from '@/lib/utils';
import { ExternalLink, Lock, LogOut, Menu } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { ThemeToggle } from './theme-toggle';

function ProfileBadge() {
  const utils = trpc.useUtils();
  const profile = trpc.profile.me.useQuery(undefined, { retry: false });
  const lockStatus = trpc.lock.status.useQuery(undefined, { retry: false });
  const logout = trpc.auth.logout.useMutation({
    onSuccess: () => {
      toast.success('Disconnesso');
      void utils.auth.status.invalidate();
    },
  });
  const onLock = () => {
    clearSessionToken();
    void utils.lock.status.invalidate();
  };
  const user = profile.data;
  if (!user) {
    return null;
  }
  const avatar = user.avatarUrl ? (
    <img src={user.avatarUrl} alt={user.username} className="h-7 w-7 rounded-full object-cover" />
  ) : (
    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-accent text-xs font-medium uppercase">
      {user.username.charAt(0)}
    </div>
  );
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-2 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
          title={user.username}
        >
          {avatar}
          <span className="hidden text-sm font-medium lg:inline">{user.username}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="flex flex-col">
          <span className="truncate">{user.username}</span>
          <span className="truncate text-xs font-normal text-muted-foreground">{user.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <a href="https://animeunion.tv/profilo" target="_blank" rel="noopener noreferrer">
            <ExternalLink className="mr-2 h-4 w-4" />
            Modifica profilo
          </a>
        </DropdownMenuItem>
        {lockStatus.data?.enabled ? (
          <DropdownMenuItem onClick={onLock}>
            <Lock className="mr-2 h-4 w-4" />
            Blocca app
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-destructive focus:text-destructive"
          onClick={() => logout.mutate()}
          disabled={logout.isPending}
        >
          <LogOut className="mr-2 h-4 w-4" />
          Esci
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
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
            <SearchTrigger />
          </div>

          <DownloadStatus />
          <NotificationBell />

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
                <SearchTrigger onOpen={() => setOpen(false)} />
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
