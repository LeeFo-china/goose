\set ON_ERROR_STOP on
-- Isolated minimal-schema migration test. Never run against a shared/production DB.
DO $$ BEGIN
  IF current_database() <> 'gooes_internal_comments_test' THEN
    RAISE EXCEPTION 'This fixture requires the isolated gooes_internal_comments_test database';
  END IF;
END $$;
CREATE TABLE public.tenants (id uuid PRIMARY KEY);
CREATE TABLE public.employees (id uuid PRIMARY KEY, tenant_id uuid, status text NOT NULL);
CREATE TABLE public.project_logs (id uuid PRIMARY KEY, tenant_id uuid);
\ir ../migrations/20261010111529_project_log_internal_comments.sql
INSERT INTO tenants VALUES ('00000000-0000-4000-8000-000000000001'), ('00000000-0000-4000-8000-000000000002');
INSERT INTO employees VALUES ('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','active');
INSERT INTO project_logs VALUES ('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001'),
 ('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001');
CREATE FUNCTION pg_temp.add_comment(p_id uuid, p_tenant uuid, p_log uuid, p_parent uuid, p_status text) RETURNS void
LANGUAGE sql AS $$
  INSERT INTO public.project_log_internal_comments(id,tenant_id,log_id,author_id,parent_id,content,moderation_status,moderation_trace_id,moderated_at,content_sha256)
  VALUES(p_id,p_tenant,p_log,'00000000-0000-4000-8000-000000000001',p_parent,'内部记录',p_status,'trace',now(),repeat('a',64));
$$;
DO $$ DECLARE
  first_id uuid := '00000000-0000-4000-8000-000000000001';
  second_id uuid := '00000000-0000-4000-8000-000000000002';
  third_id uuid := '00000000-0000-4000-8000-000000000003';
BEGIN
  PERFORM pg_temp.add_comment(first_id, first_id, first_id, null, 'approved');
  PERFORM pg_temp.add_comment(second_id, first_id, first_id, null, 'pending');
  PERFORM pg_temp.add_comment(third_id, first_id, first_id, first_id, 'approved');
  BEGIN
    PERFORM pg_temp.add_comment(gen_random_uuid(), second_id, first_id, null, 'approved');
    RAISE EXCEPTION 'FAIL: cross tenant accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    PERFORM pg_temp.add_comment(gen_random_uuid(), first_id, second_id, first_id, 'approved');
    RAISE EXCEPTION 'FAIL: cross log parent accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    PERFORM pg_temp.add_comment(gen_random_uuid(), first_id, first_id, second_id, 'approved');
    RAISE EXCEPTION 'FAIL: pending parent accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    UPDATE project_log_internal_comments SET content = '改写审核通过内容' WHERE id = first_id;
    RAISE EXCEPTION 'FAIL: reuse approval after edit';
  EXCEPTION WHEN check_violation THEN NULL; END;
  UPDATE employees SET status = 'inactive';
  BEGIN
    PERFORM pg_temp.add_comment(gen_random_uuid(), first_id, first_id, null, 'approved');
    RAISE EXCEPTION 'FAIL: inactive employee accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  UPDATE employees SET status = 'active';
  IF (SELECT count(*) FROM project_log_internal_comments WHERE moderation_status = 'approved') <> 2 THEN
    RAISE EXCEPTION 'FAIL: pending comment counted as approved';
  END IF;
  IF has_table_privilege('anon','public.project_log_internal_comments','SELECT')
    OR has_table_privilege('authenticated','public.project_log_internal_comments','SELECT')
    OR has_table_privilege('authenticated','public.project_log_internal_comments','INSERT') THEN
    RAISE EXCEPTION 'FAIL: direct client privileges';
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.project_log_internal_comments'::regclass) THEN
    RAISE EXCEPTION 'FAIL: RLS disabled';
  END IF;
END $$;
SET ROLE authenticated;
DO $$ BEGIN
  BEGIN
    PERFORM 1 FROM public.project_log_internal_comments;
    RAISE EXCEPTION 'FAIL: authenticated direct read allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SET ROLE service_role;
SELECT count(*) AS service_role_readable FROM public.project_log_internal_comments;
RESET ROLE;
INSERT INTO project_log_internal_comments(tenant_id,log_id,author_id,content,moderation_status,moderation_trace_id,moderated_at,content_sha256)
SELECT '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001',
'00000000-0000-4000-8000-000000000001','内部记录', 'approved','trace',now(),repeat('a',64)
FROM generate_series(1,5000);
ANALYZE project_log_internal_comments;
EXPLAIN (ANALYZE, BUFFERS)
SELECT id,log_id,parent_id,author_id,content,moderation_status,created_at FROM project_log_internal_comments
WHERE tenant_id='00000000-0000-4000-8000-000000000001' AND log_id='00000000-0000-4000-8000-000000000001'
AND moderation_status='approved' ORDER BY created_at,id LIMIT 20 OFFSET 20;
SELECT 'Internal comment migration isolation checks passed' AS result;
