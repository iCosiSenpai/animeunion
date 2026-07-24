'use client';

import { useSeasonGate } from '@/components/catalog/season-gate';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { trpc } from '@/lib/trpc';
import type { AnimeStatus } from '@animeunion/shared';
import {
  Check,
  ChevronDown,
  Download,
  Loader2,
  Pause,
  Plus,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';

/**
 * Segui/gestisci una serie. Un solo bottone: "Segui" (un click) quando non seguita, "Seguito"/"In
 * pausa" con popover di controlli immediati quando seguita. Niente più i 5 tag di stato: le uniche
 * scelte che contano per un centro di download sono gli interruttori (auto-download, avvisi) + la
 * pausa. Lo stato interno resta l'enum esistente (Segui = watching, In pausa = on_hold, Smetti di
 * seguire = remove) così i record legacy (plan_to_watch/completed/dropped) si mappano senza migrazioni.
 */
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
  const isCompleted = animeStatus === 'COMPLETED';

  const { ensureConfirmed, dialog: seasonDialog } = useSeasonGate(animeId);

  const invalidate = () => void utils.follow.list.invalidate();
  const onError = (e: { message?: string }) => toast.error(e.message || 'Operazione non riuscita');

  const add = trpc.follow.add.useMutation({
    onSuccess: () => {
      toast.success('Aggiunto ai Seguiti');
      invalidate();
    },
    onError,
  });
  const update = trpc.follow.updateStatus.useMutation({ onSuccess: invalidate, onError });
  const setAuto = trpc.follow.setAutoDownload.useMutation({ onSuccess: invalidate, onError });
  const setNotify = trpc.follow.setNotify.useMutation({ onSuccess: invalidate, onError });
  const remove = trpc.follow.remove.useMutation({
    onSuccess: () => {
      toast.success('Rimosso dai Seguiti');
      invalidate();
    },
    onError,
  });
  const addAll = trpc.download.addAll.useMutation({
    onSuccess: (res) => {
      toast.success(`${res.enqueued} episodi accodati`);
      void utils.download.queue.invalidate();
    },
    onError: (e) => toast.error(e.message || 'Impossibile accodare i download'),
  });

  // Non seguito: un solo click segue (watching + auto-download di default). L'auto è forward-only,
  // quindi NON scarica il backlog già uscito — solo i nuovi episodi.
  if (!current) {
    return (
      <>
        <Button
          onClick={() => add.mutate({ animeId, status: 'watching' })}
          disabled={add.isPending || follows.isLoading}
        >
          {add.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Plus className="mr-2 h-4 w-4" />
          )}
          Segui
        </Button>
        {seasonDialog}
      </>
    );
  }

  // In pausa = on_hold; i record legacy "dropped" si mostrano anch'essi come in pausa (stesso
  // comportamento: niente auto-download né avvisi). Riattivare = tornare a watching.
  const paused = current.status === 'on_hold' || current.status === 'dropped';
  const autoOn = current.autoDownload ?? current.status === 'watching';
  const notifyOn = current.notify ?? true;

  return (
    <>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant={paused ? 'outline' : 'secondary'}>
            {paused ? <Pause className="mr-2 h-4 w-4" /> : <Check className="mr-2 h-4 w-4" />}
            {paused ? 'In pausa' : 'Seguito'}
            <ChevronDown className="ml-2 h-4 w-4 opacity-70" />
          </Button>
        </PopoverTrigger>

        <PopoverContent align="end" className="w-80 p-0">
          <div className="border-b px-4 py-3">
            <p className="text-sm font-medium">Gestisci il seguito</p>
            <p className="text-xs text-muted-foreground">
              Download automatico e avvisi per questa serie.
            </p>
          </div>

          <div className="space-y-3 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">Scarica i nuovi episodi</p>
                <p className="text-xs text-muted-foreground">
                  Auto-download appena escono (solo i nuovi).
                </p>
              </div>
              <Switch
                checked={autoOn && !paused}
                disabled={paused || setAuto.isPending}
                onCheckedChange={(v) => setAuto.mutate({ animeId, autoDownload: v })}
                aria-label="Scarica automaticamente i nuovi episodi"
              />
            </div>
            {autoOn && !paused && masterOff ? (
              <p className="flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>
                  L&apos;auto-download globale è spento: attivalo in{' '}
                  <Link href="/settings" className="font-medium underline underline-offset-2">
                    Impostazioni
                  </Link>
                  .
                </span>
              </p>
            ) : null}
            {isCompleted && !paused ? (
              <p className="text-xs text-muted-foreground">
                Serie conclusa: di norma non escono nuovi episodi.
              </p>
            ) : null}

            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">Avvisi nuove stagioni</p>
                <p className="text-xs text-muted-foreground">Notifica per sequel e correlati.</p>
              </div>
              <Switch
                checked={notifyOn && !paused}
                disabled={paused || setNotify.isPending}
                onCheckedChange={(v) => setNotify.mutate({ animeId, notify: v })}
                aria-label="Avvisami di nuove stagioni"
              />
            </div>

            <Button
              variant="outline"
              size="sm"
              className="w-full gap-2"
              disabled={addAll.isPending}
              onClick={() => ensureConfirmed(() => addAll.mutate({ animeId }))}
            >
              {addAll.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              Scarica gli episodi già usciti
            </Button>
          </div>

          <div className="space-y-1 border-t p-2">
            <div className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5">
              <span className="flex items-center gap-2 text-sm font-medium">
                <Pause className="h-4 w-4" />
                In pausa
              </span>
              <Switch
                checked={paused}
                disabled={update.isPending}
                onCheckedChange={(v) =>
                  update.mutate({ animeId, status: v ? 'on_hold' : 'watching' })
                }
                aria-label="Metti in pausa"
              />
            </div>
            <p className="px-2 pb-1 text-xs text-muted-foreground">
              Sospende download e avvisi senza smettere di seguire.
            </p>
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start gap-2 text-destructive hover:text-destructive"
              disabled={remove.isPending}
              onClick={() => remove.mutate({ animeId })}
            >
              {remove.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              Smetti di seguire
            </Button>
          </div>
        </PopoverContent>
      </Popover>

      {seasonDialog}
    </>
  );
}
