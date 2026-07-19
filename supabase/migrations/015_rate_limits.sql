-- Durable, free-tier-compatible API rate limiting for Vercel serverless.
create table if not exists public.api_rate_limits (
  bucket text not null,
  subject uuid not null,
  window_start timestamptz not null,
  request_count integer not null default 1 check (request_count > 0),
  primary key (bucket, subject, window_start)
);

alter table public.api_rate_limits enable row level security;

create or replace function public.consume_api_rate_limit(
  p_bucket text,
  p_subject uuid,
  p_limit integer,
  p_window_seconds integer
)
returns table(allowed boolean, retry_after_seconds integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_window timestamptz;
  v_count integer;
begin
  if p_bucket is null or length(p_bucket) > 80 or p_limit < 1 or p_window_seconds < 1 then
    raise exception 'invalid rate-limit parameters';
  end if;

  v_window := to_timestamp(floor(extract(epoch from v_now) / p_window_seconds) * p_window_seconds);

  insert into public.api_rate_limits(bucket, subject, window_start, request_count)
  values (p_bucket, p_subject, v_window, 1)
  on conflict (bucket, subject, window_start)
  do update set request_count = public.api_rate_limits.request_count + 1
  returning request_count into v_count;

  delete from public.api_rate_limits
  where window_start < v_now - make_interval(secs => greatest(p_window_seconds * 2, 3600));

  return query select
    v_count <= p_limit,
    case when v_count <= p_limit then 0
      else greatest(1, ceil(extract(epoch from (v_window + make_interval(secs => p_window_seconds) - v_now)))::integer)
    end;
end;
$$;

revoke all on table public.api_rate_limits from public, anon, authenticated;
revoke all on function public.consume_api_rate_limit(text, uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_api_rate_limit(text, uuid, integer, integer) to service_role;
