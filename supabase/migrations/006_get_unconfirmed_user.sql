-- Returns the auth.users id for an invited-but-not-yet-confirmed user.
-- Used by the invite API to delete and re-invite when resending is needed.
create or replace function get_unconfirmed_auth_user_id(p_email text)
returns uuid
language sql
security definer
set search_path = auth, public
as $$
  select id from auth.users
  where email = p_email
    and email_confirmed_at is null
  limit 1;
$$;
