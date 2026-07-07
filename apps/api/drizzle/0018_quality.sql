ALTER TABLE `episode_file` ADD `quality` text DEFAULT 'SD' NOT NULL;--> statement-breakpoint
DROP INDEX `episode_file_episode_id_language_unique`;--> statement-breakpoint
CREATE UNIQUE INDEX `episode_file_episode_id_language_quality_unique` ON `episode_file` (`episode_id`,`language`,`quality`);
