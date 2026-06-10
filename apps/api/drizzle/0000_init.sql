CREATE TABLE `anime` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`title_ita` text,
	`title_eng` text,
	`title_jpn` text,
	`synopsis` text,
	`synopsis_eng` text,
	`type` text NOT NULL,
	`status` text NOT NULL,
	`season` text,
	`season_year` integer,
	`episode_count` integer NOT NULL,
	`episode_duration` integer,
	`cover_image` text,
	`banner_image` text,
	`trailer_url` text,
	`studio` text,
	`source` text,
	`age_rating` text,
	`score` integer,
	`mal_id` integer,
	`anilist_id` integer,
	`series_id` text,
	`season_number` integer,
	`languages` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `anime_slug_unique` ON `anime` (`slug`);--> statement-breakpoint
CREATE INDEX `idx_anime_series` ON `anime` (`series_id`);--> statement-breakpoint
CREATE TABLE `anime_genre` (
	`anime_id` text NOT NULL,
	`genre_id` text NOT NULL,
	PRIMARY KEY(`anime_id`, `genre_id`),
	FOREIGN KEY (`anime_id`) REFERENCES `anime`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`genre_id`) REFERENCES `genre`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `auth` (
	`id` text PRIMARY KEY DEFAULT 'default' NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`token_expires` text,
	`user_email` text,
	`user_name` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `config` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `download_queue` (
	`id` text PRIMARY KEY NOT NULL,
	`episode_file_id` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`progress` real DEFAULT 0,
	`started_at` text,
	`completed_at` text,
	`error` text,
	`retry_count` integer DEFAULT 0,
	`retry_max` integer DEFAULT 3,
	`priority` integer DEFAULT 50,
	`created_at` text NOT NULL,
	FOREIGN KEY (`episode_file_id`) REFERENCES `episode_file`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_download_status` ON `download_queue` (`status`);--> statement-breakpoint
CREATE INDEX `idx_download_priority` ON `download_queue` ("priority" DESC);--> statement-breakpoint
CREATE TABLE `episode` (
	`id` text PRIMARY KEY NOT NULL,
	`anime_id` text NOT NULL,
	`number` integer NOT NULL,
	`title` text,
	`title_ita` text,
	`thumbnail` text,
	`duration` text,
	`air_date` text,
	`is_filler` integer DEFAULT 0,
	`languages` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`anime_id`) REFERENCES `anime`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_episode_anime` ON `episode` (`anime_id`);--> statement-breakpoint
CREATE INDEX `idx_episode_number` ON `episode` (`anime_id`,`number`);--> statement-breakpoint
CREATE TABLE `episode_file` (
	`id` text PRIMARY KEY NOT NULL,
	`episode_id` text NOT NULL,
	`language` text NOT NULL,
	`download_url` text,
	`url_expires_at` text,
	`download_status` text DEFAULT 'not_downloaded' NOT NULL,
	`local_path` text,
	`file_size` integer,
	`downloaded_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`episode_id`) REFERENCES `episode`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_episode_file_episode` ON `episode_file` (`episode_id`);--> statement-breakpoint
CREATE INDEX `idx_episode_file_status` ON `episode_file` (`download_status`);--> statement-breakpoint
CREATE UNIQUE INDEX `episode_file_episode_id_language_unique` ON `episode_file` (`episode_id`,`language`);--> statement-breakpoint
CREATE TABLE `follow` (
	`id` text PRIMARY KEY NOT NULL,
	`anime_id` text NOT NULL,
	`status` text DEFAULT 'plan_to_watch' NOT NULL,
	`notes` text,
	`added_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`last_check_at` text,
	FOREIGN KEY (`anime_id`) REFERENCES `anime`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_follow_anime` ON `follow` (`anime_id`);--> statement-breakpoint
CREATE INDEX `idx_follow_status` ON `follow` (`status`);--> statement-breakpoint
CREATE TABLE `genre` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`name_eng` text,
	`mal_id` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `genre_slug_unique` ON `genre` (`slug`);--> statement-breakpoint
CREATE TABLE `stats` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` text NOT NULL
);
