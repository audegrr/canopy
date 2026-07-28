


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE OR REPLACE FUNCTION "public"."add_document_share"("doc_id" "uuid", "perm" "text") RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  insert into public.document_shares (document_id, user_id, permission)
  values (doc_id, auth.uid(), perm)
  on conflict (document_id, user_id) do update set permission = excluded.permission;
$$;


ALTER FUNCTION "public"."add_document_share"("doc_id" "uuid", "perm" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."add_page_share"("p_id" "uuid", "perm" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_link_permission text;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  select link_permission into v_link_permission
  from public.pages
  where id = p_id and deleted_at is null;

  if v_link_permission is null or v_link_permission not in ('view', 'edit') then
    raise exception 'link sharing is not enabled for this page';
  end if;

  insert into public.page_shares (page_id, user_id, permission)
  values (p_id, auth.uid(), v_link_permission)
  on conflict (page_id, user_id) do update
    set permission = excluded.permission
    where public.page_shares.permission <> 'owner';
end;
$$;


ALTER FUNCTION "public"."add_page_share"("p_id" "uuid", "perm" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_edit_workspace_as"("p_user_id" "uuid", "p_workspace_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select
    exists (select 1 from public.workspaces w where w.id = p_workspace_id and w.owner_id = p_user_id)
    or exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = p_workspace_id and wm.user_id = p_user_id and wm.role in ('owner', 'member')
    );
$$;


ALTER FUNCTION "public"."can_edit_workspace_as"("p_user_id" "uuid", "p_workspace_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_manage_page_as"("p_user_id" "uuid", "p_page_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.pages p
    where p.id = p_page_id
      and (
        p.owner_id = p_user_id
        or exists (select 1 from public.workspaces w where w.id = p.workspace_id and w.owner_id = p_user_id)
        or exists (
          select 1 from public.workspace_members wm
          where wm.workspace_id = p.workspace_id and wm.user_id = p_user_id and wm.role = 'owner'
        )
        or exists (
          select 1 from public.page_shares ps
          where ps.page_id = p.id and ps.user_id = p_user_id and ps.permission = 'owner'
        )
      )
  );
$$;


ALTER FUNCTION "public"."can_manage_page_as"("p_user_id" "uuid", "p_page_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."consume_api_rate_limit"("p_bucket" "text", "p_subject" "uuid", "p_limit" integer, "p_window_seconds" integer) RETURNS TABLE("allowed" boolean, "retry_after_seconds" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."consume_api_rate_limit"("p_bucket" "text", "p_subject" "uuid", "p_limit" integer, "p_window_seconds" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_all_subdoc_ids"("doc_id" "uuid") RETURNS TABLE("id" "uuid")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  with recursive subdocs as (
    select id from public.documents where parent_id = doc_id
    union all
    select d.id from public.documents d
    inner join subdocs s on d.parent_id = s.id
  )
  select id from subdocs;
$$;


ALTER FUNCTION "public"."get_all_subdoc_ids"("doc_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_all_subpage_ids"("page_id" "uuid") RETURNS TABLE("id" "uuid")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  with recursive subpages as (
    select p.id from public.pages p where p.parent_id = page_id
    union all
    select p.id from public.pages p
    inner join subpages sp on p.parent_id = sp.id
  )
  select id from subpages;
$$;


ALTER FUNCTION "public"."get_all_subpage_ids"("page_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_auth_user_by_email"("p_email" "text") RETURNS TABLE("id" "uuid", "has_account" boolean)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'auth', 'public'
    AS $$
    select u.id, (
      (u.encrypted_password is not null and length(u.encrypted_password) > 0)
      or exists (
        select 1 from auth.identities i
        where i.user_id = u.id and i.provider != 'email'
      )
    ) as has_account
    from auth.users u where u.email = p_email limit 1;
  $$;


ALTER FUNCTION "public"."get_auth_user_by_email"("p_email" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_backlinks"("target_page_id" "uuid") RETURNS TABLE("id" "uuid", "title" "text", "icon" "text")
    LANGUAGE "sql"
    AS $$
  SELECT p.id, p.title, p.icon
  FROM pages p
  WHERE
    p.id != target_page_id
    AND p.content::text LIKE '%' || target_page_id::text || '%'
  ORDER BY p.updated_at DESC NULLS LAST
  LIMIT 20;
$$;


ALTER FUNCTION "public"."get_backlinks"("target_page_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_member_workspaces"("user_uuid" "uuid") RETURNS TABLE("id" "uuid", "name" "text", "icon" "text", "owner_id" "uuid", "role" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select w.id, w.name, w.icon, w.owner_id, wm.role
  from public.workspace_members wm
  join public.workspaces w on w.id = wm.workspace_id
  where wm.user_id = user_uuid
  and w.owner_id != user_uuid
$$;


ALTER FUNCTION "public"."get_member_workspaces"("user_uuid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_page_access"("p_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1 from public.page_shares
    where page_id = p_id and user_id = auth.uid()
  )
$$;


ALTER FUNCTION "public"."get_page_access"("p_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_shared_documents"("user_uuid" "uuid") RETURNS TABLE("id" "uuid", "title" "text", "owner_id" "uuid", "permission" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select d.id, d.title, d.owner_id, ds.permission
  from public.documents d
  join public.document_shares ds on ds.document_id = d.id
  where ds.user_id = user_uuid
  and d.owner_id != user_uuid;
$$;


ALTER FUNCTION "public"."get_shared_documents"("user_uuid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_shared_pages"("user_uuid" "uuid") RETURNS TABLE("id" "uuid", "title" "text", "icon" "text", "owner_id" "uuid", "permission" "text", "parent_id" "uuid")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select
    p.id,
    p.title,
    p.icon,
    p.owner_id,
    ps.permission,
    case
      when p.parent_id is null then null
      when exists (
        select 1 from public.page_shares ps2
        where ps2.page_id = p.parent_id and ps2.user_id = user_uuid
      ) then p.parent_id
      else null
    end as parent_id
  from public.page_shares ps
  join public.pages p on p.id = ps.page_id
  where ps.user_id = user_uuid
  and p.owner_id != user_uuid
  -- Include both view AND edit permissions
  and ps.permission in ('view', 'edit')
$$;


ALTER FUNCTION "public"."get_shared_pages"("user_uuid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_unconfirmed_auth_user_id"("p_email" "text") RETURNS "uuid"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'auth', 'public'
    AS $$
    select id from auth.users
    where email = p_email
      and email_confirmed_at is null
    limit 1;
  $$;


ALTER FUNCTION "public"."get_unconfirmed_auth_user_id"("p_email" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data->>'full_name')
  on conflict (id) do update set email = excluded.email, full_name = coalesce(excluded.full_name, profiles.full_name);
  return new;
end;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."has_document_access"("doc_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  select exists (
    select 1 from public.document_shares
    where document_id = doc_id
    and user_id = auth.uid()
  )
$$;


ALTER FUNCTION "public"."has_document_access"("doc_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."increment_page_views"("page_id" "uuid") RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    AS $$ UPDATE pages SET view_count = view_count + 1 WHERE id = page_id; $$;


ALTER FUNCTION "public"."increment_page_views"("page_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_page_owner"("p_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
    SELECT EXISTS (
      SELECT 1 FROM public.pages
      WHERE id = p_id AND owner_id = auth.uid()
    )
  $$;


ALTER FUNCTION "public"."is_page_owner"("p_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_page_shared_editor"("p_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1 from public.page_shares ps
    where ps.page_id = p_id
      and ps.user_id = auth.uid()
      and ps.permission in ('edit', 'owner')
  );
$$;


ALTER FUNCTION "public"."is_page_shared_editor"("p_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_page_shared_owner"("p_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1 from public.page_shares ps
    where ps.page_id = p_id
      and ps.user_id = auth.uid()
      and ps.permission = 'owner'
  );
$$;


ALTER FUNCTION "public"."is_page_shared_owner"("p_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_workspace_member"("ws_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
    SELECT EXISTS (
      SELECT 1 FROM public.workspace_members
      WHERE workspace_id = ws_id AND user_id = auth.uid()
    )
  $$;


ALTER FUNCTION "public"."is_workspace_member"("ws_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_workspace_owner"("ws_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
    SELECT EXISTS (
      SELECT 1 FROM public.workspaces
      WHERE id = ws_id AND owner_id = auth.uid()
    )
  $$;


ALTER FUNCTION "public"."is_workspace_owner"("ws_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."move_page_tree_atomic"("p_user_id" "uuid", "p_page_id" "uuid", "p_new_parent_id" "uuid" DEFAULT NULL::"uuid", "p_target_workspace_id" "uuid" DEFAULT NULL::"uuid", "p_position_updates" "jsonb" DEFAULT '[]'::"jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_page public.pages%rowtype;
  v_parent public.pages%rowtype;
  v_destination_workspace uuid;
  v_update_count integer;
begin
  select * into v_page from public.pages where id = p_page_id and deleted_at is null for update;
  if not found then raise exception 'page not found'; end if;
  if not public.can_manage_page_as(p_user_id, p_page_id) then raise insufficient_privilege; end if;
  if jsonb_typeof(coalesce(p_position_updates, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_position_updates, '[]'::jsonb)) > 500 then
    raise exception 'invalid position updates';
  end if;

  if p_new_parent_id is not null then
    select * into v_parent from public.pages where id = p_new_parent_id and deleted_at is null for update;
    if not found then raise exception 'parent not found'; end if;
    if not public.can_manage_page_as(p_user_id, p_new_parent_id) then raise insufficient_privilege; end if;
    if exists (
      with recursive descendants as (
        select id from public.pages where parent_id = p_page_id and deleted_at is null
        union all
        select child.id from public.pages child join descendants d on child.parent_id = d.id where child.deleted_at is null
      ) select 1 from descendants where id = p_new_parent_id
    ) then raise exception 'cannot move a page into its descendant'; end if;
    v_destination_workspace := v_parent.workspace_id;
  else
    v_destination_workspace := coalesce(p_target_workspace_id, v_page.workspace_id);
    if v_destination_workspace <> v_page.workspace_id and not public.can_edit_workspace_as(p_user_id, v_destination_workspace) then
      raise insufficient_privilege;
    end if;
  end if;

  select count(*) into v_update_count
  from jsonb_to_recordset(coalesce(p_position_updates, '[]'::jsonb)) as u(id uuid, position integer)
  join public.pages p on p.id = u.id and p.workspace_id = v_destination_workspace and p.deleted_at is null;
  if v_update_count <> jsonb_array_length(coalesce(p_position_updates, '[]'::jsonb)) then
    raise exception 'invalid position update scope';
  end if;

  with recursive tree as (
    select id from public.pages where id = p_page_id
    union all
    select child.id from public.pages child join tree parent on child.parent_id = parent.id where child.deleted_at is null
  )
  update public.pages p
  set workspace_id = v_destination_workspace,
      parent_id = case when p.id = p_page_id then p_new_parent_id else p.parent_id end
  where p.id in (select id from tree);

  update public.pages p
  set position = u.position
  from jsonb_to_recordset(coalesce(p_position_updates, '[]'::jsonb)) as u(id uuid, position integer)
  where p.id = u.id;

  return v_destination_workspace;
end;
$$;


ALTER FUNCTION "public"."move_page_tree_atomic"("p_user_id" "uuid", "p_page_id" "uuid", "p_new_parent_id" "uuid", "p_target_workspace_id" "uuid", "p_position_updates" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prune_page_snapshots"("p_page_id" "uuid", "p_keep" integer DEFAULT 50) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if not public.can_manage_page_as(auth.uid(), p_page_id) then raise insufficient_privilege; end if;
  if p_keep < 1 or p_keep > 50 then raise exception 'keep must be between 1 and 50'; end if;
  with old as (select id from public.page_snapshots where page_id = p_page_id order by created_at desc offset p_keep)
  delete from public.page_snapshots where id in (select id from old);
end; $$;


ALTER FUNCTION "public"."prune_page_snapshots"("p_page_id" "uuid", "p_keep" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."purge_workspace_trash_as"("p_user_id" "uuid", "p_workspace_id" "uuid", "p_retention_days" integer DEFAULT 30) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_deleted integer;
begin
  if p_retention_days < 7 or p_retention_days > 365 then raise exception 'invalid retention'; end if;
  if not public.can_edit_workspace_as(p_user_id, p_workspace_id) then raise insufficient_privilege; end if;
  delete from public.pages where workspace_id = p_workspace_id and deleted_at is not null
    and deleted_at < now() - make_interval(days => p_retention_days);
  get diagnostics v_deleted = row_count; return v_deleted;
end; $$;


ALTER FUNCTION "public"."purge_workspace_trash_as"("p_user_id" "uuid", "p_workspace_id" "uuid", "p_retention_days" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."search_pages_advanced"("ws_id" "uuid", "q" "text", "page_kind" "text" DEFAULT 'all'::"text", "changed_after" timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS TABLE("id" "uuid", "title" "text", "icon" "text", "is_database" boolean, "match_in" "text", "snippet" "text", "updated_at" timestamp with time zone, "relevance" real)
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."search_pages_advanced"("ws_id" "uuid", "q" "text", "page_kind" "text", "changed_after" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."search_pages_fts"("ws_id" "uuid", "q" "text") RETURNS TABLE("id" "uuid", "title" "text", "icon" "text", "is_database" boolean, "match_in" "text", "snippet" "text")
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  q_lower  text := lower(q);
  ctx_len  int  := 80;
  pos      int;
  full_txt text;
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    p.title,
    p.icon,
    p.is_database,
    CASE WHEN lower(p.title) LIKE '%' || q_lower || '%'
      THEN 'title'::text
      ELSE 'content'::text
    END AS match_in,
    CASE
      WHEN lower(p.title) LIKE '%' || q_lower || '%' THEN ''::text
      ELSE (
        WITH txt AS (SELECT tiptap_to_text(p.content) AS v)
        SELECT substring(
          t.v
          FROM greatest(1, position(q_lower IN lower(t.v)) - ctx_len)
          FOR ctx_len * 2 + length(q)
        )
        FROM txt t
      )
    END AS snippet
  FROM pages p
  WHERE
    p.workspace_id = ws_id
    AND p.deleted_at IS NULL
    AND (
      lower(p.title) LIKE '%' || q_lower || '%'
      OR lower(tiptap_to_text(p.content)) LIKE '%' || q_lower || '%'
    )
  ORDER BY
    CASE WHEN lower(p.title) LIKE '%' || q_lower || '%' THEN 0 ELSE 1 END,
    p.updated_at DESC
  LIMIT 25;
END;
$$;


ALTER FUNCTION "public"."search_pages_fts"("ws_id" "uuid", "q" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_page_link_permission_atomic"("p_user_id" "uuid", "p_page_id" "uuid", "p_permission" "text", "p_only_upgrade" boolean DEFAULT false) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_count integer;
begin
  if p_permission not in ('none', 'view', 'edit') then raise exception 'invalid permission'; end if;
  if not public.can_manage_page_as(p_user_id, p_page_id) then raise insufficient_privilege; end if;

  with recursive tree as (
    select id from public.pages where id = p_page_id and deleted_at is null
    union all
    select child.id from public.pages child join tree parent on child.parent_id = parent.id where child.deleted_at is null
  )
  update public.pages p
  set link_permission = p_permission
  where p.id in (select id from tree)
    and (
      not p_only_upgrade
      or case p.link_permission when 'edit' then 2 when 'view' then 1 else 0 end
         < case p_permission when 'edit' then 2 when 'view' then 1 else 0 end
    );
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;


ALTER FUNCTION "public"."set_page_link_permission_atomic"("p_user_id" "uuid", "p_page_id" "uuid", "p_permission" "text", "p_only_upgrade" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_profile_email"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data->>'full_name')
  on conflict (id) do update set email = new.email;
  return new;
end;
$$;


ALTER FUNCTION "public"."sync_profile_email"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."tiptap_to_text"("content" "jsonb") RETURNS "text"
    LANGUAGE "plpgsql" IMMUTABLE
    AS $$
DECLARE
  result text := '';
  node   jsonb;
  nodes  jsonb;
BEGIN
  IF jsonb_typeof(content) = 'array' THEN
    nodes := content;
  ELSIF content ? 'content' THEN
    nodes := content -> 'content';
  ELSE
    RETURN '';
  END IF;
  FOR node IN SELECT jsonb_array_elements(nodes) LOOP
    IF (node->>'type') = 'text' THEN
      result := result || ' ' || coalesce(node->>'text','');
    ELSIF node ? 'content' THEN
      result := result || ' ' || tiptap_to_text(node);
    END IF;
  END LOOP;
  RETURN btrim(result);
END;
$$;


ALTER FUNCTION "public"."tiptap_to_text"("content" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."user_has_page_access"("p_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1 from public.page_shares
    where page_id = p_id and user_id = auth.uid()
  )
  or exists (
    select 1 from public.pages
    where id = p_id and link_permission in ('view', 'edit')
  )
$$;


ALTER FUNCTION "public"."user_has_page_access"("p_id" "uuid") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."api_rate_limits" (
    "bucket" "text" NOT NULL,
    "subject" "uuid" NOT NULL,
    "window_start" timestamp with time zone NOT NULL,
    "request_count" integer DEFAULT 1 NOT NULL,
    CONSTRAINT "api_rate_limits_request_count_check" CHECK (("request_count" > 0))
);


ALTER TABLE "public"."api_rate_limits" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."databases" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" DEFAULT 'Untitled database'::"text" NOT NULL,
    "fields" "jsonb" DEFAULT '[]'::"jsonb",
    "owner_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."databases" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."db_fields" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "page_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "type" "text" DEFAULT 'text'::"text" NOT NULL,
    "options" "jsonb" DEFAULT '[]'::"jsonb",
    "relation_page_id" "uuid",
    "rollup_field_id" "uuid",
    "position" double precision DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "hidden_from_viewers" boolean DEFAULT false NOT NULL,
    "width" integer,
    CONSTRAINT "db_fields_type_check" CHECK (("type" = ANY (ARRAY['text'::"text", 'number'::"text", 'currency'::"text", 'select'::"text", 'multiselect'::"text", 'date'::"text", 'checkbox'::"text", 'relation'::"text", 'rollup'::"text", 'url'::"text", 'email'::"text", 'phone'::"text"])))
);


ALTER TABLE "public"."db_fields" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."db_records" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "page_id" "uuid" NOT NULL,
    "data" "jsonb" DEFAULT '{}'::"jsonb",
    "position" double precision DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."db_records" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."db_relations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "field_id" "uuid" NOT NULL,
    "from_record_id" "uuid" NOT NULL,
    "to_record_id" "uuid" NOT NULL
);


ALTER TABLE "public"."db_relations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."db_rows" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "database_id" "uuid" NOT NULL,
    "data" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."db_rows" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."document_shares" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "document_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "permission" "text" DEFAULT 'view'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "document_shares_permission_check" CHECK (("permission" = ANY (ARRAY['view'::"text", 'edit'::"text"])))
);


ALTER TABLE "public"."document_shares" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."documents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" DEFAULT 'Untitled'::"text" NOT NULL,
    "content" "text" DEFAULT ''::"text",
    "folder_id" "uuid",
    "owner_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "link_permission" "text" DEFAULT 'none'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "parent_id" "uuid",
    CONSTRAINT "documents_link_permission_check" CHECK (("link_permission" = ANY (ARRAY['none'::"text", 'view'::"text", 'edit'::"text"])))
);


ALTER TABLE "public"."documents" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."folders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" DEFAULT 'Untitled folder'::"text" NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."folders" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "type" "text" NOT NULL,
    "title" "text" NOT NULL,
    "body" "text",
    "data" "jsonb",
    "read" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."page_comments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "page_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "body" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "anchor_id" "text",
    CONSTRAINT "page_comments_body_check" CHECK (("char_length"("body") > 0))
);


ALTER TABLE "public"."page_comments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."page_favorites" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "page_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."page_favorites" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."page_shares" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "page_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "permission" "text" DEFAULT 'view'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "page_shares_permission_check" CHECK (("permission" = ANY (ARRAY['view'::"text", 'edit'::"text", 'owner'::"text"])))
);


ALTER TABLE "public"."page_shares" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."page_snapshots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "page_id" "uuid" NOT NULL,
    "title" "text" DEFAULT ''::"text" NOT NULL,
    "content" "jsonb",
    "saved_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."page_snapshots" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."page_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "title" "text" DEFAULT 'Untitled'::"text" NOT NULL,
    "icon" "text" DEFAULT ''::"text" NOT NULL,
    "description" "text" DEFAULT ''::"text" NOT NULL,
    "content" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."page_templates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "parent_id" "uuid",
    "title" "text" DEFAULT 'Untitled'::"text" NOT NULL,
    "icon" "text" DEFAULT ''::"text",
    "cover_url" "text" DEFAULT ''::"text",
    "content" "jsonb" DEFAULT '[]'::"jsonb",
    "position" double precision DEFAULT 0,
    "is_database" boolean DEFAULT false,
    "owner_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "link_permission" "text" DEFAULT 'none'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "deleted_at" timestamp with time zone,
    "is_locked" boolean DEFAULT false,
    "view_count" integer DEFAULT 0 NOT NULL,
    "cover_position" "text",
    "toc_max_level" smallint,
    CONSTRAINT "pages_link_permission_check" CHECK (("link_permission" = ANY (ARRAY['none'::"text", 'view'::"text", 'edit'::"text"])))
);


ALTER TABLE "public"."pages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "email" "text",
    "full_name" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "avatar_url" "text"
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."push_subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "subscription" "jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "endpoint" "text" GENERATED ALWAYS AS (("subscription" ->> 'endpoint'::"text")) STORED
);


ALTER TABLE "public"."push_subscriptions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."workspace_invites" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "token" "text" DEFAULT "encode"("extensions"."gen_random_bytes"(16), 'hex'::"text") NOT NULL,
    "role" "text" DEFAULT 'member'::"text" NOT NULL,
    "created_by" "uuid",
    "expires_at" timestamp with time zone DEFAULT ("now"() + '7 days'::interval),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "invited_email" "text",
    CONSTRAINT "workspace_invites_role_check" CHECK (("role" = ANY (ARRAY['member'::"text", 'viewer'::"text"])))
);


ALTER TABLE "public"."workspace_invites" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."workspace_members" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "text" DEFAULT 'member'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "workspace_members_role_check" CHECK (("role" = ANY (ARRAY['owner'::"text", 'member'::"text", 'viewer'::"text"])))
);


ALTER TABLE "public"."workspace_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."workspaces" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" DEFAULT 'My Workspace'::"text" NOT NULL,
    "icon" "text" DEFAULT '🌿'::"text",
    "owner_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "accent_color" "text" DEFAULT '#0b6e99'::"text"
);


ALTER TABLE "public"."workspaces" OWNER TO "postgres";


ALTER TABLE ONLY "public"."api_rate_limits"
    ADD CONSTRAINT "api_rate_limits_pkey" PRIMARY KEY ("bucket", "subject", "window_start");



ALTER TABLE ONLY "public"."databases"
    ADD CONSTRAINT "databases_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."db_fields"
    ADD CONSTRAINT "db_fields_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."db_records"
    ADD CONSTRAINT "db_records_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."db_relations"
    ADD CONSTRAINT "db_relations_field_id_from_record_id_to_record_id_key" UNIQUE ("field_id", "from_record_id", "to_record_id");



ALTER TABLE ONLY "public"."db_relations"
    ADD CONSTRAINT "db_relations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."db_rows"
    ADD CONSTRAINT "db_rows_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."document_shares"
    ADD CONSTRAINT "document_shares_document_id_user_id_key" UNIQUE ("document_id", "user_id");



ALTER TABLE ONLY "public"."document_shares"
    ADD CONSTRAINT "document_shares_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."documents"
    ADD CONSTRAINT "documents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."folders"
    ADD CONSTRAINT "folders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."page_comments"
    ADD CONSTRAINT "page_comments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."page_favorites"
    ADD CONSTRAINT "page_favorites_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."page_favorites"
    ADD CONSTRAINT "page_favorites_user_id_page_id_key" UNIQUE ("user_id", "page_id");



ALTER TABLE ONLY "public"."page_shares"
    ADD CONSTRAINT "page_shares_page_id_user_id_key" UNIQUE ("page_id", "user_id");



ALTER TABLE ONLY "public"."page_shares"
    ADD CONSTRAINT "page_shares_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."page_snapshots"
    ADD CONSTRAINT "page_snapshots_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."page_templates"
    ADD CONSTRAINT "page_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pages"
    ADD CONSTRAINT "pages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_user_id_endpoint_key" UNIQUE ("user_id", "endpoint");



ALTER TABLE ONLY "public"."workspace_invites"
    ADD CONSTRAINT "workspace_invites_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."workspace_invites"
    ADD CONSTRAINT "workspace_invites_token_key" UNIQUE ("token");



ALTER TABLE ONLY "public"."workspace_members"
    ADD CONSTRAINT "workspace_members_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."workspace_members"
    ADD CONSTRAINT "workspace_members_workspace_id_user_id_key" UNIQUE ("workspace_id", "user_id");



ALTER TABLE ONLY "public"."workspaces"
    ADD CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id");



CREATE INDEX "page_comments_page_idx" ON "public"."page_comments" USING "btree" ("page_id", "created_at" DESC);



CREATE INDEX "page_snapshots_page_id_idx" ON "public"."page_snapshots" USING "btree" ("page_id", "created_at" DESC);



CREATE INDEX "pages_deleted_at_idx" ON "public"."pages" USING "btree" ("deleted_at") WHERE ("deleted_at" IS NOT NULL);



ALTER TABLE ONLY "public"."databases"
    ADD CONSTRAINT "databases_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."db_fields"
    ADD CONSTRAINT "db_fields_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."db_fields"
    ADD CONSTRAINT "db_fields_relation_page_id_fkey" FOREIGN KEY ("relation_page_id") REFERENCES "public"."pages"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."db_records"
    ADD CONSTRAINT "db_records_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."db_relations"
    ADD CONSTRAINT "db_relations_field_id_fkey" FOREIGN KEY ("field_id") REFERENCES "public"."db_fields"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."db_relations"
    ADD CONSTRAINT "db_relations_from_record_id_fkey" FOREIGN KEY ("from_record_id") REFERENCES "public"."db_records"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."db_relations"
    ADD CONSTRAINT "db_relations_to_record_id_fkey" FOREIGN KEY ("to_record_id") REFERENCES "public"."db_records"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."db_rows"
    ADD CONSTRAINT "db_rows_database_id_fkey" FOREIGN KEY ("database_id") REFERENCES "public"."databases"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."document_shares"
    ADD CONSTRAINT "document_shares_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."document_shares"
    ADD CONSTRAINT "document_shares_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."documents"
    ADD CONSTRAINT "documents_folder_id_fkey" FOREIGN KEY ("folder_id") REFERENCES "public"."folders"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."documents"
    ADD CONSTRAINT "documents_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."documents"
    ADD CONSTRAINT "documents_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."documents"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."folders"
    ADD CONSTRAINT "folders_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."page_comments"
    ADD CONSTRAINT "page_comments_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."page_comments"
    ADD CONSTRAINT "page_comments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."page_favorites"
    ADD CONSTRAINT "page_favorites_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."page_favorites"
    ADD CONSTRAINT "page_favorites_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."page_shares"
    ADD CONSTRAINT "page_shares_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."page_shares"
    ADD CONSTRAINT "page_shares_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."page_snapshots"
    ADD CONSTRAINT "page_snapshots_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."page_snapshots"
    ADD CONSTRAINT "page_snapshots_saved_by_fkey" FOREIGN KEY ("saved_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."page_templates"
    ADD CONSTRAINT "page_templates_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."page_templates"
    ADD CONSTRAINT "page_templates_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pages"
    ADD CONSTRAINT "pages_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pages"
    ADD CONSTRAINT "pages_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."pages"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pages"
    ADD CONSTRAINT "pages_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."push_subscriptions"
    ADD CONSTRAINT "push_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workspace_invites"
    ADD CONSTRAINT "workspace_invites_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."workspace_invites"
    ADD CONSTRAINT "workspace_invites_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workspace_members"
    ADD CONSTRAINT "workspace_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workspace_members"
    ADD CONSTRAINT "workspace_members_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workspaces"
    ADD CONSTRAINT "workspaces_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "Anyone with the token can read the invite" ON "public"."workspace_invites" FOR SELECT USING (true);



CREATE POLICY "Authenticated can insert notifications" ON "public"."notifications" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Authenticated users can search profiles" ON "public"."profiles" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



CREATE POLICY "Delete own documents" ON "public"."documents" FOR DELETE USING (("auth"."uid"() = "owner_id"));



CREATE POLICY "Document owner manages shares" ON "public"."document_shares" USING ((EXISTS ( SELECT 1
   FROM "public"."documents"
  WHERE (("documents"."id" = "document_shares"."document_id") AND ("documents"."owner_id" = "auth"."uid"())))));



CREATE POLICY "Insert own documents" ON "public"."documents" FOR INSERT WITH CHECK (("auth"."uid"() = "owner_id"));



CREATE POLICY "Members can read their memberships" ON "public"."workspace_members" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Members see workspace pages" ON "public"."pages" FOR SELECT USING (("owner_id" = "auth"."uid"()));



CREATE POLICY "Owner full access on databases" ON "public"."databases" USING (("auth"."uid"() = "owner_id"));



CREATE POLICY "Owner full access on db_fields" ON "public"."db_fields" USING ((EXISTS ( SELECT 1
   FROM "public"."pages"
  WHERE (("pages"."id" = "db_fields"."page_id") AND ("pages"."owner_id" = "auth"."uid"())))));



CREATE POLICY "Owner full access on db_records" ON "public"."db_records" USING ((EXISTS ( SELECT 1
   FROM "public"."pages"
  WHERE (("pages"."id" = "db_records"."page_id") AND ("pages"."owner_id" = "auth"."uid"())))));



CREATE POLICY "Owner full access on db_rows" ON "public"."db_rows" USING ((EXISTS ( SELECT 1
   FROM "public"."databases"
  WHERE (("databases"."id" = "db_rows"."database_id") AND ("databases"."owner_id" = "auth"."uid"())))));



CREATE POLICY "Owner full access on folders" ON "public"."folders" USING (("auth"."uid"() = "owner_id"));



CREATE POLICY "Owner manages page shares" ON "public"."page_shares" USING ((("user_id" = "auth"."uid"()) OR "public"."is_page_owner"("page_id") OR "public"."is_page_shared_owner"("page_id"))) WITH CHECK ((("user_id" = "auth"."uid"()) OR "public"."is_page_owner"("page_id") OR "public"."is_page_shared_owner"("page_id")));



CREATE POLICY "Public can read link-shared documents" ON "public"."documents" FOR SELECT USING (("link_permission" = ANY (ARRAY['view'::"text", 'edit'::"text"])));



CREATE POLICY "Select documents with access" ON "public"."documents" FOR SELECT USING ((("auth"."uid"() = "owner_id") OR "public"."has_document_access"("id")));



CREATE POLICY "Select own documents" ON "public"."documents" FOR SELECT USING (("auth"."uid"() = "owner_id"));



CREATE POLICY "Shared users can see their own share" ON "public"."document_shares" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Update documents with access" ON "public"."documents" FOR UPDATE USING ((("auth"."uid"() = "owner_id") OR "public"."has_document_access"("id")));



CREATE POLICY "Update own documents" ON "public"."documents" FOR UPDATE USING (("auth"."uid"() = "owner_id"));



CREATE POLICY "Users can add themselves to shared" ON "public"."page_shares" FOR INSERT WITH CHECK ((("auth"."uid"() = "user_id") AND (EXISTS ( SELECT 1
   FROM "public"."pages"
  WHERE (("pages"."id" = "page_shares"."page_id") AND ("pages"."link_permission" = "page_shares"."permission") AND ("pages"."link_permission" = ANY (ARRAY['view'::"text", 'edit'::"text"])))))));



CREATE POLICY "Users can add themselves to shared docs" ON "public"."document_shares" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete own comments" ON "public"."page_comments" FOR DELETE TO "authenticated" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete own notifications" ON "public"."notifications" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete their own pages" ON "public"."pages" FOR DELETE USING (("owner_id" = "auth"."uid"()));



CREATE POLICY "Users can insert own comments" ON "public"."page_comments" FOR INSERT TO "authenticated" WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert snapshots for pages they can edit" ON "public"."page_snapshots" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."pages" "p"
  WHERE (("p"."id" = "page_snapshots"."page_id") AND (("p"."owner_id" = "auth"."uid"()) OR ("p"."workspace_id" IN ( SELECT "workspace_members"."workspace_id"
           FROM "public"."workspace_members"
          WHERE (("workspace_members"."user_id" = "auth"."uid"()) AND ("workspace_members"."role" = ANY (ARRAY['owner'::"text", 'member'::"text"]))))))))));



CREATE POLICY "Users can insert their own pages" ON "public"."pages" FOR INSERT WITH CHECK (("owner_id" = "auth"."uid"()));



CREATE POLICY "Users can manage their own templates" ON "public"."page_templates" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can read comments on accessible pages" ON "public"."page_comments" FOR SELECT TO "authenticated" USING (("page_id" IN ( SELECT "pages"."id"
   FROM "public"."pages"
  WHERE ("pages"."owner_id" = "auth"."uid"())
UNION
 SELECT "page_shares"."page_id"
   FROM "public"."page_shares"
  WHERE ("page_shares"."user_id" = "auth"."uid"())
UNION
 SELECT "p"."id"
   FROM ("public"."pages" "p"
     JOIN "public"."workspace_members" "wm" ON ((("wm"."workspace_id" = "p"."workspace_id") AND ("wm"."user_id" = "auth"."uid"())))))));



CREATE POLICY "Users can read own notifications" ON "public"."notifications" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can read snapshots of pages they can access" ON "public"."page_snapshots" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."pages" "p"
  WHERE (("p"."id" = "page_snapshots"."page_id") AND (("p"."owner_id" = "auth"."uid"()) OR ("p"."workspace_id" IN ( SELECT "workspace_members"."workspace_id"
           FROM "public"."workspace_members"
          WHERE ("workspace_members"."user_id" = "auth"."uid"()))))))));



CREATE POLICY "Users can remove themselves" ON "public"."page_shares" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can see their own shares" ON "public"."document_shares" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own notifications" ON "public"."notifications" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own pages" ON "public"."pages" FOR UPDATE USING (("owner_id" = "auth"."uid"()));



CREATE POLICY "Users can update their own profile" ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can view their own profile" ON "public"."profiles" FOR SELECT USING (("auth"."uid"() = "id"));



CREATE POLICY "Users manage own favorites" ON "public"."page_favorites" USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users manage own push subs" ON "public"."push_subscriptions" USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users see accessible page shares" ON "public"."page_shares" FOR SELECT USING ((("user_id" = "auth"."uid"()) OR "public"."is_page_owner"("page_id") OR "public"."is_page_shared_owner"("page_id")));



CREATE POLICY "Users see their workspaces" ON "public"."workspaces" FOR SELECT USING ((("auth"."uid"() = "owner_id") OR (EXISTS ( SELECT 1
   FROM "public"."workspace_members"
  WHERE (("workspace_members"."workspace_id" = "workspaces"."id") AND ("workspace_members"."user_id" = "auth"."uid"()))))));



CREATE POLICY "Workspace owners can manage invites" ON "public"."workspace_invites" USING ((EXISTS ( SELECT 1
   FROM "public"."workspaces" "w"
  WHERE (("w"."id" = "workspace_invites"."workspace_id") AND ("w"."owner_id" = "auth"."uid"())))));



CREATE POLICY "anyone_read_invite" ON "public"."workspace_invites" FOR SELECT USING (true);



ALTER TABLE "public"."api_rate_limits" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "comments_delete" ON "public"."page_comments" FOR DELETE USING (("user_id" = "auth"."uid"()));



CREATE POLICY "comments_insert" ON "public"."page_comments" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "comments_select" ON "public"."page_comments" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."pages" "p"
  WHERE (("p"."id" = "page_comments"."page_id") AND (("p"."owner_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."workspace_members" "wm"
          WHERE (("wm"."workspace_id" = "p"."workspace_id") AND ("wm"."user_id" = "auth"."uid"())))) OR (EXISTS ( SELECT 1
           FROM "public"."page_shares" "ps"
          WHERE (("ps"."page_id" = "p"."id") AND ("ps"."user_id" = "auth"."uid"())))) OR ("p"."link_permission" = ANY (ARRAY['view'::"text", 'edit'::"text"])))))));



ALTER TABLE "public"."databases" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."db_fields" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "db_fields delete" ON "public"."db_fields" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."pages"
  WHERE (("pages"."id" = "db_fields"."page_id") AND (("pages"."owner_id" = "auth"."uid"()) OR ("pages"."link_permission" = 'edit'::"text") OR (EXISTS ( SELECT 1
           FROM "public"."page_shares"
          WHERE (("page_shares"."page_id" = "pages"."id") AND ("page_shares"."user_id" = "auth"."uid"()) AND ("page_shares"."permission" = 'edit'::"text")))) OR (EXISTS ( SELECT 1
           FROM "public"."workspace_members"
          WHERE (("workspace_members"."workspace_id" = "pages"."workspace_id") AND ("workspace_members"."user_id" = "auth"."uid"()) AND ("workspace_members"."role" = ANY (ARRAY['owner'::"text", 'member'::"text"]))))))))));



CREATE POLICY "db_fields insert" ON "public"."db_fields" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."pages"
  WHERE (("pages"."id" = "db_fields"."page_id") AND (("pages"."owner_id" = "auth"."uid"()) OR ("pages"."link_permission" = 'edit'::"text") OR (EXISTS ( SELECT 1
           FROM "public"."page_shares"
          WHERE (("page_shares"."page_id" = "pages"."id") AND ("page_shares"."user_id" = "auth"."uid"()) AND ("page_shares"."permission" = 'edit'::"text")))) OR (EXISTS ( SELECT 1
           FROM "public"."workspace_members"
          WHERE (("workspace_members"."workspace_id" = "pages"."workspace_id") AND ("workspace_members"."user_id" = "auth"."uid"()) AND ("workspace_members"."role" = ANY (ARRAY['owner'::"text", 'member'::"text"]))))))))));



CREATE POLICY "db_fields select" ON "public"."db_fields" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."pages"
  WHERE (("pages"."id" = "db_fields"."page_id") AND (("pages"."owner_id" = "auth"."uid"()) OR ("pages"."link_permission" = ANY (ARRAY['view'::"text", 'edit'::"text"])) OR (EXISTS ( SELECT 1
           FROM "public"."page_shares"
          WHERE (("page_shares"."page_id" = "pages"."id") AND ("page_shares"."user_id" = "auth"."uid"())))) OR (EXISTS ( SELECT 1
           FROM "public"."workspace_members"
          WHERE (("workspace_members"."workspace_id" = "pages"."workspace_id") AND ("workspace_members"."user_id" = "auth"."uid"())))))))));



