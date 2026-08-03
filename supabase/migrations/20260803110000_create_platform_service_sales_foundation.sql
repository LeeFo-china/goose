-- Platform deployment and annual technical service sales foundation.
-- Rollback: use a forward migration to disable platform_service_products,
-- resolve pending tenant_service_orders, then revoke/drop RPCs and policies
-- before dropping refund requests, notifications, work orders, orders,
-- product versions and products in dependency order.

BEGIN;

CREATE TABLE public.platform_service_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  title text NOT NULL,
  term_years integer NOT NULL CHECK (term_years IN (1, 2, 3)),
  list_amount_fen bigint NOT NULL CHECK (list_amount_fen > 0),
  amount_fen bigint NOT NULL CHECK (
    amount_fen > 0
    AND amount_fen <= list_amount_fen
  ),
  service_scope jsonb NOT NULL DEFAULT '[]'::jsonb,
  terms_version integer NOT NULL DEFAULT 1 CHECK (terms_version > 0),
  terms_content text NOT NULL,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'enabled', 'disabled', 'archived')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  published_version_id uuid NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_by_employee_id uuid NULL
    REFERENCES public.employees(id) ON DELETE SET NULL,
  updated_by_employee_id uuid NULL
    REFERENCES public.employees(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_service_products_code_not_blank
    CHECK (btrim(code) <> '' AND char_length(code) <= 80),
  CONSTRAINT platform_service_products_title_not_blank
    CHECK (btrim(title) <> '' AND char_length(title) <= 120),
  CONSTRAINT platform_service_products_scope_array
    CHECK (jsonb_typeof(service_scope) = 'array'),
  CONSTRAINT platform_service_products_terms_not_blank
    CHECK (btrim(terms_content) <> '')
);

CREATE TABLE public.platform_service_product_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL
    REFERENCES public.platform_service_products(id) ON DELETE RESTRICT,
  version integer NOT NULL CHECK (version > 0),
  title text NOT NULL,
  term_years integer NOT NULL CHECK (term_years IN (1, 2, 3)),
  list_amount_fen bigint NOT NULL CHECK (list_amount_fen > 0),
  amount_fen bigint NOT NULL CHECK (
    amount_fen > 0
    AND amount_fen <= list_amount_fen
  ),
  service_scope jsonb NOT NULL,
  terms_version integer NOT NULL CHECK (terms_version > 0),
  terms_content text NOT NULL,
  published_by_employee_id uuid NULL
    REFERENCES public.employees(id) ON DELETE SET NULL,
  published_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, version),
  CONSTRAINT platform_service_product_versions_title_not_blank
    CHECK (btrim(title) <> '' AND char_length(title) <= 120),
  CONSTRAINT platform_service_product_versions_scope_array
    CHECK (jsonb_typeof(service_scope) = 'array'),
  CONSTRAINT platform_service_product_versions_terms_not_blank
    CHECK (btrim(terms_content) <> '')
);

ALTER TABLE public.platform_service_products
  ADD CONSTRAINT platform_service_products_published_version_fkey
  FOREIGN KEY (published_version_id)
  REFERENCES public.platform_service_product_versions(id)
  ON DELETE RESTRICT;

