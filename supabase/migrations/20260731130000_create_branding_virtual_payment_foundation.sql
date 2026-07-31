-- Rollback: use a forward migration to move the branding product to maintenance
-- and revoke branding_create_virtual_addon_order before removing objects. Drop
-- tr_tenant_virtual_addon_orders_entitlement_event,
-- tr_tenant_virtual_addon_orders_state_transition, and
-- tr_tenant_virtual_addon_orders_snapshot_immutable before their guard
-- functions; then drop tenant_virtual_addon_orders before
-- platform_virtual_payment_products. Drop
-- tr_platform_addon_products_purchase_mode and its guard only after no writer
-- depends on purchase_mode. Removing purchase_mode or allowing direct_legacy
-- again requires a separately reviewed forward migration. Historical private
-- virtual commerce facts must be retained for audit, and ordinary
-- tenant_addon_orders remains untouched by this migration and its rollback.

BEGIN;

ALTER TABLE public.platform_addon_products
  ADD COLUMN purchase_mode text NOT NULL DEFAULT 'direct_legacy',
  ADD CONSTRAINT platform_addon_products_purchase_mode_check
    CHECK (
      purchase_mode IN ('direct_legacy', 'maintenance', 'wechat_virtual')
    );

CREATE OR REPLACE FUNCTION public.guard_branding_addon_purchase_mode_transition()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.purchase_mode = NEW.purchase_mode THEN
    RETURN NEW;
  END IF;

  IF OLD.purchase_mode = 'direct_legacy'
     AND NEW.purchase_mode = 'maintenance'
  THEN
    RETURN NEW;
  END IF;

  IF OLD.purchase_mode = 'maintenance'
     AND NEW.purchase_mode = 'wechat_virtual'
  THEN
    RETURN NEW;
  END IF;

  IF OLD.purchase_mode = 'wechat_virtual'
     AND NEW.purchase_mode = 'maintenance'
  THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION USING
    ERRCODE = 'P0001',
    MESSAGE = 'BRANDING_ADDON_PURCHASE_MODE_TRANSITION_INVALID';
END;
$$;

REVOKE ALL
ON FUNCTION public.guard_branding_addon_purchase_mode_transition()
FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER tr_platform_addon_products_purchase_mode
BEFORE UPDATE OF purchase_mode
ON public.platform_addon_products
FOR EACH ROW
EXECUTE FUNCTION public.guard_branding_addon_purchase_mode_transition();

CREATE TABLE IF NOT EXISTS public.platform_virtual_payment_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  addon_product_id uuid NOT NULL
    REFERENCES public.platform_addon_products(id) ON DELETE RESTRICT,
  provider text NOT NULL DEFAULT 'wechat_virtual',
  environment text NOT NULL,
  app_id text NOT NULL,
  virtual_merchant_id text NOT NULL,
  offer_id text NOT NULL,
  provider_product_id text NOT NULL,
  goods_quantity integer NOT NULL DEFAULT 1,
  expected_amount_fen integer NOT NULL,
  encrypted_secret_ref text NOT NULL,
  secret_revision integer NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  validation_status text NOT NULL DEFAULT 'pending',
  validated_at timestamptz NULL,
  version integer NOT NULL DEFAULT 1,
  created_by uuid NULL
    REFERENCES public.employees(id) ON DELETE SET NULL,
  updated_by uuid NULL
    REFERENCES public.employees(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_virtual_payment_products_product_environment_key
    UNIQUE (addon_product_id, environment),
  CONSTRAINT platform_virtual_payment_products_provider_identity_key
    UNIQUE (offer_id, provider_product_id, environment),
  CONSTRAINT platform_virtual_payment_products_provider_check
    CHECK (provider = 'wechat_virtual'),
  CONSTRAINT platform_virtual_payment_products_environment_check
    CHECK (environment IN ('sandbox', 'production')),
  CONSTRAINT platform_virtual_payment_products_app_id_check
    CHECK (btrim(app_id) <> '' AND char_length(app_id) <= 128),
  CONSTRAINT platform_virtual_payment_products_merchant_id_check
    CHECK (
      btrim(virtual_merchant_id) <> ''
      AND char_length(virtual_merchant_id) <= 128
    ),
  CONSTRAINT platform_virtual_payment_products_offer_id_check
    CHECK (btrim(offer_id) <> '' AND char_length(offer_id) <= 128),
  CONSTRAINT platform_virtual_payment_products_provider_product_id_check
    CHECK (
      btrim(provider_product_id) <> ''
      AND char_length(provider_product_id) <= 128
    ),
  CONSTRAINT platform_virtual_payment_products_quantity_check
    CHECK (goods_quantity = 1),
  CONSTRAINT platform_virtual_payment_products_amount_check
    CHECK (expected_amount_fen > 0),
  CONSTRAINT platform_virtual_payment_products_production_amount_check
    CHECK (environment <> 'production' OR expected_amount_fen >= 100),
  CONSTRAINT platform_virtual_payment_products_secret_ref_check
    CHECK (
      btrim(encrypted_secret_ref) <> ''
      AND char_length(encrypted_secret_ref) <= 500
    ),
  CONSTRAINT platform_virtual_payment_products_secret_revision_check
    CHECK (secret_revision > 0),
  CONSTRAINT platform_virtual_payment_products_status_check
    CHECK (status IN ('draft', 'active', 'disabled')),
  CONSTRAINT platform_virtual_payment_products_validation_status_check
    CHECK (validation_status IN ('pending', 'valid', 'invalid')),
  CONSTRAINT platform_virtual_payment_products_version_check
    CHECK (version > 0)
);

