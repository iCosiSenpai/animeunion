import { describe, expect, it } from 'vitest';
import { createMockSource } from './mock-source';

describe('MockSource', () => {
  const source = createMockSource();

  it('espone almeno 50 anime e 25 generi', async () => {
    const catalog = await source.searchAnime('', 1);
    const genres = await source.getGenres();
    expect(catalog.meta.total).toBeGreaterThanOrEqual(50);
    expect(genres.length).toBeGreaterThanOrEqual(25);
  });

  it('restituisce dati identici tra due chiamate (deterministico)', async () => {
    const first = await source.getAnimeBySlug('edens-zero');
    const second = await source.getAnimeBySlug('edens-zero');
    expect(second).toEqual(first);
  });

  it('searchAnime filtra per titolo', async () => {
    const result = await source.searchAnime('frieren');
    expect(result.data.length).toBeGreaterThan(0);
    for (const anime of result.data) {
      const haystack = `${anime.title} ${anime.titleIta ?? ''}`.toLowerCase();
      expect(haystack).toContain('frieren');
    }
  });

  it('ogni anime ha episodi coerenti con availableLanguages', async () => {
    const detail = await source.getAnimeBySlug('jujutsu-kaisen');
    const numbers = new Set(detail.episodes.map((episode) => episode.number));
    expect(numbers.size).toBe(detail.episodeCount);
    for (const episode of detail.episodes) {
      expect(detail.availableLanguages).toContain(episode.language);
    }
  });

  it('getEpisodeDetail fornisce un URL di download valido', async () => {
    const detail = await source.getAnimeBySlug('edens-zero');
    const first = detail.episodes[0];
    expect(first).toBeDefined();
    if (!first) {
      return;
    }
    const episode = await source.getEpisodeDetail(first.id);
    expect(() => new URL(episode.downloadUrl)).not.toThrow();
  });

  it('getStats conta anime ed episodi', async () => {
    const stats = await source.getStats();
    expect(stats.totalAnime).toBeGreaterThanOrEqual(50);
    expect(stats.totalEpisodes).toBeGreaterThan(250);
  });

  it('getAnimeBySlug lancia un errore per slug inesistente', async () => {
    await expect(source.getAnimeBySlug('non-esiste')).rejects.toThrow();
  });
});