CREATE POLICY "db_fields update" ON "public"."db_fields" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."pages"
  WHERE (("pages"."id" = "db_fields"."page_id") AND (("pages"."owner_id" = "auth"."uid"()) OR ("pages"."link_permission" = 'edit'::"text") OR (EXISTS ( SELECT 1
           FROM "public"."page_shares"
          WHERE (("page_shares"."page_id" = "pages"."id") AND ("page_shares"."user_id" = "auth"."uid"()) AND ("page_shares"."permission" = 'edit'::"text")))) OR (EXISTS ( SELECT 1
           FROM "public"."workspace_members"
          WHERE (("workspace_members"."workspace_id" = "pages"."workspace_id") AND ("workspace_members"."user_id" = "auth"."uid"()) AND ("workspace_members"."role" = ANY (ARRAY['owner'::"text", 'member'::"text"]))))))))));



CREATE POLICY "db_fields_select" ON "public"."db_fields" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."pages" "p"
  WHERE (("p"."id" = "db_fields"."page_id") AND (("p"."owner_id" = "auth"."uid"()) OR ("p"."link_permission" <> 'none'::"text") OR (EXISTS ( SELECT 1
           FROM "public"."page_shares"
          WHERE (("page_shares"."page_id" = "p"."id") AND ("page_shares"."user_id" = "auth"."uid"())))) OR (EXISTS ( SELECT 1
           FROM "public"."workspace_members"
          WHERE (("workspace_members"."workspace_id" = "p"."workspace_id") AND ("workspace_members"."user_id" = "auth"."uid"())))) OR (EXISTS ( SELECT 1
           FROM "public"."workspaces"
          WHERE (("workspaces"."id" = "p"."workspace_id") AND ("workspaces"."owner_id" = "auth"."uid"())))))))));



