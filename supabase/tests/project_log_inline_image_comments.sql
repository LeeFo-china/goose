\set ON_ERROR_STOP on
-- Run only in a fresh LOCAL gooes_inline_comments_test database with Supabase roles.
-- Example: psql -X -d gooes_inline_comments_test -f supabase/tests/project_log_project_comments.sql
DO $$ BEGIN
  IF current_database() <> 'gooes_inline_comments_test' THEN
    RAISE EXCEPTION 'This fixture requires isolated gooes_inline_comments_test';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role BYPASSRLS; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
END $$;
CREATE SCHEMA auth;
CREATE TABLE auth.users(id uuid PRIMARY KEY);
CREATE FUNCTION public.update_updated_at_column() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at=now(); RETURN NEW; END $$;
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


INSERT INTO auth.users VALUES (pg_temp.uid(101)),(pg_temp.uid(102));
\ir ../migrations/20260514170000_create_platform_file_objects.sql
-- Seed v1 history before applying the staged migration.
INSERT INTO public.project_log_project_comments(id,tenant_id,log_id,author_type,employee_author_id,content,moderation_status,moderation_trace_id,moderated_at,content_sha256)
VALUES (pg_temp.uid(201),pg_temp.uid(1),pg_temp.uid(1),'employee',pg_temp.uid(1),' '||repeat('字',500)||' ','approved','real-trace',now(),repeat('a',64)),
 (pg_temp.uid(202),pg_temp.uid(1),pg_temp.uid(1),'employee',pg_temp.uid(1),'历史待审','pending','real-pending-trace',now(),repeat('a',64));
\ir ../migrations/20261011100853_project_log_inline_image_comments.sql

