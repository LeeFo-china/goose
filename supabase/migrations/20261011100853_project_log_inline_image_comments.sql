BEGIN;
-- Staged rollout: preserve v1 approved/pending writes and original review evidence.
ALTER TABLE public.project_log_project_comments
  DROP CONSTRAINT project_log_project_comments_content_check,
  DROP CONSTRAINT project_log_project_comments_moderation_status_check,
  ALTER COLUMN moderation_trace_id DROP NOT NULL,
  ALTER COLUMN moderated_at DROP NOT NULL,
  ALTER COLUMN content_sha256 DROP NOT NULL,
  ADD COLUMN published boolean GENERATED ALWAYS AS (moderation_status IN ('approved', 'unchecked')) STORED,
  ADD COLUMN auth_user_id uuid REFERENCES auth.users(id),
  ADD COLUMN client_request_id uuid,
  ADD COLUMN payload_sha256 text,
  ADD CONSTRAINT project_comment_body_length CHECK (moderation_status <> 'unchecked' OR char_length(content) <= 500),
  ADD CONSTRAINT project_comment_publication CHECK (
    (moderation_status IN ('approved', 'pending') AND char_length(btrim(content)) BETWEEN 1 AND 500
      AND moderation_trace_id IS NOT NULL AND moderated_at IS NOT NULL AND content_sha256 IS NOT NULL
      AND client_request_id IS NULL AND payload_sha256 IS NULL)
    OR (moderation_status = 'unchecked' AND moderation_trace_id IS NULL AND moderated_at IS NULL
      AND content_sha256 IS NULL AND auth_user_id IS NOT NULL AND client_request_id IS NOT NULL
      AND payload_sha256 IS NOT NULL AND payload_sha256 ~ '^[a-f0-9]{64}$')
  );
CREATE UNIQUE INDEX project_comment_request_key ON public.project_log_project_comments
  (tenant_id, author_type, (coalesce(employee_author_id, customer_author_id)), client_request_id)
  WHERE client_request_id IS NOT NULL;
CREATE INDEX project_comment_published_page_idx ON public.project_log_project_comments
  (tenant_id, log_id, created_at DESC, id DESC) WHERE published;