CREATE POLICY "db_fields_write" ON "public"."db_fields" USING ((EXISTS ( SELECT 1
   FROM "public"."pages" "p"
  WHERE (("p"."id" = "db_fields"."page_id") AND (("p"."owner_id" = "auth"."uid"()) OR ("p"."link_permission" = 'edit'::"text") OR (EXISTS ( SELECT 1
           FROM "public"."page_shares"
          WHERE (("page_shares"."page_id" = "p"."id") AND ("page_shares"."user_id" = "auth"."uid"()) AND ("page_shares"."permission" = 'edit'::"text")))) OR (EXISTS ( SELECT 1
           FROM "public"."workspace_members"
          WHERE (("workspace_members"."workspace_id" = "p"."workspace_id") AND ("workspace_members"."user_id" = "auth"."uid"()) AND ("workspace_members"."role" = ANY (ARRAY['owner'::"text", 'member'::"text"]))))) OR (EXISTS ( SELECT 1
           FROM "public"."workspaces"
          WHERE (("workspaces"."id" = "p"."workspace_id") AND ("workspaces"."owner_id" = "auth"."uid"())))))))));



ALTER TABLE "public"."db_records" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "db_records delete" ON "public"."db_records" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."pages"
  WHERE (("pages"."id" = "db_records"."page_id") AND (("pages"."owner_id" = "auth"."uid"()) OR ("pages"."link_permission" = 'edit'::"text") OR (EXISTS ( SELECT 1
           FROM "public"."page_shares"
          WHERE (("page_shares"."page_id" = "pages"."id") AND ("page_shares"."user_id" = "auth"."uid"()) AND ("page_shares"."permission" = 'edit'::"text")))) OR (EXISTS ( SELECT 1
           FROM "public"."workspace_members"
          WHERE (("workspace_members"."workspace_id" = "pages"."workspace_id") AND ("workspace_members"."user_id" = "auth"."uid"()) AND ("workspace_members"."role" = ANY (ARRAY['owner'::"text", 'member'::"text"]))))))))));



