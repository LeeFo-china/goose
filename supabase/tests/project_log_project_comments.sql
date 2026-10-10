\set ON_ERROR_STOP on
-- Run only in a fresh LOCAL gooes_project_comments_test database with Supabase roles.
-- Example: psql -X -d gooes_project_comments_test -f supabase/tests/project_log_project_comments.sql
DO $$ BEGIN
  IF current_database() <> 'gooes_project_comments_test' THEN
    RAISE EXCEPTION 'This fixture requires isolated gooes_project_comments_test';
  END IF;
END $$;

CREATE TABLE public.tenants (id uuid PRIMARY KEY);
CREATE TABLE public.employees (id uuid PRIMARY KEY, tenant_id uuid, status text, name text, tenant_department_id uuid);
CREATE TABLE public.customers (id uuid PRIMARY KEY, tenant_id uuid, name text, owner_id uuid);
CREATE TABLE public.projects (id uuid PRIMARY KEY, tenant_id uuid, customer_id uuid);
CREATE TABLE public.project_members (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid, employee_id uuid, deleted_at timestamptz);
-- Existing production indexes from 20260423133000_create_project_members_table.sql.
CREATE INDEX idx_project_members_project_id ON public.project_members(project_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_project_members_employee_id ON public.project_members(employee_id) WHERE deleted_at IS NULL;
CREATE TABLE public.project_logs (id uuid PRIMARY KEY, tenant_id uuid, project_id uuid NOT NULL);
CREATE TABLE public.system_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid,
  key text NOT NULL, group_code text NOT NULL, name text NOT NULL, description text,
  value_type text NOT NULL, value_text text, is_secret boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'active', created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE UNIQUE INDEX system_settings_platform_key ON public.system_settings(key) WHERE tenant_id IS NULL;
-- Exercise explicit revocation even on installations with broad default grants.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role, anon, authenticated;
GRANT USAGE ON SCHEMA public TO service_role, anon, authenticated;
GRANT SELECT ON public.tenants, public.employees, public.customers, public.projects, public.project_logs TO service_role;
\ir ../migrations/20261010140944_project_log_project_comments.sql

DO $$ BEGIN
  IF to_regclass('public.project_log_project_comments') IS NULL THEN
    RAISE EXCEPTION 'FAIL: project communication table missing';
  END IF;
  IF (SELECT count(*) FROM public.project_log_project_comments) <> 0 THEN
    RAISE EXCEPTION 'FAIL: historical comments copied';
  END IF;
  IF (SELECT count(*) FROM public.system_settings WHERE tenant_id IS NULL
    AND key IN ('PROJECT_LOG_COMMUNICATION_ENABLED', 'PROJECT_LOG_INTERNAL_COMMENTS_RETIRED')
    AND value_type = 'boolean' AND value_text = 'false' AND status = 'active' AND NOT is_secret) <> 2 THEN
    RAISE EXCEPTION 'FAIL: independent rollout settings must default false';
  END IF;
  UPDATE public.system_settings SET value_text = 'true' WHERE key = 'PROJECT_LOG_COMMUNICATION_ENABLED';
  IF (SELECT value_text FROM public.system_settings WHERE key = 'PROJECT_LOG_INTERNAL_COMMENTS_RETIRED') <> 'false' THEN
    RAISE EXCEPTION 'FAIL: enabling communication retired internal comments';
  END IF;
  UPDATE public.system_settings SET value_text = 'false' WHERE key = 'PROJECT_LOG_COMMUNICATION_ENABLED';
  UPDATE public.system_settings SET value_text = 'true' WHERE key = 'PROJECT_LOG_INTERNAL_COMMENTS_RETIRED';
  IF (SELECT value_text FROM public.system_settings WHERE key = 'PROJECT_LOG_COMMUNICATION_ENABLED') <> 'false' THEN
    RAISE EXCEPTION 'FAIL: retiring internal comments enabled communication';
  END IF;
  UPDATE public.system_settings SET value_text = 'false' WHERE key = 'PROJECT_LOG_INTERNAL_COMMENTS_RETIRED';
END $$;

CREATE FUNCTION pg_temp.uid(n integer) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT ('00000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid;
$$;
INSERT INTO public.tenants SELECT pg_temp.uid(n) FROM generate_series(1,2) n;
INSERT INTO public.employees (id,tenant_id,status,name) VALUES
  (pg_temp.uid(1),pg_temp.uid(1),'active','员工一'),
  (pg_temp.uid(2),pg_temp.uid(2),'active','员工二'),
  (pg_temp.uid(3),pg_temp.uid(1),'inactive','离职员工'),
  (pg_temp.uid(4),pg_temp.uid(1),'active','员工四');
INSERT INTO public.customers (id,tenant_id,name) VALUES
  (pg_temp.uid(1),pg_temp.uid(1),'客户一'),
  (pg_temp.uid(2),pg_temp.uid(2),'客户二'),
  (pg_temp.uid(3),pg_temp.uid(1),NULL);
INSERT INTO public.projects VALUES
  (pg_temp.uid(1),pg_temp.uid(1),pg_temp.uid(1)),
  (pg_temp.uid(2),pg_temp.uid(2),pg_temp.uid(2)),
  (pg_temp.uid(3),pg_temp.uid(1),NULL);
INSERT INTO public.project_logs VALUES
  (pg_temp.uid(1),pg_temp.uid(1),pg_temp.uid(1)),
  (pg_temp.uid(2),pg_temp.uid(1),pg_temp.uid(1)),
  (pg_temp.uid(3),pg_temp.uid(2),pg_temp.uid(2)),
  (pg_temp.uid(4),pg_temp.uid(1),pg_temp.uid(2)), -- corrupt legacy project tenant
  (pg_temp.uid(5),NULL,pg_temp.uid(1)),
  (pg_temp.uid(6),pg_temp.uid(1),pg_temp.uid(3));

CREATE FUNCTION pg_temp.add_comment(
  comment_id integer, tenant integer DEFAULT 1, log integer DEFAULT 1,
  author_type text DEFAULT 'employee', employee integer DEFAULT 1,
  customer integer DEFAULT NULL, parent integer DEFAULT NULL,
  status text DEFAULT 'approved', body text DEFAULT '项目沟通'
) RETURNS void LANGUAGE sql AS $$
  INSERT INTO public.project_log_project_comments
    (id,tenant_id,log_id,author_type,employee_author_id,customer_author_id,parent_id,
     content,moderation_status,moderation_trace_id,moderated_at,content_sha256)
  VALUES (pg_temp.uid(comment_id),pg_temp.uid(tenant),pg_temp.uid(log),author_type,
    pg_temp.uid(employee),pg_temp.uid(customer),pg_temp.uid(parent),body,status,'trace',now(),repeat('a',64));
$$;
CREATE FUNCTION pg_temp.reject(statement text, expected_state text DEFAULT '23514') RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE statement;
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE = expected_state THEN RETURN; END IF;
    RAISE;
  END;
  RAISE EXCEPTION 'FAIL: accepted invalid statement: %', statement;
END $$;

-- Both audiences share approved roots/replies; pending rows can be persisted.
SELECT pg_temp.add_comment(1);
SELECT pg_temp.add_comment(2, author_type => 'customer', employee => NULL, customer => 1, parent => 1);
SELECT pg_temp.add_comment(3, parent => 2);
SELECT pg_temp.add_comment(4, status => 'pending');
SELECT pg_temp.add_comment(5, tenant => 2, log => 3, employee => 2);
SELECT pg_temp.add_comment(6, body => repeat('字',500));
SELECT pg_temp.add_comment(7, body => ' 字 ');

-- Ownership, tenant/log/project boundaries, XOR author shape and parent visibility.
SELECT pg_temp.reject($q$SELECT pg_temp.add_comment(10,tenant => 2)$q$);
SELECT pg_temp.reject($q$SELECT pg_temp.add_comment(10,log => 4)$q$);
SELECT pg_temp.reject($q$SELECT pg_temp.add_comment(10,log => 5)$q$);
SELECT pg_temp.reject($q$SELECT pg_temp.add_comment(10,employee => 2)$q$);
SELECT pg_temp.reject($q$SELECT pg_temp.add_comment(10,employee => 3)$q$);
SELECT pg_temp.reject($q$SELECT pg_temp.add_comment(10,employee => 99)$q$);
SELECT pg_temp.reject($q$SELECT pg_temp.add_comment(10,author_type => 'customer',employee => NULL,customer => 2)$q$);
SELECT pg_temp.reject($q$SELECT pg_temp.add_comment(10,author_type => 'customer',employee => NULL,customer => 3)$q$);
SELECT pg_temp.reject($q$SELECT pg_temp.add_comment(10,log => 6,author_type => 'customer',employee => NULL,customer => 1)$q$);
SELECT pg_temp.reject($q$SELECT pg_temp.add_comment(10,employee => NULL)$q$);
SELECT pg_temp.reject($q$SELECT pg_temp.add_comment(10,customer => 1)$q$);
SELECT pg_temp.reject($q$SELECT pg_temp.add_comment(10,author_type => 'customer',customer => 1)$q$);
SELECT pg_temp.reject($q$SELECT pg_temp.add_comment(10,author_type => 'customer',employee => NULL)$q$);
SELECT pg_temp.reject($q$SELECT pg_temp.add_comment(10,author_type => 'visitor')$q$);
SELECT pg_temp.reject($q$SELECT pg_temp.add_comment(10,log => 2,parent => 1)$q$);
SELECT pg_temp.reject($q$SELECT pg_temp.add_comment(10,parent => 5)$q$);
SELECT pg_temp.reject($q$SELECT pg_temp.add_comment(10,parent => 4)$q$);
SELECT pg_temp.reject($q$SELECT pg_temp.add_comment(10,parent => 99)$q$);
SELECT pg_temp.reject($q$SELECT pg_temp.add_comment(10,parent => 10)$q$);
SELECT pg_temp.reject($q$SELECT pg_temp.add_comment(10,body => '   ')$q$);
SELECT pg_temp.reject($q$SELECT pg_temp.add_comment(10,body => repeat('字',501))$q$);
SELECT pg_temp.reject($q$SELECT pg_temp.add_comment(10,status => 'rejected')$q$);

-- A matching project customer is insufficient if that customer's tenant is wrong.
BEGIN;
UPDATE public.projects SET customer_id = pg_temp.uid(2) WHERE id = pg_temp.uid(1);
SELECT pg_temp.reject($q$SELECT pg_temp.add_comment(10,author_type => 'customer',employee => NULL,customer => 2)$q$);
ROLLBACK;

-- Immutability even for an owner with UPDATE privileges; valid alternative authors/scopes.
DO $$ DECLARE assignment text; BEGIN
  FOREACH assignment IN ARRAY ARRAY[
    'content = ''changed''', 'content_sha256 = repeat(''b'',64)',
    'employee_author_id = pg_temp.uid(4)',
    'author_type = ''customer'', employee_author_id = NULL, customer_author_id = pg_temp.uid(1)',
    'log_id = pg_temp.uid(2)', 'parent_id = pg_temp.uid(2)',
    'tenant_id = pg_temp.uid(2), log_id = pg_temp.uid(3), employee_author_id = pg_temp.uid(2)',
    'id = pg_temp.uid(90)', 'created_at = created_at + interval ''1 second'''
  ] LOOP
    PERFORM pg_temp.reject('UPDATE public.project_log_project_comments SET ' || assignment || ' WHERE id = pg_temp.uid(1)');
  END LOOP;
END $$;
SELECT pg_temp.reject($q$UPDATE public.project_log_project_comments SET customer_author_id = pg_temp.uid(3) WHERE id = pg_temp.uid(2)$q$);

-- Check the composite FK independently of the trigger, inside a rollback-only transaction.
BEGIN;
ALTER TABLE public.project_log_project_comments DISABLE TRIGGER project_log_project_comments_validate_scope;
SELECT pg_temp.reject($q$SELECT pg_temp.add_comment(10,log => 2,parent => 1)$q$, '23503');
SELECT pg_temp.reject($q$SELECT pg_temp.add_comment(10,parent => 10)$q$);
SELECT pg_temp.reject($q$SELECT pg_temp.add_comment(10,employee => 99)$q$, '23503');
SELECT pg_temp.reject($q$SELECT pg_temp.add_comment(10,author_type => 'customer',employee => NULL,customer => 99)$q$, '23503');
SELECT pg_temp.reject($q$SELECT pg_temp.add_comment(10,customer => 1)$q$);
SELECT pg_temp.reject($q$SELECT pg_temp.add_comment(10,author_type => 'customer',customer => 1)$q$);
ROLLBACK;

DO $$ DECLARE role_name text; privilege text; BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.project_log_project_comments'::regclass) THEN
    RAISE EXCEPTION 'FAIL: RLS disabled';
  END IF;
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
    FOREACH privilege IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] LOOP
      IF has_table_privilege(role_name,'public.project_log_project_comments',privilege)
        IS DISTINCT FROM (role_name = 'service_role' AND privilege IN ('SELECT','INSERT')) THEN
        RAISE EXCEPTION 'FAIL: unexpected % privilege for %', privilege, role_name;
      END IF;
    END LOOP;
  END LOOP;
END $$;
SET ROLE anon;
SELECT pg_temp.reject('SELECT * FROM public.project_log_project_comments','42501');
SELECT pg_temp.reject('SELECT pg_temp.add_comment(20)','42501');
RESET ROLE;
SET ROLE authenticated;
SELECT pg_temp.reject('SELECT * FROM public.project_log_project_comments','42501');
SELECT pg_temp.reject('SELECT pg_temp.add_comment(20)','42501');
RESET ROLE;
-- Even accidental table grants must not bypass client RLS denial.
BEGIN;
GRANT SELECT, INSERT ON public.project_log_project_comments TO anon, authenticated;
SET LOCAL ROLE anon;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.project_log_project_comments) THEN RAISE EXCEPTION 'FAIL: anon RLS read'; END IF;
END $$;
SELECT pg_temp.reject('SELECT pg_temp.add_comment(20)','42501');
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.project_log_project_comments) THEN RAISE EXCEPTION 'FAIL: authenticated RLS read'; END IF;
END $$;
SELECT pg_temp.reject('SELECT pg_temp.add_comment(20)','42501');
ROLLBACK;
SET ROLE service_role;
SELECT pg_temp.add_comment(20);
SELECT pg_temp.add_comment(21, author_type => 'customer', employee => NULL, customer => 1, parent => 20);
DO $$ BEGIN
  IF (SELECT count(*) FROM public.project_log_project_comments) <> 9 THEN RAISE EXCEPTION 'FAIL: service SELECT/INSERT'; END IF;
