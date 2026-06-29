CREATE VIRTUAL TABLE IF NOT EXISTS `anime_fts` USING fts5(
  anime_id UNINDEXED,
  title,
  title_ita,
  title_eng,
  title_jpn,
  tokenize = 'unicode61 remove_diacritics 2'
);
--> statement-breakpoint
INSERT INTO `anime_fts` (anime_id, title, title_ita, title_eng, title_jpn)
SELECT `id`, `title`, COALESCE(`title_ita`, ''), COALESCE(`title_eng`, ''), COALESCE(`title_jpn`, '')
FROM `anime`;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `anime_fts_ai` AFTER INSERT ON `anime` BEGIN
  INSERT INTO `anime_fts` (anime_id, title, title_ita, title_eng, title_jpn)
  VALUES (new.`id`, new.`title`, COALESCE(new.`title_ita`, ''), COALESCE(new.`title_eng`, ''), COALESCE(new.`title_jpn`, ''));
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `anime_fts_ad` AFTER DELETE ON `anime` BEGIN
  DELETE FROM `anime_fts` WHERE anime_id = old.`id`;
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `anime_fts_au` AFTER UPDATE ON `anime` BEGIN
  DELETE FROM `anime_fts` WHERE anime_id = old.`id`;
  INSERT INTO `anime_fts` (anime_id, title, title_ita, title_eng, title_jpn)
  VALUES (new.`id`, new.`title`, COALESCE(new.`title_ita`, ''), COALESCE(new.`title_eng`, ''), COALESCE(new.`title_jpn`, ''));
END;