CREATE POLICY "db_records insert" ON "public"."db_records" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."pages"
  WHERE (("pages"."id" = "db_records"."page_id") AND (("pages"."owner_id" = "auth"."uid"()) OR ("pages"."link_permission" = 'edit'::"text") OR (EXISTS ( SELECT 1
           FROM "public"."page_shares"
          WHERE (("page_shares"."page_id" = "pages"."id") AND ("page_shares"."user_id" = "auth"."uid"()) AND ("page_shares"."permission" = 'edit'::"text")))) OR (EXISTS ( SELECT 1
           FROM "public"."workspace_members"
          WHERE (("workspace_members"."workspace_id" = "pages"."workspace_id") AND ("workspace_members"."user_id" = "auth"."uid"()) AND ("workspace_members"."role" = ANY (ARRAY['owner'::"text", 'member'::"text"]))))))))));



CREATE POLICY "db_records select" ON "public"."db_records" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."pages"
  WHERE (("pages"."id" = "db_records"."page_id") AND (("pages"."owner_id" = "auth"."uid"()) OR ("pages"."link_permission" = ANY (ARRAY['view'::"text", 'edit'::"text"])) OR (EXISTS ( SELECT 1
           FROM "public"."page_shares"
          WHERE (("page_shares"."page_id" = "pages"."id") AND ("page_shares"."user_id" = "auth"."uid"())))) OR (EXISTS ( SELECT 1
           FROM "public"."workspace_members"
          WHERE (("workspace_members"."workspace_id" = "pages"."workspace_id") AND ("workspace_members"."user_id" = "auth"."uid"())))))))));



