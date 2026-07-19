-- Add anchor support to page_comments for inline (text-anchored) comments
ALTER TABLE page_comments ADD COLUMN IF NOT EXISTS anchor_id TEXT DEFAULT NULL;
