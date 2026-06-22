'use client';

import { DownloadStatus } from '@/components/downloads/download-status';
import { NotificationBell } from '@/components/layout/notification-bell';
import { SearchTrigger } from '@/components/layout/search-trigger';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { clearSessionToken } from '@/lib/session';
import { trpc } from '@/lib/trpc';
import { ExternalLink, Lock, LogOut } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
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

export function Navbar() {
  return (
    <header className="sticky top-0 z-40 border-b bg-card/95 pt-safe-t backdrop-blur supports-[backdrop-filter]:bg-card/60">
      <div className="container flex h-14 items-center gap-4">
        <Link href="/" className="flex shrink-0 items-center gap-2">
          <Image
            src="/logo.png"
            alt="AnimeUnion"
            width={140}
            height={30}
            className="h-8 w-auto object-contain"
            priority
          />
        </Link>

        <div className="ml-auto flex min-w-0 items-center gap-2">
          <div className="hidden w-48 sm:block lg:w-64">
            <SearchTrigger />
          </div>

          <DownloadStatus />
          <NotificationBell />
          <ProfileBadge />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
