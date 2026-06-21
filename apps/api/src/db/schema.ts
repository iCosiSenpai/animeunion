import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  unique,
} from 'drizzle-orm/sqlite-core';

export const anime = sqliteTable(
  'anime',
  {
    id: text('id').primaryKey(),
    slug: text('slug').notNull().unique(),
    title: text('title').notNull(),
    titleIta: text('title_ita'),
    titleEng: text('title_eng'),
    titleJpn: text('title_jpn'),
    synopsis: text('synopsis'),
    synopsisEng: text('synopsis_eng'),
    type: text('type').notNull(),
    status: text('status').notNull(),
    season: text('season'),
    seasonYear: integer('season_year'),
    episodeCount: integer('episode_count').notNull(),
    episodeDuration: integer('episode_duration'),
    coverImage: text('cover_image'),
    bannerImage: text('banner_image'),
    trailerUrl: text('trailer_url'),
    studio: text('studio'),
    source: text('source'),
    ageRating: text('age_rating'),
    score: integer('score'),
    malId: integer('mal_id'),
    anilistId: integer('anilist_id'),
    seriesId: text('series_id'),
    seasonNumber: integer('season_number'),
    languages: text('languages'),
    // JSON di AnimeSummary[] dei consigliati, persistito col dettaglio per sopravvivere alla cache.
    recommendations: text('recommendations'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [index('idx_anime_series').on(table.seriesId)],
);

export const genre = sqliteTable('genre', {
  id: text('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  nameEng: text('name_eng'),
  malId: integer('mal_id'),
});

export const animeGenre = sqliteTable(
  'anime_genre',
  {
    animeId: text('anime_id')
      .notNull()
      .references(() => anime.id, { onDelete: 'cascade' }),
    genreId: text('genre_id')
      .notNull()
      .references(() => genre.id, { onDelete: 'cascade' }),
  },
  (table) => [primaryKey({ columns: [table.animeId, table.genreId] })],
);

export const animeRelation = sqliteTable(
  'anime_relation',
  {
    animeId: text('anime_id')
      .notNull()
      .references(() => anime.id, { onDelete: 'cascade' }),
    relatedAnimeId: text('related_anime_id')
      .notNull()
      .references(() => anime.id, { onDelete: 'cascade' }),
    relationType: text('relation_type').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.animeId, table.relatedAnimeId, table.relationType] }),
    index('idx_anime_relation_anime').on(table.animeId),
    index('idx_anime_relation_related').on(table.relatedAnimeId),
  ],
);

export const episode = sqliteTable(
  'episode',
  {
    id: text('id').primaryKey(),
    animeId: text('anime_id')
      .notNull()
      .references(() => anime.id, { onDelete: 'cascade' }),
    number: integer('number').notNull(),
    title: text('title'),
    titleIta: text('title_ita'),
    thumbnail: text('thumbnail'),
    duration: text('duration'),
    airDate: text('air_date'),
    isFiller: integer('is_filler').default(0),
    languages: text('languages'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('idx_episode_anime').on(table.animeId),
    index('idx_episode_number').on(table.animeId, table.number),
  ],
);

export const episodeFile = sqliteTable(
  'episode_file',
  {
    id: text('id').primaryKey(),
    episodeId: text('episode_id')
      .notNull()
      .references(() => episode.id, { onDelete: 'cascade' }),
    language: text('language').notNull(),
    downloadUrl: text('download_url'),
    urlExpiresAt: text('url_expires_at'),
    downloadStatus: text('download_status').notNull().default('not_downloaded'),
    localPath: text('local_path'),
    fileSize: integer('file_size'),
    downloadedAt: text('downloaded_at'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    unique().on(table.episodeId, table.language),
    index('idx_episode_file_episode').on(table.episodeId),
    index('idx_episode_file_status').on(table.downloadStatus),
  ],
);

export const follow = sqliteTable(
  'follow',
  {
    id: text('id').primaryKey(),
    animeId: text('anime_id')
      .notNull()
      .references(() => anime.id, { onDelete: 'cascade' }),
    status: text('status').notNull().default('plan_to_watch'),
    notes: text('notes'),
    // null = comportamento di default in base allo stato (watching = on). 0/1 = scelta esplicita.
    autoDownload: integer('auto_download'),
    addedAt: text('added_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    lastCheckAt: text('last_check_at'),
    // JSON degli id delle relazioni già viste (per rilevare nuove stagioni). null = mai scansionato.
    knownRelationIds: text('known_relation_ids'),
  },
  (table) => [
    index('idx_follow_anime').on(table.animeId),
    index('idx_follow_status').on(table.status),
  ],
);

export const downloadQueue = sqliteTable(
  'download_queue',
  {
    id: text('id').primaryKey(),
    episodeFileId: text('episode_file_id')
      .notNull()
      .references(() => episodeFile.id, { onDelete: 'cascade' }),
    status: text('status').notNull().default('queued'),
    progress: real('progress').default(0),
    startedAt: text('started_at'),
    completedAt: text('completed_at'),
    error: text('error'),
    retryCount: integer('retry_count').default(0),
    retryMax: integer('retry_max').default(3),
    priority: integer('priority').default(50),
    bytesDownloaded: integer('bytes_downloaded').default(0),
    totalBytes: integer('total_bytes'),
    speedBps: real('speed_bps'),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    index('idx_download_status').on(table.status),
    index('idx_download_priority').on(sql`${table.priority} DESC`),
  ],
);

// Override manuale di stagione/serie: l'utente corregge il rilevamento quando
// l'API non collega un sequel alla serie madre (vedi series-resolver).
export const seriesOverride = sqliteTable('series_override', {
  animeId: text('anime_id')
    .primaryKey()
    .references(() => anime.id, { onDelete: 'cascade' }),
  seriesAnimeId: text('series_anime_id').references(() => anime.id, { onDelete: 'set null' }),
  seasonNumber: integer('season_number'),
  updatedAt: text('updated_at').notNull(),
});

export const notification = sqliteTable(
  'notification',
  {
    id: text('id').primaryKey(),
    type: text('type').notNull(),
    title: text('title').notNull(),
    body: text('body'),
    animeId: text('anime_id'),
    read: integer('read').notNull().default(0),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    index('idx_notification_read').on(table.read),
    index('idx_notification_created').on(table.createdAt),
  ],
);

export const config = sqliteTable('config', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const stats = sqliteTable('stats', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const pushSubscription = sqliteTable('push_subscription', {
  endpoint: text('endpoint').primaryKey(),
  p256dh: text('p256dh').notNull(),
  auth: text('auth').notNull(),
  createdAt: text('created_at').notNull(),
});

export const auth = sqliteTable('auth', {
  id: text('id').primaryKey().default('default'),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  tokenExpires: text('token_expires'),
  userEmail: text('user_email'),
  userName: text('user_name'),
  password: text('password'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const schema = {
  anime,
  genre,
  animeGenre,
  animeRelation,
  episode,
  episodeFile,
  follow,
  downloadQueue,
  seriesOverride,
  notification,
  config,
  stats,
  auth,
  pushSubscription,
};
