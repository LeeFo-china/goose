BEGIN;

-- A new shared employee/customer audience. Never copy internal or legacy history.
CREATE TABLE public.project_log_project_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  log_id uuid NOT NULL REFERENCES public.project_logs(id) ON DELETE CASCADE,
  author_type text NOT NULL CHECK (author_type IN ('employee', 'customer')),
  employee_author_id uuid REFERENCES public.employees(id),
  customer_author_id uuid REFERENCES public.customers(id),
  parent_id uuid,
  content text NOT NULL CHECK (char_length(btrim(content)) BETWEEN 1 AND 500),
  moderation_status text NOT NULL CHECK (moderation_status IN ('approved', 'pending')),
  moderation_trace_id text NOT NULL CHECK (char_length(moderation_trace_id) BETWEEN 1 AND 256),
  moderated_at timestamptz NOT NULL,
  content_sha256 text NOT NULL CHECK (content_sha256 ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_log_project_comments_author_check CHECK (
    (author_type = 'employee' AND employee_author_id IS NOT NULL AND customer_author_id IS NULL)
    OR (author_type = 'customer' AND customer_author_id IS NOT NULL AND employee_author_id IS NULL)
  ),
  CONSTRAINT project_log_project_comments_scope_key UNIQUE (tenant_id, log_id, id),
  CONSTRAINT project_log_project_comments_parent_scope_fk
    FOREIGN KEY (tenant_id, log_id, parent_id)
    REFERENCES public.project_log_project_comments(tenant_id, log_id, id),
  CONSTRAINT project_log_project_comments_no_self_reply CHECK (parent_id IS DISTINCT FROM id)
);
CREATE INDEX project_log_project_comments_approved_page_idx
  ON public.project_log_project_comments(tenant_id, log_id, created_at, id)
  WHERE moderation_status = 'approved';

CREATE FUNCTION public.validate_project_log_project_comment_scope()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  project_customer_id uuid;
BEGIN
  -- Approval belongs to one body, author and scope; no editing API in this release.
  IF TG_OP = 'UPDATE' AND (NEW.id IS DISTINCT FROM OLD.id
    OR NEW.content IS DISTINCT FROM OLD.content
    OR NEW.content_sha256 IS DISTINCT FROM OLD.content_sha256
    OR NEW.author_type IS DISTINCT FROM OLD.author_type
    OR NEW.employee_author_id IS DISTINCT FROM OLD.employee_author_id
    OR NEW.customer_author_id IS DISTINCT FROM OLD.customer_author_id
    OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
    OR NEW.log_id IS DISTINCT FROM OLD.log_id
    OR NEW.parent_id IS DISTINCT FROM OLD.parent_id
    OR NEW.created_at IS DISTINCT FROM OLD.created_at) THEN
    RAISE EXCEPTION 'Project comment content, author and scope are immutable' USING ERRCODE = '23514';
  END IF;

  SELECT p.customer_id INTO project_customer_id
  FROM public.project_logs l JOIN public.projects p ON p.id = l.project_id
  WHERE l.id = NEW.log_id AND l.tenant_id = NEW.tenant_id AND p.tenant_id = NEW.tenant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Project comment log/project tenant scope mismatch' USING ERRCODE = '23514';
  END IF;
  IF NEW.author_type = 'employee' AND NOT EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = NEW.employee_author_id AND e.tenant_id = NEW.tenant_id AND e.status = 'active'
  ) THEN
    RAISE EXCEPTION 'Project comment requires active tenant employee' USING ERRCODE = '23514';
  END IF;
  IF NEW.author_type = 'customer' AND NOT EXISTS (
    SELECT 1 FROM public.customers c
    WHERE c.id = NEW.customer_author_id AND c.tenant_id = NEW.tenant_id AND c.id = project_customer_id
  ) THEN
    RAISE EXCEPTION 'Project comment requires project customer in same tenant' USING ERRCODE = '23514';
  END IF;
  IF NEW.parent_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.project_log_project_comments p
    WHERE p.id = NEW.parent_id AND p.tenant_id = NEW.tenant_id
      AND p.log_id = NEW.log_id AND p.moderation_status = 'approved'
  ) THEN
    RAISE EXCEPTION 'Project comment parent is not available' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER project_log_project_comments_validate_scope
  BEFORE INSERT OR UPDATE ON public.project_log_project_comments
  FOR EACH ROW EXECUTE FUNCTION public.validate_project_log_project_comment_scope();
