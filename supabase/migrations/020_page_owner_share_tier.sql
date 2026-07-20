-- Adds a third page_shares permission tier, 'owner', between 'edit' and
-- outright ownership: a page owner can delegate full manage rights (change
-- link sharing, add/remove collaborators, move/reorganize the page) to a
-- specific collaborator without giving up ownership. Manage rights are no
-- longer implied by plain workspace membership or an 'edit' share on their
-- own — only owner_id, workspace owner_id, or an explicit 'owner' share
-- grant them (see lib/access-policy.ts for the application-level mirror of
-- this rule).
--
-- Also closes a privilege-escalation hole found while implementing the
-- above: add_page_share(p_id, perm) is a SECURITY DEFINER RPC exposed to
-- anon/authenticated via PostgREST. It inserted whatever `perm` the caller
-- passed, for whatever `p_id` the caller passed, without checking that the
-- target page even has link sharing enabled. Any authenticated (or
-- anonymous) caller could grant themselves edit access to an arbitrary,
-- unrelated page — the app only ever called it when link_permission
-- allowed it, but that check lived in application code (app/share/[id]),
-- not in the function itself, and the RPC is a public endpoint regardless
-- of which UI happens to call it. Extending the permission check constraint
-- to allow 'owner' would have made this strictly worse (self-granted full
-- page management instead of just edit), so it's fixed in the same
-- migration rather than shipped separately.

-- ── 1. Allow 'owner' as a page_shares.permission value ─────────────────────
alter table public.page_shares drop constraint if exists page_shares_permission_check;
alter table public.page_shares
  add constraint page_shares_permission_check check (permission in ('view', 'edit', 'owner'));

-- ── 2. 'owner'-tier shares count as edit access everywhere 'edit' shares do ─
create or replace function public.is_page_shared_editor(p_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.page_shares ps
    where ps.page_id = p_id
      and ps.user_id = auth.uid()
      and ps.permission in ('edit', 'owner')
  );
$$;

-- ── 3. New helper: does the caller hold an 'owner'-tier share on this page ──
create or replace function public.is_page_shared_owner(p_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.page_shares ps
    where ps.page_id = p_id
      and ps.user_id = auth.uid()
      and ps.permission = 'owner'
  );
$$;

-- ── 4. Owner-tier shared users can manage page_shares too (grant/revoke) ────
drop policy if exists "Owner manages page shares" on public.page_shares;
create policy "Owner manages page shares"
on public.page_shares
for all
using (user_id = auth.uid() or is_page_owner(page_id) or is_page_shared_owner(page_id))
with check (user_id = auth.uid() or is_page_owner(page_id) or is_page_shared_owner(page_id));

drop policy if exists "Users see accessible page shares" on public.page_shares;
create policy "Users see accessible page shares"
on public.page_shares
for select
using (user_id = auth.uid() or is_page_owner(page_id) or is_page_shared_owner(page_id));

-- ── 5. Self-join via public link may never grant more than the link itself
--       grants, and can never grant 'owner' (link_permission has no owner
--       tier). Previously this policy only checked that link sharing was
--       enabled at all, not that the inserted `permission` matched it.
drop policy if exists "Users can add themselves to shared" on public.page_shares;
create policy "Users can add themselves to shared"
on public.page_shares
for insert
with check (
  auth.uid() = user_id
  and exists (
    select 1 from public.pages
    where pages.id = page_shares.page_id
      and pages.link_permission = page_shares.permission
      and pages.link_permission in ('view', 'edit')
  )
);

-- ── 6. add_page_share(): stop trusting the caller's `perm` argument. Derive
--       it from the page's actual link_permission, require link sharing to
--       be enabled, and require authentication. This is what actually
--       closes the escalation hole described above — the function runs
--       SECURITY DEFINER, so page_shares RLS does not apply to it, and (5)
--       alone would not have stopped it. `perm` is kept as a parameter for
--       call-site compatibility but is no longer used.
create or replace function public.add_page_share(p_id uuid, perm text)
returns void
language plpgsql
security definer
set search_path = public
as $$
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

revoke all on function public.add_page_share(uuid, text) from public, anon;
grant execute on function public.add_page_share(uuid, text) to authenticated, service_role;

-- ── 7. can_manage_page_as(): manage rights are owner_id / workspace
--       owner_id / an explicit 'owner' share only. Plain workspace
--       membership and 'edit' shares no longer imply manage rights (they
--       still imply edit, via can_edit_workspace_as / is_page_shared_editor).
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
          where wm.workspace_id = p.workspace_id and wm.user_id = p_user_id and wm.role = 'owner'
        )
        or exists (
          select 1 from public.page_shares ps
          where ps.page_id = p.id and ps.user_id = p_user_id and ps.permission = 'owner'
        )
      )
  );
$$;

revoke all on function public.can_manage_page_as(uuid, uuid) from public, anon, authenticated;
grant execute on function public.can_manage_page_as(uuid, uuid) to service_role;
