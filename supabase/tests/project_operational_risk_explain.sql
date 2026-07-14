\set ON_ERROR_STOP on

explain (analyze, buffers, verbose)
select public.get_project_operational_risk_page(
  :'project_health_tenant_id'::uuid,
  1,
  20,
  null,
  null,
  null,
  'Asia/Shanghai'
);