-- One private file belongs to precisely one upload scope and at most one comment.
CREATE TABLE public.project_log_comment_uploads (
  file_id uuid PRIMARY KEY REFERENCES public.platform_file_objects(id) ON DELETE RESTRICT,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  log_id uuid NOT NULL REFERENCES public.project_logs(id) ON DELETE CASCADE,
  auth_user_id uuid NOT NULL REFERENCES auth.users(id),
  author_type text NOT NULL CHECK (author_type IN ('employee', 'customer')),
  author_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'uploading' CHECK (status IN ('uploading', 'complete', 'attached', 'cleanup')),
  comment_id uuid,
  position smallint,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- Storage upload credentials must expire before this bound; cleanup cannot race a valid PUT.
  upload_expires_at timestamptz NOT NULL DEFAULT now() + interval '1 hour',
  cleanup_claimed_at timestamptz,
  CONSTRAINT project_comment_upload_expiry CHECK (upload_expires_at <= created_at + interval '24 hours'),
  CONSTRAINT project_comment_upload_attachment CHECK (
    (status = 'attached' AND comment_id IS NOT NULL AND position IS NOT NULL AND position BETWEEN 0 AND 8)
    OR (status <> 'attached' AND comment_id IS NULL AND position IS NULL)
  ),
  CONSTRAINT project_comment_upload_scope_fk FOREIGN KEY (tenant_id, log_id, comment_id)
    REFERENCES public.project_log_project_comments(tenant_id, log_id, id) ON DELETE CASCADE,
  UNIQUE (comment_id, position)
);
CREATE INDEX project_comment_upload_comment_idx ON public.project_log_comment_uploads (tenant_id, comment_id, position) WHERE status = 'attached';
CREATE INDEX project_comment_upload_orphan_idx ON public.project_log_comment_uploads (created_at, file_id) WHERE status IN ('uploading', 'complete');
ALTER TABLE public.project_log_comment_uploads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.project_log_comment_uploads FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT ON public.project_log_comment_uploads TO service_role;
CREATE POLICY project_comment_upload_service_select ON public.project_log_comment_uploads FOR SELECT TO service_role USING (true);
CREATE POLICY project_comment_upload_service_insert ON public.project_log_comment_uploads FOR INSERT TO service_role WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.validate_project_log_project_comment_scope()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE project_customer_id uuid;
BEGIN
  -- Staged SELECT/INSERT grant is for v1 only. SECURITY DEFINER v2 RPC runs as its owner.
  IF NEW.moderation_status='unchecked' AND current_user='service_role' THEN
    RAISE EXCEPTION 'Unchecked comments require the transactional v2 RPC' USING ERRCODE='42501';
  END IF;
  IF TG_OP = 'UPDATE' AND (NEW.id IS DISTINCT FROM OLD.id OR NEW.content IS DISTINCT FROM OLD.content
    OR NEW.content_sha256 IS DISTINCT FROM OLD.content_sha256 OR NEW.author_type IS DISTINCT FROM OLD.author_type
    OR NEW.employee_author_id IS DISTINCT FROM OLD.employee_author_id OR NEW.customer_author_id IS DISTINCT FROM OLD.customer_author_id
    OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR NEW.log_id IS DISTINCT FROM OLD.log_id
    OR NEW.parent_id IS DISTINCT FROM OLD.parent_id OR NEW.created_at IS DISTINCT FROM OLD.created_at
    OR NEW.auth_user_id IS DISTINCT FROM OLD.auth_user_id OR NEW.client_request_id IS DISTINCT FROM OLD.client_request_id
    OR NEW.payload_sha256 IS DISTINCT FROM OLD.payload_sha256 OR NEW.moderation_status IS DISTINCT FROM OLD.moderation_status) THEN
    RAISE EXCEPTION 'Project comment content, identity and publication are immutable' USING ERRCODE = '23514';
  END IF;
  SELECT p.customer_id INTO project_customer_id FROM public.project_logs l JOIN public.projects p ON p.id = l.project_id
    WHERE l.id = NEW.log_id AND l.tenant_id = NEW.tenant_id AND p.tenant_id = NEW.tenant_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Comment log/project scope mismatch' USING ERRCODE = '23514'; END IF;
  IF NEW.author_type = 'employee' AND NOT EXISTS (SELECT 1 FROM public.employees e
    WHERE e.id = NEW.employee_author_id AND e.tenant_id = NEW.tenant_id AND e.status = 'active') THEN
    RAISE EXCEPTION 'Comment requires active tenant employee' USING ERRCODE = '23514';
  END IF;
  IF NEW.author_type = 'customer' AND NOT EXISTS (SELECT 1 FROM public.customers c
    WHERE c.id = NEW.customer_author_id AND c.tenant_id = NEW.tenant_id AND c.id = project_customer_id) THEN
    RAISE EXCEPTION 'Comment requires project customer' USING ERRCODE = '23514';
  END IF;
  IF NEW.parent_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.project_log_project_comments p
    WHERE p.id = NEW.parent_id AND p.tenant_id = NEW.tenant_id AND p.log_id = NEW.log_id AND p.published) THEN
    RAISE EXCEPTION 'Comment parent is not visible in this log' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION public.validate_project_log_comment_upload()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE f public.platform_file_objects%ROWTYPE; c public.project_log_project_comments%ROWTYPE;
