import type {
  AnimeDetail,
  AnimeSummary,
  CalendarEntry,
  EpisodeDetail,
  GenreDetail,
  SiteStats,
} from './contracts';

export interface PaginatedResult<T> {
  data: T[];
  meta: {
    page: number;
    perPage: number;
    total: number;
    hasMore: boolean;
  };
}

export interface AnimeSource {
  readonly name: string;
  readonly baseUrl: string;

  searchAnime(query: string, page?: number): Promise<PaginatedResult<AnimeSummary>>;
  getAnimeBySlug(slug: string): Promise<AnimeDetail>;
  getSeasonalAnime(season: string, year: number): Promise<AnimeSummary[]>;
  getCalendar(): Promise<CalendarEntry[]>;
  getCalendarByDay(day: string): Promise<CalendarEntry>;
  getGenres(): Promise<GenreDetail[]>;

  getEpisodes(animeSlug: string): Promise<EpisodeDetail[]>;
  getEpisodeDetail?(episodeId: string): Promise<EpisodeDetail>;

  getStats(): Promise<SiteStats>;

  login?(
    email: string,
    password: string,
  ): Promise<{ token: string; refreshToken: string; user: unknown }>;
  refreshToken?(refreshToken: string): Promise<{ token: string; expiresIn: number }>;
}
