'use client';

import { cn } from '@/lib/utils';
import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  type SortingStrategy,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import { type ReactNode, useCallback, useEffect, useState } from 'react';

/**
 * Ordine di layout persistito in localStorage, con merge difensivo verso i default (i nuovi id si
 * aggiungono in coda, quelli sconosciuti si rimuovono). Client-only: il primo render usa sempre
 * `defaultOrder`, quindi nessun mismatch di hydration. `defaultOrder` dev'essere un riferimento
 * stabile (costante di modulo).
 */
export function useLayoutOrder(
  storageKey: string,
  defaultOrder: readonly string[],
): [string[], (next: string[]) => void] {
  const [order, setOrder] = useState<string[]>(() => [...defaultOrder]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (!saved) {
        return;
      }
      const parsed = JSON.parse(saved) as unknown;
      if (!Array.isArray(parsed)) {
        return;
      }
      const known = new Set(defaultOrder);
      const merged = (parsed as string[]).filter((id) => known.has(id));
      for (const id of defaultOrder) {
        if (!merged.includes(id)) {
          merged.push(id);
        }
      }
      setOrder(merged);
    } catch {
      // localStorage non disponibile o JSON corrotto: si resta sui default.
    }
  }, [storageKey, defaultOrder]);

  const update = useCallback(
    (next: string[]) => {
      setOrder(next);
      try {
        localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        // ignora
      }
    },
    [storageKey],
  );

  return [order, update];
}

/** Contenitore ordinabile (drag & drop). La persistenza è gestita dal chiamante via onReorder. */
export function Sortable({
  ids,
  onReorder,
  strategy,
  className,
  children,
}: {
  ids: string[];
  onReorder: (next: string[]) => void;
  strategy: SortingStrategy;
  className?: string;
  children: ReactNode;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const onDragEnd = (event: DragEndEvent): void => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const from = ids.indexOf(String(active.id));
      const to = ids.indexOf(String(over.id));
      if (from >= 0 && to >= 0) {
        onReorder(arrayMove(ids, from, to));
      }
    }
  };
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={ids} strategy={strategy}>
        <div className={className}>{children}</div>
      </SortableContext>
    </DndContext>
  );
}

/**
 * Elemento ordinabile: espone un "handle" (impugnatura) da inserire nell'header del blocco, così
 * solo il grip avvia il drag e i controlli interni (bottoni/link) restano cliccabili. Accessibile
 * anche da tastiera (attributi/listener dnd-kit sul bottone).
 */
export function SortableItem({
  id,
  className,
  children,
}: {
  id: string;
  className?: string;
  children: (handle: ReactNode) => ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });
  const style = { transform: CSS.Transform.toString(transform), transition };
  const handle = (
    <button
      type="button"
      aria-label="Trascina per riordinare"
      className="cursor-grab touch-none rounded p-1 text-muted-foreground/50 transition-colors hover:bg-accent hover:text-foreground active:cursor-grabbing"
      {...attributes}
      {...listeners}
    >
      <GripVertical className="h-4 w-4" />
    </button>
  );
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn('relative', isDragging && 'z-10 opacity-80', className)}
    >
      {children(handle)}
    </div>
  );
}
