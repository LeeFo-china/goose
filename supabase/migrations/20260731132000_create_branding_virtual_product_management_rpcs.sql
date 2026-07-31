-- Rollback: first move the branding add-on product back to maintenance, then
-- revoke both management RPCs. Drop the validation lifecycle trigger and its
-- function only after all writers have stopped relying on database-enforced
-- revalidation. This forward migration does not remove commerce history.

BEGIN;

CREATE OR REPLACE FUNCTION public.guard_branding_virtual_product_validation_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sensitive_changed boolean := false;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    v_sensitive_changed :=
      OLD.app_id IS DISTINCT FROM NEW.app_id
      OR OLD.virtual_merchant_id IS DISTINCT FROM NEW.virtual_merchant_id
      OR OLD.offer_id IS DISTINCT FROM NEW.offer_id
      OR OLD.provider_product_id IS DISTINCT FROM NEW.provider_product_id
      OR OLD.expected_amount_fen IS DISTINCT FROM NEW.expected_amount_fen
      OR OLD.encrypted_secret_ref IS DISTINCT FROM NEW.encrypted_secret_ref
      OR OLD.secret_revision IS DISTINCT FROM NEW.secret_revision;

    IF v_sensitive_changed THEN
      NEW.validation_status := 'pending';
      NEW.validated_at := NULL;
      IF NEW.status = 'active' THEN
        RAISE EXCEPTION USING
          ERRCODE = 'P0001',
          MESSAGE = 'BRANDING_VIRTUAL_PRODUCT_REVALIDATION_REQUIRED';
      END IF;
    END IF;
  END IF;

  IF NEW.status = 'active' AND NEW.validation_status <> 'valid' THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'BRANDING_VIRTUAL_PRODUCT_INVALID';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL
ON FUNCTION public.guard_branding_virtual_product_validation_lifecycle()
FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER tr_platform_virtual_payment_products_validation_lifecycle
BEFORE INSERT OR UPDATE ON public.platform_virtual_payment_products
FOR EACH ROW
EXECUTE FUNCTION public.guard_branding_virtual_product_validation_lifecycle();

CREATE OR REPLACE FUNCTION public.branding_get_virtual_product_management_snapshot()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_product jsonb;
  v_product_id uuid;
  v_mappings jsonb;
BEGIN
  PERFORM pg_advisory_xact_lock(
    hashtextextended('branding_virtual_payment_config', 20260801)
  );

  SELECT product.id,
         jsonb_build_object(
           'id', product.id,
           'code', product.code,
           'entitlement_code', product.entitlement_code,
           'name', product.name,
           'amount_fen', product.amount_fen,
           'term_years', product.term_years,
           'purchase_notes', product.purchase_notes,
           'refund_policy', product.refund_policy,
           'enabled', product.enabled,
           'purchase_mode', product.purchase_mode,
           'version', product.version,
           'updated_by_employee_id', product.updated_by_employee_id,
           'created_at', product.created_at,
           'updated_at', product.updated_at
         )
  INTO v_product_id, v_product
  FROM public.platform_addon_products AS product
  WHERE product.code = 'custom_support_branding_annual';

  IF v_product IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'BRANDING_ADDON_PRODUCT_NOT_FOUND';
  END IF;

  SELECT COALESCE(
    jsonb_agg(bounded.payload ORDER BY bounded.environment),
    '[]'::jsonb
  ) INTO v_mappings
  FROM (
    SELECT mapping.environment,
           jsonb_build_object(
             'id', mapping.id,
             'addon_product_id', mapping.addon_product_id,
             'provider', mapping.provider,
             'environment', mapping.environment,
             'app_id', mapping.app_id,
             'virtual_merchant_id', mapping.virtual_merchant_id,
             'offer_id', mapping.offer_id,
             'provider_product_id', mapping.provider_product_id,
             'goods_quantity', mapping.goods_quantity,
             'expected_amount_fen', mapping.expected_amount_fen,
             'encrypted_secret_ref', mapping.encrypted_secret_ref,
             'secret_revision', mapping.secret_revision,
             'status', mapping.status,
             'validation_status', mapping.validation_status,
             'validated_at', mapping.validated_at,
             'version', mapping.version,
             'created_by', mapping.created_by,
             'updated_by', mapping.updated_by,
             'created_at', mapping.created_at,
             'updated_at', mapping.updated_at
           ) AS payload
    FROM public.platform_virtual_payment_products AS mapping
    WHERE mapping.addon_product_id = v_product_id
    ORDER BY mapping.environment
    LIMIT 2
  ) AS bounded;

  RETURN jsonb_build_object('product', v_product, 'mappings', v_mappings);
