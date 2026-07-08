import type {
  AnimeDetail,
  AnimeSource,
  AnimeSummary,
  CalendarEntry,
  EpisodeDetail,
  GenreDetail,
  NeuralExportRecipe,
  PaginatedResult,
  SiteStats,
} from '@animeunion/shared';
import { NotFoundError } from '../lib/errors';
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
      throw new NotFoundError(`Anime non trovato: ${slug}`);
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
        .map((anime) => ({ ...toSummary(anime), airTime: '17:30', episodeNumber: null })),
    }));
  }

  async getCalendarByDay(day: string): Promise<CalendarEntry> {
    const calendar = await this.getCalendar();
    const entry = calendar.find((item) => item.day === (day as WeekDay));
    if (!entry) {
      throw new NotFoundError(`Giorno non valido: ${day}`);
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
    throw new NotFoundError(`Episodio non trovato: ${episodeId}`);
  }

  async getStats(): Promise<SiteStats> {
    const totalEpisodes = animeDetails.reduce((sum, anime) => sum + anime.episodeCount, 0);
    return {
      totalAnime: animeDetails.length,
      totalEpisodes,
    };
  }

  async getNeuralExportProfile(): Promise<NeuralExportRecipe> {
    // Fixture di sviluppo/test: 2 profili + shader placeholder. Gli sha256 sono fittizi (il render
    // vero gira sul worker con la ricetta reale del server; qui basta uno shape valido).
    return {
      version: 1,
      requiredTiers: ['MEGA_FAN', 'ULTRA_FAN'],
      license: 'Anime4K shaders (c) bloc97 et al. — MIT',
      reference: 'ffmpeg -init_hw_device vulkan -i in.mp4 -vf "..." out.mp4',
      shaders: [
        {
          file: 'Anime4K_Restore_CNN_M.glsl',
          url: 'https://api.animeunion.tv/static/anime4k/Anime4K_Restore_CNN_M.glsl',
          sha256: '0'.repeat(64),
          sizeBytes: 35916,
        },
        {
          file: 'Anime4K_Upscale_CNN_x2_M.glsl',
          url: 'https://api.animeunion.tv/static/anime4k/Anime4K_Upscale_CNN_x2_M.glsl',
          sha256: '1'.repeat(64),
          sizeBytes: 40000,
        },
      ],
      profiles: [
        {
          id: 'xq',
          chain: ['Anime4K_Restore_CNN_M.glsl', 'Anime4K_Upscale_CNN_x2_M.glsl'],
          targetWidth: 1920,
          targetHeight: 1080,
          videoBitrate: '10M',
          videoCodec: 'libx264',
          audio: 'copy',
          faststart: true,
        },
        {
          id: 'xqplus',
          chain: [
            'Anime4K_Restore_CNN_M.glsl',
            'Anime4K_Upscale_CNN_x2_M.glsl',
            'Anime4K_Upscale_CNN_x2_M.glsl',
          ],
          targetWidth: 3840,
          targetHeight: 2160,
          videoBitrate: '35M',
          videoCodec: 'libx264',
          audio: 'copy',
          faststart: true,
        },
      ],
    };
  }
}

export function createMockSource(): MockSource {
  return new MockSource();
}