CREATE TABLE public.tenant_service_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL
    REFERENCES public.tenants(id) ON DELETE RESTRICT,
  product_id uuid NOT NULL
    REFERENCES public.platform_service_products(id) ON DELETE RESTRICT,
  product_version_id uuid NOT NULL
    REFERENCES public.platform_service_product_versions(id) ON DELETE RESTRICT,
  order_no text NOT NULL UNIQUE,
  out_trade_no text NOT NULL UNIQUE,
  idempotency_key uuid NULL,
  product_code text NOT NULL,
  pricing_version integer NOT NULL CHECK (pricing_version > 0),
  product_snapshot jsonb NOT NULL,
  term_years integer NOT NULL CHECK (term_years IN (1, 2, 3)),
  amount_fen bigint NOT NULL CHECK (amount_fen > 0),
  paid_amount_fen bigint NULL CHECK (
    paid_amount_fen IS NULL
    OR paid_amount_fen >= 0
  ),
  payment_status text NOT NULL DEFAULT 'pending',
  service_status text NOT NULL DEFAULT 'waiting_payment',
  payment_config_id uuid NOT NULL
    REFERENCES public.platform_payment_configs(id) ON DELETE RESTRICT,
  payment_config_guard_version integer NOT NULL,
  payer_openid text NOT NULL,
  prepay_id text NULL,
  transaction_id text NULL,
  payment_expires_at timestamptz NOT NULL,
  paid_at timestamptz NULL,
  closed_at timestamptz NULL,
  terms_version integer NOT NULL,
  terms_accepted_at timestamptz NOT NULL,
  created_by_employee_id uuid NOT NULL
    REFERENCES public.employees(id) ON DELETE RESTRICT,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, idempotency_key),
  CONSTRAINT tenant_service_orders_identity_key UNIQUE (id, tenant_id),
  CHECK (payment_status IN (
    'pending',
    'paid',
    'refund_reviewing',
    'refunding',
    'partially_refunded',
    'refunded',
    'closed'
  )),
  CHECK (service_status IN (
    'waiting_payment',
    'waiting_assignment',
    'configuring',
    'deploying',
    'training',
    'awaiting_acceptance',
    'rectifying',
    'accepted',
    'active',
    'canceled'
  )),
  CONSTRAINT tenant_service_orders_order_no_not_blank
    CHECK (btrim(order_no) <> '' AND char_length(order_no) <= 64),
  CONSTRAINT tenant_service_orders_out_trade_no_not_blank
    CHECK (btrim(out_trade_no) <> '' AND char_length(out_trade_no) <= 64),
  CONSTRAINT tenant_service_orders_product_code_not_blank
    CHECK (btrim(product_code) <> '' AND char_length(product_code) <= 80),
  CONSTRAINT tenant_service_orders_snapshot_object
    CHECK (jsonb_typeof(product_snapshot) = 'object'),
  CONSTRAINT tenant_service_orders_guard_version_check
    CHECK (payment_config_guard_version > 0),
  CONSTRAINT tenant_service_orders_payer_openid_not_blank
    CHECK (btrim(payer_openid) <> '' AND char_length(payer_openid) <= 128),
  CONSTRAINT tenant_service_orders_prepay_id_not_blank
    CHECK (prepay_id IS NULL OR btrim(prepay_id) <> ''),
  CONSTRAINT tenant_service_orders_transaction_id_not_blank
    CHECK (transaction_id IS NULL OR btrim(transaction_id) <> ''),
  CONSTRAINT tenant_service_orders_terms_version_check
    CHECK (terms_version > 0)
);

CREATE TABLE public.tenant_service_work_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL
    REFERENCES public.tenants(id) ON DELETE RESTRICT,
  service_order_id uuid NOT NULL UNIQUE,
  order_no text NOT NULL,
  status text NOT NULL DEFAULT 'waiting_assignment',
  assignee_employee_id uuid NULL
    REFERENCES public.employees(id) ON DELETE SET NULL,
  created_by_employee_id uuid NULL
    REFERENCES public.employees(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_service_work_orders_order_identity_fkey
    FOREIGN KEY (service_order_id, tenant_id)
    REFERENCES public.tenant_service_orders(id, tenant_id)
    ON DELETE RESTRICT,
  CONSTRAINT tenant_service_work_orders_status_check
    CHECK (status IN (
      'waiting_assignment',
      'configuring',
      'deploying',
      'training',
      'awaiting_acceptance',
      'rectifying',
      'accepted',
      'active',
      'canceled'
    )),
  CONSTRAINT tenant_service_work_orders_order_no_not_blank
    CHECK (btrim(order_no) <> '' AND char_length(order_no) <= 64)
);

