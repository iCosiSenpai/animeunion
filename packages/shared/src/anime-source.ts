import type {
  AnimeDetail,
  AnimeSummary,
  CalendarEntry,
  EpisodeDetail,
  Favorite,
  GenreDetail,
  HistoryItem,
  LatestEpisode,
  NewsItem,
  SiteStats,
  UserProfile,
  WatchlistItem,
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

  // Dati utente del sito (`/me/*`) — introdotti nella v1.0.3.
  getFavorites?(updatedSince?: string): Promise<Favorite[]>;
  addFavorite?(animeId: string): Promise<{ ok: boolean; alreadyExists: boolean }>;
  removeFavorite?(animeId: string): Promise<void>;
  getWatchlist?(updatedSince?: string): Promise<WatchlistItem[]>;
  getHistory?(updatedSince?: string): Promise<HistoryItem[]>;
  getMe?(): Promise<UserProfile>;

  // Home del sito.
  getLatestEpisodes?(limit?: number): Promise<LatestEpisode[]>;
  getFeatured?(): Promise<AnimeSummary[]>;
  getNews?(limit?: number): Promise<NewsItem[]>;
}