CREATE POLICY "db_records update" ON "public"."db_records" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."pages"
  WHERE (("pages"."id" = "db_records"."page_id") AND (("pages"."owner_id" = "auth"."uid"()) OR ("pages"."link_permission" = 'edit'::"text") OR (EXISTS ( SELECT 1
           FROM "public"."page_shares"
          WHERE (("page_shares"."page_id" = "pages"."id") AND ("page_shares"."user_id" = "auth"."uid"()) AND ("page_shares"."permission" = 'edit'::"text")))) OR (EXISTS ( SELECT 1
           FROM "public"."workspace_members"
          WHERE (("workspace_members"."workspace_id" = "pages"."workspace_id") AND ("workspace_members"."user_id" = "auth"."uid"()) AND ("workspace_members"."role" = ANY (ARRAY['owner'::"text", 'member'::"text"]))))))))));



CREATE POLICY "db_records_select" ON "public"."db_records" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."pages" "p"
  WHERE (("p"."id" = "db_records"."page_id") AND (("p"."owner_id" = "auth"."uid"()) OR ("p"."link_permission" <> 'none'::"text") OR (EXISTS ( SELECT 1
           FROM "public"."page_shares"
          WHERE (("page_shares"."page_id" = "p"."id") AND ("page_shares"."user_id" = "auth"."uid"())))) OR (EXISTS ( SELECT 1
           FROM "public"."workspace_members"
          WHERE (("workspace_members"."workspace_id" = "p"."workspace_id") AND ("workspace_members"."user_id" = "auth"."uid"())))) OR (EXISTS ( SELECT 1
           FROM "public"."workspaces"
          WHERE (("workspaces"."id" = "p"."workspace_id") AND ("workspaces"."owner_id" = "auth"."uid"())))))))));



