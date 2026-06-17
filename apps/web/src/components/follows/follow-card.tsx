'use client';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { FOLLOW_STATUSES } from '@/lib/follow';
import { trpc } from '@/lib/trpc';
import type { FollowWithAnime } from '@animeunion/shared';
import { MoreVertical } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';

export function FollowCard({ follow }: { follow: FollowWithAnime }) {
  const utils = trpc.useUtils();
  const invalidate = () => {
    void utils.follow.list.invalidate();
  };

  const updateStatus = trpc.follow.updateStatus.useMutation({
    onSuccess: () => {
      toast.success('Stato aggiornato');
      invalidate();
    },
    onError: (error) => toast.error(error.message),
  });
  const remove = trpc.follow.remove.useMutation({
    onSuccess: () => {
      toast.success('Rimosso dai seguiti');
      invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const anime = follow.anime;

  return (
    <Card className="group overflow-hidden border border-border/50 shadow-sm transition-all duration-300 hover:border-primary/30 hover:shadow-lg">
      <div className="relative aspect-[2/3] bg-muted">
        <Link href={`/catalog/${anime.slug}`}>
          {anime.coverImage ? (
            <img
              src={anime.coverImage}
              alt={anime.title}
              loading="lazy"
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
          ) : null}
        </Link>
        <div className="absolute right-1 top-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="secondary" size="icon" className="h-8 w-8" aria-label="Azioni">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link href={`/catalog/${anime.slug}`}>Vai al dettaglio</Link>
              </DropdownMenuItem>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>Cambia stato</DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  {FOLLOW_STATUSES.map((status) => (
                    <DropdownMenuItem
                      key={status.value}
                      disabled={status.value === follow.status}
                      onClick={() =>
                        updateStatus.mutate({ animeId: anime.id, status: status.value })
                      }
                    >
                      {status.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive"
                onClick={() => remove.mutate({ animeId: anime.id })}
              >
                Rimuovi
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <div className="p-3">
        <Link
          href={`/catalog/${anime.slug}`}
          className="line-clamp-2 text-sm font-medium hover:underline"
        >
          {anime.titleIta ?? anime.title}
        </Link>
      </div>
    </Card>
  );
}
