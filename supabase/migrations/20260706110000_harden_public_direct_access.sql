-- Harden public direct access.
--
-- The Fastify API uses service_role after AuthContext, tenant, and permission
-- checks. RLS and privilege revokes here are a database guard against clients
-- bypassing the API with anon/authenticated Supabase keys.
--
-- Do not add FORCE ROW LEVEL SECURITY in this phase; service_role must keep
-- working for the existing API/repository access pattern.

do $$
declare
  target record;
begin
  for target in
    select format('%I.%I', namespace.nspname, class.relname) as relation_name
    from pg_class class
    join pg_namespace namespace on namespace.oid = class.relnamespace
    where namespace.nspname = 'public'
      and class.relkind in ('r', 'p')
      and class.relpersistence = 'p'
      and class.relrowsecurity = false
    order by class.relname
  loop
    raise notice 'enable row level security on %', target.relation_name;
    execute format(
      'alter table %s enable row level security',
      target.relation_name
    );
  end loop;
end $$;

revoke all privileges on all tables in schema public from anon;
revoke all privileges on all tables in schema public from authenticated;

revoke all privileges on all sequences in schema public from anon;
revoke all privileges on all sequences in schema public from authenticated;

revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
revoke execute on all functions in schema public from authenticated;
grant execute on all functions in schema public to service_role;

alter default privileges in schema public
  revoke all privileges on tables from anon;
alter default privileges in schema public
  revoke all privileges on tables from authenticated;

alter default privileges in schema public
  revoke all privileges on sequences from anon;
alter default privileges in schema public
  revoke all privileges on sequences from authenticated;

alter default privileges in schema public
  revoke execute on functions from public;
alter default privileges in schema public
  revoke execute on functions from anon;
alter default privileges in schema public
  revoke execute on functions from authenticated;
alter default privileges in schema public
  grant execute on functions to service_role;
