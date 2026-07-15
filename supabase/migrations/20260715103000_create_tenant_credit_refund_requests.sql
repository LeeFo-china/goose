-- Tenant-side refund request workflow for WeChat credit recharge orders.
-- This creates review records only; real WeChat refund execution is handled later.

ALTER TABLE public.tenant_credit_orders
  ADD COLUMN IF NOT EXISTS refund_status text NULL,
  ADD COLUMN IF NOT EXISTS refund_requested_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS refunded_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS refund_amount_fen integer NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'tenant_credit_orders_refund_status_check'
      AND conrelid = 'public.tenant_credit_orders'::regclass
  ) THEN
    ALTER TABLE public.tenant_credit_orders
      ADD CONSTRAINT tenant_credit_orders_refund_status_check
      CHECK (
        refund_status IS NULL OR refund_status = ANY (
          ARRAY[
            'pending_review'::text,
            'approved'::text,
            'rejected'::text,
            'refunding'::text,
            'refunded'::text,
            'failed'::text
          ]
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'tenant_credit_orders_refund_amount_fen_check'
      AND conrelid = 'public.tenant_credit_orders'::regclass
  ) THEN
    ALTER TABLE public.tenant_credit_orders
      ADD CONSTRAINT tenant_credit_orders_refund_amount_fen_check
      CHECK (refund_amount_fen IS NULL OR refund_amount_fen >= 0);
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS tenant_credit_orders_id_tenant_unique_idx
ON public.tenant_credit_orders(id, tenant_id);

CREATE INDEX IF NOT EXISTS tenant_credit_orders_tenant_refund_status_created_idx
ON public.tenant_credit_orders(tenant_id, refund_status, created_at DESC)
WHERE refund_status IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.tenant_credit_refund_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  order_id uuid NOT NULL,
  request_no text NOT NULL UNIQUE,
  idempotency_key text NOT NULL,
  status text NOT NULL DEFAULT 'pending_review',
  reason text NOT NULL,
  requested_amount_fen integer NOT NULL,
  requested_credits bigint NOT NULL,
  requested_by_employee_id uuid NULL REFERENCES public.employees(id) ON DELETE SET NULL,
  reviewed_by_employee_id uuid NULL REFERENCES public.employees(id) ON DELETE SET NULL,
  reviewed_at timestamptz NULL,
  review_note text NULL,
  out_refund_no text NULL,
  wechat_refund_id text NULL,
  refund_amount_fen integer NULL,
  refunded_at timestamptz NULL,
  failure_message text NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_credit_refund_requests_order_tenant_fkey
    FOREIGN KEY (order_id, tenant_id)
    REFERENCES public.tenant_credit_orders(id, tenant_id)
    ON DELETE CASCADE,
  CONSTRAINT tenant_credit_refund_requests_status_check CHECK (
    status = ANY (
      ARRAY[
        'pending_review'::text,
        'approved'::text,
        'rejected'::text,
        'refunding'::text,
        'refunded'::text,
        'failed'::text
      ]
    )
  ),
  CONSTRAINT tenant_credit_refund_requests_request_no_not_blank
    CHECK (btrim(request_no) <> ''),
  CONSTRAINT tenant_credit_refund_requests_idempotency_key_not_blank
    CHECK (btrim(idempotency_key) <> ''),
  CONSTRAINT tenant_credit_refund_requests_reason_check
    CHECK (length(btrim(reason)) BETWEEN 1 AND 500),
  CONSTRAINT tenant_credit_refund_requests_amount_check CHECK (
    requested_amount_fen > 0
    AND requested_credits > 0
    AND (refund_amount_fen IS NULL OR refund_amount_fen >= 0)
  ),
  CONSTRAINT tenant_credit_refund_requests_metadata_object_check
    CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE UNIQUE INDEX IF NOT EXISTS tenant_credit_refund_requests_idempotency_idx
ON public.tenant_credit_refund_requests(tenant_id, idempotency_key);

CREATE UNIQUE INDEX IF NOT EXISTS tenant_credit_refund_requests_active_order_idx
ON public.tenant_credit_refund_requests(order_id)
WHERE status IN ('pending_review', 'approved', 'refunding');

CREATE INDEX IF NOT EXISTS tenant_credit_refund_requests_tenant_created_idx
ON public.tenant_credit_refund_requests(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS tenant_credit_refund_requests_order_created_idx
ON public.tenant_credit_refund_requests(order_id, created_at DESC);

CREATE INDEX IF NOT EXISTS tenant_credit_refund_requests_status_created_idx
ON public.tenant_credit_refund_requests(status, created_at DESC);

DROP TRIGGER IF EXISTS tr_tenant_credit_refund_requests_updated_at
ON public.tenant_credit_refund_requests;

CREATE TRIGGER tr_tenant_credit_refund_requests_updated_at
  BEFORE UPDATE ON public.tenant_credit_refund_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.permissions (code, name, module, resource, action, description, status)
VALUES (
  'billing.recharge.refund.request',
  '申请积分充值退款',
  'billing',
  'recharge_refund',
  'request',
  '允许租户员工为本租户微信支付积分充值订单提交退款申请',
  'active'
)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  module = EXCLUDED.module,
  resource = EXCLUDED.resource,
  action = EXCLUDED.action,
  description = EXCLUDED.description,
  status = EXCLUDED.status;

INSERT INTO public.permissions (code, name, module, resource, action, description, status)
VALUES
  (
    'platform.billing.recharge_refund.read',
    '查看积分充值退款申请',
    'platform_billing',
    'billing_recharge_refund',
    'read',
    '查看租户积分微信支付充值退款申请',
    'active'
  ),
  (
    'platform.billing.recharge_refund.review',
    '审核积分充值退款申请',
    'platform_billing',
    'billing_recharge_refund',
    'review',
    '审核租户积分微信支付充值退款申请',
    'active'
  )
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  module = EXCLUDED.module,
  resource = EXCLUDED.resource,
  action = EXCLUDED.action,
  description = EXCLUDED.description,
  status = EXCLUDED.status;

INSERT INTO public.role_permissions (role_id, permission_id, access_scope)
SELECT roles.id, permissions.id, 'all'
FROM public.roles
JOIN public.permissions
  ON permissions.code = 'billing.recharge.refund.request'
WHERE roles.code = 'system_admin'
ON CONFLICT (role_id, permission_id) DO UPDATE SET
  access_scope = EXCLUDED.access_scope;

INSERT INTO public.role_permissions (role_id, permission_id, access_scope)
SELECT roles.id, permissions.id, 'all'
FROM public.roles
JOIN public.permissions
  ON permissions.code IN (
    'platform.billing.recharge_refund.read',
    'platform.billing.recharge_refund.review'
  )
WHERE roles.code = 'platform_admin'
ON CONFLICT (role_id, permission_id) DO UPDATE SET
  access_scope = EXCLUDED.access_scope;

COMMENT ON TABLE public.tenant_credit_refund_requests
IS '租户积分微信充值退款申请和退款执行记录。';

COMMENT ON COLUMN public.tenant_credit_orders.refund_status
IS '积分充值订单退款流程镜像状态。';

COMMENT ON COLUMN public.tenant_credit_orders.refund_requested_at
IS '积分充值订单首次提交退款申请时间。';

COMMENT ON COLUMN public.tenant_credit_orders.refund_amount_fen
IS '积分充值订单实际退款金额，单位分。';
