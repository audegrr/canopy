-- Privileged helpers must never be callable directly with public API roles.
do $$
begin
  if to_regprocedure('public.get_auth_user_by_email(text)') is not null then
    execute 'revoke all on function public.get_auth_user_by_email(text) from public, anon, authenticated';
    execute 'grant execute on function public.get_auth_user_by_email(text) to service_role';
  end if;

  if to_regprocedure('public.get_unconfirmed_auth_user_id(text)') is not null then
    execute 'revoke all on function public.get_unconfirmed_auth_user_id(text) from public, anon, authenticated';
    execute 'grant execute on function public.get_unconfirmed_auth_user_id(text) to service_role';
  end if;

  if to_regprocedure('public.get_workspace_pages(uuid)') is not null then
    execute 'revoke all on function public.get_workspace_pages(uuid) from public, anon';
    execute 'grant execute on function public.get_workspace_pages(uuid) to authenticated, service_role';
  end if;
end $$;
