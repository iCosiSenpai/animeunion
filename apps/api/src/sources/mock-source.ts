import type {
  AnimeDetail,
  AnimeSource,
  AnimeSummary,
  CalendarEntry,
  EpisodeDetail,
  GenreDetail,
  PaginatedResult,
  SiteStats,
} from '@animeunion/shared';
import { animeDetails, downloadUrlFor, genres, toSummary } from './mock-data';

const PER_PAGE = 24;

const WEEK_DAYS = [
  'LUNEDI',
  'MARTEDI',
  'MERCOLEDI',
  'GIOVEDI',
  'VENERDI',
  'SABATO',
  'DOMENICA',
] as const;
type WeekDay = (typeof WEEK_DAYS)[number];

function paginate(items: AnimeSummary[], page: number): PaginatedResult<AnimeSummary> {
  const safePage = page < 1 ? 1 : page;
  const start = (safePage - 1) * PER_PAGE;
  const slice = items.slice(start, start + PER_PAGE);
  return {
    data: slice,
    meta: {
      page: safePage,
      perPage: PER_PAGE,
      total: items.length,
      hasMore: start + PER_PAGE < items.length,
    },
  };
}

export class MockSource implements AnimeSource {
  readonly name = 'mock';
  readonly baseUrl = 'mock://animeunion';

  async searchAnime(query: string, page = 1): Promise<PaginatedResult<AnimeSummary>> {
    const needle = query.trim().toLowerCase();
    const matches = animeDetails
      .filter((anime) => {
        if (needle.length === 0) {
          return true;
        }
        return (
          anime.title.toLowerCase().includes(needle) ||
          (anime.titleIta?.toLowerCase().includes(needle) ?? false)
        );
      })
      .map(toSummary);
    return paginate(matches, page);
  }

  async getAnimeBySlug(slug: string): Promise<AnimeDetail> {
    const anime = animeDetails.find((entry) => entry.slug === slug);
    if (!anime) {
      throw new Error(`Anime non trovato: ${slug}`);
    }
    return anime;
  }

  async getSeasonalAnime(season: string, year: number): Promise<AnimeSummary[]> {
    return animeDetails
      .filter((anime) => anime.season === season && anime.seasonYear === year)
      .map(toSummary);
  }

  async getCalendar(): Promise<CalendarEntry[]> {
    const ongoing = animeDetails.filter((anime) => anime.status === 'ONGOING');
    return WEEK_DAYS.map((day, index) => ({
      day,
      date: `2026-06-${String(8 + index).padStart(2, '0')}`,
      anime: ongoing
        .filter((_, animeIndex) => animeIndex % WEEK_DAYS.length === index)
        .map(toSummary),
    }));
  }

  async getCalendarByDay(day: string): Promise<CalendarEntry> {
    const calendar = await this.getCalendar();
    const entry = calendar.find((item) => item.day === (day as WeekDay));
    if (!entry) {
      throw new Error(`Giorno non valido: ${day}`);
    }
    return entry;
  }

  async getGenres(): Promise<GenreDetail[]> {
    return genres;
  }

  async getEpisodes(animeSlug: string): Promise<EpisodeDetail[]> {
    const anime = await this.getAnimeBySlug(animeSlug);
    return anime.episodes.map((episode) => ({
      ...episode,
      downloadUrl: downloadUrlFor(episode.id),
      expiresAt: null,
    }));
  }

  async getEpisodeDetail(episodeId: string): Promise<EpisodeDetail> {
    for (const anime of animeDetails) {
      const episode = anime.episodes.find((entry) => entry.id === episodeId);
      if (episode) {
        return {
          ...episode,
          downloadUrl: downloadUrlFor(episode.id),
          expiresAt: null,
        };
      }
    }
    throw new Error(`Episodio non trovato: ${episodeId}`);
  }

  async getStats(): Promise<SiteStats> {
    const totalEpisodes = animeDetails.reduce((sum, anime) => sum + anime.episodeCount, 0);
    return {
      totalAnime: animeDetails.length,
      totalEpisodes,
    };
  }
}

export function createMockSource(): MockSource {
  return new MockSource();
}
