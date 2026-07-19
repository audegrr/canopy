-- Accent colour per workspace
alter table workspaces add column if not exists accent_color text default '#0b6e99';

-- Workspace invite links
create table if not exists workspace_invites (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  token text not null unique default encode(gen_random_bytes(16), 'hex'),
  role text not null default 'member' check (role in ('member', 'viewer')),
  created_by uuid references auth.users(id),
  expires_at timestamptz default (now() + interval '7 days'),
  created_at timestamptz not null default now()
);

alter table workspace_invites enable row level security;

create policy "Workspace owners can manage invites"
  on workspace_invites for all
  using (
    exists (
      select 1 from workspaces w where w.id = workspace_invites.workspace_id and w.owner_id = auth.uid()
    )
  );

create policy "Anyone with the token can read the invite"
  on workspace_invites for select
  using (true);
