'use client';

import { ChevronDown, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { trpc } from '@/lib/trpc';

const STATUSES = [
  { value: 'plan_to_watch', label: 'Da guardare' },
  { value: 'watching', label: 'In corso' },
  { value: 'on_hold', label: 'In pausa' },
  { value: 'completed', label: 'Completato' },
  { value: 'dropped', label: 'Droppato' },
] as const;

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
      <DropdownMenuContent align="start">
        {STATUSES.map((status) => (
          <DropdownMenuItem
            key={status.value}
            onClick={() => add.mutate({ animeId, status: status.value })}
          >
            {status.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