CREATE POLICY "db_records_write" ON "public"."db_records" USING ((EXISTS ( SELECT 1
   FROM "public"."pages" "p"
  WHERE (("p"."id" = "db_records"."page_id") AND (("p"."owner_id" = "auth"."uid"()) OR ("p"."link_permission" = 'edit'::"text") OR (EXISTS ( SELECT 1
           FROM "public"."page_shares"
          WHERE (("page_shares"."page_id" = "p"."id") AND ("page_shares"."user_id" = "auth"."uid"()) AND ("page_shares"."permission" = 'edit'::"text")))) OR (EXISTS ( SELECT 1
           FROM "public"."workspace_members"
          WHERE (("workspace_members"."workspace_id" = "p"."workspace_id") AND ("workspace_members"."user_id" = "auth"."uid"()) AND ("workspace_members"."role" = ANY (ARRAY['owner'::"text", 'member'::"text"]))))) OR (EXISTS ( SELECT 1
           FROM "public"."workspaces"
          WHERE (("workspaces"."id" = "p"."workspace_id") AND ("workspaces"."owner_id" = "auth"."uid"())))))))));



ALTER TABLE "public"."db_relations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "db_relations_select" ON "public"."db_relations" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."db_fields" "f",
    "public"."pages" "p"
  WHERE (("f"."id" = "db_relations"."field_id") AND ("p"."id" = "f"."page_id") AND (("p"."owner_id" = "auth"."uid"()) OR ("p"."link_permission" <> 'none'::"text") OR (EXISTS ( SELECT 1
           FROM "public"."page_shares"
          WHERE (("page_shares"."page_id" = "p"."id") AND ("page_shares"."user_id" = "auth"."uid"())))) OR (EXISTS ( SELECT 1
           FROM "public"."workspace_members"
          WHERE (("workspace_members"."workspace_id" = "p"."workspace_id") AND ("workspace_members"."user_id" = "auth"."uid"())))) OR (EXISTS ( SELECT 1
           FROM "public"."workspaces"
          WHERE (("workspaces"."id" = "p"."workspace_id") AND ("workspaces"."owner_id" = "auth"."uid"())))))))));



CREATE POLICY "db_relations_write" ON "public"."db_relations" USING ((EXISTS ( SELECT 1
   FROM "public"."db_fields" "f",
    "public"."pages" "p"
  WHERE (("f"."id" = "db_relations"."field_id") AND ("p"."id" = "f"."page_id") AND (("p"."owner_id" = "auth"."uid"()) OR ("p"."link_permission" = 'edit'::"text") OR (EXISTS ( SELECT 1
           FROM "public"."page_shares"
          WHERE (("page_shares"."page_id" = "p"."id") AND ("page_shares"."user_id" = "auth"."uid"()) AND ("page_shares"."permission" = 'edit'::"text")))) OR (EXISTS ( SELECT 1
           FROM "public"."workspace_members"
          WHERE (("workspace_members"."workspace_id" = "p"."workspace_id") AND ("workspace_members"."user_id" = "auth"."uid"()) AND ("workspace_members"."role" = ANY (ARRAY['owner'::"text", 'member'::"text"]))))) OR (EXISTS ( SELECT 1
           FROM "public"."workspaces"
          WHERE (("workspaces"."id" = "p"."workspace_id") AND ("workspaces"."owner_id" = "auth"."uid"())))))))));



