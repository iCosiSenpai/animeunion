'use client';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { FOLLOW_STATUSES, FOLLOW_STATUS_LABELS } from '@/lib/follow';
import { trpc } from '@/lib/trpc';
import { Check, ChevronDown, Plus } from 'lucide-react';
import { toast } from 'sonner';

export function FollowButton({ animeId }: { animeId: string }) {
  const utils = trpc.useUtils();
  const follows = trpc.follow.list.useQuery();
  const current = follows.data?.find((follow) => follow.animeId === animeId) ?? null;

  const invalidate = () => {
    void utils.follow.list.invalidate();
  };
  const add = trpc.follow.add.useMutation({
    onSuccess: () => {
      toast.success('Aggiunto ai Seguiti');
      invalidate();
    },
    onError: (error) => toast.error(error.message),
  });
  const update = trpc.follow.updateStatus.useMutation({
    onSuccess: () => {
      toast.success('Stato aggiornato');
      invalidate();
    },
    onError: (error) => toast.error(error.message),
  });
  const remove = trpc.follow.remove.useMutation({
    onSuccess: () => {
      toast.success('Rimosso dai Seguiti');
      invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const pending = add.isPending || update.isPending || remove.isPending;

  if (!current) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button disabled={pending}>
            <Plus className="mr-2 h-4 w-4" />
            Segui
            <ChevronDown className="ml-2 h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-72">
          <DropdownMenuLabel>Come vuoi seguirlo?</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {FOLLOW_STATUSES.map((status) => (
            <DropdownMenuItem
              key={status.value}
              onClick={() => add.mutate({ animeId, status: status.value })}
              className="flex-col items-start gap-0.5"
            >
              <span className="font-medium">{status.label}</span>
              <span className="text-xs text-muted-foreground whitespace-normal">{status.hint}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="secondary" disabled={pending}>
          <Check className="mr-2 h-4 w-4" />
          {FOLLOW_STATUS_LABELS[current.status]}
          <ChevronDown className="ml-2 h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        <DropdownMenuLabel>Stato nei Seguiti</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {FOLLOW_STATUSES.map((status) => (
          <DropdownMenuItem
            key={status.value}
            disabled={status.value === current.status}
            onClick={() => update.mutate({ animeId, status: status.value })}
            className="flex-col items-start gap-0.5"
          >
            <span className="flex items-center gap-1 font-medium">
              {status.value === current.status ? <Check className="h-3 w-3 text-primary" /> : null}
              {status.label}
            </span>
            <span className="text-xs text-muted-foreground whitespace-normal">{status.hint}</span>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-destructive focus:text-destructive"
          onClick={() => remove.mutate({ animeId })}
        >
          Smetti di seguire
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
