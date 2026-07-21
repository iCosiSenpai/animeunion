import type { LibraryEpisode, LibraryGroup, LibraryStats } from '@animeunion/shared';
import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import {
  LibraryOptimisticDeleteSerializer,
  type LibraryOptimisticStore,
  applyOptimisticLibraryDelete,
  beginOptimisticLibraryDelete,
  countExternalEpisodes,
  countManagedEpisodes,
  libraryStatsFromGroups,
  rollbackOptimisticLibraryDelete,
} from './library-optimistic';

const LIST_QUERY_KEY = [['library', 'list'], { type: 'query' }] as const;
const STATS_QUERY_KEY = [['library', 'stats'], { type: 'query' }] as const;

function episode(episodeFileId: string, fileSize: number, external = false): LibraryEpisode {
  return {
    episodeFileId,
    episodeId: `episode-${episodeFileId}`,
    episodeNumber: Number(episodeFileId.at(-1) ?? 1),
    episodeTitle: null,
    localPath: `/library/${episodeFileId}.mkv`,
    fileSize,
    downloadedAt: '2026-07-20T12:00:00.000Z',
    language: episodeFileId.includes('dub') ? 'DUB_ITA' : 'SUB_ITA',
    external,
  };
}

function library(): LibraryGroup[] {
  return [
    {
      seriesId: 'saga',
      category: 'tv',
      anime: {
        id: 'anime-a',
        slug: 'anime-a',
        title: 'Anime A',
        titleIta: null,
        coverImage: null,
        type: 'TV',
        status: 'ONGOING',
        season: null,
        seasonYear: 2026,
        score: null,
        genres: [],
        availableLanguages: ['SUB_ITA', 'DUB_ITA'],
        seriesId: 'saga',
        seasonNumber: 1,
      },
      languages: ['SUB_ITA', 'DUB_ITA'],
      totalEpisodes: 4,
      totalSizeBytes: 100,
      entries: [
        {
          animeId: 'anime-a',
          seasonNumber: 1,
          language: 'SUB_ITA',
          episodes: [episode('sub-1', 10), episode('external-2', 20, true)],
        },
        {
          animeId: 'anime-a',
          seasonNumber: 1,
          language: 'DUB_ITA',
          episodes: [episode('dub-3', 30)],
        },
        {
          animeId: 'anime-b',
          seasonNumber: 2,
          language: 'SUB_ITA',
          episodes: [episode('sub-4', 40)],
        },
      ],
    },
  ];
}

function queryClientStore(queryClient: QueryClient): LibraryOptimisticStore {
  return {
    cancelList: () => queryClient.cancelQueries({ queryKey: LIST_QUERY_KEY, exact: true }),
    cancelStats: () => queryClient.cancelQueries({ queryKey: STATS_QUERY_KEY, exact: true }),
    getList: () => queryClient.getQueryData<LibraryGroup[]>(LIST_QUERY_KEY),
    getStats: () => queryClient.getQueryData<LibraryStats>(STATS_QUERY_KEY),
    setList: (list) => queryClient.setQueryData(LIST_QUERY_KEY, list),
    setStats: (stats) => queryClient.setQueryData(STATS_QUERY_KEY, stats),
    removeList: () => queryClient.removeQueries({ queryKey: LIST_QUERY_KEY, exact: true }),
    removeStats: () => queryClient.removeQueries({ queryKey: STATS_QUERY_KEY, exact: true }),
  };
}

function memoryStore(
  initialList: LibraryGroup[],
  initialStats: LibraryStats,
): {
  store: LibraryOptimisticStore;
  getList(): LibraryGroup[] | undefined;
  getStats(): LibraryStats | undefined;
} {
  let currentList: LibraryGroup[] | undefined = initialList;
  let currentStats: LibraryStats | undefined = initialStats;
  return {
    store: {
      cancelList: () => Promise.resolve(),
      cancelStats: () => Promise.resolve(),
      getList: () => currentList,
      getStats: () => currentStats,
      setList: (list) => {
        currentList = list;
      },
      setStats: (stats) => {
        currentStats = stats;
      },
      removeList: () => {
        currentList = undefined;
      },
      removeStats: () => {
        currentStats = undefined;
      },
    },
    getList: () => currentList,
    getStats: () => currentStats,
  };
}

