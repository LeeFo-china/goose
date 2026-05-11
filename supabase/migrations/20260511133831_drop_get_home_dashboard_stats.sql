do $$
declare
  target_function record;
begin
  for target_function in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'get_home_dashboard_stats'
  loop
    execute format('drop function if exists %s', target_function.signature);
  end loop;
end $$;
