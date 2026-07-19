-- Free-tier friendly maintenance: bounded history, opportunistic trash retention,
-- and richer search without a scheduled worker.
create or replace function public.prune_page_snapshots(p_page_id uuid, p_keep integer default 50)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.can_manage_page_as(auth.uid(), p_page_id) then raise insufficient_privilege; end if;
  if p_keep < 1 or p_keep > 50 then raise exception 'keep must be between 1 and 50'; end if;
  with old as (select id from public.page_snapshots where page_id = p_page_id order by created_at desc offset p_keep)
  delete from public.page_snapshots where id in (select id from old);
end; $$;

create or replace function public.purge_workspace_trash_as(p_user_id uuid, p_workspace_id uuid, p_retention_days integer default 30)
returns integer language plpgsql security definer set search_path = public as $$
declare v_deleted integer;
begin
  if p_retention_days < 7 or p_retention_days > 365 then raise exception 'invalid retention'; end if;
  if not public.can_edit_workspace_as(p_user_id, p_workspace_id) then raise insufficient_privilege; end if;
  delete from public.pages where workspace_id = p_workspace_id and deleted_at is not null
    and deleted_at < now() - make_interval(days => p_retention_days);
  get diagnostics v_deleted = row_count; return v_deleted;
end; $$;

create or replace function public.search_pages_advanced(ws_id uuid, q text, page_kind text default 'all', changed_after timestamptz default null)
returns table (id uuid, title text, icon text, is_database boolean, match_in text, snippet text, updated_at timestamptz, relevance real)
language sql security invoker stable set search_path = public as $$
  with query as (select websearch_to_tsquery('simple', left(trim(q), 200)) value), candidates as (
    select p.*, to_tsvector('simple', coalesce(p.title, '') || ' ' || coalesce(p.content::text, '')) document
    from public.pages p where p.workspace_id = ws_id and p.deleted_at is null
      and (page_kind = 'all' or (page_kind = 'database' and p.is_database) or (page_kind = 'page' and not p.is_database))
      and (changed_after is null or p.updated_at >= changed_after)
  )
  select c.id, c.title, c.icon, c.is_database,
    case when lower(c.title) like '%' || lower(trim(q)) || '%' then 'title' else 'content' end,
    case when lower(c.title) like '%' || lower(trim(q)) || '%' then '' else left(regexp_replace(coalesce(c.content::text, ''), '[{}"\[\],:]+', ' ', 'g'), 180) end,
    c.updated_at, (ts_rank(c.document, query.value) + case when lower(c.title) like '%' || lower(trim(q)) || '%' then 1 else 0 end)::real
  from candidates c cross join query where length(trim(q)) >= 2 and c.document @@ query.value
  order by 8 desc, c.updated_at desc limit 30;
$$;

revoke all on function public.prune_page_snapshots(uuid, integer) from public, anon;
grant execute on function public.prune_page_snapshots(uuid, integer) to authenticated;
revoke all on function public.purge_workspace_trash_as(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.purge_workspace_trash_as(uuid, uuid, integer) to service_role;
revoke all on function public.search_pages_advanced(uuid, text, text, timestamptz) from public, anon;
grant execute on function public.search_pages_advanced(uuid, text, text, timestamptz) to authenticated;