CREATE TABLE public.tenant_service_wechat_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notify_id text NOT NULL UNIQUE,
  tenant_id uuid NULL
    REFERENCES public.tenants(id) ON DELETE SET NULL,
  order_id uuid NULL
    REFERENCES public.tenant_service_orders(id) ON DELETE SET NULL,
  out_trade_no text NULL,
  transaction_id text NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  processed boolean NOT NULL DEFAULT false,
  processed_at timestamptz NULL,
  error_message text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_service_wechat_notifications_notify_id_not_blank
    CHECK (btrim(notify_id) <> '' AND char_length(notify_id) <= 128),
  CONSTRAINT tenant_service_wechat_notifications_payload_object
    CHECK (jsonb_typeof(payload) = 'object'),
  CONSTRAINT tenant_service_wechat_notifications_error_message_length
    CHECK (error_message IS NULL OR char_length(error_message) <= 1000)
);

CREATE TABLE public.tenant_service_refund_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL
    REFERENCES public.tenants(id) ON DELETE RESTRICT,
  service_order_id uuid NOT NULL,
  idempotency_key uuid NOT NULL,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'reviewing',
  created_by_employee_id uuid NOT NULL
    REFERENCES public.employees(id) ON DELETE RESTRICT,
  reviewed_by_employee_id uuid NULL
    REFERENCES public.employees(id) ON DELETE SET NULL,
  reviewed_at timestamptz NULL,
  review_remark text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (service_order_id, idempotency_key),
  CONSTRAINT tenant_service_refund_requests_order_identity_fkey
    FOREIGN KEY (service_order_id, tenant_id)
    REFERENCES public.tenant_service_orders(id, tenant_id)
    ON DELETE RESTRICT,
  CONSTRAINT tenant_service_refund_requests_reason_not_blank
    CHECK (btrim(reason) <> '' AND char_length(reason) <= 500),
  CONSTRAINT tenant_service_refund_requests_status_check
    CHECK (status IN ('reviewing', 'approved', 'rejected', 'cancelled')),
  CONSTRAINT tenant_service_refund_requests_review_remark_length
    CHECK (review_remark IS NULL OR char_length(review_remark) <= 1000)
);

CREATE INDEX tenant_service_orders_tenant_created_idx
  ON public.tenant_service_orders (tenant_id, created_at DESC);
CREATE INDEX tenant_service_orders_payment_created_idx
  ON public.tenant_service_orders (payment_status, created_at DESC);
CREATE INDEX tenant_service_orders_service_updated_idx
  ON public.tenant_service_orders (service_status, updated_at DESC);
CREATE UNIQUE INDEX tenant_service_orders_transaction_unique_idx
  ON public.tenant_service_orders (transaction_id)
  WHERE transaction_id IS NOT NULL;
CREATE INDEX tenant_service_orders_pending_config_idx
  ON public.tenant_service_orders (payment_config_id, payment_expires_at)
  WHERE payment_status = 'pending';
CREATE INDEX tenant_service_orders_out_trade_idx
  ON public.tenant_service_orders (out_trade_no);
CREATE INDEX tenant_service_products_status_sort_idx
  ON public.platform_service_products (status, sort_order, created_at DESC);
CREATE INDEX tenant_service_work_orders_tenant_created_idx
  ON public.tenant_service_work_orders (tenant_id, created_at DESC);
CREATE INDEX tenant_service_work_orders_status_updated_idx
  ON public.tenant_service_work_orders (status, updated_at DESC);
CREATE INDEX tenant_service_wechat_notifications_order_created_idx
  ON public.tenant_service_wechat_notifications (order_id, created_at DESC)
  WHERE order_id IS NOT NULL;
CREATE INDEX tenant_service_wechat_notifications_unprocessed_idx
  ON public.tenant_service_wechat_notifications (created_at ASC, id)
  WHERE processed = false;