ALTER TABLE "public"."db_rows" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."document_shares" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."documents" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."folders" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "insert_snapshots" ON "public"."page_snapshots" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."pages" "p"
  WHERE (("p"."id" = "page_snapshots"."page_id") AND (("p"."owner_id" = "auth"."uid"()) OR ("p"."workspace_id" IN ( SELECT "workspace_members"."workspace_id"
           FROM "public"."workspace_members"
          WHERE (("workspace_members"."user_id" = "auth"."uid"()) AND ("workspace_members"."role" = ANY (ARRAY['owner'::"text", 'member'::"text"]))))))))));



ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "owners_manage_invites" ON "public"."workspace_invites" USING ((EXISTS ( SELECT 1
   FROM "public"."workspaces" "w"
  WHERE (("w"."id" = "workspace_invites"."workspace_id") AND ("w"."owner_id" = "auth"."uid"())))));



ALTER TABLE "public"."page_comments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."page_favorites" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."page_shares" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."page_snapshots" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."page_templates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pages" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "pages delete" ON "public"."pages" FOR DELETE USING ((("owner_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."workspace_members"
  WHERE (("workspace_members"."workspace_id" = "pages"."workspace_id") AND ("workspace_members"."user_id" = "auth"."uid"()) AND ("workspace_members"."role" = ANY (ARRAY['owner'::"text", 'member'::"text"])))))));



CREATE POLICY "pages insert" ON "public"."pages" FOR INSERT WITH CHECK ((("owner_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."workspace_members"
  WHERE (("workspace_members"."workspace_id" = "pages"."workspace_id") AND ("workspace_members"."user_id" = "auth"."uid"()) AND ("workspace_members"."role" = ANY (ARRAY['owner'::"text", 'member'::"text"])))))));



CREATE POLICY "pages select" ON "public"."pages" FOR SELECT USING ((("owner_id" = "auth"."uid"()) OR ("link_permission" = ANY (ARRAY['view'::"text", 'edit'::"text"])) OR (EXISTS ( SELECT 1
   FROM "public"."page_shares"
  WHERE (("page_shares"."page_id" = "pages"."id") AND ("page_shares"."user_id" = "auth"."uid"())))) OR (EXISTS ( SELECT 1
   FROM "public"."workspace_members"
  WHERE (("workspace_members"."workspace_id" = "pages"."workspace_id") AND ("workspace_members"."user_id" = "auth"."uid"()))))));



CREATE POLICY "pages update" ON "public"."pages" FOR UPDATE USING ((("owner_id" = "auth"."uid"()) OR ("link_permission" = 'edit'::"text") OR (EXISTS ( SELECT 1
   FROM "public"."page_shares"
  WHERE (("page_shares"."page_id" = "pages"."id") AND ("page_shares"."user_id" = "auth"."uid"()) AND ("page_shares"."permission" = 'edit'::"text")))) OR (EXISTS ( SELECT 1
   FROM "public"."workspace_members"
  WHERE (("workspace_members"."workspace_id" = "pages"."workspace_id") AND ("workspace_members"."user_id" = "auth"."uid"()) AND ("workspace_members"."role" = ANY (ARRAY['owner'::"text", 'member'::"text"])))))));



CREATE POLICY "pages_delete" ON "public"."pages" FOR DELETE USING ((("owner_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."workspace_members"
  WHERE (("workspace_members"."workspace_id" = "pages"."workspace_id") AND ("workspace_members"."user_id" = "auth"."uid"()) AND ("workspace_members"."role" = ANY (ARRAY['owner'::"text", 'member'::"text"]))))) OR (EXISTS ( SELECT 1
   FROM "public"."workspaces"
  WHERE (("workspaces"."id" = "pages"."workspace_id") AND ("workspaces"."owner_id" = "auth"."uid"()))))));



CREATE POLICY "pages_insert" ON "public"."pages" FOR INSERT WITH CHECK ((("auth"."uid"() = "owner_id") OR "public"."is_workspace_member"("workspace_id")));



CREATE POLICY "pages_select" ON "public"."pages" FOR SELECT USING ((("auth"."uid"() = "owner_id") OR ("link_permission" = ANY (ARRAY['view'::"text", 'edit'::"text"])) OR (EXISTS ( SELECT 1
   FROM "public"."page_shares"
  WHERE (("page_shares"."page_id" = "pages"."id") AND ("page_shares"."user_id" = "auth"."uid"())))) OR "public"."is_workspace_member"("workspace_id")));



CREATE POLICY "pages_update" ON "public"."pages" FOR UPDATE USING ((("owner_id" = "auth"."uid"()) OR ("link_permission" = 'edit'::"text") OR (EXISTS ( SELECT 1
   FROM "public"."page_shares"
  WHERE (("page_shares"."page_id" = "pages"."id") AND ("page_shares"."user_id" = "auth"."uid"()) AND ("page_shares"."permission" = 'edit'::"text")))) OR (EXISTS ( SELECT 1
   FROM "public"."workspace_members"
  WHERE (("workspace_members"."workspace_id" = "pages"."workspace_id") AND ("workspace_members"."user_id" = "auth"."uid"()) AND ("workspace_members"."role" = ANY (ARRAY['owner'::"text", 'member'::"text"]))))) OR (EXISTS ( SELECT 1
   FROM "public"."workspaces"
  WHERE (("workspaces"."id" = "pages"."workspace_id") AND ("workspaces"."owner_id" = "auth"."uid"()))))));



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."push_subscriptions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "read_snapshots" ON "public"."page_snapshots" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."pages" "p"
  WHERE (("p"."id" = "page_snapshots"."page_id") AND (("p"."owner_id" = "auth"."uid"()) OR ("p"."workspace_id" IN ( SELECT "workspace_members"."workspace_id"
           FROM "public"."workspace_members"
          WHERE ("workspace_members"."user_id" = "auth"."uid"()))))))));



CREATE POLICY "wm_delete" ON "public"."workspace_members" FOR DELETE USING ((("auth"."uid"() = "user_id") OR "public"."is_workspace_owner"("workspace_id")));



CREATE POLICY "wm_insert" ON "public"."workspace_members" FOR INSERT WITH CHECK ("public"."is_workspace_owner"("workspace_id"));



CREATE POLICY "wm_select" ON "public"."workspace_members" FOR SELECT USING ((("auth"."uid"() = "user_id") OR "public"."is_workspace_owner"("workspace_id")));



CREATE POLICY "wm_update" ON "public"."workspace_members" FOR UPDATE USING ("public"."is_workspace_owner"("workspace_id"));



CREATE POLICY "workspace members and editors can delete pages" ON "public"."pages" FOR DELETE USING ((("owner_id" = "auth"."uid"()) OR "public"."is_workspace_owner"("workspace_id") OR "public"."is_workspace_member"("workspace_id") OR "public"."is_page_shared_editor"("id")));



CREATE POLICY "workspace members and editors can select pages" ON "public"."pages" FOR SELECT USING ((("owner_id" = "auth"."uid"()) OR "public"."is_workspace_owner"("workspace_id") OR "public"."is_workspace_member"("workspace_id") OR "public"."is_page_shared_editor"("id")));



CREATE POLICY "workspace members and editors can update pages" ON "public"."pages" FOR UPDATE USING ((("owner_id" = "auth"."uid"()) OR "public"."is_workspace_owner"("workspace_id") OR "public"."is_workspace_member"("workspace_id") OR "public"."is_page_shared_editor"("id"))) WITH CHECK ((("owner_id" = "auth"."uid"()) OR "public"."is_workspace_owner"("workspace_id") OR "public"."is_workspace_member"("workspace_id") OR "public"."is_page_shared_editor"("id")));



ALTER TABLE "public"."workspace_invites" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."workspace_members" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."workspaces" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ws_delete" ON "public"."workspaces" FOR DELETE USING (("auth"."uid"() = "owner_id"));



CREATE POLICY "ws_insert" ON "public"."workspaces" FOR INSERT WITH CHECK (("auth"."uid"() = "owner_id"));



CREATE POLICY "ws_select" ON "public"."workspaces" FOR SELECT USING ((("auth"."uid"() = "owner_id") OR "public"."is_workspace_member"("id")));



