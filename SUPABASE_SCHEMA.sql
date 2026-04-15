-- Run this in Supabase > SQL Editor

-- Profiles table (synced from auth.users)
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text,
  full_name text,
  created_at timestamptz default now()
);
alter table public.profiles enable row level security;
create policy "Users can view their own profile" on public.profiles for select using (auth.uid() = id);
create policy "Users can update their own profile" on public.profiles for update using (auth.uid() = id);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data->>'full_name');
  return new;
end;
$$ language plpgsql security definer;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Folders
create table public.folders (
  id uuid default gen_random_uuid() primary key,
  name text not null default 'Untitled folder',
  owner_id uuid references auth.users on delete cascade not null,
  created_at timestamptz default now()
);
alter table public.folders enable row level security;
create policy "Owner full access" on public.folders for all using (auth.uid() = owner_id);

-- Documents
create table public.documents (
  id uuid default gen_random_uuid() primary key,
  title text not null default 'Untitled',
  content text default '',
  folder_id uuid references public.folders on delete set null,
  owner_id uuid references auth.users on delete cascade not null,
  link_permission text default 'none' check (link_permission in ('none', 'view', 'edit')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table public.documents enable row level security;
create policy "Owner full access" on public.documents for all using (auth.uid() = owner_id);
create policy "Shared users can view" on public.documents for select
  using (
    link_permission in ('view', 'edit')
    or exists (
      select 1 from public.document_shares
      where document_id = documents.id and user_id = auth.uid()
    )
  );
create policy "Shared editors can update" on public.documents for update
  using (
    link_permission = 'edit'
    or exists (
      select 1 from public.document_shares
      where document_id = documents.id and user_id = auth.uid() and permission = 'edit'
    )
  );

-- Document shares
create table public.document_shares (
  id uuid default gen_random_uuid() primary key,
  document_id uuid references public.documents on delete cascade not null,
  user_id uuid references auth.users on delete cascade not null,
  permission text default 'view' check (permission in ('view', 'edit')),
  created_at timestamptz default now(),
  unique(document_id, user_id)
);
alter table public.document_shares enable row level security;
create policy "Document owner manages shares" on public.document_shares for all
  using (exists (select 1 from public.documents where id = document_id and owner_id = auth.uid()));
create policy "Shared users can see their own share" on public.document_shares for select
  using (auth.uid() = user_id);
