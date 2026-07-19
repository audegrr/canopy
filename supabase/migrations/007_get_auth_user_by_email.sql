-- Returns id and whether the user has actually ever logged in.
-- inviteUserByEmail sets email_confirmed_at immediately, so that field
-- cannot distinguish "invited but never activated" from a real account.
-- last_sign_in_at is null until the user actually signs in for the first time.
create or replace function get_auth_user_by_email(p_email text)
returns table(id uuid, has_account boolean)
language sql
security definer
set search_path = auth, public
as $$
  select id, (last_sign_in_at is not null) as has_account
  from auth.users
  where email = p_email
  limit 1;
$$;
