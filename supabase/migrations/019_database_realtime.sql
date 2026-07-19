-- Make database rows and fields observable by authorized clients. RLS still
-- controls which change events each subscriber may receive.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'db_records'
  ) then
    alter publication supabase_realtime add table public.db_records;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'db_fields'
  ) then
    alter publication supabase_realtime add table public.db_fields;
  end if;
end $$;
