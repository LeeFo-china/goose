-- Rollback: use a forward migration to archive platform_virtual_products,
-- disable platform_virtual_payment_channels, and revoke the command RPCs.
-- Preserve catalog, mapping, and operation facts for audit; do not delete
-- historical annual branding identities.

BEGIN;

CREATE TABLE public.platform_virtual_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  product_type text NOT NULL CHECK (product_type IN ('duration','count','points','quota')),
  amount_fen integer NOT NULL CHECK (amount_fen > 0),
  currency text NOT NULL DEFAULT 'CNY' CHECK (currency = 'CNY'),
  image_file_id uuid NULL REFERENCES public.platform_file_objects(id) ON DELETE RESTRICT,
  purchase_notes text NOT NULL DEFAULT '',
  refund_template text NOT NULL CHECK (refund_template IN ('duration_before_fulfillment','consumable_unused_full_reverse')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','suspended','archived')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by_employee_id uuid NOT NULL REFERENCES public.employees(id),
  updated_by_employee_id uuid NOT NULL REFERENCES public.employees(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_virtual_products_code_check CHECK (code ~ '^[a-z][a-z0-9_.-]{2,99}$'),
  CONSTRAINT platform_virtual_products_name_check CHECK (char_length(btrim(name)) BETWEEN 1 AND 100),
  CONSTRAINT platform_virtual_products_notes_check CHECK (char_length(purchase_notes) <= 500)
);

CREATE TRIGGER tr_platform_virtual_products_updated_at
BEFORE UPDATE ON public.platform_virtual_products
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.platform_virtual_product_grant_rules (
  product_id uuid PRIMARY KEY REFERENCES public.platform_virtual_products(id) ON DELETE RESTRICT,
  entitlement_code text NOT NULL,
  benefit_type text NOT NULL CHECK (benefit_type IN ('duration','count','points','quota')),
  grant_amount bigint NULL CHECK (grant_amount IS NULL OR grant_amount > 0),
  duration_value integer NULL CHECK (duration_value IS NULL OR duration_value > 0),
  duration_unit text NULL CHECK (duration_unit IS NULL OR duration_unit IN ('month','year')),
  expiry_mode text NOT NULL CHECK (expiry_mode IN ('permanent','fixed_duration')),
  expiry_value integer NULL CHECK (expiry_value IS NULL OR expiry_value > 0),
  expiry_unit text NULL CHECK (expiry_unit IS NULL OR expiry_unit IN ('month','year')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_virtual_product_grant_rules_entitlement_code_check CHECK (
    btrim(entitlement_code) <> ''
    AND char_length(entitlement_code) <= 100
  ),
  CONSTRAINT platform_virtual_product_grant_rules_shape_check CHECK (
    (benefit_type = 'duration' AND grant_amount IS NULL AND duration_value IS NOT NULL AND duration_unit IS NOT NULL AND expiry_mode = 'fixed_duration' AND expiry_value IS NULL AND expiry_unit IS NULL)
    OR
    (benefit_type IN ('count','points','quota') AND grant_amount IS NOT NULL AND duration_value IS NULL AND duration_unit IS NULL AND ((expiry_mode = 'permanent' AND expiry_value IS NULL AND expiry_unit IS NULL) OR (expiry_mode = 'fixed_duration' AND expiry_value IS NOT NULL AND expiry_unit IS NOT NULL)))
  )
);

CREATE TRIGGER tr_platform_virtual_product_grant_rules_updated_at
BEFORE UPDATE ON public.platform_virtual_product_grant_rules
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.platform_virtual_payment_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL CHECK (provider = 'wechat_virtual'),
  environment text NOT NULL CHECK (environment IN ('sandbox','production')),
  app_id text NOT NULL,
  virtual_merchant_id text NOT NULL,
  offer_id text NOT NULL,
  encrypted_secret_ref text NOT NULL,
  secret_revision integer NOT NULL CHECK (secret_revision > 0),
  message_auth_status text NOT NULL DEFAULT 'unchecked' CHECK (message_auth_status IN ('unchecked','valid','invalid')),
  status text NOT NULL DEFAULT 'disabled' CHECK (status IN ('active','disabled')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by_employee_id uuid NOT NULL REFERENCES public.employees(id),
  updated_by_employee_id uuid NOT NULL REFERENCES public.employees(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, environment),
  CONSTRAINT platform_virtual_payment_channels_app_id_check CHECK (btrim(app_id) <> '' AND char_length(app_id) <= 128),
  CONSTRAINT platform_virtual_payment_channels_merchant_id_check CHECK (btrim(virtual_merchant_id) <> '' AND char_length(virtual_merchant_id) <= 128),
  CONSTRAINT platform_virtual_payment_channels_offer_id_check CHECK (btrim(offer_id) <> '' AND char_length(offer_id) <= 128),
  CONSTRAINT platform_virtual_payment_channels_secret_ref_check CHECK (btrim(encrypted_secret_ref) <> '' AND char_length(encrypted_secret_ref) <= 500)
);

CREATE TRIGGER tr_platform_virtual_payment_channels_updated_at
BEFORE UPDATE ON public.platform_virtual_payment_channels
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.platform_virtual_product_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.platform_virtual_products(id) ON DELETE RESTRICT,
  channel_id uuid NOT NULL REFERENCES public.platform_virtual_payment_channels(id) ON DELETE RESTRICT,
  provider_product_id text NOT NULL,
  upload_state text NOT NULL DEFAULT 'not_started' CHECK (upload_state IN ('not_started','processing','succeeded','failed','unknown','out_of_sync')),
  publish_state text NOT NULL DEFAULT 'not_started' CHECK (publish_state IN ('not_started','processing','succeeded','failed','unknown','out_of_sync')),
  validation_status text NOT NULL DEFAULT 'pending' CHECK (validation_status IN ('pending','valid','invalid')),
  synced_product_version integer NULL CHECK (synced_product_version IS NULL OR synced_product_version > 0),
  remote_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(remote_snapshot) = 'object'),
  last_operation_id uuid NULL,
  last_request_id text NULL,
  last_error_code text NULL,
  last_error_summary text NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, channel_id),
  UNIQUE (channel_id, provider_product_id),
  CONSTRAINT platform_virtual_product_mappings_provider_product_id_check CHECK (provider_product_id ~ '^[A-Za-z0-9_-]{1,20}$')
);

