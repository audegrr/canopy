-- Page version history: stores up to 50 snapshots per page
create table if not exists page_snapshots (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references pages(id) on delete cascade,
  title text not null default '',
  content jsonb,
  saved_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists page_snapshots_page_id_idx on page_snapshots(page_id, created_at desc);

-- RLS: same visibility as the page itself
alter table page_snapshots enable row level security;

create policy "Users can read snapshots of pages they can access"
  on page_snapshots for select
  using (
    exists (
      select 1 from pages p
      where p.id = page_snapshots.page_id
        and (p.owner_id = auth.uid()
          or p.workspace_id in (
            select workspace_id from workspace_members where user_id = auth.uid()
          )
        )
    )
  );

create policy "Users can insert snapshots for pages they can edit"
  on page_snapshots for insert
  with check (
    exists (
      select 1 from pages p
      where p.id = page_snapshots.page_id
        and (p.owner_id = auth.uid()
          or p.workspace_id in (
            select workspace_id from workspace_members where user_id = auth.uid()
              and role in ('owner', 'member')
          )
        )
    )
  );