describe('applyOptimisticLibraryDelete', () => {
  it('rimuove subito un episodio, ricalcola i totali e non muta lo snapshot di rollback', () => {
    const snapshot = library();
    const next = applyOptimisticLibraryDelete(snapshot, {
      scope: 'episode',
      episodeFileId: 'sub-1',
    });

    expect(next).not.toBe(snapshot);
    expect(next[0]?.entries[0]?.episodes.map((item) => item.episodeFileId)).toEqual(['external-2']);
    expect(next[0]?.totalEpisodes).toBe(3);
    expect(next[0]?.totalSizeBytes).toBe(90);
    expect(libraryStatsFromGroups(next)).toEqual({
      totalEpisodes: 3,
      totalSizeBytes: 90,
      totalSeries: 2,
    });
    expect(snapshot[0]?.entries[0]?.episodes.map((item) => item.episodeFileId)).toEqual([
      'sub-1',
      'external-2',
    ]);
  });

  it('pubblica il successo ottimistico e ripristina ordine e statistiche sul percorso errore', async () => {
    const initialList = library();
    const initialStats = libraryStatsFromGroups(initialList);
    const state = memoryStore(initialList, initialStats);
    const cancelled: string[] = [];
    const store: LibraryOptimisticStore = {
      ...state.store,
      cancelList: () => {
        cancelled.push('list');
        return Promise.resolve();
      },
      cancelStats: () => {
        cancelled.push('stats');
        return Promise.resolve();
      },
    };

    const snapshot = await beginOptimisticLibraryDelete(store, {
      scope: 'episode',
      episodeFileId: 'sub-1',
    });

    expect(cancelled).toEqual(['list', 'stats']);
    expect(state.getList()?.[0]?.entries[0]?.episodes.map((item) => item.episodeFileId)).toEqual([
      'external-2',
    ]);
    expect(state.getStats()).toEqual({ totalEpisodes: 3, totalSizeBytes: 90, totalSeries: 2 });

    rollbackOptimisticLibraryDelete(store, snapshot);
    expect(state.getList()).toBe(initialList);
    expect(state.getStats()).toBe(initialStats);
    expect(state.getList()?.[0]?.entries[0]?.episodes.map((item) => item.episodeFileId)).toEqual([
      'sub-1',
      'external-2',
    ]);
  });

  it('rimuove davvero con QueryClient le query inizialmente assenti dopo popolazioni concorrenti', async () => {
    const queryClient = new QueryClient();
    const store = queryClientStore(queryClient);
    const initialList = library();

    queryClient.setQueryData(LIST_QUERY_KEY, initialList);
    const snapshotWithAbsentStats = await beginOptimisticLibraryDelete(store, {
      scope: 'episode',
      episodeFileId: 'sub-1',
    });
    expect(snapshotWithAbsentStats.stats).toBeUndefined();

    queryClient.setQueryData<LibraryStats>(STATS_QUERY_KEY, {
      totalEpisodes: 99,
      totalSizeBytes: 99,
      totalSeries: 99,
    });
    rollbackOptimisticLibraryDelete(store, snapshotWithAbsentStats);
    expect(queryClient.getQueryData(LIST_QUERY_KEY)).toStrictEqual(initialList);
    expect(queryClient.getQueryState(STATS_QUERY_KEY)).toBeUndefined();

    queryClient.clear();
    const fullyAbsentSnapshot = await beginOptimisticLibraryDelete(store, {
      scope: 'episode',
      episodeFileId: 'sub-1',
    });
    expect(fullyAbsentSnapshot).toEqual({ list: undefined, stats: undefined });

    queryClient.setQueryData(LIST_QUERY_KEY, library());
    queryClient.setQueryData(STATS_QUERY_KEY, libraryStatsFromGroups(library()));
    rollbackOptimisticLibraryDelete(store, fullyAbsentSnapshot);
    expect(queryClient.getQueryState(LIST_QUERY_KEY)).toBeUndefined();
    expect(queryClient.getQueryState(STATS_QUERY_KEY)).toBeUndefined();
  });

  it('serializza delete richieste da card diverse e rende componibili due rollback', async () => {
    const initialList = library();
    const initialStats = libraryStatsFromGroups(initialList);
    const state = memoryStore(initialList, initialStats);
    const serializer = new LibraryOptimisticDeleteSerializer();

    const first = await serializer.begin(state.store, {
      scope: 'episode',
      episodeFileId: 'sub-1',
    });
    let secondStarted = false;
    const secondPending = serializer
      .begin(state.store, { scope: 'episode', episodeFileId: 'dub-3' })
      .then((transaction) => {
        secondStarted = true;
        return transaction;
      });

    await Promise.resolve();
    expect(secondStarted).toBe(false);
    expect(
      state
        .getList()?.[0]
        ?.entries.flatMap((entry) => entry.episodes.map((item) => item.episodeFileId)),
    ).toEqual(['external-2', 'dub-3', 'sub-4']);

    rollbackOptimisticLibraryDelete(state.store, first.snapshot);
    first.release();
    const second = await secondPending;
    expect(
      state
        .getList()?.[0]
        ?.entries.flatMap((entry) => entry.episodes.map((item) => item.episodeFileId)),
    ).toEqual(['sub-1', 'external-2', 'sub-4']);

    rollbackOptimisticLibraryDelete(state.store, second.snapshot);
    second.release();
    expect(state.getList()).toBe(initialList);
    expect(state.getStats()).toBe(initialStats);
  });

  it('rimuove solo i download dell’entry richiesta e conserva gli external nella posizione originale', () => {
    const next = applyOptimisticLibraryDelete(library(), {
      scope: 'entry',
      animeId: 'anime-a',
      language: 'SUB_ITA',
    });

    expect(
      next[0]?.entries.map((entry) => entry.episodes.map((item) => item.episodeFileId)),
    ).toEqual([['external-2'], ['dub-3'], ['sub-4']]);
    expect(next[0]?.languages).toEqual(['SUB_ITA', 'DUB_ITA']);
  });

  it('rimuove i download dell’intera serie ma lascia intatti i file external', () => {
    const next = applyOptimisticLibraryDelete(library(), {
      scope: 'series',
      animeId: 'anime-b',
    });

    expect(next).toHaveLength(1);
    expect(next[0]?.entries).toHaveLength(1);
    expect(next[0]?.entries[0]?.episodes[0]?.episodeFileId).toBe('external-2');
    expect(next[0]?.languages).toEqual(['SUB_ITA']);
    expect(libraryStatsFromGroups(next)).toEqual({
      totalEpisodes: 1,
      totalSizeBytes: 20,
      totalSeries: 1,
    });
    expect(countManagedEpisodes(next[0] as LibraryGroup)).toBe(0);
    expect(countExternalEpisodes(next[0] as LibraryGroup)).toBe(1);
  });

  it('senza seriesIdHint non rimuove un gruppo estraneo con identità API coincidente', () => {
    const target = library()[0] as LibraryGroup;
    const unrelated: LibraryGroup = {
      ...target,
      seriesId: 'raw-api-series',
      anime: { ...target.anime, id: 'unrelated-anime', seriesId: 'raw-api-series' },
      entries: [
        {
          animeId: 'unrelated-anime',
          seasonNumber: 1,
          language: 'SUB_ITA',
          episodes: [episode('unrelated-9', 9)],
        },
      ],
      languages: ['SUB_ITA'],
      totalEpisodes: 1,
      totalSizeBytes: 9,
    };

    const next = applyOptimisticLibraryDelete([target, unrelated], {
      scope: 'series',
      animeId: 'anime-a',
    });

    expect(next).toHaveLength(2);
    expect(next[1]).toBe(unrelated);
    expect(next[1]?.entries[0]?.episodes[0]?.episodeFileId).toBe('unrelated-9');
  });

  it('rimuove la card vuota e conserva il riferimento se il target non esiste', () => {
    const onlyManaged = library();
    const group = onlyManaged[0] as LibraryGroup;
    group.entries[0] = {
      ...(group.entries[0] as LibraryGroup['entries'][number]),
      episodes: [episode('sub-1', 10)],
    };
    group.totalEpisodes = 3;
    group.totalSizeBytes = 80;

    expect(
      applyOptimisticLibraryDelete(onlyManaged, {
        scope: 'series',
        animeId: 'anime-a',
        seriesIdHint: 'saga',
      }),
    ).toEqual([]);
    expect(
      applyOptimisticLibraryDelete(onlyManaged, {
        scope: 'series',
        animeId: 'anime-non-in-cache',
      }),
    ).toBe(onlyManaged);
    expect(
      applyOptimisticLibraryDelete(onlyManaged, {
        scope: 'episode',
        episodeFileId: 'missing',
      }),
    ).toBe(onlyManaged);
  });
});