END;
$$;

CREATE OR REPLACE FUNCTION public.branding_manage_virtual_product_configuration(
  p_expected_product_version integer,
  p_product_patch jsonb,
  p_virtual_product_patch jsonb,
  p_actor_employee_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_product public.platform_addon_products%ROWTYPE;
  v_mapping public.platform_virtual_payment_products%ROWTYPE;
  v_production public.platform_virtual_payment_products%ROWTYPE;
  v_environment text;
  v_mapping_exists boolean := false;
  v_expected_mapping_version integer;
  v_final_mode text;
  v_final_amount integer;
  v_mapping_status text;
  v_mapping_validation text;
  v_mapping_amount integer;
  v_mapping_secret_ref text;
  v_sensitive_changed boolean := false;
BEGIN
  IF p_expected_product_version IS NULL OR p_expected_product_version <= 0 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'BRANDING_VIRTUAL_PRODUCT_PATCH_INVALID';
  END IF;
  IF p_actor_employee_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'BRANDING_ADDON_ACTOR_REQUIRED';
  END IF;
  IF p_product_patch IS NULL OR jsonb_typeof(p_product_patch) <> 'object'
     OR p_virtual_product_patch IS NULL
     OR jsonb_typeof(p_virtual_product_patch) <> 'object'
  THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'BRANDING_VIRTUAL_PRODUCT_PATCH_INVALID';
  END IF;
  IF p_product_patch = '{}'::jsonb
     AND p_virtual_product_patch = '{}'::jsonb
  THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'BRANDING_VIRTUAL_PRODUCT_PATCH_INVALID';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_object_keys(p_product_patch) AS item(key)
    WHERE key NOT IN ('name', 'amount_fen', 'purchase_notes', 'enabled', 'purchase_mode')
  ) OR EXISTS (
    SELECT 1 FROM jsonb_object_keys(p_virtual_product_patch) AS item(key)
    WHERE key NOT IN (
      'environment', 'app_id', 'virtual_merchant_id', 'offer_id',
      'provider_product_id', 'expected_amount_fen', 'encrypted_secret_ref',
      'secret_revision', 'status', 'version'
    )
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'BRANDING_VIRTUAL_PRODUCT_PATCH_INVALID';
  END IF;

  IF (p_product_patch ? 'name' AND (
        jsonb_typeof(p_product_patch->'name') <> 'string'
        OR btrim(p_product_patch->>'name') = ''
        OR char_length(p_product_patch->>'name') > 100
      ))
     OR (p_product_patch ? 'amount_fen' AND
        jsonb_typeof(p_product_patch->'amount_fen') <> 'number')
     OR (p_product_patch ? 'purchase_notes' AND (
        jsonb_typeof(p_product_patch->'purchase_notes') <> 'string'
        OR btrim(p_product_patch->>'purchase_notes') = ''
        OR char_length(p_product_patch->>'purchase_notes') > 500
      ))
     OR (p_product_patch ? 'enabled' AND
        jsonb_typeof(p_product_patch->'enabled') <> 'boolean')
     OR (p_product_patch ? 'purchase_mode' AND
        jsonb_typeof(p_product_patch->'purchase_mode') <> 'string')
  THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'BRANDING_VIRTUAL_PRODUCT_PATCH_INVALID';
  END IF;
  IF p_product_patch ? 'amount_fen' AND (
       (p_product_patch->>'amount_fen')::numeric <> trunc((p_product_patch->>'amount_fen')::numeric)
       OR (p_product_patch->>'amount_fen')::numeric <= 0
       OR (p_product_patch->>'amount_fen')::numeric > 2147483647
     )
  THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'BRANDING_VIRTUAL_PRODUCT_PATCH_INVALID';
  END IF;
  IF p_product_patch ? 'purchase_mode'
     AND p_product_patch->>'purchase_mode' NOT IN ('direct_legacy', 'maintenance', 'wechat_virtual')
  THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'BRANDING_VIRTUAL_PRODUCT_PATCH_INVALID';
  END IF;

  IF p_virtual_product_patch <> '{}'::jsonb AND (
    NOT (p_virtual_product_patch ?& ARRAY[
      'environment', 'app_id', 'virtual_merchant_id', 'offer_id',
      'provider_product_id', 'expected_amount_fen', 'encrypted_secret_ref',
      'secret_revision', 'status', 'version'
    ])
    OR jsonb_typeof(p_virtual_product_patch->'environment') <> 'string'
    OR jsonb_typeof(p_virtual_product_patch->'app_id') <> 'string'
    OR jsonb_typeof(p_virtual_product_patch->'virtual_merchant_id') <> 'string'
    OR jsonb_typeof(p_virtual_product_patch->'offer_id') <> 'string'
    OR jsonb_typeof(p_virtual_product_patch->'provider_product_id') <> 'string'
    OR jsonb_typeof(p_virtual_product_patch->'expected_amount_fen') <> 'number'
    OR jsonb_typeof(p_virtual_product_patch->'encrypted_secret_ref') <> 'string'
    OR jsonb_typeof(p_virtual_product_patch->'secret_revision') <> 'number'
    OR jsonb_typeof(p_virtual_product_patch->'status') <> 'string'
    OR jsonb_typeof(p_virtual_product_patch->'version') <> 'number'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'BRANDING_VIRTUAL_PRODUCT_PATCH_INVALID';
  END IF;
  IF p_virtual_product_patch <> '{}'::jsonb AND (
    btrim(p_virtual_product_patch->>'app_id') = ''
    OR char_length(p_virtual_product_patch->>'app_id') > 64
    OR btrim(p_virtual_product_patch->>'virtual_merchant_id') = ''
    OR char_length(p_virtual_product_patch->>'virtual_merchant_id') > 64
    OR btrim(p_virtual_product_patch->>'offer_id') = ''
    OR char_length(p_virtual_product_patch->>'offer_id') > 128
    OR btrim(p_virtual_product_patch->>'provider_product_id') = ''
    OR char_length(p_virtual_product_patch->>'provider_product_id') > 128
    OR p_virtual_product_patch->>'environment' NOT IN ('sandbox', 'production')
    OR p_virtual_product_patch->>'status' NOT IN ('draft', 'active', 'disabled')
    OR (p_virtual_product_patch->>'expected_amount_fen')::numeric
      <> trunc((p_virtual_product_patch->>'expected_amount_fen')::numeric)
    OR (p_virtual_product_patch->>'expected_amount_fen')::numeric <= 0
    OR (p_virtual_product_patch->>'expected_amount_fen')::numeric > 2147483647
    OR (p_virtual_product_patch->>'secret_revision')::numeric
      <> trunc((p_virtual_product_patch->>'secret_revision')::numeric)
    OR (p_virtual_product_patch->>'secret_revision')::numeric <= 0
    OR (p_virtual_product_patch->>'secret_revision')::numeric > 2147483647
    OR (p_virtual_product_patch->>'version')::numeric
      <> trunc((p_virtual_product_patch->>'version')::numeric)
    OR (p_virtual_product_patch->>'version')::numeric <= 0
    OR (p_virtual_product_patch->>'version')::numeric > 2147483647
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'BRANDING_VIRTUAL_PRODUCT_PATCH_INVALID';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('branding_virtual_payment_config', 20260801)
  );

  SELECT * INTO v_product
  FROM public.platform_addon_products
  WHERE code = 'custom_support_branding_annual'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'BRANDING_ADDON_PRODUCT_NOT_FOUND';
  END IF;
  IF v_product.version IS DISTINCT FROM p_expected_product_version THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'BRANDING_ADDON_PRODUCT_VERSION_CONFLICT';
  END IF;

  v_final_mode := COALESCE(p_product_patch->>'purchase_mode', v_product.purchase_mode);
  v_final_amount := COALESCE((p_product_patch->>'amount_fen')::integer, v_product.amount_fen);

  IF v_final_mode <> v_product.purchase_mode AND NOT (
    (v_product.purchase_mode = 'direct_legacy' AND v_final_mode = 'maintenance')
    OR (v_product.purchase_mode = 'maintenance' AND v_final_mode = 'wechat_virtual')
    OR (v_product.purchase_mode = 'wechat_virtual' AND v_final_mode = 'maintenance')
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'BRANDING_ADDON_PURCHASE_MODE_TRANSITION_INVALID';
  END IF;

  IF p_virtual_product_patch <> '{}'::jsonb THEN
    v_environment := p_virtual_product_patch->>'environment';
    v_expected_mapping_version := (p_virtual_product_patch->>'version')::integer;
    IF v_environment NOT IN ('sandbox', 'production')
       OR v_expected_mapping_version IS NULL
    THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'BRANDING_VIRTUAL_PRODUCT_PATCH_INVALID';
    END IF;

    SELECT * INTO v_mapping
    FROM public.platform_virtual_payment_products
    WHERE addon_product_id = v_product.id
      AND environment = v_environment
    FOR UPDATE;
    v_mapping_exists := FOUND;

    IF v_mapping_exists
       AND v_mapping.version IS DISTINCT FROM v_expected_mapping_version
    THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'BRANDING_VIRTUAL_PRODUCT_VERSION_CONFLICT';
    END IF;
    IF NOT v_mapping_exists AND v_expected_mapping_version IS DISTINCT FROM 1 THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'BRANDING_VIRTUAL_PRODUCT_VERSION_CONFLICT';
    END IF;

    IF v_environment = 'production'
       AND (p_virtual_product_patch->>'expected_amount_fen')::integer < 100
    THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'BRANDING_VIRTUAL_PRODUCT_AMOUNT_TOO_LOW';
    END IF;
    IF p_virtual_product_patch->>'encrypted_secret_ref' <> CASE
      WHEN v_environment = 'production'
        THEN 'WECHAT_VIRTUAL_PAYMENT_PRODUCTION_SECRET_BUNDLE'
      ELSE 'WECHAT_VIRTUAL_PAYMENT_SANDBOX_SECRET_BUNDLE'
    END THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'BRANDING_VIRTUAL_PRODUCT_SECRET_ENVIRONMENT_MISMATCH';
    END IF;

    IF v_mapping_exists THEN
      v_sensitive_changed :=
        v_mapping.app_id IS DISTINCT FROM p_virtual_product_patch->>'app_id'
        OR v_mapping.virtual_merchant_id IS DISTINCT FROM p_virtual_product_patch->>'virtual_merchant_id'
        OR v_mapping.offer_id IS DISTINCT FROM p_virtual_product_patch->>'offer_id'
        OR v_mapping.provider_product_id IS DISTINCT FROM p_virtual_product_patch->>'provider_product_id'
        OR v_mapping.expected_amount_fen IS DISTINCT FROM (p_virtual_product_patch->>'expected_amount_fen')::integer
        OR v_mapping.encrypted_secret_ref IS DISTINCT FROM p_virtual_product_patch->>'encrypted_secret_ref'
        OR v_mapping.secret_revision IS DISTINCT FROM (p_virtual_product_patch->>'secret_revision')::integer;
      IF v_sensitive_changed AND p_virtual_product_patch->>'status' = 'active' THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'BRANDING_VIRTUAL_PRODUCT_REVALIDATION_REQUIRED';
      END IF;
      IF NOT v_sensitive_changed
         AND p_virtual_product_patch->>'status' = 'active'
         AND v_mapping.validation_status <> 'valid'
      THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'BRANDING_VIRTUAL_PRODUCT_INVALID';
      END IF;

      UPDATE public.platform_virtual_payment_products
      SET app_id = p_virtual_product_patch->>'app_id',
          virtual_merchant_id = p_virtual_product_patch->>'virtual_merchant_id',
          offer_id = p_virtual_product_patch->>'offer_id',
          provider_product_id = p_virtual_product_patch->>'provider_product_id',
          expected_amount_fen = (p_virtual_product_patch->>'expected_amount_fen')::integer,
          encrypted_secret_ref = p_virtual_product_patch->>'encrypted_secret_ref',
          secret_revision = (p_virtual_product_patch->>'secret_revision')::integer,
          status = p_virtual_product_patch->>'status',
          validation_status = CASE WHEN v_sensitive_changed THEN 'pending' ELSE validation_status END,
          validated_at = CASE WHEN v_sensitive_changed THEN NULL ELSE validated_at END,
          version = version + 1,
          updated_by = p_actor_employee_id
      WHERE id = v_mapping.id
      RETURNING * INTO v_mapping;
    ELSE
      IF p_virtual_product_patch->>'status' = 'active' THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'BRANDING_VIRTUAL_PRODUCT_REVALIDATION_REQUIRED';
      END IF;
      INSERT INTO public.platform_virtual_payment_products (
        addon_product_id, provider, environment, app_id, virtual_merchant_id,
        offer_id, provider_product_id, goods_quantity, expected_amount_fen,
        encrypted_secret_ref, secret_revision, status, validation_status,
        validated_at, version, created_by, updated_by
      ) VALUES (
        v_product.id, 'wechat_virtual', v_environment,
        p_virtual_product_patch->>'app_id',
        p_virtual_product_patch->>'virtual_merchant_id',
        p_virtual_product_patch->>'offer_id',
        p_virtual_product_patch->>'provider_product_id', 1,
        (p_virtual_product_patch->>'expected_amount_fen')::integer,
        p_virtual_product_patch->>'encrypted_secret_ref',
        (p_virtual_product_patch->>'secret_revision')::integer,
        p_virtual_product_patch->>'status', 'pending', NULL, 1,
        p_actor_employee_id, p_actor_employee_id
      ) RETURNING * INTO v_mapping;
    END IF;
  END IF;

  IF v_final_mode = 'wechat_virtual' THEN
    IF v_environment = 'production' THEN
      v_mapping_status := v_mapping.status;
      v_mapping_validation := v_mapping.validation_status;
      v_mapping_amount := v_mapping.expected_amount_fen;
      v_mapping_secret_ref := v_mapping.encrypted_secret_ref;
    ELSE
      SELECT * INTO v_production
      FROM public.platform_virtual_payment_products
      WHERE addon_product_id = v_product.id AND environment = 'production'
      FOR UPDATE;
      IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'BRANDING_VIRTUAL_PRODUCT_PRODUCTION_REQUIRED';
      END IF;
      v_mapping_status := v_production.status;
      v_mapping_validation := v_production.validation_status;
      v_mapping_amount := v_production.expected_amount_fen;
      v_mapping_secret_ref := v_production.encrypted_secret_ref;
    END IF;
    IF v_mapping_status <> 'active' THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'BRANDING_VIRTUAL_PRODUCT_DISABLED';
    END IF;
    IF v_mapping_validation <> 'valid' THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'BRANDING_VIRTUAL_PRODUCT_INVALID';
    END IF;
    IF v_final_amount IS NULL OR v_final_amount < 100 THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'BRANDING_VIRTUAL_PRODUCT_AMOUNT_TOO_LOW';
    END IF;
    IF v_mapping_amount <> v_final_amount THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'BRANDING_VIRTUAL_PRODUCT_AMOUNT_MISMATCH';
    END IF;
    IF v_mapping_secret_ref <> 'WECHAT_VIRTUAL_PAYMENT_PRODUCTION_SECRET_BUNDLE' THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'BRANDING_VIRTUAL_PRODUCT_SECRET_ENVIRONMENT_MISMATCH';
    END IF;
  END IF;

  IF p_product_patch <> '{}'::jsonb THEN
    UPDATE public.platform_addon_products
    SET name = COALESCE(p_product_patch->>'name', name),
        amount_fen = COALESCE((p_product_patch->>'amount_fen')::integer, amount_fen),
        purchase_notes = COALESCE(p_product_patch->>'purchase_notes', purchase_notes),
        enabled = COALESCE((p_product_patch->>'enabled')::boolean, enabled),
        purchase_mode = COALESCE(p_product_patch->>'purchase_mode', purchase_mode),
        version = version + 1,
        updated_by_employee_id = p_actor_employee_id
    WHERE id = v_product.id
    RETURNING * INTO v_product;
  END IF;

  RETURN jsonb_build_object('product', to_jsonb(v_product),
    'virtual_product', CASE
      WHEN p_virtual_product_patch = '{}'::jsonb THEN NULL
      ELSE to_jsonb(v_mapping)
    END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.branding_set_virtual_product_configuration_validation(
  p_addon_product_id uuid,
  p_environment text,
  p_expected_product_version integer,
  p_expected_mapping_version integer,
  p_validation_status text,
  p_validated_at timestamptz,
  p_updated_by uuid
)
RETURNS public.platform_virtual_payment_products
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_product public.platform_addon_products%ROWTYPE;
  v_mapping public.platform_virtual_payment_products%ROWTYPE;
BEGIN
  IF p_expected_product_version IS NULL OR p_expected_product_version <= 0
     OR p_expected_mapping_version IS NULL OR p_expected_mapping_version <= 0
     OR p_validated_at IS NULL
     OR p_updated_by IS NULL
  THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'BRANDING_VIRTUAL_PRODUCT_PATCH_INVALID';
  END IF;
  IF p_validation_status NOT IN ('valid', 'invalid') THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'BRANDING_VIRTUAL_PRODUCT_VALIDATION_STATUS_INVALID';
  END IF;
  PERFORM pg_advisory_xact_lock(
    hashtextextended('branding_virtual_payment_config', 20260801)
  );
  SELECT * INTO v_product
  FROM public.platform_addon_products
  WHERE id = p_addon_product_id
    AND code = 'custom_support_branding_annual'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'BRANDING_ADDON_PRODUCT_NOT_FOUND';
  END IF;
  IF v_product.version IS DISTINCT FROM p_expected_product_version THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'BRANDING_ADDON_PRODUCT_VERSION_CONFLICT';
  END IF;

  SELECT * INTO v_mapping
  FROM public.platform_virtual_payment_products
  WHERE addon_product_id = p_addon_product_id
    AND environment = p_environment
  FOR UPDATE;
  IF NOT FOUND
     OR v_mapping.version IS DISTINCT FROM p_expected_mapping_version
  THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'BRANDING_VIRTUAL_PRODUCT_VERSION_CONFLICT';
  END IF;

  UPDATE public.platform_virtual_payment_products
  SET status = CASE
        WHEN p_validation_status = 'invalid' AND status = 'active'
          THEN 'disabled'
        ELSE status
      END,
      validation_status = p_validation_status,
      validated_at = p_validated_at,
      version = version + 1,
      updated_by = p_updated_by
  WHERE id = v_mapping.id
  RETURNING * INTO v_mapping;
  RETURN v_mapping;
END;
$$;

REVOKE ALL ON FUNCTION public.branding_manage_virtual_product_configuration(integer, jsonb, jsonb, uuid)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.branding_manage_virtual_product_configuration(integer, jsonb, jsonb, uuid)
TO service_role;

REVOKE ALL ON FUNCTION public.branding_set_virtual_product_configuration_validation(uuid, text, integer, integer, text, timestamptz, uuid)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.branding_set_virtual_product_configuration_validation(uuid, text, integer, integer, text, timestamptz, uuid)
TO service_role;

REVOKE ALL ON FUNCTION public.branding_get_virtual_product_management_snapshot()
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.branding_get_virtual_product_management_snapshot()
TO service_role;

-- Task 1 temporarily granted table writes so the mapping could be introduced
-- before its command boundary existed. From this migration onward all writes
-- must pass through one of the two audited, optimistic-locking RPCs above.
REVOKE INSERT, UPDATE
ON TABLE public.platform_virtual_payment_products
FROM service_role;
REVOKE INSERT, UPDATE
ON TABLE public.platform_addon_products
FROM service_role;

COMMIT;