BEGIN
  IF TG_OP = 'INSERT' AND (NEW.status <> 'uploading' OR NEW.comment_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Upload must start unclaimed' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF ROW(NEW.file_id,NEW.tenant_id,NEW.log_id,NEW.auth_user_id,NEW.author_type,NEW.author_id,NEW.created_at,NEW.upload_expires_at)
      IS DISTINCT FROM ROW(OLD.file_id,OLD.tenant_id,OLD.log_id,OLD.auth_user_id,OLD.author_type,OLD.author_id,OLD.created_at,OLD.upload_expires_at)
      OR OLD.status = 'attached' OR (OLD.status='cleanup' AND NEW.status<>'cleanup') THEN
      RAISE EXCEPTION 'Upload scope/claim is immutable' USING ERRCODE = '23514';
    END IF;
    IF NEW.status = 'attached' AND OLD.status <> 'complete' THEN
      RAISE EXCEPTION 'Attachment must be complete' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF NEW.status = 'cleanup' THEN RETURN NEW; END IF;
  SELECT * INTO f FROM public.platform_file_objects WHERE id = NEW.file_id FOR SHARE;
  IF NOT FOUND OR f.tenant_id IS DISTINCT FROM NEW.tenant_id OR f.owner_type <> 'project_log'
    OR f.owner_id IS DISTINCT FROM NEW.log_id OR f.scene <> 'project_log_project_comment'
    OR f.visibility <> 'private' OR f.public_url IS NOT NULL OR f.deleted_at IS NOT NULL
    OR f.created_by_auth_user_id IS DISTINCT FROM NEW.auth_user_id
    OR f.status IS DISTINCT FROM 'active' OR f.mime_type IS NULL OR f.mime_type NOT IN ('image/jpeg','image/png','image/webp')
    OR f.size_bytes IS NULL OR f.size_bytes NOT BETWEEN 1 AND 10485760 THEN
    RAISE EXCEPTION 'Private comment file ownership/metadata mismatch' USING ERRCODE = 'PT403';
  END IF;
  IF NEW.status IN ('complete','attached') AND f.metadata->>'upload_status' IS DISTINCT FROM 'uploaded' THEN
    RAISE EXCEPTION 'File upload is not complete' USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.project_logs l JOIN public.projects p ON p.id=l.project_id
    WHERE l.id=NEW.log_id AND l.tenant_id=NEW.tenant_id AND p.tenant_id=NEW.tenant_id
    AND ((NEW.author_type='employee' AND EXISTS (SELECT 1 FROM public.employees e
      WHERE e.id=NEW.author_id AND e.tenant_id=NEW.tenant_id AND e.status='active'))
      OR (NEW.author_type='customer' AND p.customer_id=NEW.author_id AND EXISTS (
        SELECT 1 FROM public.customers customer WHERE customer.id=NEW.author_id AND customer.tenant_id=NEW.tenant_id)))) THEN
    RAISE EXCEPTION 'Upload selected author/log mismatch' USING ERRCODE = 'PT403';
  END IF;
  IF NEW.status='attached' THEN
    SELECT * INTO c FROM public.project_log_project_comments WHERE id=NEW.comment_id;
    IF NOT FOUND OR c.tenant_id<>NEW.tenant_id OR c.log_id<>NEW.log_id OR c.auth_user_id IS DISTINCT FROM NEW.auth_user_id
      OR c.author_type<>NEW.author_type OR coalesce(c.employee_author_id,c.customer_author_id)<>NEW.author_id
      OR c.moderation_status<>'unchecked' THEN
      RAISE EXCEPTION 'Comment attachment identity mismatch' USING ERRCODE = 'PT403';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER project_comment_upload_validate BEFORE INSERT OR UPDATE ON public.project_log_comment_uploads
  FOR EACH ROW EXECUTE FUNCTION public.validate_project_log_comment_upload();

