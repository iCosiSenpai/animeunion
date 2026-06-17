CREATE TABLE `anime_relation` (
	`anime_id` text NOT NULL,
	`related_anime_id` text NOT NULL,
	`relation_type` text NOT NULL,
	PRIMARY KEY(`anime_id`, `related_anime_id`, `relation_type`),
	FOREIGN KEY (`anime_id`) REFERENCES `anime`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`related_anime_id`) REFERENCES `anime`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_anime_relation_anime` ON `anime_relation` (`anime_id`);--> statement-breakpoint
CREATE INDEX `idx_anime_relation_related` ON `anime_relation` (`related_anime_id`);