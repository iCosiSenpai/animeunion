UPDATE `follow` SET `auto_download_from_ep` = COALESCE(
  (SELECT MAX(e.`number`) FROM `episode` e
     WHERE e.`anime_id` = `follow`.`anime_id`
       AND (e.`air_date` IS NULL OR e.`air_date` <= `follow`.`updated_at`)), 0)
WHERE `auto_download_from_ep` IS NOT NULL;
