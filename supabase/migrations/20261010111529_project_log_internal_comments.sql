BEGIN;

-- Deliberately separate from the legacy employee/customer comment table and its
-- customer-facing security-definer summary RPCs. No historical rows are copied.
CREATE TABLE public.project_log_internal_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  log_id uuid NOT NULL REFERENCES public.project_logs(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES public.employees(id),
  parent_id uuid,
  content text NOT NULL CHECK (char_length(btrim(content)) BETWEEN 1 AND 500),
  moderation_status text NOT NULL CHECK (moderation_status IN ('approved', 'pending')),
  moderation_trace_id text NOT NULL CHECK (char_length(moderation_trace_id) BETWEEN 1 AND 256),
  moderated_at timestamptz NOT NULL,
  content_sha256 text NOT NULL CHECK (content_sha256 ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_log_internal_comments_scope_key UNIQUE (tenant_id, log_id, id),
  CONSTRAINT project_log_internal_comments_parent_scope_fk
    FOREIGN KEY (tenant_id, log_id, parent_id)
    REFERENCES public.project_log_internal_comments(tenant_id, log_id, id),
  CONSTRAINT project_log_internal_comments_no_self_reply CHECK (parent_id IS DISTINCT FROM id)
);
CREATE INDEX project_log_internal_comments_approved_page_idx
  ON public.project_log_internal_comments(tenant_id, log_id, created_at, id)
  WHERE moderation_status = 'approved';

CREATE FUNCTION public.validate_project_log_internal_comment_scope()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.project_logs l
    WHERE l.id = NEW.log_id AND l.tenant_id = NEW.tenant_id) THEN
    RAISE EXCEPTION 'Internal comment log scope mismatch' USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.employees e
    WHERE e.id = NEW.author_id AND e.tenant_id = NEW.tenant_id AND e.status = 'active') THEN
    RAISE EXCEPTION 'Internal comment requires active tenant employee' USING ERRCODE = '23514';
  END IF;
  IF NEW.parent_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.project_log_internal_comments p
    WHERE p.id = NEW.parent_id AND p.tenant_id = NEW.tenant_id
      AND p.log_id = NEW.log_id AND p.moderation_status = 'approved'
  ) THEN
    RAISE EXCEPTION 'Internal comment parent is not available' USING ERRCODE = '23514';
  END IF;
  -- No edit API in this release: approval cannot be reused for a changed body.
  IF TG_OP = 'UPDATE' AND (NEW.content IS DISTINCT FROM OLD.content
    OR NEW.content_sha256 IS DISTINCT FROM OLD.content_sha256
    OR NEW.author_id IS DISTINCT FROM OLD.author_id
    OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
    OR NEW.log_id IS DISTINCT FROM OLD.log_id
    OR NEW.parent_id IS DISTINCT FROM OLD.parent_id) THEN
    RAISE EXCEPTION 'Internal comment content is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER project_log_internal_comments_validate_scope
  BEFORE INSERT OR UPDATE ON public.project_log_internal_comments
  FOR EACH ROW EXECUTE FUNCTION public.validate_project_log_internal_comment_scope();
REVOKE ALL ON FUNCTION public.validate_project_log_internal_comment_scope() FROM PUBLIC, anon, authenticated;

ALTER TABLE public.project_log_internal_comments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.project_log_internal_comments FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.project_log_internal_comments TO service_role;
CREATE POLICY project_log_internal_comments_service_only
  ON public.project_log_internal_comments FOR ALL TO service_role USING (true) WITH CHECK (true);
COMMENT ON TABLE public.project_log_internal_comments IS
  '员工内部施工日志文字评论；仅服务端鉴权访问；approved可见，pending不公开；不包含旧客户评论和图片';

COMMIT;