END $$;
SELECT pg_temp.reject('UPDATE public.project_log_project_comments SET moderation_status = ''pending''','42501');
SELECT pg_temp.reject('DELETE FROM public.project_log_project_comments','42501');
RESET ROLE;

INSERT INTO public.project_log_project_comments
  (tenant_id,log_id,author_type,employee_author_id,content,moderation_status,moderation_trace_id,moderated_at,content_sha256)
SELECT pg_temp.uid(1),pg_temp.uid(1),'employee',pg_temp.uid(1),'项目沟通','approved','trace',now(),repeat('a',64)
FROM generate_series(1,5000);
ANALYZE public.project_log_project_comments;
EXPLAIN (ANALYZE, BUFFERS)
SELECT id,log_id,parent_id,author_type,employee_author_id,customer_author_id,content,moderation_status,created_at
FROM public.project_log_project_comments
WHERE tenant_id = '00000000-0000-4000-8000-000000000001'
  AND log_id = '00000000-0000-4000-8000-000000000001' AND moderation_status = 'approved'
ORDER BY created_at,id LIMIT 20 OFFSET 20;
-- The access RPC is a fresh, single-project boolean, never a cached ID list.
DO $$ BEGIN
  IF to_regprocedure('public.can_access_project_communication_scope(uuid,uuid,uuid,text,uuid)') IS NULL THEN
    RAISE EXCEPTION 'FAIL: fresh project communication scope RPC missing';
  END IF;