REVOKE ALL ON FUNCTION public.validate_project_log_project_comment_scope() FROM PUBLIC, anon, authenticated;

ALTER TABLE public.project_log_project_comments ENABLE ROW LEVEL SECURITY;
-- Supabase installations can grant ALL through default privileges: explicitly narrow them.
REVOKE ALL ON public.project_log_project_comments FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT ON public.project_log_project_comments TO service_role;
CREATE POLICY project_log_project_comments_service_select
  ON public.project_log_project_comments FOR SELECT TO service_role USING (true);
CREATE POLICY project_log_project_comments_service_insert
  ON public.project_log_project_comments FOR INSERT TO service_role WITH CHECK (true);
COMMENT ON TABLE public.project_log_project_comments IS
  '项目客户与员工共享施工日志文字评论；仅服务端鉴权访问；approved可见，pending不公开；不复制内部或旧评论';

-- Fresh single-project equivalent of permissionRepository.canAccessProjectByScope.
-- Only the new communication feature uses this RPC; no cached/list-all fallback.
CREATE FUNCTION public.can_access_project_communication_scope(
  p_project_id uuid,
  p_tenant_id uuid,
  p_employee_id uuid,
  p_scope text,
  p_department_id uuid DEFAULT NULL
) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.projects AS project
    JOIN public.employees AS requester
      ON requester.id = p_employee_id
      AND requester.tenant_id = p_tenant_id
      AND requester.status = 'active'
    WHERE project.id = p_project_id
      AND project.tenant_id = p_tenant_id
      AND p_scope IN ('all', 'self', 'assigned', 'department')
      AND (
        p_scope = 'all'
        OR (
          p_scope IN ('self', 'assigned')
          AND (
            EXISTS (
              SELECT 1 FROM public.project_members AS member
              WHERE member.project_id = project.id
                AND member.employee_id = p_employee_id AND member.deleted_at IS NULL
            )
            OR EXISTS (
              SELECT 1 FROM public.customers AS customer
              WHERE customer.id = project.customer_id
                AND customer.owner_id = p_employee_id AND customer.tenant_id = p_tenant_id
            )
          )
        )
        OR (
          p_scope = 'department' AND p_department_id IS NOT NULL
          AND requester.tenant_department_id = p_department_id
          AND (
            EXISTS (
              SELECT 1 FROM public.project_members AS member
              JOIN public.employees AS employee
                ON employee.id = member.employee_id AND employee.tenant_id = p_tenant_id
              WHERE member.project_id = project.id AND member.deleted_at IS NULL
                AND employee.tenant_department_id = p_department_id
            )
            OR EXISTS (
              SELECT 1 FROM public.customers AS customer
              JOIN public.employees AS owner
                ON owner.id = customer.owner_id AND owner.tenant_id = p_tenant_id
              WHERE customer.id = project.customer_id AND customer.tenant_id = p_tenant_id
                AND owner.tenant_department_id = p_department_id
            )
          )
        )
      )
  );
$$;
REVOKE ALL ON FUNCTION public.can_access_project_communication_scope(uuid, uuid, uuid, text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_project_communication_scope(uuid, uuid, uuid, text, uuid)
  TO service_role;
COMMENT ON FUNCTION public.can_access_project_communication_scope(uuid, uuid, uuid, text, uuid) IS
  '项目沟通专用实时员工项目范围判断；单项目布尔结果；仅服务端调用，角色权限由服务端先行校验';

-- Independent rollout controls, both closed by default. Preserve any operator value.
INSERT INTO public.system_settings (
  key, group_code, name, description, value_type, value_text, is_secret, status
)
SELECT incoming.key, 'project_log', incoming.name, incoming.description,
  'boolean', 'false', false, 'active'
FROM (VALUES
  ('PROJECT_LOG_COMMUNICATION_ENABLED', '项目日志沟通开关', '启用客户与员工共享的项目日志文字评论。'),
  ('PROJECT_LOG_INTERNAL_COMMENTS_RETIRED', '内部日志评论退役开关', '独立控制旧内部评论接口退役；开启后旧接口稳定返回 410。')
) AS incoming(key, name, description)
WHERE NOT EXISTS (
  SELECT 1 FROM public.system_settings existing
  WHERE existing.tenant_id IS NULL AND existing.key = incoming.key
);

COMMIT;
