-- Atomic hierarchy and link-sharing operations. Callable only by service_role;
-- the authenticated user id is supplied by a server route and checked here.

create or replace function public.can_manage_page_as(p_user_id uuid, p_page_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.pages p
    where p.id = p_page_id
      and (
        p.owner_id = p_user_id
        or exists (select 1 from public.workspaces w where w.id = p.workspace_id and w.owner_id = p_user_id)
        or exists (
          select 1 from public.workspace_members wm
          where wm.workspace_id = p.workspace_id and wm.user_id = p_user_id and wm.role in ('owner', 'member')
        )
        or exists (
          select 1 from public.page_shares ps
          where ps.page_id = p.id and ps.user_id = p_user_id and ps.permission = 'edit'
        )
      )
  );
$$;

create or replace function public.can_edit_workspace_as(p_user_id uuid, p_workspace_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select
    exists (select 1 from public.workspaces w where w.id = p_workspace_id and w.owner_id = p_user_id)
    or exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = p_workspace_id and wm.user_id = p_user_id and wm.role in ('owner', 'member')
    );
$$;

create or replace function public.move_page_tree_atomic(
  p_user_id uuid,
  p_page_id uuid,
  p_new_parent_id uuid default null,
  p_target_workspace_id uuid default null,
  p_position_updates jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
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

create or replace function public.set_page_link_permission_atomic(
  p_user_id uuid,
  p_page_id uuid,
  p_permission text,
  p_only_upgrade boolean default false
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
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

revoke all on function public.can_manage_page_as(uuid, uuid) from public, anon, authenticated;
revoke all on function public.can_edit_workspace_as(uuid, uuid) from public, anon, authenticated;
revoke all on function public.move_page_tree_atomic(uuid, uuid, uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.set_page_link_permission_atomic(uuid, uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.can_manage_page_as(uuid, uuid) to service_role;
grant execute on function public.can_edit_workspace_as(uuid, uuid) to service_role;
grant execute on function public.move_page_tree_atomic(uuid, uuid, uuid, uuid, jsonb) to service_role;
grant execute on function public.set_page_link_permission_atomic(uuid, uuid, text, boolean) to service_role;
