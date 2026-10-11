\set ON_ERROR_STOP on
DO $$ BEGIN IF current_database()<>'gooes_inline_comments_test' THEN RAISE EXCEPTION 'isolated fixture database required'; END IF; END $$;
CREATE FUNCTION pg_temp.uid(n integer) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$ SELECT ('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid $$;
CREATE FUNCTION pg_temp.reject(q text, state text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN BEGIN EXECUTE q; EXCEPTION WHEN OTHERS THEN IF SQLSTATE=state THEN RAISE NOTICE 'PASS expected %: %',state,q; RETURN; END IF; RAISE; END; RAISE EXCEPTION 'Unexpectedly accepted: %',q; END $$;
SET ROLE anon;
SELECT pg_temp.reject('SELECT * FROM public.project_log_comment_uploads','42501');
SELECT pg_temp.reject('SELECT public.list_project_log_project_comments_v2(NULL,NULL)','42501');
SELECT pg_temp.reject('SELECT public.preview_project_log_project_comments_v2(NULL,NULL,ARRAY[]::uuid[])','42501');
SELECT pg_temp.reject('SELECT public.create_project_log_project_comment_v2(NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL)','42501');
SELECT pg_temp.reject('SELECT public.complete_project_log_comment_upload(NULL,NULL,NULL,NULL,NULL,NULL,NULL)','42501');
SELECT pg_temp.reject('SELECT public.claim_project_log_comment_orphans(1)','42501');
SELECT pg_temp.reject('SELECT public.finish_project_log_comment_orphan(NULL)','42501');
RESET ROLE;
SET ROLE authenticated;
SELECT pg_temp.reject('SELECT * FROM public.project_log_project_comments','42501');
SELECT pg_temp.reject('SELECT * FROM public.project_log_comment_uploads','42501');
SELECT pg_temp.reject('SELECT public.list_project_log_project_comments_v2(NULL,NULL)','42501');
SELECT pg_temp.reject('SELECT public.preview_project_log_project_comments_v2(NULL,NULL,ARRAY[]::uuid[])','42501');
SELECT pg_temp.reject('SELECT public.create_project_log_project_comment_v2(NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL)','42501');
SELECT pg_temp.reject('SELECT public.complete_project_log_comment_upload(NULL,NULL,NULL,NULL,NULL,NULL,NULL)','42501');
SELECT pg_temp.reject('SELECT public.claim_project_log_comment_orphans(1)','42501');
SELECT pg_temp.reject('SELECT public.finish_project_log_comment_orphan(NULL)','42501');
RESET ROLE;
SET ROLE service_role;
SELECT pg_temp.reject('UPDATE public.project_log_comment_uploads SET position=0 WHERE false','42501');
SELECT pg_temp.reject('DELETE FROM public.project_log_comment_uploads WHERE false','42501');
SELECT pg_temp.reject('UPDATE public.project_log_project_comments SET content=''bypass'' WHERE false','42501');
SELECT pg_temp.reject('DELETE FROM public.project_log_project_comments WHERE false','42501');
RESET ROLE;
-- Execute the actual repaired nullable-position constraint as owner without disabling triggers.
BEGIN;
SELECT pg_temp.reject($q$UPDATE public.project_log_comment_uploads SET status='attached',comment_id=(SELECT id FROM public.project_log_project_comments WHERE client_request_id=pg_temp.uid(301)),position=NULL WHERE file_id=pg_temp.uid(439)$q$,'23514');
ROLLBACK;
-- Deferred empty-body integrity as migration owner; final fixture separately denies service-role v2 direct INSERT.
BEGIN;
SET CONSTRAINTS ALL IMMEDIATE;
SELECT pg_temp.reject($q$INSERT INTO public.project_log_project_comments(tenant_id,log_id,author_type,employee_author_id,content,moderation_status,auth_user_id,client_request_id,payload_sha256) VALUES(pg_temp.uid(1),pg_temp.uid(1),'employee',pg_temp.uid(1),'','unchecked',pg_temp.uid(101),pg_temp.uid(88001),repeat('e',64))$q$,'23514');
ROLLBACK;
-- Customer branch not covered by fixture's employee-only helper.
BEGIN;
SET LOCAL ROLE service_role;
SELECT id,author_type,published FROM public.create_project_log_project_comment_v2(pg_temp.uid(1),pg_temp.uid(1),pg_temp.uid(101),'customer',pg_temp.uid(1),'customer SQL probe',NULL,ARRAY[]::uuid[],pg_temp.uid(88002),repeat('e',64));
SELECT pg_temp.reject($q$SELECT * FROM public.create_project_log_project_comment_v2(pg_temp.uid(1),pg_temp.uid(1),pg_temp.uid(101),'customer',pg_temp.uid(3),'wrong customer',NULL,ARRAY[]::uuid[],pg_temp.uid(88003),repeat('e',64))$q$,'23514');
ROLLBACK;
SELECT 'PASS supplemental permissions and constraints' AS result;
-- Record real nested statements of the actual preview/list functions, not only Function Scan.
LOAD 'auto_explain';
SET auto_explain.log_min_duration=0;
SET auto_explain.log_analyze=on;
SET auto_explain.log_buffers=on;
SET auto_explain.log_nested_statements=on;
SET auto_explain.log_level='log';
SET client_min_messages='log';
SELECT log_id,total,jsonb_array_length(recent_comments) AS recent_count FROM public.preview_project_log_project_comments_v2(pg_temp.uid(1),pg_temp.uid(1),ARRAY[pg_temp.uid(1),pg_temp.uid(2)]);
WITH q AS MATERIALIZED (SELECT public.list_project_log_project_comments_v2(pg_temp.uid(1),pg_temp.uid(1),20) r) SELECT jsonb_array_length(r->'list') AS page_count,r->>'total' AS total,r->>'hasMore' AS has_more FROM q;

-- Normal visibility-map maintenance; no planner switches or forced index settings.
VACUUM (ANALYZE) public.project_log_project_comments;
SELECT log_id,total,jsonb_array_length(recent_comments) AS recent_count FROM public.preview_project_log_project_comments_v2(pg_temp.uid(1),pg_temp.uid(1),ARRAY[pg_temp.uid(1),pg_temp.uid(2)]);
