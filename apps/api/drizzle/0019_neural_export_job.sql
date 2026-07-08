CREATE TABLE `neural_export_job` (
	`id` text PRIMARY KEY NOT NULL,
	`episode_file_id` text NOT NULL,
	`quality` text NOT NULL,
	`state` text DEFAULT 'queued' NOT NULL,
	`worker_job_id` text,
	`progress` real DEFAULT 0,
	`error` text,
	`output_path` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`episode_file_id`) REFERENCES `episode_file`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_neural_export_episode_file` ON `neural_export_job` (`episode_file_id`);--> statement-breakpoint
CREATE INDEX `idx_neural_export_state` ON `neural_export_job` (`state`);
