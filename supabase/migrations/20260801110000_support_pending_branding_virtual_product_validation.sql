BEGIN;

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
     OR p_validation_status IS NULL
     OR p_environment IS NULL
     OR p_environment NOT IN ('sandbox', 'production')
     OR (p_validation_status <> 'pending' AND p_validated_at IS NULL)
     OR p_updated_by IS NULL
  THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'BRANDING_VIRTUAL_PRODUCT_PATCH_INVALID';
  END IF;
  IF p_validation_status NOT IN ('pending', 'valid', 'invalid') THEN
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
      validated_at = CASE
        WHEN p_validation_status = 'pending' THEN NULL
        ELSE p_validated_at
      END,
      version = version + 1,
      updated_by = p_updated_by
  WHERE id = v_mapping.id
  RETURNING * INTO v_mapping;
  RETURN v_mapping;
END;
$$;

REVOKE ALL ON FUNCTION public.branding_set_virtual_product_configuration_validation(uuid, text, integer, integer, text, timestamptz, uuid)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.branding_set_virtual_product_configuration_validation(uuid, text, integer, integer, text, timestamptz, uuid)
TO service_role;

COMMIT;
