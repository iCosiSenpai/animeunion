ALTER TABLE `follow` ADD `auto_download_from_ep` integer;--> statement-breakpoint
UPDATE `follow` SET `auto_download_from_ep` = COALESCE(
  (SELECT MAX(e.`number`) FROM `episode` e
     JOIN `episode_file` ef ON ef.`episode_id` = e.`id`
   WHERE e.`anime_id` = `follow`.`anime_id`
     AND ef.`download_status` IN ('downloaded', 'external')), 0);