-- Deferred so image-only INSERT and attachment claims can commit together, never half a comment.
CREATE FUNCTION public.validate_project_comment_nonempty()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.project_log_project_comments c WHERE c.id=NEW.id
    AND btrim(c.content)='' AND NOT EXISTS (
      SELECT 1 FROM public.project_log_comment_uploads u WHERE u.comment_id=c.id AND u.status='attached')) THEN
    RAISE EXCEPTION 'Comment requires text or attachment' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER project_comment_nonempty AFTER INSERT OR UPDATE ON public.project_log_project_comments
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.validate_project_comment_nonempty();

CREATE FUNCTION public.create_project_log_project_comment_v2(
  p_tenant_id uuid, p_log_id uuid, p_auth_user_id uuid, p_author_type text, p_author_id uuid,
  p_content text, p_parent_id uuid, p_attachment_ids uuid[], p_client_request_id uuid, p_payload_sha256 text
) RETURNS SETOF public.project_log_project_comments LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE c public.project_log_project_comments%ROWTYPE; attachment_count integer;
BEGIN
  IF p_auth_user_id IS NULL OR p_author_id IS NULL OR p_author_type IS NULL OR p_author_type NOT IN ('employee','customer')
    OR p_client_request_id IS NULL OR p_payload_sha256 IS NULL OR p_payload_sha256 !~ '^[a-f0-9]{64}$'
    OR p_content IS NULL OR char_length(p_content)>500 OR p_attachment_ids IS NULL
    OR cardinality(p_attachment_ids)>9 OR array_position(p_attachment_ids,NULL) IS NOT NULL
    OR cardinality(p_attachment_ids)<>(SELECT count(DISTINCT x) FROM unnest(p_attachment_ids) x)
    OR (btrim(p_content)='' AND cardinality(p_attachment_ids)=0) THEN
    RAISE EXCEPTION 'Invalid comment request' USING ERRCODE='23514';
  END IF;
  -- Serialize only matching identity/request keys. Unique index remains a final integrity boundary.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text||p_author_type||p_author_id::text||p_client_request_id::text,0));
  SELECT * INTO c FROM public.project_log_project_comments
    WHERE tenant_id=p_tenant_id AND author_type=p_author_type
      AND coalesce(employee_author_id,customer_author_id)=p_author_id AND client_request_id=p_client_request_id;
  IF FOUND THEN
    IF c.payload_sha256<>p_payload_sha256 OR c.log_id<>p_log_id OR c.parent_id IS DISTINCT FROM p_parent_id
      OR c.content<>p_content OR c.auth_user_id IS DISTINCT FROM p_auth_user_id
      OR p_attachment_ids IS DISTINCT FROM coalesce((SELECT array_agg(file_id ORDER BY position)
        FROM public.project_log_comment_uploads WHERE comment_id=c.id), ARRAY[]::uuid[]) THEN
      RAISE EXCEPTION 'COMMENT_REQUEST_CONFLICT' USING ERRCODE='PT409';
    END IF;
    RETURN NEXT c; RETURN;
  END IF;
  -- Same lock order as cleanup/complete. Cleanup cannot claim a file between validation and attach.
  PERFORM file_id FROM public.project_log_comment_uploads WHERE file_id=ANY(p_attachment_ids) ORDER BY file_id FOR UPDATE;
  SELECT count(*) INTO attachment_count FROM public.project_log_comment_uploads
    WHERE file_id=ANY(p_attachment_ids) AND tenant_id=p_tenant_id AND log_id=p_log_id
      AND auth_user_id=p_auth_user_id AND author_type=p_author_type AND author_id=p_author_id AND status='complete';
  IF attachment_count<>cardinality(p_attachment_ids) THEN
    RAISE EXCEPTION 'Attachment is unavailable or belongs to another identity' USING ERRCODE='PT403';
  END IF;
  INSERT INTO public.project_log_project_comments(tenant_id,log_id,auth_user_id,author_type,employee_author_id,
    customer_author_id,content,parent_id,moderation_status,client_request_id,payload_sha256)
  VALUES (p_tenant_id,p_log_id,p_auth_user_id,p_author_type,
    CASE WHEN p_author_type='employee' THEN p_author_id END, CASE WHEN p_author_type='customer' THEN p_author_id END,
    p_content,p_parent_id,'unchecked',p_client_request_id,p_payload_sha256) RETURNING * INTO c;
  UPDATE public.project_log_comment_uploads u SET status='attached',comment_id=c.id,position=(a.ordinality-1)::smallint
    FROM unnest(p_attachment_ids) WITH ORDINALITY a(file_id,ordinality) WHERE u.file_id=a.file_id;
  RETURN NEXT c;