CREATE TRIGGER tr_platform_virtual_payment_products_updated_at
BEFORE UPDATE ON public.platform_virtual_payment_products
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.tenant_virtual_addon_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL
    REFERENCES public.tenants(id) ON DELETE RESTRICT,
  order_no text NOT NULL UNIQUE,
  out_trade_no text NOT NULL UNIQUE,
  idempotency_key uuid NOT NULL,
  product_id uuid NOT NULL,
  product_code text NOT NULL,
  entitlement_code text NOT NULL,
  product_name text NOT NULL,
  amount_fen integer NOT NULL,
  term_years integer NOT NULL DEFAULT 1,
  purchase_notes text NOT NULL,
  refund_policy text NOT NULL,
  environment text NOT NULL,
  offer_id text NOT NULL,
  provider_product_id text NOT NULL,
  requested_platform text NOT NULL DEFAULT 'unknown',
  settlement_channel text NULL,
  payer_openid text NOT NULL,
  provider_order_no text NULL UNIQUE,
  transaction_id text NULL UNIQUE,
  payment_status text NOT NULL DEFAULT 'pending',
  fulfillment_status text NOT NULL DEFAULT 'pending',
  refund_status text NOT NULL DEFAULT 'none',
  paid_amount_fen integer NULL,
  paid_at timestamptz NULL,
  entitlement_event_id uuid NULL,
  config_version integer NOT NULL,
  secret_revision integer NOT NULL,
  payment_expires_at timestamptz NOT NULL,
  failure_code text NULL,
  failure_message text NULL,
  reconcile_claim_token uuid NULL,
  reconcile_claim_expires_at timestamptz NULL,
  reconcile_attempt_count integer NOT NULL DEFAULT 0,
  reconcile_last_error text NULL,
  created_by uuid NOT NULL
    REFERENCES public.employees(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenant_virtual_addon_orders_tenant_idempotency_key
    UNIQUE (tenant_id, idempotency_key),
  CONSTRAINT tenant_virtual_addon_orders_identity_key
    UNIQUE (id, tenant_id),
  CONSTRAINT tenant_virtual_addon_orders_product_identity_fkey
    FOREIGN KEY (product_id, product_code)
    REFERENCES public.platform_addon_products(id, code)
    ON DELETE RESTRICT,
  CONSTRAINT tenant_virtual_addon_orders_entitlement_event_identity_fkey
    FOREIGN KEY (entitlement_event_id, tenant_id, entitlement_code)
    REFERENCES public.tenant_entitlement_events(id, tenant_id, entitlement_code)
    ON DELETE RESTRICT,
  CONSTRAINT tenant_virtual_addon_orders_order_no_check
    CHECK (btrim(order_no) <> '' AND char_length(order_no) <= 64),
  CONSTRAINT tenant_virtual_addon_orders_out_trade_no_check
    CHECK (btrim(out_trade_no) <> '' AND char_length(out_trade_no) <= 32),
  CONSTRAINT tenant_virtual_addon_orders_product_code_check
    CHECK (product_code = 'custom_support_branding_annual'),
  CONSTRAINT tenant_virtual_addon_orders_entitlement_code_check
    CHECK (entitlement_code = 'custom_support_branding'),
  CONSTRAINT tenant_virtual_addon_orders_product_name_check
    CHECK (btrim(product_name) <> '' AND char_length(product_name) <= 100),
  CONSTRAINT tenant_virtual_addon_orders_amount_check
    CHECK (amount_fen >= 100),
  CONSTRAINT tenant_virtual_addon_orders_term_check
    CHECK (term_years = 1),
  CONSTRAINT tenant_virtual_addon_orders_purchase_notes_check
    CHECK (
      btrim(purchase_notes) <> ''
      AND char_length(purchase_notes) <= 500
    ),
  CONSTRAINT tenant_virtual_addon_orders_refund_policy_check
    CHECK (
      btrim(refund_policy) <> ''
      AND char_length(refund_policy) <= 500
    ),
  CONSTRAINT tenant_virtual_addon_orders_environment_check
    CHECK (environment IN ('sandbox', 'production')),
  CONSTRAINT tenant_virtual_addon_orders_offer_id_check
    CHECK (btrim(offer_id) <> '' AND char_length(offer_id) <= 128),
  CONSTRAINT tenant_virtual_addon_orders_provider_product_id_check
    CHECK (
      btrim(provider_product_id) <> ''
      AND char_length(provider_product_id) <= 128
    ),
  CONSTRAINT tenant_virtual_addon_orders_requested_platform_check
    CHECK (
      requested_platform IN ('android', 'harmony', 'windows', 'ios', 'unknown')
    ),
  CONSTRAINT tenant_virtual_addon_orders_settlement_channel_check
    CHECK (settlement_channel IN ('wechat', 'apple')),
  CONSTRAINT tenant_virtual_addon_orders_payer_openid_check
    CHECK (
      btrim(payer_openid) <> ''
      AND char_length(payer_openid) <= 128
    ),
  CONSTRAINT tenant_virtual_addon_orders_provider_order_no_check
    CHECK (
      provider_order_no IS NULL
      OR (
        btrim(provider_order_no) <> ''
        AND char_length(provider_order_no) <= 128
      )
    ),
  CONSTRAINT tenant_virtual_addon_orders_transaction_id_check
    CHECK (
      transaction_id IS NULL
      OR (
        btrim(transaction_id) <> ''
        AND char_length(transaction_id) <= 128
      )
    ),
  CONSTRAINT tenant_virtual_addon_orders_payment_status_check
    CHECK (payment_status IN ('pending', 'succeeded', 'closed', 'failed')),
  CONSTRAINT tenant_virtual_addon_orders_fulfillment_status_check
    CHECK (fulfillment_status IN ('pending', 'granted', 'grant_failed')),
  CONSTRAINT tenant_virtual_addon_orders_refund_status_check
    CHECK (
      refund_status IN (
        'none',
        'reviewing',
        'submitted',
        'external_required',
        'succeeded',
        'failed',
        'rejected'
      )
    ),
  CONSTRAINT tenant_virtual_addon_orders_paid_amount_check
    CHECK (paid_amount_fen IS NULL OR paid_amount_fen >= 0),
  CONSTRAINT tenant_virtual_addon_orders_succeeded_state_check
    CHECK (
      payment_status <> 'succeeded'
      OR (paid_amount_fen = amount_fen AND paid_at IS NOT NULL)
    ),
  CONSTRAINT tenant_virtual_addon_orders_unpaid_state_check
    CHECK (
      payment_status = 'succeeded'
      OR (paid_amount_fen IS NULL AND paid_at IS NULL)
    ),
  CONSTRAINT tenant_virtual_addon_orders_granted_state_check
    CHECK (
      fulfillment_status <> 'granted'
      OR entitlement_event_id IS NOT NULL
    ),
  CONSTRAINT tenant_virtual_addon_orders_ungranted_state_check
    CHECK (
      fulfillment_status = 'granted'
      OR entitlement_event_id IS NULL
    ),
  CONSTRAINT tenant_virtual_addon_orders_fulfillment_payment_check
    CHECK (
      fulfillment_status = 'pending'
      OR payment_status = 'succeeded'
    ),
  CONSTRAINT tenant_virtual_addon_orders_config_version_check
    CHECK (config_version > 0),
  CONSTRAINT tenant_virtual_addon_orders_secret_revision_check
    CHECK (secret_revision > 0),
  CONSTRAINT tenant_virtual_addon_orders_payment_expiry_check
    CHECK (payment_expires_at >= created_at + interval '1 minute'),
  CONSTRAINT tenant_virtual_addon_orders_failure_code_check
    CHECK (
      failure_code IS NULL
      OR (
        btrim(failure_code) <> ''
        AND char_length(failure_code) <= 100
      )
    ),
  CONSTRAINT tenant_virtual_addon_orders_failure_message_check
    CHECK (
      failure_message IS NULL
      OR (
        btrim(failure_message) <> ''
        AND char_length(failure_message) <= 500
      )
    ),
  CONSTRAINT tenant_virtual_addon_orders_reconcile_attempt_check
    CHECK (reconcile_attempt_count >= 0),
  CONSTRAINT tenant_virtual_addon_orders_reconcile_error_check
    CHECK (
      reconcile_last_error IS NULL
      OR (
        btrim(reconcile_last_error) <> ''
        AND char_length(reconcile_last_error) <= 1000
      )
    ),
  CONSTRAINT tenant_virtual_addon_orders_reconcile_claim_check
    CHECK (
      (
        reconcile_claim_token IS NULL
        AND reconcile_claim_expires_at IS NULL
      )
      OR (
        reconcile_claim_token IS NOT NULL
        AND reconcile_claim_expires_at IS NOT NULL
      )
    )
);

