-- Rollback: use a forward migration to disable the add-on product and purchase
-- entry points, then restore guard_pending_recharge_payment_config and
-- guard_pending_recharge_payment_secret from 20260720224000. Restore both
-- before dropping the tenant_addon_orders table. Revoke/drop
-- branding_confirm_addon_purchase; drop
-- tr_tenant_addon_orders_entitlement_event,
-- tr_tenant_addon_orders_snapshot_immutable, and the functions
-- guard_tenant_addon_order_entitlement_event and
-- guard_tenant_addon_order_snapshot; drop
-- tenant_entitlement_events_purchase_source_unique_idx; drop the
-- tenant_addon_orders_entitlement_event_identity_fkey before
-- tenant_entitlement_events_identity_key; remove the four scoped permissions;
-- preserve paid audit data until in-flight orders resolve, then drop the
-- notification, order, and product tables in that dependency order.

BEGIN;

CREATE TABLE IF NOT EXISTS public.platform_addon_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  entitlement_code text NOT NULL,
  name text NOT NULL,
  amount_fen integer NULL,
  term_years integer NOT NULL DEFAULT 1,
  purchase_notes text NOT NULL,
  refund_policy text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  updated_by_employee_id uuid NULL
    REFERENCES public.employees(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_addon_products_identity_key UNIQUE (id, code),
  CONSTRAINT platform_addon_products_code_check
    CHECK (code = 'custom_support_branding_annual'),
  CONSTRAINT platform_addon_products_entitlement_code_check
    CHECK (entitlement_code = 'custom_support_branding'),
  CONSTRAINT platform_addon_products_name_check
    CHECK (btrim(name) <> '' AND char_length(name) <= 100),
  CONSTRAINT platform_addon_products_amount_check
    CHECK (amount_fen IS NULL OR amount_fen > 0),
  CONSTRAINT platform_addon_products_enabled_price_check
    CHECK (enabled = false OR amount_fen IS NOT NULL),
  CONSTRAINT platform_addon_products_term_check CHECK (term_years = 1),
  CONSTRAINT platform_addon_products_purchase_notes_check
    CHECK (btrim(purchase_notes) <> '' AND char_length(purchase_notes) <= 500),
  CONSTRAINT platform_addon_products_refund_policy_check
    CHECK (btrim(refund_policy) <> '' AND char_length(refund_policy) <= 500),
  CONSTRAINT platform_addon_products_version_check CHECK (version > 0)
);

CREATE TRIGGER tr_platform_addon_products_updated_at
BEFORE UPDATE ON public.platform_addon_products
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.platform_addon_products (
  code,
  entitlement_code,
  name,
  amount_fen,
  term_years,
  purchase_notes,
  refund_policy,
  enabled,
  version
)
VALUES
  ('custom_support_branding_annual', 'custom_support_branding', '年度品牌技术支持', NULL, 1, '支付成功后自动开通或续期一年', '数字权益支付成功并开通后不支持退款', false, 1)
ON CONFLICT (code) DO NOTHING;

ALTER TABLE public.tenant_entitlement_events
  ADD CONSTRAINT tenant_entitlement_events_identity_key
  UNIQUE (id, tenant_id, entitlement_code);