END $$;

-- Admission runs before any credential is issued or object-storage mutation occurs.
CREATE INDEX project_comment_upload_identity_recent_idx ON public.project_log_comment_uploads
  (tenant_id, auth_user_id, author_type, author_id, created_at DESC);
CREATE INDEX project_comment_upload_identity_outstanding_idx ON public.project_log_comment_uploads
  (tenant_id, auth_user_id, author_type, author_id) WHERE status IN ('uploading','complete');
CREATE FUNCTION public.reserve_project_log_comment_upload(
  p_file_id uuid,p_tenant_id uuid,p_log_id uuid,p_auth_user_id uuid,p_author_type text,p_author_id uuid,
  p_bucket text,p_region text,p_object_key text,p_raw_object_key text,p_mime_type text,p_size_bytes bigint,p_original_name text DEFAULT NULL
) RETURNS SETOF public.project_log_comment_uploads LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE reserved_at timestamptz; path_prefix text; recent_count integer; outstanding_count integer;
BEGIN
  path_prefix:='private/project-log-project-comments/'||p_tenant_id::text||'/'||p_log_id::text||'/';
  IF p_file_id IS NULL OR p_tenant_id IS NULL OR p_log_id IS NULL OR p_auth_user_id IS NULL OR p_author_id IS NULL
    OR p_author_type IS NULL OR p_author_type NOT IN ('employee','customer')
    OR p_bucket IS NULL OR btrim(p_bucket)='' OR p_region IS NULL OR btrim(p_region)=''
    OR p_mime_type IS NULL OR p_mime_type NOT IN ('image/jpeg','image/png','image/webp')
    OR p_size_bytes IS NULL OR p_size_bytes NOT BETWEEN 1 AND 10485760
    OR p_object_key IS NULL OR left(p_object_key,length(path_prefix))<>path_prefix
    OR substring(p_object_key FROM length(path_prefix)+1) !~ '^[a-f0-9-]{36}/final$'
    OR p_raw_object_key IS DISTINCT FROM regexp_replace(p_object_key,'/final$','/raw') THEN
    RAISE EXCEPTION 'Invalid scoped upload reservation' USING ERRCODE='23514';
  END IF;
  -- Identity spans logs: switching a log must not reset admission quotas. No separate queue/counter.
  PERFORM pg_advisory_xact_lock(hashtextextended('comment-upload-admission:'||p_tenant_id::text||':'||p_auth_user_id::text||':'||p_author_type||':'||p_author_id::text,0));
  reserved_at:=clock_timestamp();
  -- Both scans stop at the rejection threshold, even for identities with very large histories.
  SELECT count(*) INTO recent_count FROM (
    SELECT 1 FROM public.project_log_comment_uploads WHERE tenant_id=p_tenant_id AND auth_user_id=p_auth_user_id
      AND author_type=p_author_type AND author_id=p_author_id AND created_at>reserved_at-interval '10 minutes' LIMIT 60
  ) recent;
  SELECT count(*) INTO outstanding_count FROM (
    SELECT 1 FROM public.project_log_comment_uploads WHERE tenant_id=p_tenant_id AND auth_user_id=p_auth_user_id
      AND author_type=p_author_type AND author_id=p_author_id AND status IN ('uploading','complete') LIMIT 90
  ) outstanding;
  IF recent_count>=60 OR outstanding_count>=90 THEN
    RAISE EXCEPTION 'COMMENT_ATTACHMENT_RATE_LIMITED' USING ERRCODE='PT429';
  END IF;
  INSERT INTO public.platform_file_objects(id,tenant_id,owner_type,owner_id,scene,provider,bucket,region,object_key,
    original_name,mime_type,size_bytes,visibility,public_url,status,metadata,created_by_auth_user_id,created_by_employee_id,created_at)
  VALUES(p_file_id,p_tenant_id,'project_log',p_log_id,'project_log_project_comment','tencent_cos',p_bucket,p_region,p_object_key,
    p_original_name,p_mime_type,p_size_bytes,'private',NULL,'active',
    jsonb_build_object('raw_object_key',p_raw_object_key,'upload_status','uploading','upload_verified',false),
    p_auth_user_id,CASE WHEN p_author_type='employee' THEN p_author_id END,reserved_at);
  RETURN QUERY INSERT INTO public.project_log_comment_uploads(file_id,tenant_id,log_id,auth_user_id,author_type,author_id,created_at,upload_expires_at)
    VALUES(p_file_id,p_tenant_id,p_log_id,p_auth_user_id,p_author_type,p_author_id,reserved_at,reserved_at+interval '10 minutes') RETURNING *;
  -- Upload trigger validates active selected author, project scope and matching file. Any error rolls back BOTH rows.