CREATE TRIGGER tr_tenant_virtual_addon_orders_updated_at
BEFORE UPDATE ON public.tenant_virtual_addon_orders
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE UNIQUE INDEX tenant_virtual_addon_orders_pending_product_unique_idx
ON public.tenant_virtual_addon_orders(tenant_id, product_code)
WHERE payment_status = 'pending';

CREATE UNIQUE INDEX tenant_virtual_addon_orders_entitlement_event_unique_idx
ON public.tenant_virtual_addon_orders(entitlement_event_id)
WHERE entitlement_event_id IS NOT NULL;

CREATE INDEX tenant_virtual_addon_orders_tenant_status_created_idx
ON public.tenant_virtual_addon_orders(
  tenant_id,
  payment_status,
  created_at DESC,
  id DESC
);

CREATE INDEX tenant_virtual_addon_orders_tenant_created_idx
ON public.tenant_virtual_addon_orders(
  tenant_id,
  created_at DESC,
  id DESC
);

CREATE INDEX tenant_virtual_addon_orders_platform_created_idx
ON public.tenant_virtual_addon_orders(created_at DESC, id DESC);

CREATE INDEX tenant_virtual_addon_orders_status_created_idx
ON public.tenant_virtual_addon_orders(
  payment_status,
  created_at DESC,
  id DESC
);

