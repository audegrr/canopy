begin;

create extension if not exists pgtap with schema extensions;
select plan(12);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.pages'::regclass),
  'pages has row-level security enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.api_rate_limits'::regclass),
  'rate-limit storage has row-level security enabled'
);

select ok(exists(
  select 1 from pg_policies
  where schemaname = 'public' and tablename = 'pages'
    and policyname = 'workspace members and editors can select pages'
), 'workspace collaborators have an explicit pages SELECT policy');
select ok(exists(
  select 1 from pg_policies
  where schemaname = 'public' and tablename = 'pages'
    and policyname = 'workspace members and editors can update pages'
), 'workspace collaborators have an explicit pages UPDATE policy');
select ok(exists(
  select 1 from pg_policies
  where schemaname = 'public' and tablename = 'pages'
    and policyname = 'workspace members and editors can delete pages'
), 'workspace collaborators have an explicit pages DELETE policy');

select ok(to_regprocedure('public.consume_api_rate_limit(text,uuid,integer,integer)') is not null,
  'durable rate-limit function exists');
select ok(to_regprocedure('public.move_page_tree_atomic(uuid,uuid,uuid,uuid,jsonb)') is not null,
  'atomic page-move function exists');
select ok(to_regprocedure('public.set_page_link_permission_atomic(uuid,uuid,text,boolean)') is not null,
  'atomic link-permission function exists');

select ok(not has_function_privilege(
  'anon', 'public.consume_api_rate_limit(text,uuid,integer,integer)', 'execute'
), 'anonymous users cannot call the rate-limit function');
select ok(not has_function_privilege(
  'authenticated', 'public.move_page_tree_atomic(uuid,uuid,uuid,uuid,jsonb)', 'execute'
), 'authenticated clients cannot bypass the page-move API');
select ok(not has_function_privilege(
  'authenticated', 'public.set_page_link_permission_atomic(uuid,uuid,text,boolean)', 'execute'
), 'authenticated clients cannot bypass the link-permission API');
select ok(has_function_privilege(
  'service_role', 'public.move_page_tree_atomic(uuid,uuid,uuid,uuid,jsonb)', 'execute'
), 'service role can call the atomic page-move function');

select * from finish();
rollback;
