import type {
  Language,
  LibraryEntry,
  LibraryEpisode,
  LibraryGroup,
  LibraryStats,
} from '@animeunion/shared';

const LANGUAGE_ORDER: Language[] = ['SUB_ITA', 'DUB_ITA'];

export type OptimisticLibraryDelete =
  | { scope: 'episode'; episodeFileId: string }
  | { scope: 'entry'; animeId: string; language: Language }
  | { scope: 'series'; animeId: string; seriesIdHint?: string };

export interface LibraryCacheSnapshot {
  list: LibraryGroup[] | undefined;
  stats: LibraryStats | undefined;
}

export interface LibraryOptimisticStore {
  cancelList(): Promise<unknown>;
  cancelStats(): Promise<unknown>;
  getList(): LibraryGroup[] | undefined;
  getStats(): LibraryStats | undefined;
  setList(list: LibraryGroup[]): void;
  setStats(stats: LibraryStats): void;
  removeList(): void;
  removeStats(): void;
}

export interface LibraryOptimisticTransaction {
  snapshot: LibraryCacheSnapshot;
  release(): void;
}

function shouldRemoveEpisode(
  group: LibraryGroup,
  entry: LibraryEntry,
  episode: LibraryEpisode,
  target: OptimisticLibraryDelete,
): boolean {
  // Gli external appartengono all'utente: le mutation delete* non devono mai rimuoverli.
  if (episode.external) {
    return false;
  }

  if (target.scope === 'episode') {
    return episode.episodeFileId === target.episodeFileId;
  }
  if (target.scope === 'entry') {
    return entry.animeId === target.animeId && entry.language === target.language;
  }
  return (
    (target.seriesIdHint !== undefined && group.seriesId === target.seriesIdHint) ||
    group.entries.some((candidate) => candidate.animeId === target.animeId)
  );
}

function updateGroup(group: LibraryGroup, target: OptimisticLibraryDelete): LibraryGroup | null {
  let changed = false;
  const entries: LibraryEntry[] = [];

  for (const entry of group.entries) {
    const episodes = entry.episodes.filter(
      (episode) => !shouldRemoveEpisode(group, entry, episode, target),
    );
    if (episodes.length === entry.episodes.length) {
      entries.push(entry);
      continue;
    }

    changed = true;
    if (episodes.length > 0) {
      entries.push({ ...entry, episodes });
    }
  }

  if (!changed) {
    return group;
  }
  if (entries.length === 0) {
    return null;
  }

  let totalEpisodes = 0;
  let totalSizeBytes = 0;
  const presentLanguages = new Set<Language>();
  for (const entry of entries) {
    presentLanguages.add(entry.language);
    for (const episode of entry.episodes) {
      totalEpisodes += 1;
      totalSizeBytes += episode.fileSize ?? 0;
    }
  }

  return {
    ...group,
    entries,
    languages: LANGUAGE_ORDER.filter((language) => presentLanguages.has(language)),
    totalEpisodes,
    totalSizeBytes,
  };
}

/** Applica alla lista la stessa selezione delle mutation backend, senza mutare lo snapshot. */
export function applyOptimisticLibraryDelete(
  groups: LibraryGroup[],
  target: OptimisticLibraryDelete,
): LibraryGroup[] {
  let changed = false;
  const next: LibraryGroup[] = [];

  for (const group of groups) {
    const updated = updateGroup(group, target);
    if (updated !== group) {
      changed = true;
    }
    if (updated) {
      next.push(updated);
    }
  }

  return changed ? next : groups;
}

/** Replica LibraryService.stats() sui gruppi già trasformati. */
export function libraryStatsFromGroups(groups: LibraryGroup[]): LibraryStats {
  let totalEpisodes = 0;
  let totalSizeBytes = 0;
  const animeIds = new Set<string>();

  for (const group of groups) {
    for (const entry of group.entries) {
      animeIds.add(entry.animeId);
      for (const episode of entry.episodes) {
        totalEpisodes += 1;
        totalSizeBytes += episode.fileSize ?? 0;
      }
    }
  }

  return {
    totalEpisodes,
    totalSizeBytes,
    totalSeries: animeIds.size,
  };
}

/** Esegue la fase onMutate: cancella i refetch, salva lo snapshot e pubblica i dati ottimistici. */
export async function beginOptimisticLibraryDelete(
  store: LibraryOptimisticStore,
  target: OptimisticLibraryDelete,
): Promise<LibraryCacheSnapshot> {
  await Promise.all([store.cancelList(), store.cancelStats()]);

  const snapshot = { list: store.getList(), stats: store.getStats() };
  if (snapshot.list !== undefined) {
    const next = applyOptimisticLibraryDelete(snapshot.list, target);
    store.setList(next);
    if (snapshot.stats !== undefined) {
      store.setStats(libraryStatsFromGroups(next));
    }
  }
  return snapshot;
}

/** Esegue la fase onError ripristinando anche la reale assenza iniziale delle query. */
export function rollbackOptimisticLibraryDelete(
  store: LibraryOptimisticStore,
  snapshot: LibraryCacheSnapshot | undefined,
): void {
  if (!snapshot) {
    return;
  }

  if (snapshot.list === undefined) {
    store.removeList();
  } else {
    store.setList(snapshot.list);
  }
  if (snapshot.stats === undefined) {
    store.removeStats();
  } else {
    store.setStats(snapshot.stats);
  }
}

/**
 * Serializza l'intero ciclo di vita delle delete ottimistiche. Gli snapshot completi non possono
 * così sovrascrivere il risultato di una seconda mutation avviata da un'altra card/hook.
 */
export class LibraryOptimisticDeleteSerializer {
  private tail: Promise<void> = Promise.resolve();

  async begin(
    store: LibraryOptimisticStore,
    target: OptimisticLibraryDelete,
  ): Promise<LibraryOptimisticTransaction> {
    const predecessor = this.tail;
    let unlock!: () => void;
    const gate = new Promise<void>((resolve) => {
      unlock = resolve;
    });
    this.tail = predecessor.then(() => gate);
    await predecessor;

    let released = false;
    const release = () => {
      if (!released) {
        released = true;
        unlock();
      }
    };

    try {
      return {
        snapshot: await beginOptimisticLibraryDelete(store, target),
        release,
      };
    } catch (error) {
      release();
      throw error;
    }
  }
}

export function countManagedEpisodes(group: LibraryGroup): number {
  return group.entries.reduce(
    (total, entry) => total + entry.episodes.filter((episode) => !episode.external).length,
    0,
  );
}

export function countExternalEpisodes(group: LibraryGroup): number {
  return group.entries.reduce(
    (total, entry) => total + entry.episodes.filter((episode) => episode.external).length,
    0,
  );
}