CREATE INDEX tenant_virtual_addon_orders_reconcile_idx
ON public.tenant_virtual_addon_orders(
  payment_status,
  fulfillment_status,
  payment_expires_at,
  id
)
WHERE payment_status = 'pending'
   OR fulfillment_status = 'grant_failed';

CREATE INDEX tenant_virtual_addon_orders_reconcile_claim_idx
ON public.tenant_virtual_addon_orders(
  reconcile_claim_expires_at ASC,
  payment_expires_at ASC,
  id
)
WHERE payment_status = 'pending'
   OR fulfillment_status = 'grant_failed';

CREATE INDEX tenant_virtual_addon_orders_order_no_trgm_idx
ON public.tenant_virtual_addon_orders
USING gin (order_no extensions.gin_trgm_ops);

CREATE INDEX tenant_virtual_addon_orders_out_trade_no_trgm_idx
ON public.tenant_virtual_addon_orders
USING gin (out_trade_no extensions.gin_trgm_ops);

CREATE INDEX tenant_virtual_addon_orders_provider_order_no_trgm_idx
ON public.tenant_virtual_addon_orders
USING gin (provider_order_no extensions.gin_trgm_ops);

CREATE INDEX tenant_virtual_addon_orders_transaction_id_trgm_idx
ON public.tenant_virtual_addon_orders
USING gin (transaction_id extensions.gin_trgm_ops);

