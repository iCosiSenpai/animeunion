ALTER TABLE `download_queue` ADD `target_path` text;--> statement-breakpoint
ALTER TABLE `download_queue` ADD `expected_bytes` integer;--> statement-breakpoint
ALTER TABLE `download_queue` ADD `source_url` text;