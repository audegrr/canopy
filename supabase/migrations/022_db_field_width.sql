-- Persist a manually-resized column width per field. Null means "no manual
-- width set" — the client auto-fits the column to the available space.
alter table db_fields add column if not exists width integer;
