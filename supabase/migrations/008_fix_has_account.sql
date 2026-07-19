-- Fix has_account detection.
-- last_sign_in_at is set when ANY invite link is clicked (even broken ones),
-- so it cannot distinguish "invited but never activated" from a real account.
-- encrypted_password is only set for users who went through the real signup flow
-- (email+password). Invited users have encrypted_password = '' or null.
-- Users who signed in via Google etc. have provider != 'email', so they are
-- also correctly detected as having a real account.
create or replace function get_auth_user_by_email(p_email text)
returns table(id uuid, has_account boolean)
language sql
security definer
set search_path = auth, public
as $$
  select id, (
    (encrypted_password is not null and length(encrypted_password) > 0)
    or (raw_app_meta_data->>'provider' is distinct from 'email')
  ) as has_account
  from auth.users
  where email = p_email
  limit 1;
$$;