CREATE FUNCTION pg_temp.check_true(ok boolean, message text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %',message; END IF; END $$;
CREATE FUNCTION pg_temp.expect_failure(statement text, expected_state text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN EXECUTE statement;
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE=expected_state THEN RETURN; END IF;
    RAISE EXCEPTION 'Unexpected SQLSTATE % (wanted %): %',SQLSTATE,expected_state,SQLERRM;
  END;
  RAISE EXCEPTION 'FAIL: statement succeeded: %', statement;
END $$;
CREATE FUNCTION pg_temp.add_v2(req integer, body text DEFAULT 'hello', files uuid[] DEFAULT ARRAY[]::uuid[],
  parent uuid DEFAULT NULL, log_no integer DEFAULT 1, author_no integer DEFAULT 1, auth_no integer DEFAULT 101, tenant_no integer DEFAULT 1,
  hash text DEFAULT repeat('b',64)) RETURNS uuid LANGUAGE sql AS $$
  SELECT id FROM public.create_project_log_project_comment_v2(pg_temp.uid(tenant_no),pg_temp.uid(log_no),pg_temp.uid(auth_no),
    'employee',pg_temp.uid(author_no),body,parent,files,pg_temp.uid(req),hash);
$$;
CREATE FUNCTION pg_temp.upload_file(n integer, log_no integer DEFAULT 1, author_no integer DEFAULT 1, auth_no integer DEFAULT 101,
  tenant_no integer DEFAULT 1, completed boolean DEFAULT true, made_at timestamptz DEFAULT now()) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE f uuid := pg_temp.uid(n);
BEGIN
  INSERT INTO public.platform_file_objects(id,tenant_id,owner_type,owner_id,scene,bucket,object_key,mime_type,size_bytes,visibility,created_by_auth_user_id,metadata)
  VALUES(f,pg_temp.uid(tenant_no),'project_log',pg_temp.uid(log_no),'project_log_project_comment','private-bucket','private/'||n||'/final','image/png',1200,'private',pg_temp.uid(auth_no),'{"upload_status":"uploading"}');
  INSERT INTO public.project_log_comment_uploads(file_id,tenant_id,log_id,auth_user_id,author_type,author_id,created_at,upload_expires_at)
  VALUES(f,pg_temp.uid(tenant_no),pg_temp.uid(log_no),pg_temp.uid(auth_no),'employee',pg_temp.uid(author_no),made_at,made_at+interval '5 minutes');
  IF completed THEN
    PERFORM public.complete_project_log_comment_upload(f,pg_temp.uid(tenant_no),pg_temp.uid(log_no),pg_temp.uid(auth_no),'employee',pg_temp.uid(author_no),
      jsonb_build_object('mime_type','image/png','size_bytes',1200,'width',100,'height',100,'checksum',repeat('c',64),'object_key','private/'||n||'/final/'||repeat('c',64)));
  END IF;
  RETURN f;
END $$;

SELECT pg_temp.check_true((SELECT published AND moderation_trace_id='real-trace' FROM public.project_log_project_comments WHERE id=pg_temp.uid(201)),'old approved preserved');
SELECT pg_temp.check_true((SELECT NOT published AND moderation_trace_id='real-pending-trace' FROM public.project_log_project_comments WHERE id=pg_temp.uid(202)),'old pending hidden');
-- v1 service_role still has SELECT/INSERT and unchanged legitimate writes work.
SET ROLE service_role;
INSERT INTO public.project_log_project_comments(tenant_id,log_id,author_type,employee_author_id,content,moderation_status,moderation_trace_id,moderated_at,content_sha256)
VALUES ('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','employee','00000000-0000-4000-8000-000000000001','v1 postmigration','approved','trace',now(),repeat('a',64)),
 ('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','employee','00000000-0000-4000-8000-000000000001','v1 pending postmigration','pending','trace',now(),repeat('a',64));
RESET ROLE;
SELECT pg_temp.check_true((SELECT value_text='false' FROM public.system_settings WHERE key='PROJECT_LOG_COMMENT_V2_ENABLED'),'v2 closed by default');
SELECT pg_temp.add_v2(301);
SELECT pg_temp.check_true(pg_temp.add_v2(301)=pg_temp.add_v2(301),'same key returns same row');
SELECT pg_temp.check_true((SELECT count(*)=1 AND bool_and(published AND moderation_status='unchecked' AND moderation_trace_id IS NULL AND moderated_at IS NULL AND content_sha256 IS NULL)
  FROM public.project_log_project_comments WHERE client_request_id=pg_temp.uid(301)),'unchecked no fake metadata');
SELECT pg_temp.expect_failure($q$SELECT pg_temp.add_v2(301,'different')$q$,'PT409');
SELECT pg_temp.expect_failure($q$SELECT pg_temp.add_v2(301,log_no=>2)$q$,'PT409');
SELECT pg_temp.expect_failure($q$SELECT pg_temp.add_v2(301,hash=>repeat('d',64))$q$,'PT409');
SELECT pg_temp.expect_failure($q$SELECT pg_temp.add_v2(302,'')$q$,'23514');
SELECT pg_temp.expect_failure($q$SELECT pg_temp.add_v2(302,repeat('字',501))$q$,'23514');
SELECT pg_temp.add_v2(303,repeat('字',500));
SELECT pg_temp.expect_failure($q$SELECT pg_temp.add_v2(304,parent=>pg_temp.uid(202))$q$,'23514');
SELECT pg_temp.expect_failure($q$SELECT pg_temp.add_v2(304,parent=>pg_temp.uid(201),log_no=>2)$q$,'23514');
SELECT pg_temp.add_v2(305,parent=>pg_temp.add_v2(301));
SELECT pg_temp.add_v2(306,parent=>pg_temp.uid(201));
SELECT pg_temp.expect_failure($q$SELECT pg_temp.add_v2(307,author_no=>2)$q$,'23514');
SELECT pg_temp.expect_failure($q$SELECT pg_temp.add_v2(308,author_no=>3)$q$,'23514');

SELECT pg_temp.upload_file(401);
SELECT pg_temp.add_v2(401,'',ARRAY[pg_temp.uid(401)]);
SELECT pg_temp.check_true((SELECT status='attached' AND position=0 FROM public.project_log_comment_uploads WHERE file_id=pg_temp.uid(401)),'image-only atomic claim');
SELECT pg_temp.check_true(pg_temp.add_v2(401,'',ARRAY[pg_temp.uid(401)])=pg_temp.add_v2(401,'',ARRAY[pg_temp.uid(401)]),'attachment retry works');
SELECT pg_temp.expect_failure($q$SELECT pg_temp.add_v2(402,'',ARRAY[pg_temp.uid(401)])$q$,'PT403');
SELECT pg_temp.upload_file(410,log_no=>2);
SELECT pg_temp.upload_file(411,author_no=>4);
SELECT pg_temp.upload_file(412,auth_no=>102);
SELECT pg_temp.upload_file(413,log_no=>3,tenant_no=>2,author_no=>2);
SELECT pg_temp.upload_file(414,completed=>false);
SELECT pg_temp.expect_failure($q$SELECT pg_temp.add_v2(410,'',ARRAY[pg_temp.uid(410)])$q$,'PT403');
SELECT pg_temp.expect_failure($q$SELECT pg_temp.add_v2(411,'',ARRAY[pg_temp.uid(411)])$q$,'PT403');
SELECT pg_temp.expect_failure($q$SELECT pg_temp.add_v2(412,'',ARRAY[pg_temp.uid(412)])$q$,'PT403');
SELECT pg_temp.expect_failure($q$SELECT pg_temp.add_v2(413,'',ARRAY[pg_temp.uid(413)])$q$,'PT403');
SELECT pg_temp.expect_failure($q$SELECT pg_temp.add_v2(414,'',ARRAY[pg_temp.uid(414)])$q$,'PT403');
SELECT pg_temp.expect_failure($q$SELECT pg_temp.add_v2(420,'',ARRAY[pg_temp.uid(410),pg_temp.uid(410)])$q$,'23514');
SELECT pg_temp.upload_file(n) FROM generate_series(430,439) n;
SELECT pg_temp.expect_failure($q$SELECT pg_temp.add_v2(430,'',(SELECT array_agg(pg_temp.uid(n)) FROM generate_series(430,439) n))$q$,'23514');
SELECT pg_temp.add_v2(431,'',(SELECT array_agg(pg_temp.uid(n) ORDER BY n DESC) FROM generate_series(430,438) n));
SELECT pg_temp.check_true((SELECT array_agg(file_id ORDER BY position)=ARRAY(SELECT pg_temp.uid(n) FROM generate_series(438,430,-1) n) FROM public.project_log_comment_uploads WHERE comment_id=(SELECT id FROM public.project_log_project_comments WHERE client_request_id=pg_temp.uid(431))),'nine attachments preserve input order');
-- Invalid parent transaction leaves neither comment nor attachment claim.
SELECT pg_temp.expect_failure($q$SELECT pg_temp.add_v2(439,'',ARRAY[pg_temp.uid(439)],pg_temp.uid(202))$q$,'23514');
SELECT pg_temp.check_true((SELECT status='complete' AND comment_id IS NULL FROM public.project_log_comment_uploads WHERE file_id=pg_temp.uid(439)),'failed create rolled back claim');

SELECT pg_temp.upload_file(450,made_at=>now()-interval '25 hours');
SELECT pg_temp.upload_file(451,completed=>false,made_at=>now()-interval '25 hours');
SELECT pg_temp.upload_file(452,made_at=>now()-interval '23 hours');
SELECT pg_temp.check_true((SELECT count(*)=2 FROM public.claim_project_log_comment_orphans(100)),'cleanup only older than24h');
SELECT pg_temp.expect_failure($q$SELECT pg_temp.add_v2(450,'',ARRAY[pg_temp.uid(450)])$q$,'PT403');
SELECT pg_temp.expect_failure($q$SELECT public.complete_project_log_comment_upload(pg_temp.uid(451),pg_temp.uid(1),pg_temp.uid(1),pg_temp.uid(101),'employee',pg_temp.uid(1),'{}')$q$,'PT403');
SELECT public.finish_project_log_comment_orphan(pg_temp.uid(450));
SELECT pg_temp.check_true((SELECT status='deleted' AND deleted_at IS NOT NULL FROM public.platform_file_objects WHERE id=pg_temp.uid(450)),'cleanup completion persists');
SELECT pg_temp.expect_failure($q$SELECT public.finish_project_log_comment_orphan(pg_temp.uid(401))$q$,'PT403');

SELECT pg_temp.expect_failure($q$SELECT public.preview_project_log_project_comments_v2(pg_temp.uid(1),pg_temp.uid(1),ARRAY[pg_temp.uid(1),pg_temp.uid(3)])$q$,'PT400');
SELECT pg_temp.expect_failure($q$SELECT public.preview_project_log_project_comments_v2(pg_temp.uid(1),pg_temp.uid(1),ARRAY[pg_temp.uid(1),pg_temp.uid(999)])$q$,'PT400');
SELECT pg_temp.expect_failure($q$SELECT public.preview_project_log_project_comments_v2(pg_temp.uid(1),pg_temp.uid(1),ARRAY[pg_temp.uid(6)])$q$,'PT400');
SELECT pg_temp.expect_failure($q$SELECT public.preview_project_log_project_comments_v2(pg_temp.uid(1),pg_temp.uid(1),(SELECT array_agg(pg_temp.uid(n)) FROM generate_series(1,21)n))$q$,'22023');
SELECT pg_temp.check_true((SELECT total=0 AND recent_comments='[]' FROM public.preview_project_log_project_comments_v2(pg_temp.uid(1),pg_temp.uid(1),ARRAY[pg_temp.uid(2)])),'empty valid log included');
SELECT pg_temp.expect_failure($q$SELECT public.list_project_log_project_comments_v2(pg_temp.uid(1),pg_temp.uid(1),101)$q$,'22023');
SELECT pg_temp.expect_failure($q$SELECT public.list_project_log_project_comments_v2(pg_temp.uid(1),pg_temp.uid(1),20,now(),NULL)$q$,'22023');

-- Privileges must remain closed even with broad Supabase default privileges.
DO $$ DECLARE r text; f record;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
    PERFORM pg_temp.check_true(NOT has_table_privilege(r,'public.project_log_project_comments','SELECT,INSERT,UPDATE,DELETE'),'comment table private');
    PERFORM pg_temp.check_true(NOT has_table_privilege(r,'public.project_log_comment_uploads','SELECT,INSERT,UPDATE,DELETE'),'upload table private');
    FOR f IN SELECT oid FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN (
      'create_project_log_project_comment_v2','complete_project_log_comment_upload','claim_project_log_comment_orphans',
      'finish_project_log_comment_orphan','list_project_log_project_comments_v2','preview_project_log_project_comments_v2') LOOP
      PERFORM pg_temp.check_true(NOT has_function_privilege(r,f.oid,'EXECUTE'),'RPC service only');
    END LOOP;
  END LOOP;
END $$;
SET ROLE service_role;
SELECT pg_temp.expect_failure($q$INSERT INTO public.project_log_project_comments(tenant_id,log_id,author_type,employee_author_id,content,moderation_status,auth_user_id,client_request_id,payload_sha256)
VALUES('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','employee','00000000-0000-4000-8000-000000000001','direct bypass','unchecked','00000000-0000-4000-8000-000000000101','00000000-0000-4000-8000-000000000999',repeat('b',64))$q$,'42501');
SELECT id FROM public.create_project_log_project_comment_v2('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000101','employee','00000000-0000-4000-8000-000000000001','via RPC',NULL,ARRAY[]::uuid[],'00000000-0000-4000-8000-000000000998',repeat('b',64));
RESET ROLE;
SET ROLE anon;
SELECT pg_temp.expect_failure('SELECT * FROM public.project_log_project_comments','42501');
RESET ROLE;
SELECT pg_temp.check_true((SELECT relrowsecurity FROM pg_class WHERE oid='public.project_log_comment_uploads'::regclass),'RLS enabled');
SELECT pg_temp.check_true(NOT has_table_privilege('service_role','public.project_log_comment_uploads','UPDATE,DELETE'),'service cannot bypass claim RPC');

-- 5,000 rows with deterministic microsecond ties exercise newest and older seeks.
INSERT INTO public.project_log_project_comments(id,tenant_id,log_id,author_type,employee_author_id,content,moderation_status,moderation_trace_id,moderated_at,content_sha256,created_at)
SELECT pg_temp.uid(10000+n),pg_temp.uid(1),pg_temp.uid(1),'employee',pg_temp.uid(1),'perf '||n,'approved','perf-trace',now(),repeat('a',64),
  '2030-01-01 00:00:00.123456+00'::timestamptz+(n/2)*interval '1 microsecond' FROM generate_series(1,5000)n;
ANALYZE public.project_log_project_comments;
DO $$ DECLARE first_page jsonb; next_page jsonb; last_row jsonb; preview record; plan json;
BEGIN
  first_page:=public.list_project_log_project_comments_v2(pg_temp.uid(1),pg_temp.uid(1),20);
  PERFORM pg_temp.check_true(jsonb_array_length(first_page->'list')=20 AND (first_page->>'hasMore')::boolean,'bounded first page');
  last_row:=first_page->'list'->19;
  next_page:=public.list_project_log_project_comments_v2(pg_temp.uid(1),pg_temp.uid(1),20,(last_row->>'created_at')::timestamptz,(last_row->>'id')::uuid);
  PERFORM pg_temp.check_true(NOT EXISTS(SELECT 1 FROM jsonb_array_elements(first_page->'list')a JOIN jsonb_array_elements(next_page->'list')b ON a->>'id'=b->>'id'),'microsecond cursor no duplicates');
  PERFORM pg_temp.check_true(next_page->'list'->0->>'id'=pg_temp.uid(14980)::text,'microsecond cursor no skips');
  SELECT * INTO preview FROM public.preview_project_log_project_comments_v2(pg_temp.uid(1),pg_temp.uid(1),ARRAY[pg_temp.uid(1)]);
  PERFORM pg_temp.check_true(jsonb_array_length(preview.recent_comments)=3 AND preview.total=(first_page->>'total')::bigint,'bounded latest3 and visible total');
  EXECUTE format('EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) SELECT id FROM public.project_log_project_comments WHERE tenant_id=%L AND log_id=%L AND published AND (created_at,id)<(%L::timestamptz,%L::uuid) ORDER BY created_at DESC,id DESC LIMIT 21',pg_temp.uid(1),pg_temp.uid(1),last_row->>'created_at',last_row->>'id') INTO plan;
  PERFORM pg_temp.check_true(plan::text LIKE '%project_comment_published_page_idx%','cursor index used');
  RAISE NOTICE '5000-row cursor plan: %',plan;
END $$;
EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM public.preview_project_log_project_comments_v2(pg_temp.uid(1),pg_temp.uid(1),ARRAY[pg_temp.uid(1),pg_temp.uid(2)]);
-- Admission regression: runs after pagination evidence and rolls back all quota seed rows.
CREATE FUNCTION pg_temp.reserve_upload(n integer,author_no integer DEFAULT 601,auth_no integer DEFAULT 601,
  tenant_no integer DEFAULT 1,log_no integer DEFAULT 1) RETURNS uuid LANGUAGE sql AS $$
  SELECT file_id FROM public.reserve_project_log_comment_upload(pg_temp.uid(n),pg_temp.uid(tenant_no),pg_temp.uid(log_no),
    pg_temp.uid(auth_no),'employee',pg_temp.uid(author_no),'private-bucket','ap-shanghai',
    'private/project-log-project-comments/'||pg_temp.uid(tenant_no)||'/'||pg_temp.uid(log_no)||'/'||pg_temp.uid(n)||'/final',
    'private/project-log-project-comments/'||pg_temp.uid(tenant_no)||'/'||pg_temp.uid(log_no)||'/'||pg_temp.uid(n)||'/raw',
    'image/png',1200,'fixture.png');
$$;
BEGIN;
INSERT INTO auth.users SELECT pg_temp.uid(n) FROM generate_series(601,603)n;
INSERT INTO public.employees(id,tenant_id,status,name) SELECT pg_temp.uid(n),pg_temp.uid(1),'active','quota fixture' FROM generate_series(601,603)n;
SET ROLE service_role;
SELECT pg_temp.reserve_upload(60001);
RESET ROLE;
SELECT pg_temp.check_true((SELECT upload_expires_at=created_at+interval '10 minutes' FROM public.project_log_comment_uploads WHERE file_id=pg_temp.uid(60001)),'DB reservation expiry10min');
SELECT pg_temp.check_true((SELECT visibility='private' AND metadata->>'upload_status'='uploading' AND metadata->>'upload_verified'='false'
  AND owner_id=pg_temp.uid(1) AND created_by_auth_user_id=pg_temp.uid(601) FROM public.platform_file_objects WHERE id=pg_temp.uid(60001)),'atomic reserved private metadata');
SELECT pg_temp.reserve_upload(n) FROM generate_series(60002,60060)n;
SELECT pg_temp.expect_failure($q$SELECT pg_temp.reserve_upload(60061)$q$,'PT429');
SELECT pg_temp.expect_failure($q$SELECT pg_temp.reserve_upload(60062,log_no=>2)$q$,'PT429');
SELECT pg_temp.check_true(NOT EXISTS(SELECT 1 FROM public.platform_file_objects WHERE id IN(pg_temp.uid(60061),pg_temp.uid(60062))),'rejected quotas leave no file metadata');
SELECT pg_temp.check_true((SELECT count(*)=60 FROM public.project_log_comment_uploads WHERE auth_user_id=pg_temp.uid(601) AND author_id=pg_temp.uid(601)),'60per10min exact boundary');
-- Each component of selected identity matters; log switching intentionally shares the quota.
SELECT pg_temp.reserve_upload(60063,auth_no=>602);
SELECT pg_temp.reserve_upload(60064,author_no=>602);
SELECT pg_temp.reserve_upload(60065,tenant_no=>2,log_no=>3,author_no=>2);
-- Scope failure after platform-file INSERT must roll back both records.
SELECT pg_temp.expect_failure($q$SELECT pg_temp.reserve_upload(60066,author_no=>2,auth_no=>603)$q$,'PT403');
SELECT pg_temp.check_true(NOT EXISTS(SELECT 1 FROM public.platform_file_objects WHERE id=pg_temp.uid(60066)),'invalid owner rolls back file insertion');
-- Older-than10min rows do not spend the rolling allowance, but still count as outstanding.
SELECT pg_temp.upload_file(n,author_no=>603,auth_no=>603,made_at=>clock_timestamp()-interval '11 minutes') FROM generate_series(61001,61089)n;
SELECT pg_temp.reserve_upload(61090,author_no=>603,auth_no=>603);
SELECT pg_temp.expect_failure($q$SELECT pg_temp.reserve_upload(61091,author_no=>603,auth_no=>603)$q$,'PT429');
SELECT pg_temp.check_true(NOT EXISTS(SELECT 1 FROM public.platform_file_objects WHERE id=pg_temp.uid(61091)),'outstanding limit leaves no file metadata');
-- Attaching a completed image frees exactly one outstanding slot without erasing its recent history.
SELECT pg_temp.add_v2(61999,'',ARRAY[pg_temp.uid(61001)],author_no=>603,auth_no=>603);
SELECT pg_temp.reserve_upload(61092,author_no=>603,auth_no=>603);
SELECT pg_temp.check_true((SELECT count(*)=90 FROM public.project_log_comment_uploads
  WHERE auth_user_id=pg_temp.uid(603) AND author_id=pg_temp.uid(603) AND status IN('uploading','complete')),'attached excluded from90outstanding');
SET ROLE anon;
SELECT pg_temp.expect_failure($q$SELECT pg_temp.reserve_upload(62001)$q$,'42501');
RESET ROLE;
SET ROLE authenticated;
SELECT pg_temp.expect_failure($q$SELECT pg_temp.reserve_upload(62002)$q$,'42501');
RESET ROLE;
ROLLBACK;
SELECT 'PASS: inline image comments constraints, compatibility, permissions, idempotency 5000-row pagination and atomic upload admission' AS result;