CREATE TRIGGER tr_platform_virtual_product_mappings_updated_at
BEFORE UPDATE ON public.platform_virtual_product_mappings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.platform_virtual_goods_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid NOT NULL REFERENCES public.platform_virtual_payment_channels(id) ON DELETE RESTRICT,
  mapping_id uuid NOT NULL REFERENCES public.platform_virtual_product_mappings(id) ON DELETE RESTRICT,
  product_id uuid NOT NULL REFERENCES public.platform_virtual_products(id) ON DELETE RESTRICT,
  product_version integer NOT NULL CHECK (product_version > 0),
  phase text NOT NULL CHECK (phase IN ('upload','publish')),
  state text NOT NULL CHECK (state IN ('submitted','processing','succeeded','failed','unknown')),
  request_snapshot_hash text NOT NULL CHECK (request_snapshot_hash ~ '^[0-9a-f]{64}$'),
  request_id text NULL,
  normalized_result jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(normalized_result) = 'object'),
  failure_code text NULL,
  failure_summary text NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  last_queried_at timestamptz NULL,
  finished_at timestamptz NULL
);

ALTER TABLE public.platform_virtual_product_mappings
  ADD CONSTRAINT platform_virtual_product_mappings_last_operation_fkey
  FOREIGN KEY (last_operation_id) REFERENCES public.platform_virtual_goods_operations(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX platform_virtual_goods_operations_one_running_per_channel_idx
  ON public.platform_virtual_goods_operations(channel_id)
  WHERE state IN ('submitted', 'processing');
CREATE INDEX platform_virtual_products_list_idx ON public.platform_virtual_products(status, updated_at DESC, id DESC);
CREATE INDEX platform_virtual_product_mappings_product_idx ON public.platform_virtual_product_mappings(product_id, channel_id);
CREATE INDEX platform_virtual_goods_operations_mapping_started_idx ON public.platform_virtual_goods_operations(mapping_id, started_at DESC);

INSERT INTO public.platform_virtual_products (
  id,
  code,
  name,
  product_type,
  amount_fen,
  currency,
  purchase_notes,
  refund_template,
  status,
  version,
  created_by_employee_id,
  updated_by_employee_id,
  created_at,
  updated_at
)
SELECT
  product.id,
  product.code,
  product.name,
  'duration',
  product.amount_fen,
  'CNY',
  product.purchase_notes,
  'duration_before_fulfillment',
  CASE
    WHEN product.enabled AND product.purchase_mode = 'wechat_virtual' THEN 'active'
    WHEN product.purchase_mode = 'maintenance' THEN 'suspended'
    ELSE 'draft'
  END,
  product.version,
  COALESCE(product.updated_by_employee_id, actor.id),
  COALESCE(product.updated_by_employee_id, actor.id),
  product.created_at,
  product.updated_at
FROM public.platform_addon_products AS product
CROSS JOIN LATERAL (
  SELECT employees.id
  FROM public.employees
  ORDER BY employees.created_at ASC, employees.id ASC
  LIMIT 1
) AS actor
WHERE product.code = 'custom_support_branding_annual'
  AND product.amount_fen IS NOT NULL
ON CONFLICT (id) DO UPDATE SET
  code = EXCLUDED.code,
  name = EXCLUDED.name,
  product_type = EXCLUDED.product_type,
  amount_fen = EXCLUDED.amount_fen,
  currency = EXCLUDED.currency,
  purchase_notes = EXCLUDED.purchase_notes,
  refund_template = EXCLUDED.refund_template,
  status = EXCLUDED.status,
  version = EXCLUDED.version,
  updated_by_employee_id = EXCLUDED.updated_by_employee_id,
  updated_at = EXCLUDED.updated_at;

INSERT INTO public.platform_virtual_product_grant_rules (
  product_id,
  entitlement_code,
  benefit_type,
  grant_amount,
  duration_value,
  duration_unit,
  expiry_mode,
  version,
  created_at,
  updated_at
)
SELECT
  product.id,
  product.entitlement_code,
  'duration',
  NULL,
  product.term_years,
  'year',
  'fixed_duration',
  product.version,
  product.created_at,
  product.updated_at
FROM public.platform_addon_products AS product
WHERE product.code = 'custom_support_branding_annual'
  AND product.amount_fen IS NOT NULL
ON CONFLICT (product_id) DO UPDATE SET
  entitlement_code = EXCLUDED.entitlement_code,
  benefit_type = EXCLUDED.benefit_type,
  grant_amount = EXCLUDED.grant_amount,
  duration_value = EXCLUDED.duration_value,
  duration_unit = EXCLUDED.duration_unit,
  expiry_mode = EXCLUDED.expiry_mode,
  version = EXCLUDED.version,
  updated_at = EXCLUDED.updated_at;

INSERT INTO public.platform_virtual_payment_channels (
  provider,
  environment,
  app_id,
  virtual_merchant_id,
  offer_id,
  encrypted_secret_ref,
  secret_revision,
  message_auth_status,
  status,
  version,
  created_by_employee_id,
  updated_by_employee_id,
  created_at,
  updated_at
)
SELECT DISTINCT ON (mapping.environment)
  'wechat_virtual',
  mapping.environment,
  mapping.app_id,
  mapping.virtual_merchant_id,
  mapping.offer_id,
  mapping.encrypted_secret_ref,
  mapping.secret_revision,
  'unchecked',
  CASE WHEN mapping.status = 'active' THEN 'active' ELSE 'disabled' END,
  mapping.version,
  COALESCE(mapping.created_by, actor.id),
  COALESCE(mapping.updated_by, mapping.created_by, actor.id),
  mapping.created_at,
  mapping.updated_at
FROM public.platform_virtual_payment_products AS mapping
CROSS JOIN LATERAL (
  SELECT employees.id
  FROM public.employees
  ORDER BY employees.created_at ASC, employees.id ASC
  LIMIT 1
) AS actor
ORDER BY mapping.environment, mapping.updated_at DESC, mapping.id DESC
ON CONFLICT (provider, environment) DO UPDATE SET
  app_id = EXCLUDED.app_id,
  virtual_merchant_id = EXCLUDED.virtual_merchant_id,
  offer_id = EXCLUDED.offer_id,
  encrypted_secret_ref = EXCLUDED.encrypted_secret_ref,
  secret_revision = EXCLUDED.secret_revision,
  status = EXCLUDED.status,
  version = EXCLUDED.version,
  updated_by_employee_id = EXCLUDED.updated_by_employee_id,
  updated_at = EXCLUDED.updated_at;

INSERT INTO public.platform_virtual_product_mappings (
  product_id,
  channel_id,
  provider_product_id,
  upload_state,
  publish_state,
  validation_status,
  synced_product_version,
  remote_snapshot,
  version,
  created_at,
  updated_at
)
SELECT
  product.id,
  channel.id,
  mapping.provider_product_id,
  CASE WHEN mapping.validation_status = 'valid' THEN 'succeeded' ELSE 'not_started' END,
  CASE WHEN mapping.validation_status = 'valid' THEN 'succeeded' ELSE 'not_started' END,
  mapping.validation_status,
  CASE WHEN mapping.validation_status = 'valid' THEN product.version ELSE NULL END,
  jsonb_build_object(
    'legacy_mapping_id', mapping.id,
    'validated_at', mapping.validated_at,
    'item_url', mapping.item_url
  ),
  mapping.version,
  mapping.created_at,
  mapping.updated_at
FROM public.platform_virtual_payment_products AS mapping
JOIN public.platform_addon_products AS product
  ON product.id = mapping.addon_product_id
JOIN public.platform_virtual_payment_channels AS channel
  ON channel.provider = 'wechat_virtual'
 AND channel.environment = mapping.environment
WHERE product.code = 'custom_support_branding_annual'
  AND mapping.provider_product_id ~ '^[A-Za-z0-9_-]{1,20}$'
ON CONFLICT (product_id, channel_id) DO UPDATE SET
  provider_product_id = EXCLUDED.provider_product_id,
  upload_state = EXCLUDED.upload_state,
  publish_state = EXCLUDED.publish_state,
  validation_status = EXCLUDED.validation_status,
  synced_product_version = EXCLUDED.synced_product_version,
  remote_snapshot = EXCLUDED.remote_snapshot,
  version = EXCLUDED.version,
  updated_at = EXCLUDED.updated_at;

CREATE OR REPLACE FUNCTION public.platform_virtual_provider_product_id()
RETURNS text
LANGUAGE sql
SET search_path = public, pg_temp
AS $$
  SELECT 'vp_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 16);
$$;

REVOKE ALL
ON FUNCTION public.platform_virtual_provider_product_id()
FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.platform_create_virtual_product(
  p_product jsonb,
  p_grant_rule jsonb,
  p_actor_employee_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_product public.platform_virtual_products%ROWTYPE;
  v_key text;
  v_provider_product_id text;
BEGIN
  IF p_actor_employee_id IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'VIRTUAL_PRODUCT_ACTOR_REQUIRED';
  END IF;
  IF p_product IS NULL OR jsonb_typeof(p_product) <> 'object'
     OR p_grant_rule IS NULL OR jsonb_typeof(p_grant_rule) <> 'object'
  THEN
    RAISE EXCEPTION USING MESSAGE = 'VIRTUAL_PRODUCT_PAYLOAD_INVALID';
  END IF;
  IF (p_product->>'product_type') IS DISTINCT FROM (p_grant_rule->>'benefit_type') THEN
    RAISE EXCEPTION USING MESSAGE = 'VIRTUAL_PRODUCT_GRANT_TYPE_MISMATCH';
  END IF;

  v_key := lower(regexp_replace(COALESCE(NULLIF(p_product->>'name', ''), gen_random_uuid()::text), '[^a-zA-Z0-9]+', '_', 'g'));
  v_key := trim(both '_' from v_key);
  IF char_length(v_key) < 3 OR v_key !~ '^[a-z]' THEN
    v_key := 'vp_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 16);
  ELSE
    v_key := substr(v_key, 1, 70) || '_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
  END IF;

  INSERT INTO public.platform_virtual_products (
    code,
    name,
    product_type,
    amount_fen,
    image_file_id,
    purchase_notes,
    refund_template,
    created_by_employee_id,
    updated_by_employee_id
  )
  VALUES (
    v_key,
    p_product->>'name',
    p_product->>'product_type',
    (p_product->>'amount_fen')::integer,
    NULLIF(p_product->>'image_file_id', '')::uuid,
    COALESCE(p_product->>'purchase_notes', ''),
    p_product->>'refund_template',
    p_actor_employee_id,
    p_actor_employee_id
  )
  RETURNING * INTO v_product;

  INSERT INTO public.platform_virtual_product_grant_rules (
    product_id,
    entitlement_code,
    benefit_type,
    grant_amount,
    duration_value,
    duration_unit,
    expiry_mode,
    expiry_value,
    expiry_unit
  )
  VALUES (
    v_product.id,
    p_grant_rule->>'entitlement_code',
    p_grant_rule->>'benefit_type',
    NULLIF(p_grant_rule->>'grant_amount', '')::bigint,
    NULLIF(p_grant_rule->>'duration_value', '')::integer,
    NULLIF(p_grant_rule->>'duration_unit', ''),
    p_grant_rule->>'expiry_mode',
    NULLIF(p_grant_rule->>'expiry_value', '')::integer,
    NULLIF(p_grant_rule->>'expiry_unit', '')
  );

  v_provider_product_id := public.platform_virtual_provider_product_id();

  INSERT INTO public.platform_virtual_product_mappings (
    product_id,
    channel_id,
    provider_product_id
  )
  SELECT v_product.id, channel.id, v_provider_product_id
  FROM public.platform_virtual_payment_channels AS channel;

  RETURN jsonb_build_object(
    'product', to_jsonb(v_product),
    'provider_product_id', v_provider_product_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_update_virtual_product(
  p_product_id uuid,
  p_expected_version integer,
  p_product_patch jsonb,
  p_grant_rule_patch jsonb,
  p_actor_employee_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_product public.platform_virtual_products%ROWTYPE;
BEGIN
  IF p_product_id IS NULL OR p_expected_version IS NULL OR p_expected_version <= 0
     OR p_actor_employee_id IS NULL
  THEN
    RAISE EXCEPTION USING MESSAGE = 'VIRTUAL_PRODUCT_PATCH_INVALID';
  END IF;

  SELECT *
  INTO v_product
  FROM public.platform_virtual_products
  WHERE id = p_product_id
  FOR UPDATE;

  IF v_product.id IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'VIRTUAL_PRODUCT_NOT_FOUND';
  END IF;
  IF v_product.version IS DISTINCT FROM p_expected_version THEN
    RAISE EXCEPTION USING MESSAGE = 'VIRTUAL_PRODUCT_VERSION_CONFLICT';
  END IF;
  IF v_product.status = 'archived' THEN
    RAISE EXCEPTION USING MESSAGE = 'VIRTUAL_PRODUCT_ALREADY_ARCHIVED';
  END IF;
  IF p_product_patch ? 'code' OR p_product_patch ? 'provider_product_id' THEN
    RAISE EXCEPTION USING MESSAGE = 'VIRTUAL_PRODUCT_CHANNEL_ID_IMMUTABLE';
  END IF;

  UPDATE public.platform_virtual_products
  SET
    name = COALESCE(NULLIF(p_product_patch->>'name', ''), name),
    amount_fen = COALESCE(NULLIF(p_product_patch->>'amount_fen', '')::integer, amount_fen),
    image_file_id = COALESCE(NULLIF(p_product_patch->>'image_file_id', '')::uuid, image_file_id),
    purchase_notes = COALESCE(p_product_patch->>'purchase_notes', purchase_notes),
    refund_template = COALESCE(p_product_patch->>'refund_template', refund_template),
    version = version + 1,
    updated_by_employee_id = p_actor_employee_id
  WHERE id = p_product_id
  RETURNING * INTO v_product;

  UPDATE public.platform_virtual_product_mappings
  SET upload_state = 'out_of_sync',
      publish_state = 'out_of_sync',
      validation_status = 'pending',
      synced_product_version = NULL,
      version = version + 1
  WHERE product_id = p_product_id
    AND synced_product_version IS DISTINCT FROM v_product.version;

  RETURN jsonb_build_object('product', to_jsonb(v_product));
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_transition_virtual_product(
  p_product_id uuid,
  p_expected_version integer,
  p_target_status text,
  p_actor_employee_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_product public.platform_virtual_products%ROWTYPE;
BEGIN
  IF p_product_id IS NULL OR p_expected_version IS NULL OR p_expected_version <= 0
     OR p_actor_employee_id IS NULL
     OR p_target_status NOT IN ('active','suspended','archived')
  THEN
    RAISE EXCEPTION USING MESSAGE = 'VIRTUAL_PRODUCT_TRANSITION_INVALID';
  END IF;

  SELECT *
  INTO v_product
  FROM public.platform_virtual_products
  WHERE id = p_product_id
  FOR UPDATE;

  IF v_product.id IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'VIRTUAL_PRODUCT_NOT_FOUND';
  END IF;
  IF v_product.version IS DISTINCT FROM p_expected_version THEN
    RAISE EXCEPTION USING MESSAGE = 'VIRTUAL_PRODUCT_VERSION_CONFLICT';
  END IF;
  IF v_product.status = 'archived' THEN
    RAISE EXCEPTION USING MESSAGE = 'VIRTUAL_PRODUCT_ALREADY_ARCHIVED';
  END IF;

  UPDATE public.platform_virtual_products
  SET status = p_target_status,
      version = version + 1,
      updated_by_employee_id = p_actor_employee_id
  WHERE id = p_product_id
  RETURNING * INTO v_product;

  RETURN jsonb_build_object('product', to_jsonb(v_product));
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_begin_virtual_goods_operation(
  p_mapping_id uuid,
  p_product_version integer,
  p_phase text,
  p_request_snapshot_hash text
)
RETURNS public.platform_virtual_goods_operations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_mapping public.platform_virtual_product_mappings%ROWTYPE;
  v_running public.platform_virtual_goods_operations%ROWTYPE;
  v_operation public.platform_virtual_goods_operations%ROWTYPE;
BEGIN
  IF p_mapping_id IS NULL OR p_product_version IS NULL OR p_product_version <= 0
     OR p_phase NOT IN ('upload','publish')
     OR p_request_snapshot_hash !~ '^[0-9a-f]{64}$'
  THEN
    RAISE EXCEPTION USING MESSAGE = 'VIRTUAL_PRODUCT_OPERATION_INVALID';
  END IF;

  SELECT *
  INTO v_mapping
  FROM public.platform_virtual_product_mappings
  WHERE id = p_mapping_id
  FOR UPDATE;

  IF v_mapping.id IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'VIRTUAL_PRODUCT_MAPPING_NOT_FOUND';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('platform_virtual_goods:' || v_mapping.channel_id::text, 20260803)
  );

  SELECT *
  INTO v_running
  FROM public.platform_virtual_goods_operations
  WHERE channel_id = v_mapping.channel_id
    AND state IN ('submitted', 'processing')
  LIMIT 1
  FOR UPDATE;

  IF v_running.id IS NOT NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'VIRTUAL_PRODUCT_CHANNEL_TASK_PENDING';
  END IF;
  IF v_mapping.provider_product_id !~ '^[A-Za-z0-9_-]{1,20}$' THEN
    RAISE EXCEPTION USING MESSAGE = 'VIRTUAL_PRODUCT_CHANNEL_ID_IMMUTABLE';
  END IF;

  INSERT INTO public.platform_virtual_goods_operations (
    channel_id,
    mapping_id,
    product_id,
    product_version,
    phase,
    state,
    request_snapshot_hash
  )
  VALUES (
    v_mapping.channel_id,
    v_mapping.id,
    v_mapping.product_id,
    p_product_version,
    p_phase,
    'submitted',
    p_request_snapshot_hash
  )
  RETURNING * INTO v_operation;

  UPDATE public.platform_virtual_product_mappings
  SET last_operation_id = v_operation.id,
      upload_state = CASE WHEN p_phase = 'upload' THEN 'processing' ELSE upload_state END,
      publish_state = CASE WHEN p_phase = 'publish' THEN 'processing' ELSE publish_state END,
      version = version + 1
  WHERE id = v_mapping.id;

  RETURN v_operation;
END;
$$;

CREATE OR REPLACE FUNCTION public.platform_finish_virtual_goods_operation(
  p_operation_id uuid,
  p_state text,
  p_request_id text,
  p_normalized_result jsonb,
  p_failure_code text,
  p_failure_summary text,
  p_synced_product_version integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_operation public.platform_virtual_goods_operations%ROWTYPE;
BEGIN
  IF p_operation_id IS NULL
     OR p_state NOT IN ('processing','succeeded','failed','unknown')
     OR (p_normalized_result IS NOT NULL AND jsonb_typeof(p_normalized_result) <> 'object')
  THEN
    RAISE EXCEPTION USING MESSAGE = 'VIRTUAL_PRODUCT_OPERATION_INVALID';
  END IF;

  SELECT *
  INTO v_operation
  FROM public.platform_virtual_goods_operations
  WHERE id = p_operation_id
  FOR UPDATE;

  IF v_operation.id IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'VIRTUAL_PRODUCT_OPERATION_NOT_FOUND';
  END IF;

  UPDATE public.platform_virtual_goods_operations
  SET state = p_state,
      request_id = COALESCE(p_request_id, request_id),
      normalized_result = COALESCE(p_normalized_result, normalized_result),
      failure_code = p_failure_code,
      failure_summary = p_failure_summary,
      last_queried_at = now(),
      finished_at = CASE WHEN p_state IN ('succeeded','failed','unknown') THEN now() ELSE finished_at END
  WHERE id = p_operation_id
  RETURNING * INTO v_operation;

  UPDATE public.platform_virtual_product_mappings
  SET upload_state = CASE
        WHEN v_operation.phase = 'upload' THEN
          CASE WHEN p_state = 'succeeded' THEN 'succeeded' WHEN p_state = 'processing' THEN 'processing' ELSE p_state END
        ELSE upload_state
      END,
      publish_state = CASE
        WHEN v_operation.phase = 'publish' THEN
          CASE WHEN p_state = 'succeeded' THEN 'succeeded' WHEN p_state = 'processing' THEN 'processing' ELSE p_state END
        ELSE publish_state
      END,
      validation_status = CASE
        WHEN p_state = 'succeeded' AND v_operation.phase = 'publish' THEN 'valid'
        WHEN p_state IN ('failed','unknown') THEN 'invalid'
        ELSE validation_status
      END,
      synced_product_version = CASE
        WHEN p_state = 'succeeded' THEN COALESCE(p_synced_product_version, v_operation.product_version)
        WHEN p_state IN ('failed','unknown') THEN NULL
        ELSE synced_product_version
      END,
      remote_snapshot = COALESCE(p_normalized_result, remote_snapshot),
      last_request_id = COALESCE(p_request_id, last_request_id),
      last_error_code = p_failure_code,
      last_error_summary = p_failure_summary,
      version = version + 1
  WHERE id = v_operation.mapping_id;

  RETURN jsonb_build_object('operation', to_jsonb(v_operation));
END;
$$;

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
  ('platform.virtual_product.read', '查看虚拟商品', 'platform_virtual_product', 'virtual_product', 'read', '查看平台虚拟商品目录、渠道映射和微信状态', 'active'),
  ('platform.virtual_product.manage', '管理虚拟商品', 'platform_virtual_product', 'virtual_product', 'manage', '创建、编辑和调整平台虚拟商品销售状态', 'active'),
  ('platform.virtual_product.publish', '发布虚拟商品', 'platform_virtual_product', 'virtual_product', 'publish', '上传、发布和校验微信虚拟商品', 'active'),
  ('platform.virtual_order.read', '查看虚拟商品订单', 'platform_virtual_order', 'virtual_order', 'read', '查看租户虚拟商品订单和支付审计', 'active'),
  ('platform.virtual_refund.manage', '管理虚拟商品退款', 'platform_virtual_refund', 'virtual_refund', 'manage', '处理虚拟商品退款和异常冲正', 'active'),
  ('virtual_product.purchase', '购买虚拟商品', 'virtual_product', 'virtual_product', 'purchase', '为当前租户购买平台虚拟商品权益', 'active')
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
    'platform.virtual_product.read',
    'platform.virtual_product.manage',
    'platform.virtual_product.publish',
    'platform.virtual_order.read',
    'platform.virtual_refund.manage'
  )
WHERE roles.code = 'platform_admin'
  AND roles.tenant_id IS NULL
ON CONFLICT (role_id, permission_id) DO UPDATE SET
  access_scope = EXCLUDED.access_scope;

INSERT INTO public.role_permissions (role_id, permission_id, access_scope)
SELECT roles.id, permissions.id, 'all'
FROM public.roles AS roles
JOIN public.permissions AS permissions
  ON permissions.code = 'virtual_product.purchase'
WHERE roles.code = 'system_admin'
  AND roles.tenant_id IS NOT NULL
ON CONFLICT (role_id, permission_id) DO UPDATE SET
  access_scope = EXCLUDED.access_scope;

ALTER TABLE public.platform_virtual_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_virtual_product_grant_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_virtual_payment_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_virtual_product_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_virtual_goods_operations ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.platform_virtual_products FORCE ROW LEVEL SECURITY;
ALTER TABLE public.platform_virtual_product_grant_rules FORCE ROW LEVEL SECURITY;
ALTER TABLE public.platform_virtual_payment_channels FORCE ROW LEVEL SECURITY;
ALTER TABLE public.platform_virtual_product_mappings FORCE ROW LEVEL SECURITY;
ALTER TABLE public.platform_virtual_goods_operations FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.platform_virtual_products FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.platform_virtual_product_grant_rules FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.platform_virtual_payment_channels FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.platform_virtual_product_mappings FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.platform_virtual_goods_operations FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE ON TABLE public.platform_virtual_products TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.platform_virtual_product_grant_rules TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.platform_virtual_payment_channels TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.platform_virtual_product_mappings TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.platform_virtual_goods_operations TO service_role;

REVOKE ALL ON FUNCTION public.platform_create_virtual_product(jsonb, jsonb, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.platform_update_virtual_product(uuid, integer, jsonb, jsonb, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.platform_transition_virtual_product(uuid, integer, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.platform_begin_virtual_goods_operation(uuid, integer, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.platform_finish_virtual_goods_operation(uuid, text, text, jsonb, text, text, integer) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.platform_create_virtual_product(jsonb, jsonb, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.platform_update_virtual_product(uuid, integer, jsonb, jsonb, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.platform_transition_virtual_product(uuid, integer, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.platform_begin_virtual_goods_operation(uuid, integer, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.platform_finish_virtual_goods_operation(uuid, text, text, jsonb, text, text, integer) TO service_role;

COMMENT ON TABLE public.platform_virtual_products IS '平台通用虚拟商品事实。';
COMMENT ON TABLE public.platform_virtual_product_grant_rules IS '虚拟商品自动发放规则，一件商品一条规则。';
COMMENT ON TABLE public.platform_virtual_payment_channels IS '微信虚拟支付环境级渠道配置。';
COMMENT ON TABLE public.platform_virtual_product_mappings IS '本地虚拟商品到微信渠道商品的映射。';
COMMENT ON TABLE public.platform_virtual_goods_operations IS '微信虚拟商品上传和发布操作证据。';

COMMIT;