CREATE TABLE IF NOT EXISTS public.tenant_addon_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL
    REFERENCES public.tenants(id) ON DELETE RESTRICT,
  order_no text NOT NULL,
  out_trade_no text NOT NULL,
  idempotency_key uuid NOT NULL,
  product_id uuid NOT NULL,
  product_code text NOT NULL,
  entitlement_code text NOT NULL,
  product_name text NOT NULL,
  amount_fen integer NOT NULL,
  term_years integer NOT NULL,
  purchase_notes text NOT NULL,
  refund_policy text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  channel text NOT NULL DEFAULT 'wechat_pay',
  payer_openid text NOT NULL,
  payment_config_id uuid NOT NULL
    REFERENCES public.platform_payment_configs(id) ON DELETE RESTRICT,
  expected_guard_version bigint NOT NULL,
  payment_mchid text NOT NULL,
  payment_appid text NOT NULL,
  prepay_id text NULL,
  payment_expires_at timestamptz NOT NULL,
  transaction_id text NULL,
  paid_amount_fen integer NULL,
  paid_at timestamptz NULL,
  closed_at timestamptz NULL,
  failure_code text NULL,
  failure_message text NULL,
  entitlement_event_id uuid NULL,
  created_by uuid NOT NULL
    REFERENCES public.employees(id) ON DELETE RESTRICT,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  close_claim_token uuid NULL,
  close_claim_expires_at timestamptz NULL,
  close_attempt_count integer NOT NULL DEFAULT 0,
  close_last_error text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_addon_orders_tenant_idempotency_key
    UNIQUE (tenant_id, idempotency_key),
  CONSTRAINT tenant_addon_orders_identity_key UNIQUE (id, tenant_id),
  CONSTRAINT tenant_addon_orders_product_identity_fkey
    FOREIGN KEY (product_id, product_code)
    REFERENCES public.platform_addon_products(id, code)
    ON DELETE RESTRICT,
  CONSTRAINT tenant_addon_orders_entitlement_event_identity_fkey
    FOREIGN KEY (entitlement_event_id, tenant_id, entitlement_code)
    REFERENCES public.tenant_entitlement_events(id, tenant_id, entitlement_code)
    ON DELETE RESTRICT,
  CONSTRAINT tenant_addon_orders_order_no_not_blank_check
    CHECK (btrim(order_no) <> '' AND char_length(order_no) <= 64),
  CONSTRAINT tenant_addon_orders_out_trade_no_not_blank_check
    CHECK (btrim(out_trade_no) <> '' AND char_length(out_trade_no) <= 64),
  CONSTRAINT tenant_addon_orders_product_code_check
    CHECK (product_code = 'custom_support_branding_annual'),
  CONSTRAINT tenant_addon_orders_entitlement_code_check
    CHECK (entitlement_code = 'custom_support_branding'),
  CONSTRAINT tenant_addon_orders_product_name_check
    CHECK (btrim(product_name) <> '' AND char_length(product_name) <= 100),
  CONSTRAINT tenant_addon_orders_amount_check CHECK (amount_fen > 0),
  CONSTRAINT tenant_addon_orders_term_check CHECK (term_years = 1),
  CONSTRAINT tenant_addon_orders_purchase_notes_check
    CHECK (btrim(purchase_notes) <> '' AND char_length(purchase_notes) <= 500),
  CONSTRAINT tenant_addon_orders_refund_policy_check
    CHECK (btrim(refund_policy) <> '' AND char_length(refund_policy) <= 500),
  CONSTRAINT tenant_addon_orders_status_check
    CHECK (status IN ('pending', 'paid', 'closed', 'failed')),
  CONSTRAINT tenant_addon_orders_channel_check CHECK (channel = 'wechat_pay'),
  CONSTRAINT tenant_addon_orders_payer_openid_check
    CHECK (btrim(payer_openid) <> '' AND char_length(payer_openid) <= 128),
  CONSTRAINT tenant_addon_orders_expected_guard_version_check
    CHECK (expected_guard_version > 0),
  CONSTRAINT tenant_addon_orders_payment_mchid_check
    CHECK (btrim(payment_mchid) <> '' AND char_length(payment_mchid) <= 64),
  CONSTRAINT tenant_addon_orders_payment_appid_check
    CHECK (btrim(payment_appid) <> '' AND char_length(payment_appid) <= 128),
  CONSTRAINT tenant_addon_orders_prepay_id_check
    CHECK (
      prepay_id IS NULL
      OR (btrim(prepay_id) <> '' AND char_length(prepay_id) <= 128)
    ),
  CONSTRAINT tenant_addon_orders_payment_expiry_check
    CHECK (payment_expires_at >= created_at + interval '1 minute'),
  CONSTRAINT tenant_addon_orders_transaction_id_check
    CHECK (
      transaction_id IS NULL
      OR (btrim(transaction_id) <> '' AND char_length(transaction_id) <= 64)
    ),
  CONSTRAINT tenant_addon_orders_paid_amount_check
    CHECK (paid_amount_fen >= 0),
  CONSTRAINT tenant_addon_orders_failure_code_check
    CHECK (
      failure_code IS NULL
      OR (btrim(failure_code) <> '' AND char_length(failure_code) <= 100)
    ),
  CONSTRAINT tenant_addon_orders_failure_message_check
    CHECK (
      failure_message IS NULL
      OR (btrim(failure_message) <> '' AND char_length(failure_message) <= 500)
    ),
  CONSTRAINT tenant_addon_orders_metadata_object_check
    CHECK (jsonb_typeof(metadata) = 'object'),
  CONSTRAINT tenant_addon_orders_close_attempt_check
    CHECK (close_attempt_count >= 0),
  CONSTRAINT tenant_addon_orders_close_claim_check
    CHECK (
      (close_claim_token IS NULL AND close_claim_expires_at IS NULL)
      OR (
        close_claim_token IS NOT NULL
        AND close_claim_expires_at IS NOT NULL
      )
    ),
  CONSTRAINT tenant_addon_orders_pending_state_check
    CHECK (
      status <> 'pending'
      OR (
        transaction_id IS NULL
        AND paid_amount_fen IS NULL
        AND paid_at IS NULL
        AND closed_at IS NULL
        AND failure_code IS NULL
        AND failure_message IS NULL
        AND entitlement_event_id IS NULL
      )
    ),
  CONSTRAINT tenant_addon_orders_paid_state_check
    CHECK (
      status <> 'paid'
      OR (
        transaction_id IS NOT NULL
        AND paid_amount_fen = amount_fen
        AND paid_at IS NOT NULL
        AND closed_at IS NULL
        AND failure_code IS NULL
        AND failure_message IS NULL
        AND entitlement_event_id IS NOT NULL
      )
    ),
  CONSTRAINT tenant_addon_orders_closed_state_check
    CHECK (
      status <> 'closed'
      OR (
        closed_at IS NOT NULL
        AND transaction_id IS NULL
        AND paid_amount_fen IS NULL
        AND paid_at IS NULL
        AND failure_code IS NULL
        AND failure_message IS NULL
        AND entitlement_event_id IS NULL
      )
    ),
  CONSTRAINT tenant_addon_orders_failed_state_check
    CHECK (
      status <> 'failed'
      OR (
        failure_code IS NOT NULL
        AND failure_message IS NOT NULL
        AND transaction_id IS NULL
        AND paid_amount_fen IS NULL
        AND paid_at IS NULL
        AND closed_at IS NULL
        AND entitlement_event_id IS NULL
      )
    )
);

