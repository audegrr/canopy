-- push_subscriptions was unique per user_id, so subscribing from a second
-- device silently overwrote (and stopped delivering push to) the first.
-- Move uniqueness to (user_id, endpoint) so each device/browser keeps its
-- own row; endpoint is extracted from the stored subscription JSON, which
-- the Web Push spec guarantees is unique per registered device.

alter table push_subscriptions add column if not exists endpoint text
  generated always as (subscription->>'endpoint') stored;

-- Drop whatever the existing single-column unique constraint on user_id is
-- named (it predates the migrations folder, so the name isn't known here).
do $$
declare
  target_conname text;
begin
  select con.conname into target_conname
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  where rel.relname = 'push_subscriptions'
    and con.contype = 'u'
    and con.conkey = (
      select array_agg(attnum order by attnum)
      from pg_attribute
      where attrelid = rel.oid and attname = 'user_id'
    )::smallint[]
  limit 1;

  if target_conname is not null then
    execute format('alter table push_subscriptions drop constraint %I', target_conname);
  end if;
end $$;

alter table push_subscriptions
  add constraint push_subscriptions_user_id_endpoint_key unique (user_id, endpoint);
