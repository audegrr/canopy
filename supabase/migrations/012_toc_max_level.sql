-- Per-page setting: max heading level shown in the table of contents (1, 2, or 3)
ALTER TABLE pages ADD COLUMN IF NOT EXISTS toc_max_level SMALLINT DEFAULT NULL;