CREATE OR REPLACE FUNCTION public.guard_tenant_addon_order_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF ROW(
    OLD.tenant_id,
    OLD.order_no,
    OLD.out_trade_no,
    OLD.idempotency_key,
    OLD.product_id,
    OLD.product_code,
    OLD.entitlement_code,
    OLD.product_name,
    OLD.amount_fen,
    OLD.term_years,
    OLD.purchase_notes,
    OLD.refund_policy,
    OLD.channel,
    OLD.payer_openid,
    OLD.payment_config_id,
    OLD.expected_guard_version,
    OLD.payment_mchid,
    OLD.payment_appid,
    OLD.payment_expires_at,
    OLD.created_by,
    OLD.created_at
  ) IS DISTINCT FROM ROW(
    NEW.tenant_id,
    NEW.order_no,
    NEW.out_trade_no,
    NEW.idempotency_key,
    NEW.product_id,
    NEW.product_code,
    NEW.entitlement_code,
    NEW.product_name,
    NEW.amount_fen,
    NEW.term_years,
    NEW.purchase_notes,
    NEW.refund_policy,
    NEW.channel,
    NEW.payer_openid,
    NEW.payment_config_id,
    NEW.expected_guard_version,
    NEW.payment_mchid,
    NEW.payment_appid,
    NEW.payment_expires_at,
    NEW.created_by,
    NEW.created_at
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'Branding add-on order snapshot is immutable',
      DETAIL = 'BRANDING_ADDON_ORDER_SNAPSHOT_IMMUTABLE';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_tenant_addon_order_snapshot()
FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER tr_tenant_addon_orders_snapshot_immutable
BEFORE UPDATE OF
  tenant_id,
  order_no,
  out_trade_no,
  idempotency_key,
  product_id,
  product_code,
  entitlement_code,
  product_name,
  amount_fen,
  term_years,
  purchase_notes,
  refund_policy,
  channel,
  payer_openid,
  payment_config_id,
  expected_guard_version,
  payment_mchid,
  payment_appid,
  payment_expires_at,
  created_by,
  created_at
ON public.tenant_addon_orders
FOR EACH ROW
EXECUTE FUNCTION public.guard_tenant_addon_order_snapshot();

CREATE OR REPLACE FUNCTION public.guard_tenant_addon_order_entitlement_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.entitlement_event_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.tenant_entitlement_events AS entitlement_event
    WHERE entitlement_event.id = NEW.entitlement_event_id
      AND entitlement_event.tenant_id = NEW.tenant_id
      AND entitlement_event.entitlement_code = NEW.entitlement_code
      AND entitlement_event.source_type = 'purchase'
      AND entitlement_event.source_id = NEW.id
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'Branding add-on entitlement event mismatch',
      DETAIL = 'BRANDING_ADDON_ENTITLEMENT_EVENT_MISMATCH';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL
ON FUNCTION public.guard_tenant_addon_order_entitlement_event()
FROM PUBLIC, anon, authenticated, service_role;

CREATE CONSTRAINT TRIGGER tr_tenant_addon_orders_entitlement_event
AFTER INSERT OR UPDATE
ON public.tenant_addon_orders
DEFERRABLE INITIALLY IMMEDIATE
FOR EACH ROW
EXECUTE FUNCTION public.guard_tenant_addon_order_entitlement_event();

CREATE UNIQUE INDEX tenant_addon_orders_order_no_unique_idx
ON public.tenant_addon_orders(order_no);

CREATE UNIQUE INDEX tenant_addon_orders_out_trade_no_unique_idx
ON public.tenant_addon_orders(out_trade_no);

CREATE UNIQUE INDEX tenant_addon_orders_transaction_unique_idx
ON public.tenant_addon_orders(transaction_id)
WHERE transaction_id IS NOT NULL;

CREATE UNIQUE INDEX tenant_addon_orders_entitlement_event_unique_idx
ON public.tenant_addon_orders(entitlement_event_id)
WHERE entitlement_event_id IS NOT NULL;

CREATE UNIQUE INDEX tenant_addon_orders_pending_product_unique_idx
ON public.tenant_addon_orders(tenant_id, product_code)
WHERE status = 'pending';

CREATE INDEX tenant_addon_orders_tenant_status_created_idx
ON public.tenant_addon_orders(tenant_id, status, created_at DESC, id DESC);

CREATE INDEX tenant_addon_orders_status_created_idx
ON public.tenant_addon_orders(status, created_at DESC, id DESC);

CREATE INDEX tenant_addon_orders_pending_expiry_idx
ON public.tenant_addon_orders(payment_expires_at ASC, id)
WHERE status = 'pending';

CREATE INDEX tenant_addon_orders_close_claim_idx
ON public.tenant_addon_orders(
  close_claim_expires_at ASC,
  payment_expires_at ASC,
  id
)
WHERE status = 'pending';

CREATE INDEX tenant_addon_orders_payment_config_pending_idx
ON public.tenant_addon_orders(payment_config_id, expected_guard_version)
WHERE status = 'pending';

-- Preserve the central payment-config lock protocol and include pending
-- branding add-on orders before allowing merchant or secret revision changes.
CREATE OR REPLACE FUNCTION public.guard_pending_recharge_payment_config()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF ROW(
    OLD.provider,
    OLD.profile_code,
    OLD.principal_type,
    OLD.merchant_mode,
    OLD.merchant_id,
    OLD.sub_merchant_id,
    OLD.app_id,
    OLD.sub_app_id,
    OLD.serial_no,
    OLD.encrypted_config_ref,
    OLD.secret_bundle_revision,
    OLD.notify_url,
    OLD.enabled_channels,
    OLD.status,
    OLD.validation_status,
    OLD.last_validated_at
  ) IS DISTINCT FROM ROW(
    NEW.provider,
    NEW.profile_code,
    NEW.principal_type,
    NEW.merchant_mode,
    NEW.merchant_id,
    NEW.sub_merchant_id,
    NEW.app_id,
    NEW.sub_app_id,
    NEW.serial_no,
    NEW.encrypted_config_ref,
    NEW.secret_bundle_revision,
    NEW.notify_url,
    NEW.enabled_channels,
    NEW.status,
    NEW.validation_status,
    NEW.last_validated_at
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM public.tenant_credit_orders AS orders
      WHERE orders.payment_config_id = OLD.id
        AND orders.channel = 'wechat_pay'
        AND orders.status = 'pending'
    ) OR EXISTS (
      SELECT 1
      FROM public.tenant_payment_configs AS tenant_config
      JOIN public.wechat_payment_orders AS project_order
        ON project_order.payment_config_id = tenant_config.id
      WHERE tenant_config.platform_payment_config_id = OLD.id
        AND project_order.status = 'pending'
    ) OR EXISTS (
      SELECT 1
      FROM public.tenant_addon_orders AS addon_order
      WHERE addon_order.payment_config_id = OLD.id
        AND addon_order.channel = 'wechat_pay'
        AND addon_order.status = 'pending'
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'PLATFORM_PAYMENT_CONFIG_PENDING_RECHARGE_ORDERS';
    END IF;

    NEW.recharge_guard_version := OLD.recharge_guard_version + 1;
  ELSE
    NEW.recharge_guard_version := OLD.recharge_guard_version;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_pending_recharge_payment_config()
FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_pending_recharge_payment_config()
FROM anon;
REVOKE ALL ON FUNCTION public.guard_pending_recharge_payment_config()
FROM authenticated;

CREATE OR REPLACE FUNCTION public.guard_pending_recharge_payment_secret()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_config_id uuid;
  v_references text[] := ARRAY[]::text[];
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.tenant_id IS NOT NULL THEN
      RETURN OLD;
    END IF;
    v_references := ARRAY[
      OLD.key,
      'secret://' || OLD.key,
      'setting://' || OLD.key
    ];
  ELSE
    IF ROW(OLD.value_text, OLD.key, OLD.tenant_id)
      IS NOT DISTINCT FROM ROW(NEW.value_text, NEW.key, NEW.tenant_id)
    THEN
      RETURN NEW;
    END IF;

    IF OLD.tenant_id IS NULL THEN
      v_references := v_references || ARRAY[
        OLD.key,
        'secret://' || OLD.key,
        'setting://' || OLD.key
      ];
    END IF;
    IF NEW.tenant_id IS NULL THEN
      v_references := v_references || ARRAY[
        NEW.key,
        'secret://' || NEW.key,
        'setting://' || NEW.key
      ];
    END IF;
  END IF;

  FOR v_config_id IN
    SELECT platform_config.id
    FROM public.platform_payment_configs AS platform_config
    WHERE platform_config.provider = 'wechat_pay'
      AND platform_config.encrypted_config_ref = ANY(v_references)
    ORDER BY platform_config.id
    FOR UPDATE OF platform_config
  LOOP
    IF EXISTS (
      SELECT 1
      FROM public.tenant_credit_orders AS recharge_order
      WHERE recharge_order.payment_config_id = v_config_id
        AND recharge_order.channel = 'wechat_pay'
        AND recharge_order.status = 'pending'
    ) OR EXISTS (
      SELECT 1
      FROM public.tenant_payment_configs AS tenant_config
      JOIN public.wechat_payment_orders AS project_order
        ON project_order.payment_config_id = tenant_config.id
      WHERE tenant_config.platform_payment_config_id = v_config_id
        AND project_order.status = 'pending'
    ) OR EXISTS (
      SELECT 1
      FROM public.tenant_addon_orders AS addon_order
      WHERE addon_order.payment_config_id = v_config_id
        AND addon_order.channel = 'wechat_pay'
        AND addon_order.status = 'pending'
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'PLATFORM_PAYMENT_CONFIG_PENDING_RECHARGE_ORDERS';
    END IF;

    UPDATE public.platform_payment_configs AS platform_config
    SET recharge_guard_version =
      platform_config.recharge_guard_version + 1
    WHERE platform_config.id = v_config_id;
  END LOOP;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_pending_recharge_payment_secret()
FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_pending_recharge_payment_secret()
FROM anon;
REVOKE ALL ON FUNCTION public.guard_pending_recharge_payment_secret()
FROM authenticated;

CREATE TRIGGER tr_tenant_addon_orders_updated_at
BEFORE UPDATE ON public.tenant_addon_orders
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.tenant_addon_wechat_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notify_id text NOT NULL UNIQUE,
  tenant_id uuid NOT NULL
    REFERENCES public.tenants(id) ON DELETE RESTRICT,
  order_id uuid NOT NULL,
  event_type text NOT NULL,
  resource_type text NOT NULL,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  signature_valid boolean NOT NULL DEFAULT false,
  processed boolean NOT NULL DEFAULT false,
  processed_at timestamptz NULL,
  error_message text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_addon_wechat_notifications_order_identity_fkey
    FOREIGN KEY (order_id, tenant_id)
    REFERENCES public.tenant_addon_orders(id, tenant_id)
    ON DELETE RESTRICT,
  CONSTRAINT tenant_addon_wechat_notifications_notify_id_check
    CHECK (btrim(notify_id) <> '' AND char_length(notify_id) <= 128),
  CONSTRAINT tenant_addon_wechat_notifications_event_type_check
    CHECK (btrim(event_type) <> '' AND char_length(event_type) <= 100),
  CONSTRAINT tenant_addon_wechat_notifications_resource_type_check
    CHECK (btrim(resource_type) <> '' AND char_length(resource_type) <= 100),
  CONSTRAINT tenant_addon_wechat_notifications_raw_payload_object_check
    CHECK (jsonb_typeof(raw_payload) = 'object'),
  CONSTRAINT tenant_addon_wechat_notifications_processed_state_check
    CHECK (
      (processed = false AND processed_at IS NULL)
      OR (processed = true AND processed_at IS NOT NULL)
    ),
  CONSTRAINT tenant_addon_wechat_notifications_error_message_check
    CHECK (
      error_message IS NULL
      OR (btrim(error_message) <> '' AND char_length(error_message) <= 500)
    )
);

CREATE INDEX tenant_addon_wechat_notifications_tenant_created_idx
ON public.tenant_addon_wechat_notifications(
  tenant_id,
  created_at DESC,
  id DESC
);

CREATE INDEX tenant_addon_wechat_notifications_order_created_idx
ON public.tenant_addon_wechat_notifications(
  order_id,
  created_at DESC,
  id DESC
);

CREATE INDEX tenant_addon_wechat_notifications_unprocessed_idx
ON public.tenant_addon_wechat_notifications(created_at ASC, id)
WHERE processed = false;

CREATE TRIGGER tr_tenant_addon_wechat_notifications_updated_at
BEFORE UPDATE ON public.tenant_addon_wechat_notifications
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE UNIQUE INDEX tenant_entitlement_events_purchase_source_unique_idx
ON public.tenant_entitlement_events(source_id)
WHERE source_type = 'purchase'
  AND source_id IS NOT NULL;

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
  ('platform.branding_product.manage', '管理品牌权益商品', 'platform_branding', 'branding_product', 'manage', '管理年度品牌权益商品配置和上下架状态', 'active'),
  ('platform.branding_order.read', '查看品牌权益订单', 'platform_branding', 'branding_order', 'read', '查看平台品牌权益购买订单和支付审计', 'active'),
  ('brand.entitlement.purchase', '购买品牌权益', 'branding', 'entitlement', 'purchase', '为当前租户购买或续费年度品牌权益', 'active'),
  ('brand.entitlement_order.read', '查看品牌权益订单', 'branding', 'entitlement_order', 'read', '查看当前租户的品牌权益购买订单', 'active')
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
    'platform.branding_product.manage',
    'platform.branding_order.read'
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
    'brand.entitlement.purchase',
    'brand.entitlement_order.read'
  )
WHERE roles.code = 'system_admin'
  AND roles.tenant_id IS NOT NULL
ON CONFLICT (role_id, permission_id) DO UPDATE SET
  access_scope = EXCLUDED.access_scope;

CREATE OR REPLACE FUNCTION public.branding_confirm_addon_purchase(
  p_order_id uuid,
  p_out_trade_no text,
  p_transaction_id text,
  p_paid_amount_fen integer,
  p_paid_at timestamptz,
  p_mchid text,
  p_appid text,
  p_notification_id uuid,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order public.tenant_addon_orders%ROWTYPE;
  v_entitlement public.tenant_entitlements%ROWTYPE;
  v_event public.tenant_entitlement_events%ROWTYPE;
  v_old_value jsonb := '{}'::jsonb;
  v_event_type text;
BEGIN
  IF p_order_id IS NULL
     OR p_out_trade_no IS NULL
     OR btrim(p_out_trade_no) = ''
     OR p_transaction_id IS NULL
     OR btrim(p_transaction_id) = ''
     OR p_paid_amount_fen IS NULL
     OR p_paid_amount_fen <= 0
     OR p_paid_at IS NULL
     OR p_mchid IS NULL
     OR btrim(p_mchid) = ''
     OR p_appid IS NULL
     OR btrim(p_appid) = ''
     OR p_metadata IS NULL
     OR jsonb_typeof(p_metadata) <> 'object'
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'Invalid branding add-on confirmation input',
      DETAIL = 'BRANDING_ADDON_CONFIRM_INPUT_INVALID';
  END IF;

  SELECT addon_order.*
  INTO v_order
  FROM public.tenant_addon_orders AS addon_order
  WHERE addon_order.id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'Branding add-on order not found',
      DETAIL = 'BRANDING_ADDON_ORDER_NOT_FOUND';
  END IF;

  IF v_order.out_trade_no IS DISTINCT FROM p_out_trade_no THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'Branding add-on merchant order mismatch',
      DETAIL = 'BRANDING_ADDON_OUT_TRADE_NO_MISMATCH';
  END IF;

  IF v_order.amount_fen IS DISTINCT FROM p_paid_amount_fen THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'Branding add-on payment amount mismatch',
      DETAIL = 'BRANDING_ADDON_CALLBACK_AMOUNT_MISMATCH';
  END IF;

  IF v_order.payment_mchid IS DISTINCT FROM p_mchid
     OR v_order.payment_appid IS DISTINCT FROM p_appid
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'Branding add-on payment context mismatch',
      DETAIL = 'BRANDING_ADDON_CALLBACK_CONTEXT_MISMATCH';
  END IF;

  IF v_order.status = 'paid' THEN
    IF v_order.transaction_id IS DISTINCT FROM p_transaction_id THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'Branding add-on transaction conflict',
        DETAIL = 'BRANDING_ADDON_TRANSACTION_CONFLICT';
    END IF;

    SELECT entitlement.*
    INTO v_entitlement
    FROM public.tenant_entitlements AS entitlement
    WHERE entitlement.tenant_id = v_order.tenant_id
      AND entitlement.entitlement_code = v_order.entitlement_code;

    SELECT entitlement_event.*
    INTO v_event
    FROM public.tenant_entitlement_events AS entitlement_event
    WHERE entitlement_event.id = v_order.entitlement_event_id;

    RETURN jsonb_build_object(
      'idempotent', true,
      'order', to_jsonb(v_order),
      'entitlement', to_jsonb(v_entitlement),
      'event', to_jsonb(v_event),
      'source_type', 'purchase'
    );
  END IF;

  IF v_order.status <> 'pending' THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'Branding add-on order status invalid',
      DETAIL = 'BRANDING_ADDON_ORDER_STATUS_INVALID';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_transaction_id, 0));

  IF EXISTS (
    SELECT 1
    FROM public.tenant_addon_orders AS addon_order
    WHERE addon_order.transaction_id = p_transaction_id
      AND addon_order.id <> v_order.id
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'Branding add-on transaction conflict',
      DETAIL = 'BRANDING_ADDON_TRANSACTION_CONFLICT';
  END IF;

  PERFORM tenant.id
  FROM public.tenants AS tenant
  WHERE tenant.id = v_order.tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'Branding add-on tenant not found',
      DETAIL = 'BRANDING_ADDON_TENANT_NOT_FOUND';
  END IF;

  IF p_notification_id IS NOT NULL THEN
    PERFORM notification.id
    FROM public.tenant_addon_wechat_notifications AS notification
    WHERE notification.id = p_notification_id
      AND notification.order_id = v_order.id
      AND notification.tenant_id = v_order.tenant_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'Branding add-on notification mismatch',
        DETAIL = 'BRANDING_ADDON_NOTIFICATION_MISMATCH';
    END IF;
  END IF;

  SELECT entitlement.*
  INTO v_entitlement
  FROM public.tenant_entitlements AS entitlement
  WHERE entitlement.tenant_id = v_order.tenant_id
    AND entitlement.entitlement_code = v_order.entitlement_code
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.tenant_entitlements (
      tenant_id,
      entitlement_code,
      status,
      starts_at,
      expires_at,
      source_type,
      source_id,
      version,
      updated_by_employee_id
    )
    VALUES (
      v_order.tenant_id,
      v_order.entitlement_code,
      'active',
      p_paid_at,
      p_paid_at + make_interval(years => v_order.term_years),
      'purchase',
      v_order.id,
      1,
      NULL
    )
    RETURNING tenant_entitlements.* INTO v_entitlement;

    v_event_type := 'granted';
  ELSE
    v_old_value := to_jsonb(v_entitlement);
    v_event_type := 'renewed';

    IF v_entitlement.status IN ('suspended', 'revoked') THEN
      UPDATE public.tenant_entitlements
      SET
        status = v_entitlement.status,
        starts_at = v_entitlement.starts_at,
        expires_at = GREATEST(v_entitlement.expires_at, p_paid_at)
          + make_interval(years => v_order.term_years),
        source_type = 'purchase',
        source_id = v_order.id,
        version = version + 1,
        updated_by_employee_id = NULL
      WHERE id = v_entitlement.id
      RETURNING tenant_entitlements.* INTO v_entitlement;
    ELSIF v_entitlement.status = 'active'
      AND v_entitlement.expires_at > p_paid_at
    THEN
      UPDATE public.tenant_entitlements
      SET
        expires_at = v_entitlement.expires_at
          + make_interval(years => v_order.term_years),
        source_type = 'purchase',
        source_id = v_order.id,
        version = version + 1,
        updated_by_employee_id = NULL
      WHERE id = v_entitlement.id
      RETURNING tenant_entitlements.* INTO v_entitlement;
    ELSE
      UPDATE public.tenant_entitlements
      SET
        status = 'active',
        starts_at = p_paid_at,
        expires_at = p_paid_at
          + make_interval(years => v_order.term_years),
        source_type = 'purchase',
        source_id = v_order.id,
        suspended_at = NULL,
        suspend_reason = NULL,
        version = version + 1,
        updated_by_employee_id = NULL
      WHERE id = v_entitlement.id
      RETURNING tenant_entitlements.* INTO v_entitlement;
    END IF;
  END IF;

  INSERT INTO public.tenant_entitlement_events (
    entitlement_id,
    tenant_id,
    entitlement_code,
    event_type,
    source_type,
    source_id,
    old_value,
    new_value,
    reason,
    actor_employee_id,
    actor_user_id
  )
  VALUES (
    v_entitlement.id,
    v_entitlement.tenant_id,
    v_entitlement.entitlement_code,
    v_event_type,
    'purchase',
    v_order.id,
    v_old_value,
    to_jsonb(v_entitlement),
    'Annual branding add-on purchase confirmed',
    NULL,
    NULL
  )
  RETURNING tenant_entitlement_events.* INTO v_event;

  UPDATE public.tenant_addon_orders
  SET
    status = 'paid',
    transaction_id = p_transaction_id,
    paid_amount_fen = p_paid_amount_fen,
    paid_at = p_paid_at,
    entitlement_event_id = v_event.id,
    close_claim_token = NULL,
    close_claim_expires_at = NULL,
    close_last_error = NULL,
    metadata = metadata || p_metadata || jsonb_build_object(
      'confirmation_notification_id',
      p_notification_id
    )
  WHERE id = v_order.id
    AND status = 'pending'
  RETURNING tenant_addon_orders.* INTO v_order;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'Branding add-on order state changed',
      DETAIL = 'BRANDING_ADDON_ORDER_STATUS_INVALID';
  END IF;

  INSERT INTO public.platform_audit_logs (
    action,
    actor_employee_id,
    actor_user_id,
    target_tenant_id,
    resource_type,
    resource_id,
    resource_label,
    status,
    summary,
    metadata
  )
  VALUES (
    'branding_addon_purchase.confirm',
    NULL,
    NULL,
    v_order.tenant_id,
    'tenant_addon_order',
    v_order.id,
    v_order.order_no,
    'success',
    'Annual branding add-on purchase confirmed',
    jsonb_build_object(
      'entitlement_id', v_entitlement.id,
      'entitlement_event_id', v_event.id,
      'product_code', v_order.product_code,
      'amount_fen', v_order.amount_fen,
      'paid_at', v_order.paid_at,
      'transaction_id', v_order.transaction_id
    )
  );

  RETURN jsonb_build_object(
    'idempotent', false,
    'order', to_jsonb(v_order),
    'entitlement', to_jsonb(v_entitlement),
    'event', to_jsonb(v_event),
    'source_type', 'purchase'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.branding_confirm_addon_purchase(
  uuid, text, text, integer, timestamptz, text, text, uuid, jsonb
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.branding_confirm_addon_purchase(
  uuid, text, text, integer, timestamptz, text, text, uuid, jsonb
) FROM anon;
REVOKE ALL ON FUNCTION public.branding_confirm_addon_purchase(
  uuid, text, text, integer, timestamptz, text, text, uuid, jsonb
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.branding_confirm_addon_purchase(
  uuid, text, text, integer, timestamptz, text, text, uuid, jsonb
) TO service_role;

ALTER TABLE public.platform_addon_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_addon_products FORCE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_addon_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_addon_orders FORCE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_addon_wechat_notifications
  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_addon_wechat_notifications
  FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.platform_addon_products
FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.tenant_addon_orders
FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.tenant_addon_wechat_notifications
FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.platform_addon_products FROM service_role;
REVOKE ALL ON TABLE public.tenant_addon_orders FROM service_role;
REVOKE ALL ON TABLE public.tenant_addon_wechat_notifications
FROM service_role;

GRANT SELECT, INSERT, UPDATE ON TABLE public.platform_addon_products
TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.tenant_addon_orders
TO service_role;
GRANT SELECT, INSERT, UPDATE
ON TABLE public.tenant_addon_wechat_notifications
TO service_role;

COMMENT ON TABLE public.platform_addon_products
IS 'Platform-managed add-on products with immutable product identities.';
COMMENT ON TABLE public.tenant_addon_orders
IS 'Tenant-isolated annual branding add-on orders and payment snapshots.';
COMMENT ON TABLE public.tenant_addon_wechat_notifications
IS 'Tenant-isolated WeChat notifications for branding add-on orders.';
COMMENT ON COLUMN public.tenant_addon_orders.expected_guard_version
IS 'Payment configuration CAS version captured when the order is created.';
COMMENT ON COLUMN public.tenant_addon_orders.payment_mchid
IS 'Immutable WeChat merchant ID snapshot used to validate confirmation.';
COMMENT ON COLUMN public.tenant_addon_orders.payment_appid
IS 'Immutable WeChat appid snapshot used to validate confirmation.';
COMMENT ON COLUMN public.tenant_addon_orders.close_claim_token
IS 'Lease token used by the bounded expiration and close worker.';
COMMENT ON FUNCTION public.branding_confirm_addon_purchase(
  uuid, text, text, integer, timestamptz, text, text, uuid, jsonb
)
IS 'Atomically confirms one branding add-on payment and applies its natural-year entitlement term exactly once.';

COMMIT;
