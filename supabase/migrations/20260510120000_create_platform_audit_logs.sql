CREATE TABLE IF NOT EXISTS public.platform_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action text NOT NULL,
  actor_employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  actor_user_id uuid,
  target_tenant_id uuid REFERENCES public.tenants(id) ON DELETE SET NULL,
  resource_type text NOT NULL,
  resource_id uuid,
  resource_label text,
  status text NOT NULL DEFAULT 'success',
  summary text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_audit_logs_action_not_blank CHECK (btrim(action) <> ''),
  CONSTRAINT platform_audit_logs_resource_type_not_blank CHECK (btrim(resource_type) <> ''),
  CONSTRAINT platform_audit_logs_status_check CHECK (status IN ('success', 'failure'))
);

CREATE INDEX IF NOT EXISTS platform_audit_logs_created_at_idx
ON public.platform_audit_logs(created_at DESC);

CREATE INDEX IF NOT EXISTS platform_audit_logs_action_created_at_idx
ON public.platform_audit_logs(action, created_at DESC);

CREATE INDEX IF NOT EXISTS platform_audit_logs_target_tenant_created_at_idx
ON public.platform_audit_logs(target_tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS platform_audit_logs_actor_created_at_idx
ON public.platform_audit_logs(actor_employee_id, created_at DESC);

CREATE INDEX IF NOT EXISTS platform_audit_logs_resource_idx
ON public.platform_audit_logs(resource_type, resource_id);

COMMENT ON TABLE public.platform_audit_logs IS '平台超管操作审计日志';
COMMENT ON COLUMN public.platform_audit_logs.action IS '操作类型，例如 tenant_create、tenant_suspend、platform_lead_assign';
COMMENT ON COLUMN public.platform_audit_logs.actor_employee_id IS '平台操作员工 ID';
COMMENT ON COLUMN public.platform_audit_logs.actor_user_id IS '平台操作用户 ID';
COMMENT ON COLUMN public.platform_audit_logs.target_tenant_id IS '操作影响的目标租户';
COMMENT ON COLUMN public.platform_audit_logs.resource_type IS '被操作资源类型';
COMMENT ON COLUMN public.platform_audit_logs.resource_id IS '被操作资源 ID';
COMMENT ON COLUMN public.platform_audit_logs.resource_label IS '被操作资源可读名称';
COMMENT ON COLUMN public.platform_audit_logs.status IS '操作结果：success/failure';
COMMENT ON COLUMN public.platform_audit_logs.summary IS '操作摘要';
COMMENT ON COLUMN public.platform_audit_logs.metadata IS '操作上下文快照';
