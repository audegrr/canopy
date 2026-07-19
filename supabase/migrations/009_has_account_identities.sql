-- Improve has_account detection to include identity linking (e.g. Google OAuth).
-- When a user links Google via linkIdentity(), Supabase adds a row to auth.identities
-- but raw_app_meta_data->>'provider' may still read 'email'. Checking the identities
-- table directly is more reliable than relying on the provider field.
create or replace function get_auth_user_by_email(p_email text)
returns table(id uuid, has_account boolean)
language sql
security definer
set search_path = auth, public
as $$
  select
    u.id,
    (
      -- Has a real password set (email+password signup or welcome page setup)
      (u.encrypted_password is not null and length(u.encrypted_password) > 0)
      -- OR has any non-email identity linked (Google, GitHub, etc.)
      or exists (
        select 1 from auth.identities i
        where i.user_id = u.id
        and i.provider != 'email'
      )
    ) as has_account
  from auth.users u
  where u.email = p_email
  limit 1;
$$;
