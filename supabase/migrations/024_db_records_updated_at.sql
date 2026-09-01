-- db_records had no updated_at, so a cell edit could only ever blind-overwrite
-- the row's data column with whatever the client last knew locally — two
-- users editing the same record around the same time would silently clobber
-- each other with no way to detect it (unlike pages.content, which already
-- carries updated_at and a 3-way merge/conflict banner in PageView).
--
-- Set explicitly by the client on every write (see pages.updated_at), not by
-- a trigger, so DatabaseView can use it for compare-and-swap: send the
-- updated_at you last read back with your write, and a mismatch means
-- someone else changed the row first.

alter table public.db_records
  add column if not exists updated_at timestamptz not null default now();