CREATE INDEX tenant_service_refund_requests_tenant_created_idx
  ON public.tenant_service_refund_requests (tenant_id, created_at DESC);
CREATE INDEX tenant_service_refund_requests_order_created_idx
  ON public.tenant_service_refund_requests (service_order_id, created_at DESC);

CREATE TRIGGER tr_platform_service_products_updated_at
BEFORE UPDATE ON public.platform_service_products
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER tr_tenant_service_orders_updated_at
BEFORE UPDATE ON public.tenant_service_orders
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER tr_tenant_service_work_orders_updated_at
BEFORE UPDATE ON public.tenant_service_work_orders
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER tr_tenant_service_wechat_notifications_updated_at
BEFORE UPDATE ON public.tenant_service_wechat_notifications
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER tr_tenant_service_refund_requests_updated_at
BEFORE UPDATE ON public.tenant_service_refund_requests
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.platform_service_create_pending_order(
  p_tenant_id uuid,
  p_product_id uuid,
  p_product_version_id uuid,
  p_order_no text,
  p_out_trade_no text,
  p_idempotency_key uuid,
  p_product_code text,
  p_pricing_version integer,
  p_product_snapshot jsonb,
  p_term_years integer,
  p_amount_fen bigint,
  p_payment_config_id uuid,
  p_payment_config_guard_version integer,
  p_payer_openid text,
  p_payment_expires_at timestamptz,
  p_terms_version integer,
  p_terms_accepted_at timestamptz,
  p_created_by_employee_id uuid,
  p_required_channel text DEFAULT 'platform_service'
)
RETURNS public.tenant_service_orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_payment_config public.platform_payment_configs%ROWTYPE;
  v_order public.tenant_service_orders%ROWTYPE;