CREATE POLICY "ws_update" ON "public"."workspaces" FOR UPDATE USING (("auth"."uid"() = "owner_id"));



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."add_document_share"("doc_id" "uuid", "perm" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."add_document_share"("doc_id" "uuid", "perm" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."add_document_share"("doc_id" "uuid", "perm" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."add_page_share"("p_id" "uuid", "perm" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."add_page_share"("p_id" "uuid", "perm" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."add_page_share"("p_id" "uuid", "perm" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."can_edit_workspace_as"("p_user_id" "uuid", "p_workspace_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."can_edit_workspace_as"("p_user_id" "uuid", "p_workspace_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."can_manage_page_as"("p_user_id" "uuid", "p_page_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."can_manage_page_as"("p_user_id" "uuid", "p_page_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."consume_api_rate_limit"("p_bucket" "text", "p_subject" "uuid", "p_limit" integer, "p_window_seconds" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."consume_api_rate_limit"("p_bucket" "text", "p_subject" "uuid", "p_limit" integer, "p_window_seconds" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_all_subdoc_ids"("doc_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_all_subdoc_ids"("doc_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_all_subdoc_ids"("doc_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_all_subpage_ids"("page_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_all_subpage_ids"("page_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_all_subpage_ids"("page_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_auth_user_by_email"("p_email" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_auth_user_by_email"("p_email" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_backlinks"("target_page_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_backlinks"("target_page_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_backlinks"("target_page_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_member_workspaces"("user_uuid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_member_workspaces"("user_uuid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_member_workspaces"("user_uuid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_page_access"("p_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_page_access"("p_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_page_access"("p_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_shared_documents"("user_uuid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_shared_documents"("user_uuid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_shared_documents"("user_uuid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_shared_pages"("user_uuid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_shared_pages"("user_uuid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_shared_pages"("user_uuid" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_unconfirmed_auth_user_id"("p_email" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_unconfirmed_auth_user_id"("p_email" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."has_document_access"("doc_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."has_document_access"("doc_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_document_access"("doc_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."increment_page_views"("page_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."increment_page_views"("page_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_page_views"("page_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_page_owner"("p_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_page_owner"("p_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_page_owner"("p_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_page_shared_editor"("p_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_page_shared_editor"("p_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_page_shared_editor"("p_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_page_shared_owner"("p_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_page_shared_owner"("p_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_page_shared_owner"("p_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_workspace_member"("ws_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_workspace_member"("ws_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_workspace_member"("ws_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_workspace_owner"("ws_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_workspace_owner"("ws_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_workspace_owner"("ws_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."move_page_tree_atomic"("p_user_id" "uuid", "p_page_id" "uuid", "p_new_parent_id" "uuid", "p_target_workspace_id" "uuid", "p_position_updates" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."move_page_tree_atomic"("p_user_id" "uuid", "p_page_id" "uuid", "p_new_parent_id" "uuid", "p_target_workspace_id" "uuid", "p_position_updates" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."prune_page_snapshots"("p_page_id" "uuid", "p_keep" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."prune_page_snapshots"("p_page_id" "uuid", "p_keep" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."prune_page_snapshots"("p_page_id" "uuid", "p_keep" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."purge_workspace_trash_as"("p_user_id" "uuid", "p_workspace_id" "uuid", "p_retention_days" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."purge_workspace_trash_as"("p_user_id" "uuid", "p_workspace_id" "uuid", "p_retention_days" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."search_pages_advanced"("ws_id" "uuid", "q" "text", "page_kind" "text", "changed_after" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."search_pages_advanced"("ws_id" "uuid", "q" "text", "page_kind" "text", "changed_after" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."search_pages_advanced"("ws_id" "uuid", "q" "text", "page_kind" "text", "changed_after" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."search_pages_fts"("ws_id" "uuid", "q" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."search_pages_fts"("ws_id" "uuid", "q" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."search_pages_fts"("ws_id" "uuid", "q" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_page_link_permission_atomic"("p_user_id" "uuid", "p_page_id" "uuid", "p_permission" "text", "p_only_upgrade" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_page_link_permission_atomic"("p_user_id" "uuid", "p_page_id" "uuid", "p_permission" "text", "p_only_upgrade" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_profile_email"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_profile_email"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_profile_email"() TO "service_role";



GRANT ALL ON FUNCTION "public"."tiptap_to_text"("content" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."tiptap_to_text"("content" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."tiptap_to_text"("content" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."user_has_page_access"("p_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."user_has_page_access"("p_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."user_has_page_access"("p_id" "uuid") TO "service_role";



GRANT ALL ON TABLE "public"."api_rate_limits" TO "service_role";



GRANT ALL ON TABLE "public"."databases" TO "anon";
GRANT ALL ON TABLE "public"."databases" TO "authenticated";
GRANT ALL ON TABLE "public"."databases" TO "service_role";



GRANT ALL ON TABLE "public"."db_fields" TO "anon";
GRANT ALL ON TABLE "public"."db_fields" TO "authenticated";
GRANT ALL ON TABLE "public"."db_fields" TO "service_role";



GRANT ALL ON TABLE "public"."db_records" TO "anon";
GRANT ALL ON TABLE "public"."db_records" TO "authenticated";
GRANT ALL ON TABLE "public"."db_records" TO "service_role";



GRANT ALL ON TABLE "public"."db_relations" TO "anon";
GRANT ALL ON TABLE "public"."db_relations" TO "authenticated";
GRANT ALL ON TABLE "public"."db_relations" TO "service_role";



GRANT ALL ON TABLE "public"."db_rows" TO "anon";
GRANT ALL ON TABLE "public"."db_rows" TO "authenticated";
GRANT ALL ON TABLE "public"."db_rows" TO "service_role";



GRANT ALL ON TABLE "public"."document_shares" TO "anon";
GRANT ALL ON TABLE "public"."document_shares" TO "authenticated";
GRANT ALL ON TABLE "public"."document_shares" TO "service_role";



GRANT ALL ON TABLE "public"."documents" TO "anon";
GRANT ALL ON TABLE "public"."documents" TO "authenticated";
GRANT ALL ON TABLE "public"."documents" TO "service_role";



GRANT ALL ON TABLE "public"."folders" TO "anon";
GRANT ALL ON TABLE "public"."folders" TO "authenticated";
GRANT ALL ON TABLE "public"."folders" TO "service_role";



GRANT ALL ON TABLE "public"."notifications" TO "anon";
GRANT ALL ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";



GRANT ALL ON TABLE "public"."page_comments" TO "anon";
GRANT ALL ON TABLE "public"."page_comments" TO "authenticated";
GRANT ALL ON TABLE "public"."page_comments" TO "service_role";



GRANT ALL ON TABLE "public"."page_favorites" TO "anon";
GRANT ALL ON TABLE "public"."page_favorites" TO "authenticated";
GRANT ALL ON TABLE "public"."page_favorites" TO "service_role";



GRANT ALL ON TABLE "public"."page_shares" TO "anon";
GRANT ALL ON TABLE "public"."page_shares" TO "authenticated";
GRANT ALL ON TABLE "public"."page_shares" TO "service_role";



GRANT ALL ON TABLE "public"."page_snapshots" TO "anon";
GRANT ALL ON TABLE "public"."page_snapshots" TO "authenticated";
GRANT ALL ON TABLE "public"."page_snapshots" TO "service_role";



GRANT ALL ON TABLE "public"."page_templates" TO "anon";
GRANT ALL ON TABLE "public"."page_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."page_templates" TO "service_role";



GRANT ALL ON TABLE "public"."pages" TO "anon";
GRANT ALL ON TABLE "public"."pages" TO "authenticated";
GRANT ALL ON TABLE "public"."pages" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."push_subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."push_subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."push_subscriptions" TO "service_role";



GRANT ALL ON TABLE "public"."workspace_invites" TO "anon";
GRANT ALL ON TABLE "public"."workspace_invites" TO "authenticated";
GRANT ALL ON TABLE "public"."workspace_invites" TO "service_role";



GRANT ALL ON TABLE "public"."workspace_members" TO "anon";
GRANT ALL ON TABLE "public"."workspace_members" TO "authenticated";
GRANT ALL ON TABLE "public"."workspace_members" TO "service_role";



GRANT ALL ON TABLE "public"."workspaces" TO "anon";
GRANT ALL ON TABLE "public"."workspaces" TO "authenticated";
GRANT ALL ON TABLE "public"."workspaces" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";
