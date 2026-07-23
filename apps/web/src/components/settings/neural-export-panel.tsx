'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { trpc } from '@/lib/trpc';
import { cn } from '@/lib/utils';
import type { NeuralExportJobView } from '@animeunion/shared';
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Loader2,
  RefreshCw,
  Sparkles,
  X,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';

const QUALITY_LABEL: Record<'XQ' | 'XQPLUS', string> = {
  XQ: 'XQ · 1080p',
  XQPLUS: 'XQ+ · 4K',
};

function StatusRow({ ok, label, detail }: { ok: boolean; label: string; detail?: string }) {
  return (
    <li className="flex items-start gap-2.5">
      {ok ? (
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" aria-hidden="true" />
      ) : (
        <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      )}
      <div className="min-w-0">
        <p className="text-sm">{label}</p>
        {detail && <p className="text-xs text-muted-foreground">{detail}</p>}
      </div>
    </li>
  );
}

function JobRow({
  job,
  onCancel,
  cancelling,
}: {
  job: NeuralExportJobView;
  onCancel: (id: string) => void;
  cancelling: boolean;
}) {
  const active = job.state === 'queued' || job.state === 'running';
  const quality = QUALITY_LABEL[job.quality as 'XQ' | 'XQPLUS'] ?? job.quality;
  return (
    <li className="rounded-lg border p-3">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          {job.animeTitle ?? 'Episodio'}
          {job.episodeNumber != null && (
            <span className="text-muted-foreground"> · Ep {job.episodeNumber}</span>
          )}
        </span>
        <Badge variant="outline" className="shrink-0">
          {quality}
        </Badge>
        {job.state === 'done' && (
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" aria-hidden="true" />
        )}
        {job.state === 'running' && (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" aria-hidden="true" />
        )}
        {job.state === 'error' && (
          <AlertCircle className="h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
        )}
        {active && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0"
            disabled={cancelling}
            onClick={() => onCancel(job.id)}
            aria-label="Annulla export"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
      {job.state === 'running' && (
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${Math.round((job.progress ?? 0) * 100)}%` }}
          />
        </div>
      )}
      {job.state === 'error' && job.error && (
        <p className="mt-1.5 text-xs text-destructive">{job.error}</p>
      )}
    </li>
  );
}

// Pannello Neural Export: stato (ricetta + salute worker) + coda export + attribution.
// La configurazione del worker (URL/token/abilitazione) vive nel form Impostazioni (single owner).
export function NeuralExportPanel() {
  const utils = trpc.useUtils();
  const status = trpc.neuralExport.status.useQuery(undefined, { retry: false });
  const jobs = trpc.neuralExport.jobs.useQuery(undefined, {
    refetchInterval: (q) =>
      (q.state.data ?? []).some((j) => j.state === 'queued' || j.state === 'running')
        ? 3000
        : false,
  });
  const cancel = trpc.neuralExport.cancel.useMutation({
    onSuccess: () => {
      toast.success('Export annullato');
      void utils.neuralExport.jobs.invalidate();
    },
    onError: () => toast.error('Impossibile annullare'),
  });

  const s = status.data;
  const worker = s?.worker;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border p-5">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" aria-hidden="true" />
          <h3 className="text-base font-semibold">Download neurale (Anime4K)</h3>
          {s?.available ? (
            <span className="ml-auto rounded-full bg-emerald-600 px-2.5 py-0.5 text-xs font-medium text-white">
              Pronto
            </span>
          ) : (
            <span className="ml-auto rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
              Non pronto
            </span>
          )}
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          Upscale degli episodi a XQ (1080p) / XQ+ (4K) con gli shader ufficiali del sito, eseguito
          dal worker GPU. La sorgente SD resta sempre disponibile.
        </p>
        <a
          href="https://icosisenpai.github.io/animeunion/faq.html#neural"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-flex items-center gap-1 text-sm text-primary underline-offset-4 hover:underline"
        >
          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          Come si configura il worker?
        </a>

        {status.isLoading ? (
          <p className="mt-4 text-sm text-muted-foreground">Verifica in corso…</p>
        ) : (
          <ul className="mt-4 space-y-2.5">
            <StatusRow ok={!!s?.entitled} label="Incluso nel tuo piano" />
            <StatusRow
              ok={!!worker?.enabled}
              label="Abilitato nelle impostazioni"
              detail={worker?.enabled ? undefined : 'Attiva il toggle qui sotto'}
            />
            <StatusRow
              ok={!!worker?.configured}
              label="Worker collegato"
              detail={worker?.configured ? undefined : 'Collega il worker dall’app sul PC con GPU'}
            />
            <StatusRow
              ok={!!worker?.reachable}
              label="Worker raggiungibile"
              detail={
                worker?.configured && worker.enabled && !worker.reachable
                  ? 'Il PC con la GPU non risponde — è acceso e il worker è avviato?'
                  : undefined
              }
            />
            <StatusRow
              ok={!!worker?.ffmpegCapable}
              label="ffmpeg + Vulkan disponibili sul worker"
              detail={
                worker?.reachable && !worker.ffmpegCapable
                  ? 'Installa una build ffmpeg con libplacebo+Vulkan (vedi README worker)'
                  : undefined
              }
            />
            {s?.recipeVersion != null && (
              <StatusRow
                ok
                label={`Ricetta v${s.recipeVersion}`}
                detail={s.profiles
                  .map((p) => QUALITY_LABEL[p.quality as 'XQ' | 'XQPLUS'] ?? p.quality)
                  .join(' · ')}
              />
            )}
          </ul>
        )}

        <div className="mt-4 flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={status.isFetching}
            onClick={() => void utils.neuralExport.status.invalidate()}
          >
            <RefreshCw className={cn('h-3.5 w-3.5', status.isFetching && 'animate-spin')} />
            Verifica worker
          </Button>
        </div>
      </div>

      {(jobs.data ?? []).length > 0 && (
        <div className="rounded-xl border p-5">
          <h3 className="text-sm font-semibold">Coda export</h3>
          <ul className="mt-3 space-y-2">
            {(jobs.data ?? []).map((job) => (
              <JobRow
                key={job.id}
                job={job}
                cancelling={cancel.isPending}
                onCancel={(id) => cancel.mutate({ jobId: id })}
              />
            ))}
          </ul>
        </div>
      )}

      <p className="px-1 text-xs text-muted-foreground">
        Shader{' '}
        <a
          href="https://github.com/bloc97/Anime4K"
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline-offset-4 hover:underline"
        >
          Anime4K
        </a>{' '}
        © bloc97 e contributori — licenza MIT. L'upscale è eseguito localmente sul tuo hardware.
      </p>
    </div>
  );
}
