-- Rollback: move the branding product to maintenance and stop configuration
-- writes. Drop the public wrapper, rename the internal function back, restore
-- the previous snapshot/validation trigger definitions, then drop item_url.
-- Existing commerce and entitlement facts are not changed by this migration.

BEGIN;

ALTER TABLE public.platform_virtual_payment_products
ADD COLUMN item_url text NULL;

ALTER TABLE public.platform_virtual_payment_products
ADD CONSTRAINT platform_virtual_payment_products_item_url_check CHECK (
  item_url IS NULL OR (
    item_url = btrim(item_url)
    AND char_length(item_url) <= 2048
    AND item_url ~* '^https://[^[:space:]]+\.(png|jpe?g)(\?[^[:space:]]*)?$'
  )
);

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
      OR OLD.item_url IS DISTINCT FROM NEW.item_url
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
             'item_url', mapping.item_url,
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

ALTER FUNCTION public.branding_manage_virtual_product_configuration(
  integer, jsonb, jsonb, uuid
)
RENAME TO branding_manage_virtual_product_configuration_without_item_url;

REVOKE ALL ON FUNCTION public.branding_manage_virtual_product_configuration_without_item_url(
  integer, jsonb, jsonb, uuid
)
FROM PUBLIC, anon, authenticated, service_role;

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
  v_result jsonb;
  v_mapping public.platform_virtual_payment_products%ROWTYPE;
  v_mapping_id uuid;
  v_has_item_url boolean := false;
BEGIN
  IF p_virtual_product_patch IS NULL
     OR jsonb_typeof(p_virtual_product_patch) <> 'object'
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'BRANDING_VIRTUAL_PRODUCT_PATCH_INVALID';
  END IF;

  v_has_item_url := p_virtual_product_patch ? 'item_url';
  IF v_has_item_url AND (
    jsonb_typeof(p_virtual_product_patch->'item_url') <> 'string'
    OR btrim(p_virtual_product_patch->>'item_url') = ''
    OR char_length(p_virtual_product_patch->>'item_url') > 2048
    OR p_virtual_product_patch->>'item_url'
      !~* '^https://[^[:space:]]+\.(png|jpe?g)(\?[^[:space:]]*)?$'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'BRANDING_VIRTUAL_PRODUCT_PATCH_INVALID';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('branding_virtual_payment_config', 20260801)
  );

  v_result := public.branding_manage_virtual_product_configuration_without_item_url(
    p_expected_product_version,
    p_product_patch,
    p_virtual_product_patch - 'item_url',
    p_actor_employee_id
  );

  IF p_virtual_product_patch <> '{}'::jsonb AND v_has_item_url THEN
    v_mapping_id := (v_result->'virtual_product'->>'id')::uuid;
    UPDATE public.platform_virtual_payment_products
    SET item_url = p_virtual_product_patch->>'item_url'
    WHERE id = v_mapping_id
    RETURNING * INTO v_mapping;

    IF NOT FOUND THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'BRANDING_VIRTUAL_PRODUCT_NOT_FOUND';
    END IF;
    v_result := jsonb_set(v_result, '{virtual_product}', to_jsonb(v_mapping));
  END IF;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.branding_manage_virtual_product_configuration(
  integer, jsonb, jsonb, uuid
)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.branding_manage_virtual_product_configuration(
  integer, jsonb, jsonb, uuid
)
TO service_role;

REVOKE ALL ON FUNCTION public.branding_get_virtual_product_management_snapshot()
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.branding_get_virtual_product_management_snapshot()
TO service_role;

REVOKE INSERT, UPDATE
ON TABLE public.platform_virtual_payment_products
FROM service_role;

COMMIT;
