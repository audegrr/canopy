-- Store cover image position/zoom so users can reframe uploaded covers
ALTER TABLE pages ADD COLUMN IF NOT EXISTS cover_position TEXT DEFAULT NULL;
