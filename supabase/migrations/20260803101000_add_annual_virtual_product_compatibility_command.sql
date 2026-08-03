-- Keep the legacy annual-branding settings route on the generic virtual-product
-- source of truth. The legacy tables remain read-only migration evidence.

WITH candidate AS (
  SELECT
    product.id AS product_id,
    file_object.id AS file_id,
    row_number() OVER (
      PARTITION BY product.id
      ORDER BY file_object.created_at DESC, file_object.id DESC
    ) AS candidate_rank
  FROM public.platform_virtual_products AS product
  JOIN public.platform_virtual_payment_products AS legacy_mapping
    ON legacy_mapping.addon_product_id = product.id
  JOIN public.platform_file_objects AS file_object
    ON file_object.public_url = legacy_mapping.item_url
   AND file_object.tenant_id IS NULL
   AND file_object.owner_type = 'branding_virtual_goods'
   AND file_object.scene = 'branding_virtual_goods'
   AND file_object.visibility = 'public'
   AND file_object.width = 200
   AND file_object.height = 200
   AND file_object.status = 'active'
   AND file_object.deleted_at IS NULL
  WHERE product.code = 'custom_support_branding_annual'
    AND product.image_file_id IS NULL
    AND legacy_mapping.item_url IS NOT NULL
)
UPDATE public.platform_virtual_products AS product
SET image_file_id = candidate.file_id
FROM candidate
WHERE product.id = candidate.product_id
  AND candidate.candidate_rank = 1;