CREATE OR REPLACE FUNCTION public.guard_tenant_virtual_addon_order_snapshot()
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
    OLD.environment,
    OLD.offer_id,
    OLD.provider_product_id,
    OLD.requested_platform,
    OLD.payer_openid,
    OLD.config_version,
    OLD.secret_revision,
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
    NEW.environment,
    NEW.offer_id,
    NEW.provider_product_id,
    NEW.requested_platform,
    NEW.payer_openid,
    NEW.config_version,
    NEW.secret_revision,
    NEW.payment_expires_at,
    NEW.created_by,
    NEW.created_at
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'Branding virtual order snapshot is immutable',
      DETAIL = 'BRANDING_VIRTUAL_ORDER_SNAPSHOT_IMMUTABLE';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL
ON FUNCTION public.guard_tenant_virtual_addon_order_snapshot()
FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER tr_tenant_virtual_addon_orders_snapshot_immutable
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
  environment,
  offer_id,
  provider_product_id,
  requested_platform,
  payer_openid,
  config_version,
  secret_revision,
  payment_expires_at,
  created_by,
  created_at
ON public.tenant_virtual_addon_orders
FOR EACH ROW
EXECUTE FUNCTION public.guard_tenant_virtual_addon_order_snapshot();

CREATE OR REPLACE FUNCTION public.guard_tenant_virtual_addon_order_state_transition()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.payment_status IS DISTINCT FROM NEW.payment_status
     AND NOT (
       OLD.payment_status = 'pending'
       AND NEW.payment_status IN ('succeeded', 'closed', 'failed')
     )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'BRANDING_VIRTUAL_PAYMENT_STATUS_TRANSITION_INVALID';
  END IF;

  IF OLD.fulfillment_status IS DISTINCT FROM NEW.fulfillment_status
     AND NOT (
       (
         OLD.fulfillment_status = 'pending'
         AND NEW.fulfillment_status IN ('granted', 'grant_failed')
       )
       OR (
         OLD.fulfillment_status = 'grant_failed'
         AND NEW.fulfillment_status = 'granted'
       )
     )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'BRANDING_VIRTUAL_FULFILLMENT_STATUS_TRANSITION_INVALID';
  END IF;

  IF OLD.refund_status IS DISTINCT FROM NEW.refund_status
     AND NOT (
       (OLD.refund_status = 'none' AND NEW.refund_status = 'reviewing')
       OR (
         OLD.refund_status = 'reviewing'
         AND NEW.refund_status IN (
           'submitted',
           'external_required',
           'rejected'
         )
       )
       OR (
         OLD.refund_status = 'submitted'
         AND NEW.refund_status IN ('succeeded', 'failed')
       )
       OR (
         OLD.refund_status = 'external_required'
         AND NEW.refund_status IN ('succeeded', 'failed')
       )
     )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'BRANDING_VIRTUAL_REFUND_STATUS_TRANSITION_INVALID';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL
ON FUNCTION public.guard_tenant_virtual_addon_order_state_transition()
FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER tr_tenant_virtual_addon_orders_state_transition
BEFORE UPDATE OF payment_status, fulfillment_status, refund_status
ON public.tenant_virtual_addon_orders
FOR EACH ROW
EXECUTE FUNCTION public.guard_tenant_virtual_addon_order_state_transition();

CREATE OR REPLACE FUNCTION public.guard_tenant_virtual_addon_order_entitlement_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
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
      MESSAGE = 'Branding virtual entitlement event mismatch',
      DETAIL = 'BRANDING_VIRTUAL_ENTITLEMENT_EVENT_MISMATCH';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL
ON FUNCTION public.guard_tenant_virtual_addon_order_entitlement_event()
FROM PUBLIC, anon, authenticated, service_role;

