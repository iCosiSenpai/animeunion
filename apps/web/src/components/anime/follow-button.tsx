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
import { FOLLOW_STATUSES } from '@/lib/follow';
import { trpc } from '@/lib/trpc';
import { ChevronDown, Plus } from 'lucide-react';
import { toast } from 'sonner';

export function FollowButton({ animeId }: { animeId: string }) {
  const utils = trpc.useUtils();
  const add = trpc.follow.add.useMutation({
    onSuccess: () => {
      toast.success('Anime aggiornato nei Seguiti');
      void utils.follow.list.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button disabled={add.isPending}>
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
