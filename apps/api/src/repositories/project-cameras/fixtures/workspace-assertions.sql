SET ROLE service_role;
DO $test$
DECLARE
  tenant uuid := '00000000-0000-4000-8000-000000000001';
  project uuid := '00000000-0000-4000-8000-000000000101';
  result jsonb;
  term text;
BEGIN
  result := public.list_camera_workspace_projects(tenant, NULL);
  ASSERT (result->>'total')::int = 1, 'default bound excludes empty/deleted/foreign projects';
  ASSERT result#>'{list,0,summary}' = '{"camera_count":3,"online_count":1,"offline_count":1,"unknown_count":1,"hidden_count":1,"tencent_count":2}'::jsonb, 'exact camera counts';
  result := public.list_camera_workspace_projects(tenant, NULL, NULL, 'all', NULL, 1, 1);
  ASSERT jsonb_array_length(result->'list') = 1, 'project database pagination';
  ASSERT (result->>'total')::int = 4, 'zero-camera projects included';
  ASSERT (result#>>'{summary,total_camera_count}')::int = 3, 'global summary independent of page';
  result := public.list_camera_workspace_projects(tenant, NULL, NULL, 'unbound');
  ASSERT (result->>'total')::int = 3, 'deleted-only project unbound';
  ASSERT (result#>>'{summary,total_camera_count}')::int = 0, 'unbound summary is scoped';
  result := public.list_camera_workspace_projects(tenant, ARRAY[]::uuid[], NULL, 'all');
  ASSERT (result->>'total')::int = 0, 'empty visibility must never mean all';
  ASSERT result->'list' = '[]', 'empty visibility list';
  result := public.list_camera_workspace_projects(tenant, ARRAY[project], NULL, 'all');
  ASSERT (result->>'total')::int = 1, 'visible IDs restriction';
  result := public.list_camera_workspace_projects(tenant, ARRAY['00000000-0000-4000-8000-000000000104']::uuid[], NULL, 'all');
  ASSERT (result->>'total')::int = 0, 'foreign visible ID cannot bypass tenant';
  result := public.list_camera_workspace_projects(tenant, NULL, NULL, 'all', 'designing');
  ASSERT (result->>'total')::int = 3, 'project status filter';
  FOREACH term IN ARRAY ARRAY['13812345678', '12345', '客户张', '项目甲', '地址甲', '小区甲', '三栋', '三室'] LOOP
    result := public.list_camera_workspace_projects(tenant, NULL, term, 'all');
    ASSERT (result->>'total')::int = 1, 'server-side keyword search: ' || term;
    ASSERT result#>>'{list,0,project,id}' = project::text, 'search matched correct project';
  END LOOP;
  result := public.list_camera_workspace_projects(tenant, NULL, '%_', 'all');
  ASSERT (result->>'total')::int = 1, 'literal LIKE metacharacters';
  result := public.list_camera_workspace_projects(tenant, NULL, '外租户客户', 'all');
  ASSERT (result->>'total')::int = 0, 'foreign customer must not match';
  result := public.list_camera_workspace_projects(tenant, NULL, NULL, 'all', NULL, 999, 20);
  ASSERT result->'list' = '[]' AND (result->>'total')::int = 4, 'beyond last page retains total';
  ASSERT (result#>>'{summary,total_camera_count}')::int = 3, 'beyond last page retains summary';
  BEGIN
    PERFORM public.list_camera_workspace_projects(NULL, NULL);
    RAISE EXCEPTION 'null tenant accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  BEGIN
    PERFORM public.list_camera_workspace_projects(tenant, NULL, NULL, 'all', NULL, 1, 101);
    RAISE EXCEPTION 'oversized page accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
END;
$test$;
RESET ROLE;
DO $test$
DECLARE signature text := 'public.list_camera_workspace_projects(uuid,uuid[],text,text,text,integer,integer)';
BEGIN
  ASSERT NOT has_function_privilege('anon', signature, 'EXECUTE'), 'anon blocked';
  ASSERT NOT has_function_privilege('authenticated', signature, 'EXECUTE'), 'authenticated blocked';
  ASSERT has_function_privilege('service_role', signature, 'EXECUTE'), 'service role allowed';
END;
$test$;
-- No PostgREST row cap can truncate project/camera counts. Additional tenants
-- demonstrate the indexed tenant boundary in the actual function-body EXPLAIN.
INSERT INTO public.projects(id,tenant_id,name,status,updated_at)
SELECT md5('project' || i)::uuid,
  CASE WHEN i <= 2000 THEN '00000000-0000-4000-8000-000000000001'::uuid
       ELSE md5('tenant' || (i % 20))::uuid END,
  'bulk' || i, 'constructing', now() - i * interval '1 second'
FROM generate_series(1,20000) i;
INSERT INTO public.project_cameras(tenant_id, project_id, status, can_view, vendor)
SELECT p.tenant_id, p.id, 'online', true, 'ezviz'
FROM public.projects p CROSS JOIN generate_series(1,5) n WHERE p.name LIKE 'bulk%';
ANALYZE public.projects;
ANALYZE public.project_cameras;
ANALYZE public.customers;
ANALYZE public.properties;
SET ROLE service_role;
DO $test$
DECLARE result jsonb;
BEGIN
  result := public.list_camera_workspace_projects('00000000-0000-4000-8000-000000000001', NULL, NULL, 'all', NULL, 2, 100);
  ASSERT jsonb_array_length(result->'list') = 100, 'bounded large dataset page';
  ASSERT (result->>'total')::int = 2004, 'project count exceeds REST cap';
  ASSERT (result#>>'{summary,total_camera_count}')::int = 10003, 'camera count exceeds REST cap';
END;
$test$;
RESET ROLE;
