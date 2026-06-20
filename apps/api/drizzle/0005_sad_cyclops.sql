CREATE TABLE `notification` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`body` text,
	`anime_id` text,
	`read` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_notification_read` ON `notification` (`read`);--> statement-breakpoint
CREATE INDEX `idx_notification_created` ON `notification` (`created_at`);