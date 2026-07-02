'use client';

import { useSeasonGate } from '@/components/catalog/season-gate';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { FOLLOW_STATUSES, FOLLOW_STATUS_LABELS } from '@/lib/follow';
import { trpc } from '@/lib/trpc';
import { cn } from '@/lib/utils';
import type { AnimeStatus, FollowStatus } from '@animeunion/shared';
import { Check, ChevronDown, Loader2, Plus, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';

export function FollowButton({
  animeId,
  animeStatus,
}: {
  animeId: string;
  animeStatus?: AnimeStatus;
}) {
  const utils = trpc.useUtils();
  const follows = trpc.follow.list.useQuery();
  const config = trpc.config.getAll.useQuery();
  const masterOff = config.data ? !config.data.autoDownload : false;
  const current = follows.data?.find((follow) => follow.animeId === animeId) ?? null;
  // Serie conclusa: l'auto-download resta attivabile (lo stato d'onda non e' piu' un gate),
  // mostriamo solo una nota informativa.
  const isCompleted = animeStatus === 'COMPLETED';

  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<FollowStatus>('watching');
  const [autoDownload, setAutoDownload] = useState(true);
  const [autoTouched, setAutoTouched] = useState(false);
  const [downloadExisting, setDownloadExisting] = useState(false);

  const { ensureConfirmed, dialog: seasonDialog } = useSeasonGate(animeId);

  const invalidate = () => void utils.follow.list.invalidate();
  const add = trpc.follow.add.useMutation();
  const update = trpc.follow.updateStatus.useMutation();
  const setAuto = trpc.follow.setAutoDownload.useMutation();
  const remove = trpc.follow.remove.useMutation({
    onSuccess: () => {
      toast.success('Rimosso dai Seguiti');
      invalidate();
      setOpen(false);
    },
    onError: (e) => toast.error(e.message),
  });
  const addAll = trpc.download.addAll.useMutation({
    onSuccess: (res) => {
      toast.success(`${res.enqueued} episodi accodati`);
      void utils.download.queue.invalidate();
    },
    onError: (e) => toast.error(e.message || 'Impossibile accodare i download'),
  });

  const pending = add.isPending || update.isPending || setAuto.isPending || remove.isPending;

  function onOpenChange(next: boolean) {
    if (next) {
      const initialStatus = current?.status ?? 'watching';
      setStatus(initialStatus);
      // Rispetta lo stato auto reale (anche per le serie concluse: ora e' attivabile).
      setAutoDownload(current?.autoDownload ?? initialStatus === 'watching');
      setAutoTouched(current?.autoDownload != null);
      setDownloadExisting(false);
    }
    setOpen(next);
  }

  function pickStatus(next: FollowStatus) {
    setStatus(next);
    if (!autoTouched) {
      setAutoDownload(next === 'watching');
    }
  }

  async function onSave() {
    try {
      if (current) {
        if (status !== current.status) {
          await update.mutateAsync({ animeId, status });
        }
        if (autoDownload !== (current.autoDownload ?? current.status === 'watching')) {
          await setAuto.mutateAsync({ animeId, autoDownload });
        }
        toast.success('Seguito aggiornato');
      } else {
        await add.mutateAsync({ animeId, status, autoDownload });
        toast.success('Aggiunto ai Seguiti');
      }
      invalidate();
      setOpen(false);
      if (downloadExisting) {
        ensureConfirmed(() => addAll.mutate({ animeId }));
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Operazione non riuscita');
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogTrigger asChild>
          <Button variant={current ? 'secondary' : 'default'} disabled={pending}>
            {current ? (
              <>
                <Check className="mr-2 h-4 w-4" />
                {FOLLOW_STATUS_LABELS[current.status]}
              </>
            ) : (
              <>
                <Plus className="mr-2 h-4 w-4" />
                Segui
              </>
            )}
            <ChevronDown className="ml-2 h-4 w-4" />
          </Button>
        </DialogTrigger>

        <DialogContent>
          <DialogHeader>
            <DialogTitle>{current ? 'Gestisci nei Seguiti' : 'Aggiungi ai Seguiti'}</DialogTitle>
            <DialogDescription>
              Scegli lo stato e cosa scaricare. Lo stato decide cosa succede ai nuovi episodi.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              {FOLLOW_STATUSES.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => pickStatus(s.value)}
                  className={cn(
                    'flex w-full flex-col items-start gap-0.5 rounded-md border p-2.5 text-left transition-colors',
                    status === s.value
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:bg-accent/50',
                  )}
                >
                  <span className="flex items-center gap-1.5 text-sm font-medium">
                    {status === s.value ? <Check className="h-3.5 w-3.5 text-primary" /> : null}
                    {s.label}
                  </span>
                  <span className="text-xs text-muted-foreground">{s.hint}</span>
                </button>
              ))}
            </div>

            <div className="space-y-2 rounded-md border p-3">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-primary"
                  checked={autoDownload}
                  onChange={(e) => {
                    setAutoDownload(e.target.checked);
                    setAutoTouched(true);
                  }}
                />
                Scarica automaticamente i nuovi episodi
              </label>
              {autoDownload && masterOff ? (
                <p className="flex items-start gap-1.5 pl-6 text-xs text-amber-600 dark:text-amber-400">
                  <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span>
                    L&apos;auto-download globale è spento: attivalo in{' '}
                    <Link
                      href="/settings"
                      className="font-medium underline underline-offset-2 hover:text-amber-700 dark:hover:text-amber-300"
                    >
                      Impostazioni
                    </Link>{' '}
                    perché i nuovi episodi partano da soli.
                  </span>
                </p>
              ) : null}
              {isCompleted ? (
                <p className="pl-6 text-xs text-muted-foreground">
                  Serie conclusa: di norma non escono nuovi episodi. Per quelli già usciti usa
                  l&apos;opzione qui sotto.
                </p>
              ) : null}
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-primary"
                  checked={downloadExisting}
                  onChange={(e) => setDownloadExisting(e.target.checked)}
                />
                Scarica subito gli episodi già usciti
              </label>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:justify-between">
            {current ? (
              <Button
                variant="ghost"
                className="text-destructive hover:text-destructive"
                onClick={() => remove.mutate({ animeId })}
                disabled={pending}
              >
                Smetti di seguire
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
                Annulla
              </Button>
              <Button onClick={onSave} disabled={pending}>
                {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {current ? 'Salva' : 'Segui'}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {seasonDialog}
    </>
  );
}