BEGIN
  IF p_required_channel IS NULL OR btrim(p_required_channel) = '' THEN
    RAISE EXCEPTION 'SERVICE_PAYMENT_CHANNEL_REQUIRED';
  END IF;

  SELECT *
  INTO v_payment_config
  FROM public.platform_payment_configs
  WHERE id = p_payment_config_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SERVICE_PAYMENT_CONFIG_NOT_FOUND';
  END IF;

  IF v_payment_config.provider <> 'wechat_pay'
    OR v_payment_config.principal_type <> 'platform'
    OR v_payment_config.merchant_mode <> 'direct_merchant'
    OR v_payment_config.status <> 'active'
    OR NOT (p_required_channel = ANY(v_payment_config.enabled_channels))
  THEN
    RAISE EXCEPTION 'SERVICE_PAYMENT_CONFIG_INVALID';
  END IF;

  IF v_payment_config.recharge_guard_version <> p_payment_config_guard_version THEN
    RAISE EXCEPTION 'SERVICE_PAYMENT_CONFIG_VERSION_CONFLICT';
  END IF;

  INSERT INTO public.tenant_service_orders (
    tenant_id,
    product_id,
    product_version_id,
    order_no,
    out_trade_no,
    idempotency_key,
    product_code,
    pricing_version,
    product_snapshot,
    term_years,
    amount_fen,
    payment_config_id,
    payment_config_guard_version,
    payer_openid,
    payment_expires_at,
    terms_version,
    terms_accepted_at,
    created_by_employee_id
  )
  VALUES (
    p_tenant_id,
    p_product_id,
    p_product_version_id,
    p_order_no,
    p_out_trade_no,
    p_idempotency_key,
    p_product_code,
    p_pricing_version,
    p_product_snapshot,
    p_term_years,
    p_amount_fen,
    p_payment_config_id,
    p_payment_config_guard_version,
    p_payer_openid,
    p_payment_expires_at,
    p_terms_version,
    p_terms_accepted_at,
    p_created_by_employee_id
  )
  RETURNING * INTO v_order;

  RETURN v_order;
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_service_confirm_payment(
  p_order_id uuid,
  p_transaction_id text,
  p_paid_amount_fen bigint,
  p_paid_at timestamptz,
  p_notification_id uuid,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order public.tenant_service_orders%ROWTYPE;
  v_work_order public.tenant_service_work_orders%ROWTYPE;
BEGIN
  IF p_transaction_id IS NULL OR btrim(p_transaction_id) = '' THEN
    RAISE EXCEPTION 'SERVICE_PAYMENT_TRANSACTION_ID_REQUIRED';
  END IF;

  SELECT *
  INTO v_order
  FROM public.tenant_service_orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SERVICE_ORDER_NOT_FOUND';
  END IF;

  IF v_order.payment_status = 'paid' THEN
    SELECT *
    INTO v_work_order
    FROM public.tenant_service_work_orders
    WHERE service_order_id = v_order.id;

    RETURN jsonb_build_object(
      'order', to_jsonb(v_order),
      'work_order', to_jsonb(v_work_order),
      'idempotent', true
    );
  END IF;

  IF v_order.payment_status <> 'pending' THEN
    RAISE EXCEPTION 'SERVICE_ORDER_INVALID_STATE';
  END IF;

  IF p_paid_amount_fen <> v_order.amount_fen THEN
    RAISE EXCEPTION 'SERVICE_PAYMENT_AMOUNT_MISMATCH';
  END IF;

  UPDATE public.tenant_service_orders
  SET
    payment_status = 'paid',
    service_status = 'waiting_assignment',
    paid_amount_fen = p_paid_amount_fen,
    paid_at = coalesce(p_paid_at, now()),
    transaction_id = p_transaction_id,
    version = version + 1
  WHERE id = v_order.id
  RETURNING * INTO v_order;

  INSERT INTO public.tenant_service_work_orders (
    tenant_id,
    service_order_id,
    order_no,
    status,
    created_by_employee_id
  )
  VALUES (
    v_order.tenant_id,
    v_order.id,
    v_order.order_no,
    'waiting_assignment',
    v_order.created_by_employee_id
  )
  ON CONFLICT (service_order_id) DO NOTHING;

  SELECT *
  INTO v_work_order
  FROM public.tenant_service_work_orders
  WHERE service_order_id = v_order.id;

  RETURN jsonb_build_object(
    'order', to_jsonb(v_order),
    'work_order', to_jsonb(v_work_order),
    'idempotent', false,
    'notification_id', p_notification_id,
    'metadata', coalesce(p_metadata, '{}'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.platform_service_create_pending_order(
  uuid,
  uuid,
  uuid,
  text,
  text,
  uuid,
  text,
  integer,
  jsonb,
  integer,
  bigint,
  uuid,
  integer,
  text,
  timestamptz,
  integer,
  timestamptz,
  uuid,
  text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.platform_service_create_pending_order(
  uuid,
  uuid,
  uuid,
  text,
  text,
  uuid,
  text,
  integer,
  jsonb,
  integer,
  bigint,
  uuid,
  integer,
  text,
  timestamptz,
  integer,
  timestamptz,
  uuid,
  text
) TO service_role;

REVOKE ALL ON FUNCTION public.platform_service_confirm_payment(
  uuid,
  text,
  bigint,
  timestamptz,
  uuid,
  jsonb
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.platform_service_confirm_payment(
  uuid,
  text,
  bigint,
  timestamptz,
  uuid,
  jsonb
) TO service_role;

ALTER TABLE public.platform_service_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_service_product_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_service_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_service_work_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_service_wechat_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_service_refund_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY platform_service_products_enabled_read
  ON public.platform_service_products
  FOR SELECT
  USING (status = 'enabled');

CREATE POLICY platform_service_product_versions_enabled_product_read
  ON public.platform_service_product_versions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.platform_service_products AS product
      WHERE product.id = platform_service_product_versions.product_id
        AND product.status = 'enabled'
        AND product.published_version_id = platform_service_product_versions.id
    )
  );

CREATE POLICY tenant_service_orders_self_read
  ON public.tenant_service_orders
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.employees AS employee
      WHERE employee.user_id = auth.uid()
        AND employee.tenant_id = tenant_service_orders.tenant_id
        AND employee.status = 'active'
    )
  );

CREATE POLICY tenant_service_work_orders_self_read
  ON public.tenant_service_work_orders
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.employees AS employee
      WHERE employee.user_id = auth.uid()
        AND employee.tenant_id = tenant_service_work_orders.tenant_id
        AND employee.status = 'active'
    )
  );