CREATE CONSTRAINT TRIGGER tr_tenant_virtual_addon_orders_entitlement_event
AFTER INSERT OR UPDATE
ON public.tenant_virtual_addon_orders
DEFERRABLE INITIALLY IMMEDIATE
FOR EACH ROW
EXECUTE FUNCTION public.guard_tenant_virtual_addon_order_entitlement_event();

CREATE OR REPLACE FUNCTION public.branding_create_virtual_addon_order(
  p_tenant_id uuid,
  p_idempotency_key uuid,
  p_virtual_product_id uuid,
  p_requested_platform text,
  p_payer_openid text,
  p_created_by uuid
)
RETURNS public.tenant_virtual_addon_orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_product public.platform_addon_products%ROWTYPE;
  v_virtual_product public.platform_virtual_payment_products%ROWTYPE;
  v_order public.tenant_virtual_addon_orders%ROWTYPE;
  v_now timestamptz;
  v_order_no text;
  v_out_trade_no text;
BEGIN
  IF p_tenant_id IS NULL
     OR p_idempotency_key IS NULL
     OR p_virtual_product_id IS NULL
     OR p_created_by IS NULL
     OR p_requested_platform IS NULL
     OR p_requested_platform NOT IN (
       'android',
       'harmony',
       'windows',
       'ios',
       'unknown'
     )
     OR p_payer_openid IS NULL
     OR btrim(p_payer_openid) = ''
     OR char_length(p_payer_openid) > 128
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'BRANDING_VIRTUAL_ORDER_INPUT_INVALID';
  END IF;

  SELECT addon_product.*
  INTO v_product
  FROM public.platform_addon_products AS addon_product
  WHERE addon_product.code = 'custom_support_branding_annual'
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'BRANDING_VIRTUAL_PRODUCT_NOT_FOUND';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      p_tenant_id::text || ':' || v_product.code,
      20260731
    )
  );

  SELECT orders.*
  INTO v_order
  FROM public.tenant_virtual_addon_orders AS orders
  WHERE orders.tenant_id = p_tenant_id
    AND orders.idempotency_key = p_idempotency_key
  FOR UPDATE;

  IF FOUND THEN
    RETURN v_order;
  END IF;

  SELECT orders.*
  INTO v_order
  FROM public.tenant_virtual_addon_orders AS orders
  WHERE orders.tenant_id = p_tenant_id
    AND orders.product_code = v_product.code
    AND orders.payment_status = 'pending'
  FOR UPDATE;

  IF FOUND THEN
    RETURN v_order;
  END IF;

  IF v_product.purchase_mode <> 'wechat_virtual' THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'BRANDING_VIRTUAL_PURCHASE_MODE_UNAVAILABLE';
  END IF;

  IF v_product.enabled = false OR v_product.amount_fen IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'BRANDING_VIRTUAL_PRODUCT_DISABLED';
  END IF;

  SELECT virtual_product.*
  INTO v_virtual_product
  FROM public.platform_virtual_payment_products AS virtual_product
  WHERE virtual_product.id = p_virtual_product_id
    AND virtual_product.addon_product_id = v_product.id
    AND virtual_product.provider = 'wechat_virtual'
    AND virtual_product.status = 'active'
    AND virtual_product.validation_status = 'valid'
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'BRANDING_VIRTUAL_PRODUCT_MAPPING_UNAVAILABLE';
  END IF;

  IF v_virtual_product.expected_amount_fen IS DISTINCT FROM v_product.amount_fen
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'BRANDING_VIRTUAL_PRODUCT_AMOUNT_MISMATCH';
  END IF;

  IF v_virtual_product.environment = 'production'
     AND v_product.amount_fen < 100
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'BRANDING_VIRTUAL_PRODUCT_AMOUNT_TOO_LOW';
  END IF;

  v_now := clock_timestamp();
  v_order_no :=
    'BVO-' || to_char(v_now, 'YYYYMMDDHH24MISSMS') || '-' ||
    upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
  v_out_trade_no :=
    'BV' || to_char(v_now, 'YYYYMMDDHH24MISS') ||
    upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 16));

  INSERT INTO public.tenant_virtual_addon_orders (
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
    environment,
    offer_id,
    provider_product_id,
    requested_platform,
    payer_openid,
    payment_status,
    fulfillment_status,
    refund_status,
    config_version,
    secret_revision,
    payment_expires_at,
    created_by,
    created_at,
    updated_at
  )
  VALUES (
    p_tenant_id,
    v_order_no,
    v_out_trade_no,
    p_idempotency_key,
    v_product.id,
    v_product.code,
    v_product.entitlement_code,
    v_product.name,
    v_product.amount_fen,
    v_product.term_years,
    v_product.purchase_notes,
    v_product.refund_policy,
    v_virtual_product.environment,
    v_virtual_product.offer_id,
    v_virtual_product.provider_product_id,
    p_requested_platform,
    p_payer_openid,
    'pending',
    'pending',
    'none',
    v_virtual_product.version,
    v_virtual_product.secret_revision,
    v_now + interval '5 minutes',
    p_created_by,
    v_now,
    v_now
  )
  ON CONFLICT DO NOTHING
  RETURNING tenant_virtual_addon_orders.* INTO v_order;

  IF FOUND THEN
    RETURN v_order;
  END IF;

  SELECT orders.*
  INTO v_order
  FROM public.tenant_virtual_addon_orders AS orders
  WHERE orders.tenant_id = p_tenant_id
    AND (
      orders.idempotency_key = p_idempotency_key
      OR (
        orders.product_code = v_product.code
        AND orders.payment_status = 'pending'
      )
    )
  ORDER BY
    (orders.idempotency_key = p_idempotency_key) DESC,
    orders.created_at DESC,
    orders.id DESC
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    RETURN v_order;
  END IF;

  RAISE EXCEPTION USING
    ERRCODE = 'P0001',
    MESSAGE = 'BRANDING_VIRTUAL_ORDER_CONFLICT';