END $$;
REVOKE ALL ON FUNCTION public.reserve_project_log_comment_upload(uuid,uuid,uuid,uuid,text,uuid,text,text,text,text,text,bigint,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_project_log_comment_upload(uuid,uuid,uuid,uuid,text,uuid,text,text,text,text,text,bigint,text)
  TO service_role;

CREATE FUNCTION public.complete_project_log_comment_upload(p_file_id uuid,p_tenant_id uuid,p_log_id uuid,p_auth_user_id uuid,p_author_type text,p_author_id uuid,p_verified jsonb)
RETURNS SETOF public.project_log_comment_uploads LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE u public.project_log_comment_uploads%ROWTYPE;
BEGIN
  SELECT * INTO u FROM public.project_log_comment_uploads WHERE file_id=p_file_id AND tenant_id=p_tenant_id
    AND log_id=p_log_id AND auth_user_id=p_auth_user_id AND author_type=p_author_type AND author_id=p_author_id FOR UPDATE;
  IF NOT FOUND OR u.status NOT IN ('uploading','complete','attached') THEN
    RAISE EXCEPTION 'Upload ownership or claim mismatch' USING ERRCODE='PT403';
  END IF;
  IF u.status IN ('complete','attached') THEN
    IF NOT EXISTS (SELECT 1 FROM public.platform_file_objects WHERE id=p_file_id
      AND checksum=p_verified->>'checksum' AND object_key=p_verified->>'object_key') THEN
      RAISE EXCEPTION 'Upload already completed with different bytes' USING ERRCODE='PT409';
    END IF;
    RETURN NEXT u; RETURN;
  END IF;
  IF p_verified IS NULL OR p_verified->>'mime_type' IS NULL OR p_verified->>'mime_type' NOT IN ('image/jpeg','image/png','image/webp')
    OR coalesce((p_verified->>'size_bytes')::bigint,0) NOT BETWEEN 1 AND 10485760
    OR coalesce((p_verified->>'width')::integer,0)<=0 OR coalesce((p_verified->>'height')::integer,0)<=0
    OR coalesce(p_verified->>'checksum','') !~ '^[a-f0-9]{64}$'
    OR NOT EXISTS (SELECT 1 FROM public.platform_file_objects WHERE id=p_file_id
      AND p_verified->>'object_key'=object_key||'/'||(p_verified->>'checksum')) THEN
    RAISE EXCEPTION 'Invalid verified image metadata' USING ERRCODE='23514';
  END IF;
  UPDATE public.platform_file_objects SET object_key=p_verified->>'object_key',mime_type=p_verified->>'mime_type',size_bytes=(p_verified->>'size_bytes')::bigint,
    width=(p_verified->>'width')::integer,height=(p_verified->>'height')::integer,checksum=p_verified->>'checksum',
    metadata=metadata || jsonb_build_object('upload_status','uploaded','upload_verified',true)
    WHERE id=p_file_id;
  UPDATE public.project_log_comment_uploads SET status='complete' WHERE file_id=p_file_id RETURNING * INTO u;
  RETURN NEXT u;
END $$;

CREATE FUNCTION public.claim_project_log_comment_orphans(p_limit integer DEFAULT 100)
RETURNS SETOF public.project_log_comment_uploads LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Invalid cleanup limit' USING ERRCODE='22023'; END IF;
  RETURN QUERY WITH candidates AS (
    SELECT file_id FROM public.project_log_comment_uploads
    WHERE (status IN ('uploading','complete') OR (status='cleanup' AND cleanup_claimed_at<now()-interval '15 minutes'))
      AND created_at<now()-interval '24 hours'
      AND upload_expires_at<now() AND comment_id IS NULL
      AND EXISTS (SELECT 1 FROM public.platform_file_objects f WHERE f.id=file_id AND f.deleted_at IS NULL)
    ORDER BY created_at,file_id LIMIT p_limit FOR UPDATE SKIP LOCKED
  ) UPDATE public.project_log_comment_uploads u SET status='cleanup',cleanup_claimed_at=now()
    FROM candidates c WHERE u.file_id=c.file_id RETURNING u.*;
END $$;

CREATE FUNCTION public.finish_project_log_comment_orphan(p_file_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM file_id FROM public.project_log_comment_uploads WHERE file_id=p_file_id AND status='cleanup' AND comment_id IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'File is not claimed for cleanup' USING ERRCODE='PT403'; END IF;
  UPDATE public.platform_file_objects SET status='deleted',deleted_at=now() WHERE id=p_file_id AND deleted_at IS NULL;
  RETURN true;
END $$;

CREATE FUNCTION public.list_project_log_project_comments_v2(p_tenant_id uuid,p_log_id uuid,p_page_size integer DEFAULT 20,
  p_before_created_at timestamptz DEFAULT NULL,p_before_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE result jsonb;
BEGIN
  IF p_page_size IS NULL OR p_page_size NOT BETWEEN 1 AND 100 OR (p_before_created_at IS NULL)<>(p_before_id IS NULL) THEN
    RAISE EXCEPTION 'Invalid comment cursor/page size' USING ERRCODE='22023';
  END IF;
  WITH page AS MATERIALIZED (
    SELECT id,log_id,parent_id,author_type,employee_author_id,customer_author_id,content,moderation_status,published,created_at
    FROM public.project_log_project_comments WHERE tenant_id=p_tenant_id AND log_id=p_log_id AND published
      AND (p_before_created_at IS NULL OR (created_at,id)<(p_before_created_at,p_before_id))
    ORDER BY created_at DESC,id DESC LIMIT p_page_size+1
  ), kept AS (SELECT * FROM page ORDER BY created_at DESC,id DESC LIMIT p_page_size)
  SELECT jsonb_build_object('list',coalesce((SELECT jsonb_agg(to_jsonb(k) ORDER BY k.created_at DESC,k.id DESC) FROM kept k),'[]'::jsonb),
    'total',(SELECT count(*) FROM public.project_log_project_comments WHERE tenant_id=p_tenant_id AND log_id=p_log_id AND published),
    'hasMore',(SELECT count(*)>p_page_size FROM page)) INTO result;
  RETURN result;
END $$;

CREATE FUNCTION public.preview_project_log_project_comments_v2(p_tenant_id uuid,p_project_id uuid,p_log_ids uuid[])
RETURNS TABLE(log_id uuid,total bigint,recent_comments jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF p_log_ids IS NULL OR cardinality(p_log_ids)>20 OR array_position(p_log_ids,NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'Preview requires at most 20 logs' USING ERRCODE='22023';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(p_log_ids) requested(id) WHERE NOT EXISTS (
    SELECT 1 FROM public.project_logs l JOIN public.projects p ON p.id=l.project_id
    WHERE l.id=requested.id AND l.tenant_id=p_tenant_id AND l.project_id=p_project_id AND p.tenant_id=p_tenant_id)) THEN
    RAISE EXCEPTION 'One or more logs do not belong to this project' USING ERRCODE='PT400';
  END IF;
  -- <=20 scoped exact counts (O(history)), each followed by a three-row index seek; never rank full histories.
  RETURN QUERY SELECT requested.id,
    (SELECT count(*) FROM public.project_log_project_comments c WHERE c.tenant_id=p_tenant_id AND c.log_id=requested.id AND c.published),
    coalesce((SELECT jsonb_agg(to_jsonb(latest) ORDER BY latest.created_at DESC,latest.id DESC) FROM (
      SELECT c.id,c.log_id,c.parent_id,c.author_type,c.employee_author_id,c.customer_author_id,c.content,c.moderation_status,c.published,c.created_at
      FROM public.project_log_project_comments c WHERE c.tenant_id=p_tenant_id AND c.log_id=requested.id AND c.published
      ORDER BY c.created_at DESC,c.id DESC LIMIT 3
    ) latest),'[]'::jsonb)
    FROM (SELECT DISTINCT unnest(p_log_ids) AS id) requested;
END $$;

REVOKE ALL ON FUNCTION public.validate_project_log_comment_upload(),public.validate_project_comment_nonempty() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.create_project_log_project_comment_v2(uuid,uuid,uuid,text,uuid,text,uuid,uuid[],uuid,text),
  public.complete_project_log_comment_upload(uuid,uuid,uuid,uuid,text,uuid,jsonb), public.claim_project_log_comment_orphans(integer),public.finish_project_log_comment_orphan(uuid),
  public.list_project_log_project_comments_v2(uuid,uuid,integer,timestamptz,uuid),public.preview_project_log_project_comments_v2(uuid,uuid,uuid[])
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_project_log_project_comment_v2(uuid,uuid,uuid,text,uuid,text,uuid,uuid[],uuid,text),
  public.complete_project_log_comment_upload(uuid,uuid,uuid,uuid,text,uuid,jsonb), public.claim_project_log_comment_orphans(integer),public.finish_project_log_comment_orphan(uuid),
  public.list_project_log_project_comments_v2(uuid,uuid,integer,timestamptz,uuid),public.preview_project_log_project_comments_v2(uuid,uuid,uuid[])
  TO service_role;
INSERT INTO public.system_settings(key,group_code,name,description,value_type,value_text,is_secret,status)
SELECT 'PROJECT_LOG_COMMENT_V2_ENABLED','project_log','项目日志图文评论新版开关','启用不做内容检测的图文评论 v2 契约。','boolean','false',false,'active'
WHERE NOT EXISTS (SELECT 1 FROM public.system_settings WHERE tenant_id IS NULL AND key='PROJECT_LOG_COMMENT_V2_ENABLED');
COMMENT ON TABLE public.project_log_project_comments IS '项目日志沟通；unchecked真实表示未检测且发布，approved历史可见，pending保持隐藏；仅服务端鉴权访问';
COMMENT ON TABLE public.project_log_comment_uploads IS '私有评论上传归属及有序附件；cleanup原子排除attach/complete，凭证必须在upload_expires_at前失效';
-- Rollback: disable v2 flag and deploy a compatible API; retain unchecked records/files and v1 evidence.
-- Do not map unchecked to approved or destructively remove this migration's columns/tables.
COMMIT;