CREATE POLICY tenant_service_refund_requests_self_read
  ON public.tenant_service_refund_requests
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.employees AS employee
      WHERE employee.user_id = auth.uid()
        AND employee.tenant_id = tenant_service_refund_requests.tenant_id
        AND employee.status = 'active'
    )
  );

INSERT INTO public.permissions (
  code,
  name,
  module,
  resource,
  action,
  description,
  status
)
VALUES
  ('billing.service_order.create', '发起技术服务订单', 'billing', 'service_order', 'create', '为当前租户购买平台部署及年度技术服务', 'active'),
  ('billing.service_order.read', '查看技术服务订单', 'billing', 'service_order', 'read', '查看当前租户平台技术服务订单', 'active'),
  ('billing.service_order.refund.request', '申请技术服务退款', 'billing', 'service_order', 'refund_request', '为当前租户技术服务订单提交退款申请', 'active'),
  ('platform.service_product.manage', '管理技术服务商品', 'platform_service', 'service_product', 'manage', '管理平台部署及年度技术服务商品、价格和发布版本', 'active'),
  ('platform.service_order.read', '查看技术服务订单', 'platform_service', 'service_order', 'read', '查看平台技术服务订单和支付审计', 'active'),
  ('platform.service_work_order.manage', '管理技术服务工单', 'platform_service', 'service_work_order', 'manage', '分配和管理平台技术服务实施工单', 'active')
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  module = EXCLUDED.module,
  resource = EXCLUDED.resource,
  action = EXCLUDED.action,
  description = EXCLUDED.description,
  status = EXCLUDED.status;

INSERT INTO public.role_permissions (role_id, permission_id, access_scope)
SELECT roles.id, permissions.id, 'all'
FROM public.roles AS roles
JOIN public.permissions AS permissions
  ON permissions.code IN (
    'platform.service_product.manage',
    'platform.service_order.read',
    'platform.service_work_order.manage'
  )
WHERE roles.code = 'platform_admin'
  AND roles.tenant_id IS NULL
ON CONFLICT (role_id, permission_id) DO UPDATE SET
  access_scope = EXCLUDED.access_scope;

INSERT INTO public.role_permissions (role_id, permission_id, access_scope)
SELECT roles.id, permissions.id, 'all'
FROM public.roles AS roles
JOIN public.permissions AS permissions
  ON permissions.code IN (
    'billing.service_order.create',
    'billing.service_order.read',
    'billing.service_order.refund.request'
  )
WHERE roles.code = 'system_admin'
  AND roles.tenant_id IS NOT NULL
ON CONFLICT (role_id, permission_id) DO UPDATE SET
  access_scope = EXCLUDED.access_scope;