CREATE OR REPLACE FUNCTION public.platform_manage_annual_virtual_payment_compatibility(
  p_expected_product_version integer,
  p_purchase_mode text,
  p_virtual_product_patch jsonb,
  p_actor_employee_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_product public.platform_virtual_products%ROWTYPE;
  v_mapping public.platform_virtual_product_mappings%ROWTYPE;
  v_channel public.platform_virtual_payment_channels%ROWTYPE;
  v_current_mode text;
  v_environment text;
  v_expected_mapping_version integer;
  v_target_product_status text;
  v_target_channel_status text;
  v_expected_secret_ref text;
  v_current_item_url text;
  v_channel_changed boolean := false;
  v_new_product_version integer;
BEGIN
  IF p_expected_product_version IS NULL OR p_expected_product_version <= 0
     OR p_actor_employee_id IS NULL
     OR p_virtual_product_patch IS NULL
     OR jsonb_typeof(p_virtual_product_patch) <> 'object'
  THEN
    RAISE EXCEPTION USING MESSAGE = 'VIRTUAL_PRODUCT_COMPATIBILITY_PATCH_INVALID';
  END IF;

  SELECT *
  INTO v_product
  FROM public.platform_virtual_products
  WHERE code = 'custom_support_branding_annual'
  FOR UPDATE;

  IF v_product.id IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'VIRTUAL_PRODUCT_NOT_FOUND';
  END IF;
  IF v_product.version IS DISTINCT FROM p_expected_product_version THEN
    RAISE EXCEPTION USING MESSAGE = 'VIRTUAL_PRODUCT_VERSION_CONFLICT';
  END IF;
  IF v_product.status = 'archived' THEN
    RAISE EXCEPTION USING MESSAGE = 'VIRTUAL_PRODUCT_ALREADY_ARCHIVED';
  END IF;

  v_current_mode := CASE v_product.status
    WHEN 'active' THEN 'wechat_virtual'
    WHEN 'draft' THEN 'direct_legacy'
    ELSE 'maintenance'
  END;

  IF p_purchase_mode IS NOT NULL THEN
    IF p_purchase_mode NOT IN ('direct_legacy', 'maintenance', 'wechat_virtual')
       OR NOT (
         p_purchase_mode = v_current_mode
         OR (v_current_mode = 'direct_legacy' AND p_purchase_mode = 'maintenance')
         OR (v_current_mode = 'maintenance' AND p_purchase_mode = 'wechat_virtual')
         OR (v_current_mode = 'wechat_virtual' AND p_purchase_mode = 'maintenance')
       )
    THEN
      RAISE EXCEPTION USING MESSAGE = 'BRANDING_ADDON_PURCHASE_MODE_TRANSITION_INVALID';
    END IF;
    v_target_product_status := CASE p_purchase_mode
      WHEN 'wechat_virtual' THEN 'active'
      WHEN 'direct_legacy' THEN 'draft'
      ELSE 'suspended'
    END;
  ELSE
    v_target_product_status := v_product.status;
  END IF;

  IF p_virtual_product_patch <> '{}'::jsonb THEN
    v_environment := p_virtual_product_patch ->> 'environment';
    IF COALESCE(v_environment, '') NOT IN ('sandbox', 'production')
       OR COALESCE(p_virtual_product_patch ->> 'version', '') !~ '^[1-9][0-9]*$'
    THEN
      RAISE EXCEPTION USING MESSAGE = 'VIRTUAL_PRODUCT_COMPATIBILITY_PATCH_INVALID';
    END IF;
    v_expected_mapping_version := (p_virtual_product_patch ->> 'version')::integer;

    SELECT mapping.*
    INTO v_mapping
    FROM public.platform_virtual_product_mappings AS mapping
    JOIN public.platform_virtual_payment_channels AS channel
      ON channel.id = mapping.channel_id
    WHERE mapping.product_id = v_product.id
      AND channel.provider = 'wechat_virtual'
      AND channel.environment = v_environment
    FOR UPDATE OF mapping;

    IF v_mapping.id IS NULL THEN
      RAISE EXCEPTION USING MESSAGE = 'VIRTUAL_PRODUCT_MAPPING_NOT_FOUND';
    END IF;
    IF p_virtual_product_patch ->> 'provider_product_id'
       IS DISTINCT FROM v_mapping.provider_product_id
    THEN
      RAISE EXCEPTION USING MESSAGE = 'VIRTUAL_PRODUCT_CHANNEL_ID_IMMUTABLE';
    END IF;
    IF COALESCE(p_virtual_product_patch ->> 'expected_amount_fen', '') !~ '^[1-9][0-9]*$'
       OR (p_virtual_product_patch ->> 'expected_amount_fen')::integer
          IS DISTINCT FROM v_product.amount_fen
    THEN
      RAISE EXCEPTION USING MESSAGE = 'VIRTUAL_PRODUCT_COMPATIBILITY_PRODUCT_FACT_IMMUTABLE';
    END IF;

    SELECT channel.*
    INTO v_channel
    FROM public.platform_virtual_payment_channels AS channel
    WHERE channel.id = v_mapping.channel_id
    FOR UPDATE;

    -- The legacy UI uses a configuration version. Generic mapping versions
    -- also advance for upload/publish state, so channel.version is the stable
    -- optimistic-lock fact for this compatibility command.
    IF v_channel.version IS DISTINCT FROM v_expected_mapping_version THEN
      RAISE EXCEPTION USING MESSAGE = 'VIRTUAL_PRODUCT_VERSION_CONFLICT';
    END IF;

    SELECT COALESCE(
      (
        SELECT file_object.public_url
        FROM public.platform_file_objects AS file_object
        WHERE file_object.id = v_product.image_file_id
      ),
      v_mapping.remote_snapshot ->> 'item_url'
    )
    INTO v_current_item_url;

    IF p_virtual_product_patch ? 'item_url'
       AND NULLIF(p_virtual_product_patch ->> 'item_url', '')
           IS DISTINCT FROM NULLIF(v_current_item_url, '')
    THEN
      RAISE EXCEPTION USING MESSAGE = 'VIRTUAL_PRODUCT_COMPATIBILITY_PRODUCT_FACT_IMMUTABLE';
    END IF;

    IF COALESCE(btrim(p_virtual_product_patch ->> 'app_id'), '') = ''
       OR COALESCE(btrim(p_virtual_product_patch ->> 'virtual_merchant_id'), '') = ''
       OR COALESCE(btrim(p_virtual_product_patch ->> 'offer_id'), '') = ''
       OR COALESCE(p_virtual_product_patch ->> 'secret_revision', '') !~ '^[1-9][0-9]*$'
       OR COALESCE(p_virtual_product_patch ->> 'status', '')
          NOT IN ('draft', 'active', 'disabled')
    THEN
      RAISE EXCEPTION USING MESSAGE = 'VIRTUAL_PRODUCT_COMPATIBILITY_PATCH_INVALID';
    END IF;

    v_target_channel_status := CASE
      WHEN p_virtual_product_patch ->> 'status' = 'active' THEN 'active'
      ELSE 'disabled'
    END;
    v_expected_secret_ref := CASE v_environment
      WHEN 'production' THEN 'WECHAT_VIRTUAL_PAYMENT_PRODUCTION_SECRET_BUNDLE'
      ELSE 'WECHAT_VIRTUAL_PAYMENT_SANDBOX_SECRET_BUNDLE'
    END;
    v_channel_changed :=
      v_channel.app_id IS DISTINCT FROM p_virtual_product_patch ->> 'app_id'
      OR v_channel.virtual_merchant_id IS DISTINCT FROM
        p_virtual_product_patch ->> 'virtual_merchant_id'
      OR v_channel.offer_id IS DISTINCT FROM p_virtual_product_patch ->> 'offer_id'
      OR v_channel.secret_revision IS DISTINCT FROM
        (p_virtual_product_patch ->> 'secret_revision')::integer
      OR v_channel.status IS DISTINCT FROM v_target_channel_status;

    IF v_channel_changed THEN
      UPDATE public.platform_virtual_payment_channels
      SET app_id = p_virtual_product_patch ->> 'app_id',
          virtual_merchant_id = p_virtual_product_patch ->> 'virtual_merchant_id',
          offer_id = p_virtual_product_patch ->> 'offer_id',
          encrypted_secret_ref = v_expected_secret_ref,
          secret_revision = (p_virtual_product_patch ->> 'secret_revision')::integer,
          status = v_target_channel_status,
          version = version + 1,
          updated_by_employee_id = p_actor_employee_id
      WHERE id = v_channel.id;

      UPDATE public.platform_virtual_product_mappings
      SET upload_state = CASE
            WHEN upload_state = 'not_started' THEN upload_state
            ELSE 'out_of_sync'
          END,
          publish_state = CASE
            WHEN publish_state = 'not_started' THEN publish_state
            ELSE 'out_of_sync'
          END,
          validation_status = 'pending',
          synced_product_version = NULL,
          version = version + 1
      WHERE channel_id = v_channel.id;
    END IF;
  END IF;

  IF v_target_product_status = 'active' AND v_product.status <> 'active' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.platform_virtual_product_mappings AS mapping
      JOIN public.platform_virtual_payment_channels AS channel
        ON channel.id = mapping.channel_id
      WHERE mapping.product_id = v_product.id
        AND channel.environment = 'production'
        AND channel.status = 'active'
        AND mapping.validation_status = 'valid'
        AND mapping.synced_product_version = v_product.version
    ) THEN
      RAISE EXCEPTION USING MESSAGE = 'VIRTUAL_PRODUCT_NOT_READY';
    END IF;
  END IF;

  IF v_target_product_status IS DISTINCT FROM v_product.status THEN
    v_new_product_version := v_product.version + 1;
    UPDATE public.platform_virtual_products
    SET status = v_target_product_status,
        version = v_new_product_version,
        updated_by_employee_id = p_actor_employee_id
    WHERE id = v_product.id;

    UPDATE public.platform_virtual_product_mappings
    SET synced_product_version = v_new_product_version
    WHERE product_id = v_product.id
      AND validation_status = 'valid'
      AND synced_product_version = v_product.version;
  END IF;

  RETURN jsonb_build_object(
    'product_id', v_product.id,
    'environment', v_environment,
    'updated', true
  );
END;
$$;

REVOKE ALL ON FUNCTION public.platform_manage_annual_virtual_payment_compatibility(
  integer,
  text,
  jsonb,
  uuid
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_manage_annual_virtual_payment_compatibility(
  integer,
  text,
  jsonb,
  uuid
) TO service_role;

COMMENT ON FUNCTION public.platform_manage_annual_virtual_payment_compatibility(
  integer,
  text,
  jsonb,
  uuid
) IS '兼容旧年度品牌权益支付配置入口，仅更新通用虚拟商品事实。';