END;
$$;

REVOKE ALL ON FUNCTION public.branding_create_virtual_addon_order(
  uuid, uuid, uuid, text, text, uuid
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.branding_create_virtual_addon_order(
  uuid, uuid, uuid, text, text, uuid
) FROM anon;
REVOKE ALL ON FUNCTION public.branding_create_virtual_addon_order(
  uuid, uuid, uuid, text, text, uuid
) FROM authenticated;
REVOKE ALL ON FUNCTION public.branding_create_virtual_addon_order(
  uuid, uuid, uuid, text, text, uuid
) FROM service_role;
GRANT EXECUTE ON FUNCTION public.branding_create_virtual_addon_order(
  uuid, uuid, uuid, text, text, uuid
) TO service_role;

ALTER TABLE public.platform_virtual_payment_products
  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_virtual_payment_products
  FORCE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_virtual_addon_orders
  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_virtual_addon_orders
  FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.platform_virtual_payment_products
FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.tenant_virtual_addon_orders
FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.platform_virtual_payment_products
FROM service_role;
REVOKE ALL ON TABLE public.tenant_virtual_addon_orders
FROM service_role;

GRANT SELECT, INSERT, UPDATE
ON TABLE public.platform_virtual_payment_products
TO service_role;
GRANT SELECT, INSERT, UPDATE
ON TABLE public.tenant_virtual_addon_orders
TO service_role;

COMMENT ON TABLE public.platform_virtual_payment_products
IS 'Private platform mapping from annual branding products to WeChat virtual-payment products; secret material is referenced, never stored in plaintext.';
COMMENT ON TABLE public.tenant_virtual_addon_orders
IS 'Private tenant-scoped virtual-payment, fulfillment, and refund facts. Ordinary tenant_addon_orders remains untouched.';
COMMENT ON COLUMN public.tenant_virtual_addon_orders.requested_platform
IS 'Untrusted client capability declaration retained only as an immutable diagnostic snapshot.';
COMMENT ON COLUMN public.tenant_virtual_addon_orders.settlement_channel
IS 'Nullable WeChat-confirmed settlement fact; clients cannot select this channel.';
COMMENT ON FUNCTION public.branding_create_virtual_addon_order(
  uuid, uuid, uuid, text, text, uuid
)
IS 'Atomically creates or reuses one branding virtual-payment order from locked server-owned product and mapping snapshots.';

COMMIT;