WITH seed_products AS (
  INSERT INTO public.platform_service_products (
    code,
    title,
    term_years,
    list_amount_fen,
    amount_fen,
    service_scope,
    terms_version,
    terms_content,
    status,
    version,
    sort_order
  )
  VALUES
    (
      'platform_service_1y',
      '平台部署及年度技术服务（1年）',
      1,
      980000,
      980000,
      '["客户专属系统环境部署","服务器基础配置与安全基线配置","首次操作培训及实施指导","1年年度运维与技术支持"]'::jsonb,
      1,
      '客户专属系统环境部署、服务器基础配置与安全基线配置、首次操作培训及实施指导、1年年度运维与技术支持。不包含积分赠送。',
      'enabled',
      1,
      10
    ),
    (
      'platform_service_2y',
      '平台部署及年度技术服务（2年）',
      2,
      1960000,
      1568000,
      '["客户专属系统环境部署","服务器基础配置与安全基线配置","首次操作培训及实施指导","2年年度运维与技术支持"]'::jsonb,
      1,
      '客户专属系统环境部署、服务器基础配置与安全基线配置、首次操作培训及实施指导、2年年度运维与技术支持。不包含积分赠送。',
      'enabled',
      1,
      20
    ),
    (
      'platform_service_3y',
      '平台部署及年度技术服务（3年）',
      3,
      2940000,
      2058000,
      '["客户专属系统环境部署","服务器基础配置与安全基线配置","首次操作培训及实施指导","3年年度运维与技术支持"]'::jsonb,
      1,
      '客户专属系统环境部署、服务器基础配置与安全基线配置、首次操作培训及实施指导、3年年度运维与技术支持。不包含积分赠送。',
      'enabled',
      1,
      30
    )
  ON CONFLICT (code) DO UPDATE SET
    title = EXCLUDED.title,
    term_years = EXCLUDED.term_years,
    list_amount_fen = EXCLUDED.list_amount_fen,
    amount_fen = EXCLUDED.amount_fen,
    service_scope = EXCLUDED.service_scope,
    terms_version = EXCLUDED.terms_version,
    terms_content = EXCLUDED.terms_content,
    status = EXCLUDED.status,
    sort_order = EXCLUDED.sort_order
  RETURNING *
),
seed_versions AS (
  INSERT INTO public.platform_service_product_versions (
    product_id,
    version,
    title,
    term_years,
    list_amount_fen,
    amount_fen,
    service_scope,
    terms_version,
    terms_content,
    published_by_employee_id
  )
  SELECT
    product.id,
    1,
    product.title,
    product.term_years,
    product.list_amount_fen,
    product.amount_fen,
    product.service_scope,
    product.terms_version,
    product.terms_content,
    NULL
  FROM seed_products AS product
  ON CONFLICT (product_id, version) DO UPDATE SET
    title = EXCLUDED.title,
    term_years = EXCLUDED.term_years,
    list_amount_fen = EXCLUDED.list_amount_fen,
    amount_fen = EXCLUDED.amount_fen,
    service_scope = EXCLUDED.service_scope,
    terms_version = EXCLUDED.terms_version,
    terms_content = EXCLUDED.terms_content
  RETURNING *
)
UPDATE public.platform_service_products AS product
SET published_version_id = version.id
FROM seed_versions AS version
WHERE product.id = version.product_id;

COMMENT ON TABLE public.platform_service_products
IS '平台部署及年度技术服务商品草稿和当前发布指针。';
COMMENT ON TABLE public.platform_service_product_versions
IS '平台技术服务商品不可变发布版本，订单只引用已发布版本。';
COMMENT ON TABLE public.tenant_service_orders
IS '租户购买平台部署及年度技术服务的普通微信支付订单。';
COMMENT ON TABLE public.tenant_service_work_orders
IS '平台技术服务实施主工单，支付确认后幂等创建。';
COMMENT ON TABLE public.tenant_service_wechat_notifications
IS '平台技术服务订单微信支付回调通知幂等和审计记录。';
COMMENT ON TABLE public.tenant_service_refund_requests
IS '租户技术服务订单退款申请，本期只进入平台审核。';
COMMENT ON COLUMN public.platform_service_product_versions.published_by_employee_id
IS '发布员工；系统初始化默认商品版本允许为空，后续平台发布必须由 API 传入员工。';

COMMIT;
