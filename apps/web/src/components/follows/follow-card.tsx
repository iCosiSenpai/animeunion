'use client';

import { useSeasonGate } from '@/components/catalog/season-gate';
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
import { Download, MoreVertical } from 'lucide-react';
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
  const setAuto = trpc.follow.setAutoDownload.useMutation({
    onSuccess: () => {
      toast.success('Auto-download aggiornato');
      invalidate();
    },
    onError: (error) => toast.error(error.message),
  });
  const addAll = trpc.download.addAll.useMutation({
    onSuccess: (res) => {
      toast.success(`${res.enqueued} episodi accodati`);
      void utils.download.queue.invalidate();
    },
    onError: (error) => toast.error(error.message || 'Impossibile accodare i download'),
  });

  const anime = follow.anime;
  const { ensureConfirmed, dialog: seasonDialog } = useSeasonGate(anime.id);
  // Serie conclusa: niente auto-download (coerente con enqueueForAutoFollows che esclude i COMPLETED).
  const isCompleted = anime.status === 'COMPLETED';
  const autoEffective = follow.autoDownload ?? follow.status === 'watching';

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
              <DropdownMenuItem
                onClick={() => ensureConfirmed(() => addAll.mutate({ animeId: anime.id }))}
              >
                Scarica episodi mancanti
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={isCompleted}
                onClick={() => setAuto.mutate({ animeId: anime.id, autoDownload: !autoEffective })}
              >
                {autoEffective ? 'Disattiva auto-download' : 'Attiva auto-download'}
              </DropdownMenuItem>
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
        {autoEffective && !isCompleted ? (
          <span className="absolute left-1 top-1 inline-flex items-center gap-1 rounded-full bg-primary/90 px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground shadow-sm">
            <Download className="h-3 w-3" />
            Auto
          </span>
        ) : null}
      </div>

      {seasonDialog}
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
