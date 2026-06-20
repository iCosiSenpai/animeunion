CREATE TABLE `series_override` (
	`anime_id` text PRIMARY KEY NOT NULL,
	`series_anime_id` text,
	`season_number` integer,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`anime_id`) REFERENCES `anime`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`series_anime_id`) REFERENCES `anime`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
ALTER TABLE `download_queue` ADD `bytes_downloaded` integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE `download_queue` ADD `total_bytes` integer;--> statement-breakpoint
ALTER TABLE `download_queue` ADD `speed_bps` real;