END $$;
CREATE FUNCTION pg_temp.assert_access(
  expected boolean, scope text, employee integer DEFAULT 1, tenant integer DEFAULT 1,
  project integer DEFAULT 1, department integer DEFAULT NULL
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF public.can_access_project_communication_scope(pg_temp.uid(project),pg_temp.uid(tenant),
    pg_temp.uid(employee),scope,pg_temp.uid(department)) IS DISTINCT FROM expected THEN
    RAISE EXCEPTION 'FAIL: scope %, employee %, tenant %, project %, department %, expected %',
      scope,employee,tenant,project,department,expected;
  END IF;
END $$;
SELECT pg_temp.assert_access(true,'all');
SELECT pg_temp.assert_access(false,'unknown');
SELECT pg_temp.assert_access(false,NULL);
SELECT pg_temp.assert_access(false,'all',employee => 3); -- inactive requester
SELECT pg_temp.assert_access(false,'all',employee => 2); -- other-tenant requester
SELECT pg_temp.assert_access(false,'all',employee => 99);
SELECT pg_temp.assert_access(false,'all',employee => NULL);
SELECT pg_temp.assert_access(false,'all',project => 2);
SELECT pg_temp.assert_access(false,'all',project => 99);
SELECT pg_temp.assert_access(false,'all',tenant => NULL);
SELECT pg_temp.assert_access(false,'self');
SELECT pg_temp.assert_access(false,'assigned');

-- Membership grant/revocation is visible to the very next call.
INSERT INTO public.project_members(project_id,employee_id) VALUES (pg_temp.uid(1),pg_temp.uid(1));
SELECT pg_temp.assert_access(true,'self');
SELECT pg_temp.assert_access(true,'assigned');
UPDATE public.project_members SET deleted_at = now();
SELECT pg_temp.assert_access(false,'self');
SELECT pg_temp.assert_access(false,'assigned');
UPDATE public.project_members SET deleted_at = NULL;
UPDATE public.employees SET status = 'inactive' WHERE id = pg_temp.uid(1);
SELECT pg_temp.assert_access(false,'self');
SELECT pg_temp.assert_access(false,'all');
UPDATE public.employees SET status = 'active' WHERE id = pg_temp.uid(1);
DELETE FROM public.project_members;
SELECT pg_temp.assert_access(false,'self');

-- Customer ownership grants self/assigned, independent of membership.
UPDATE public.customers SET owner_id = pg_temp.uid(1) WHERE id = pg_temp.uid(1);
SELECT pg_temp.assert_access(true,'self');
SELECT pg_temp.assert_access(true,'assigned');
UPDATE public.customers SET owner_id = pg_temp.uid(4) WHERE id = pg_temp.uid(1);
SELECT pg_temp.assert_access(false,'self');
SELECT pg_temp.assert_access(false,'assigned');
SELECT pg_temp.assert_access(true,'self',employee => 4);
UPDATE public.customers SET tenant_id = pg_temp.uid(2) WHERE id = pg_temp.uid(1);
SELECT pg_temp.assert_access(false,'self',employee => 4);
UPDATE public.customers SET tenant_id = pg_temp.uid(1), owner_id = NULL WHERE id = pg_temp.uid(1);

-- Validate the caller's actual department; peers retain current read-policy semantics.
UPDATE public.employees SET tenant_department_id = pg_temp.uid(10) WHERE id IN (pg_temp.uid(1),pg_temp.uid(4));
INSERT INTO public.project_members(project_id,employee_id) VALUES (pg_temp.uid(1),pg_temp.uid(4));
SELECT pg_temp.assert_access(true,'department',department => 10);
SELECT pg_temp.assert_access(false,'department');
SELECT pg_temp.assert_access(false,'department',department => 11);
SELECT pg_temp.assert_access(false,'self');
UPDATE public.employees SET status = 'inactive' WHERE id = pg_temp.uid(4);
SELECT pg_temp.assert_access(true,'department',department => 10); -- legacy read semantics do not require active peer
UPDATE public.employees SET status = 'active', tenant_department_id = pg_temp.uid(11) WHERE id = pg_temp.uid(4);
SELECT pg_temp.assert_access(false,'department',department => 10);
UPDATE public.employees SET tenant_department_id = pg_temp.uid(10) WHERE id = pg_temp.uid(4);
UPDATE public.employees SET tenant_department_id = pg_temp.uid(11) WHERE id = pg_temp.uid(1);
SELECT pg_temp.assert_access(false,'department',department => 10); -- reject stale caller department
SELECT pg_temp.assert_access(false,'department',department => 11);
UPDATE public.employees SET tenant_department_id = pg_temp.uid(10) WHERE id = pg_temp.uid(1);
UPDATE public.project_members SET deleted_at = now();
SELECT pg_temp.assert_access(false,'department',department => 10);

-- Department ownership branch and immediate revocations after owner changes.
UPDATE public.customers SET owner_id = pg_temp.uid(4) WHERE id = pg_temp.uid(1);
SELECT pg_temp.assert_access(true,'department',department => 10);
UPDATE public.employees SET tenant_department_id = pg_temp.uid(11) WHERE id = pg_temp.uid(4);
SELECT pg_temp.assert_access(false,'department',department => 10);
UPDATE public.employees SET tenant_department_id = pg_temp.uid(10) WHERE id = pg_temp.uid(4);
UPDATE public.customers SET tenant_id = pg_temp.uid(2) WHERE id = pg_temp.uid(1);
SELECT pg_temp.assert_access(false,'department',department => 10);
UPDATE public.customers SET tenant_id = pg_temp.uid(1), owner_id = pg_temp.uid(2) WHERE id = pg_temp.uid(1);
UPDATE public.employees SET tenant_department_id = pg_temp.uid(10) WHERE id = pg_temp.uid(2);
SELECT pg_temp.assert_access(false,'department',department => 10); -- owner from other tenant
UPDATE public.customers SET owner_id = NULL WHERE id = pg_temp.uid(1);
INSERT INTO public.project_members(project_id,employee_id) VALUES (pg_temp.uid(1),pg_temp.uid(2));
SELECT pg_temp.assert_access(false,'department',department => 10); -- member from other tenant
UPDATE public.project_members SET deleted_at = NULL WHERE employee_id = pg_temp.uid(4);
SELECT pg_temp.assert_access(true,'department',department => 10);
UPDATE public.employees SET tenant_id = pg_temp.uid(2) WHERE id = pg_temp.uid(1);
SELECT pg_temp.assert_access(false,'department',department => 10);
UPDATE public.employees SET tenant_id = pg_temp.uid(1) WHERE id = pg_temp.uid(1);

DO $$ DECLARE rpc regprocedure := 'public.can_access_project_communication_scope(uuid,uuid,uuid,text,uuid)'::regprocedure; BEGIN
  IF NOT (SELECT prosecdef AND provolatile = 's' AND proconfig @> ARRAY['search_path=public, pg_temp'] FROM pg_proc WHERE oid = rpc) THEN
    RAISE EXCEPTION 'FAIL: access RPC must be stable security definer with fixed search_path';
  END IF;
  IF has_function_privilege('anon',rpc,'EXECUTE') OR has_function_privilege('authenticated',rpc,'EXECUTE')
    OR NOT has_function_privilege('service_role',rpc,'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL: access RPC execution privileges';
  END IF;
END $$;
SET ROLE anon;
SELECT pg_temp.reject($q$SELECT public.can_access_project_communication_scope(NULL,NULL,NULL,'all')$q$,'42501');
RESET ROLE;
SET ROLE authenticated;
SELECT pg_temp.reject($q$SELECT public.can_access_project_communication_scope(NULL,NULL,NULL,'all')$q$,'42501');
RESET ROLE;
SET ROLE service_role;
SELECT pg_temp.assert_access(true,'department',department => 10);
SELECT pg_temp.assert_access(false,'unknown');
RESET ROLE;

-- Add unrelated projects/members to exercise bounded lookup rather than list-all behavior.
INSERT INTO public.projects(id,tenant_id) SELECT pg_temp.uid(n),pg_temp.uid(1) FROM generate_series(100,5099) n;
INSERT INTO public.project_members(project_id,employee_id) SELECT pg_temp.uid(n),pg_temp.uid(4) FROM generate_series(100,5099) n;
ANALYZE public.projects;
ANALYZE public.employees;
ANALYZE public.customers;
ANALYZE public.project_members;
EXPLAIN (ANALYZE, BUFFERS)
SELECT public.can_access_project_communication_scope(
  '00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000001','department','00000000-0000-4000-8000-000000000010');
-- SECURITY DEFINER hides nested plans from EXPLAIN; explain its exact stored SQL body too.
SELECT format(
  'PREPARE communication_access_plan(uuid,uuid,uuid,text,uuid) AS %s',
  replace(replace(replace(replace(replace(prosrc,
    'p_project_id','$1'),'p_tenant_id','$2'),'p_employee_id','$3'),'p_scope','$4'),'p_department_id','$5')
) FROM pg_proc WHERE oid = 'public.can_access_project_communication_scope(uuid,uuid,uuid,text,uuid)'::regprocedure
\gexec
EXPLAIN (ANALYZE, BUFFERS) EXECUTE communication_access_plan(
  '00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000001','department','00000000-0000-4000-8000-000000000010');
DEALLOCATE communication_access_plan;
SELECT 'Project comment migration and fresh scope checks passed' AS result;
