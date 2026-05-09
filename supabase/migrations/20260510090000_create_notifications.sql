CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id),
  recipient_employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  scene text NOT NULL,
  title text NOT NULL,
  content text NOT NULL,
  target_type text,
  target_id text,
  target_url text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'unread',
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notifications_status_check CHECK (status IN ('unread', 'read')),
  CONSTRAINT notifications_payload_object_check CHECK (jsonb_typeof(payload) = 'object')
);

DROP TRIGGER IF EXISTS tr_notifications_updated_at ON public.notifications;
CREATE TRIGGER tr_notifications_updated_at
  BEFORE UPDATE ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS notifications_recipient_status_created_at_idx
ON public.notifications(recipient_employee_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS notifications_tenant_scene_created_at_idx
ON public.notifications(tenant_id, scene, created_at DESC);

CREATE INDEX IF NOT EXISTS notifications_target_idx
ON public.notifications(target_type, target_id)
WHERE target_type IS NOT NULL AND target_id IS NOT NULL;

COMMENT ON TABLE public.notifications IS '员工站内通知表';
COMMENT ON COLUMN public.notifications.scene IS '通知场景，如 platform_lead_assigned / employee_share_customer_bound';
COMMENT ON COLUMN public.notifications.target_url IS '前端可跳转路径，由业务侧生成';
