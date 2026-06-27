'use client';

import { HOME_SECTIONS, resolveHomeOrder } from '@/components/home/home-sections';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { trpc } from '@/lib/trpc';
import { cn } from '@/lib/utils';
import type { HomeSectionId, HomeSectionPref } from '@animeunion/shared';
import { ChevronDown, ChevronUp, Eye, EyeOff } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

const SECTION_META = new Map(HOME_SECTIONS.map((s) => [s.id, s] as const));

export function HomeLayoutSection() {
  const utils = trpc.useUtils();
  const config = trpc.config.getAll.useQuery();
  const setMutation = trpc.config.set.useMutation();

  const [draft, setDraft] = useState<HomeSectionPref[] | null>(null);

  // Inizializza il draft dal server (merge col registro) appena arriva la config.
  useEffect(() => {
    if (config.data && !draft) {
      setDraft(resolveHomeOrder(config.data.homeLayout));
    }
  }, [config.data, draft]);

  if (!draft) {
    return (
      <Card className="space-y-4 p-5">
        <div className="h-6 w-40 animate-pulse rounded bg-muted" />
        <div className="h-48 animate-pulse rounded bg-muted" />
      </Card>
    );
  }

  const saved = resolveHomeOrder(config.data?.homeLayout ?? []);
  const isDirty = JSON.stringify(draft) !== JSON.stringify(saved);

  const move = (index: number, delta: number) => {
    setDraft((prev) => {
      if (!prev) return prev;
      const target = index + delta;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      const [item] = next.splice(index, 1);
      if (!item) return prev;
      next.splice(target, 0, item);
      return next;
    });
  };

  const toggle = (id: HomeSectionId) => {
    setDraft((prev) =>
      prev ? prev.map((p) => (p.id === id ? { ...p, visible: !p.visible } : p)) : prev,
    );
  };

  const onSave = async () => {
    try {
      await setMutation.mutateAsync({ key: 'homeLayout', value: draft });
      await utils.config.getAll.invalidate();
      toast.success('Layout della home salvato.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Salvataggio non riuscito.');
    }
  };

  return (
    <Card className="space-y-4 p-5">
      <div>
        <h2 className="text-lg font-semibold">Personalizza la home</h2>
        <p className="text-xs text-muted-foreground">
          Scegli quali sezioni mostrare e in che ordine. Le sezioni nascoste, o senza contenuti, non
          appaiono nella home.
        </p>
      </div>
      <Separator />
      <ul className="space-y-2">
        {draft.map((entry, index) => {
          const meta = SECTION_META.get(entry.id);
          if (!meta) return null;
          const Icon = meta.icon;
          return (
            <li
              key={entry.id}
              className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2"
            >
              <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span
                className={cn(
                  'min-w-0 flex-1 truncate text-sm',
                  !entry.visible && 'text-muted-foreground line-through',
                )}
              >
                {meta.label}
              </span>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => toggle(entry.id)}
                aria-label={entry.visible ? `Nascondi ${meta.label}` : `Mostra ${meta.label}`}
              >
                {entry.visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => move(index, -1)}
                disabled={index === 0}
                aria-label={`Sposta su ${meta.label}`}
              >
                <ChevronUp className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => move(index, 1)}
                disabled={index === draft.length - 1}
                aria-label={`Sposta giù ${meta.label}`}
              >
                <ChevronDown className="h-4 w-4" />
              </Button>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={onSave} disabled={!isDirty || setMutation.isPending}>
          {setMutation.isPending ? 'Salvataggio…' : 'Salva'}
        </Button>
        <Button
          variant="ghost"
          onClick={() => setDraft(saved)}
          disabled={!isDirty || setMutation.isPending}
        >
          Annulla
        </Button>
        <Button
          variant="outline"
          onClick={() => setDraft(resolveHomeOrder([]))}
          disabled={setMutation.isPending}
        >
          Ripristina predefinito
        </Button>
      </div>
    </Card>
  );
}
