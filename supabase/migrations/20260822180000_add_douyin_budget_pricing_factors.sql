-- Forward rollback procedure:
-- 1. Disable tenant pricing-management routes before changing factor commands.
-- 2. In a reviewed forward migration, revoke the factor command and restore
--    the previous payload/create function definitions if the API is rolled back.
-- 3. Preserve every pricing version and estimate snapshot. Existing estimates
--    keep their stored result_payload and are never recalculated.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE FUNCTION public.douyin_budget_default_pricing_factor_payload()
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public
AS $function$
  SELECT jsonb_build_object(
    'layout_coefficients_bps', jsonb_build_object(
      'one_bedroom_one_living', 10000,
      'two_bedroom_one_living', 10000,
      'two_bedroom_two_living', 10100,
      'three_bedroom_one_living', 10150,
      'three_bedroom_two_living', 10200,
      'four_bedroom_two_living', 10350,
      'villa_duplex', 10800,
      'custom', 10000
    ),
    'style_coefficients_bps', jsonb_build_object(
      'modern_simple', 10000,
      'cream', 10300,
      'new_chinese', 10800,
      'nordic', 10200,
      'light_luxury', 10700,
      'natural_wood', 10300,
      'american', 10600,
      'french', 10800,
      'wabi_sabi', 10700,
      'custom', 10000
    )
  );
$function$;

REVOKE ALL ON FUNCTION public.douyin_budget_default_pricing_factor_payload()
FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.is_valid_douyin_budget_pricing_factor_payload(
  p_payload jsonb
)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_layout jsonb;
  v_style jsonb;
BEGIN
  IF jsonb_typeof(p_payload) <> 'object'
    OR NOT p_payload ?& ARRAY[
      'layout_coefficients_bps',
      'style_coefficients_bps'
    ]
    OR EXISTS (
      SELECT 1
      FROM jsonb_object_keys(p_payload) AS payload_key
      WHERE payload_key <> ALL (ARRAY[
        'layout_coefficients_bps',
        'style_coefficients_bps'
      ])
    )
  THEN
    RETURN false;
  END IF;

  v_layout := p_payload->'layout_coefficients_bps';
  v_style := p_payload->'style_coefficients_bps';

  IF jsonb_typeof(p_payload->'layout_coefficients_bps') <> 'object'
    OR jsonb_typeof(p_payload->'style_coefficients_bps') <> 'object'
    OR NOT v_layout ?& ARRAY[
      'one_bedroom_one_living',
      'two_bedroom_one_living',
      'two_bedroom_two_living',
      'three_bedroom_one_living',
      'three_bedroom_two_living',
      'four_bedroom_two_living',
      'villa_duplex',
      'custom'
    ]
    OR NOT v_style ?& ARRAY[
      'modern_simple',
      'cream',
      'new_chinese',
      'nordic',
      'light_luxury',
      'natural_wood',
      'american',
      'french',
      'wabi_sabi',
      'custom'
    ]
    OR EXISTS (
      SELECT 1
      FROM jsonb_object_keys(v_layout) AS factor_key
      WHERE factor_key <> ALL (ARRAY[
        'one_bedroom_one_living',
        'two_bedroom_one_living',
        'two_bedroom_two_living',
        'three_bedroom_one_living',
        'three_bedroom_two_living',
        'four_bedroom_two_living',
        'villa_duplex',
        'custom'
      ])
    )
    OR EXISTS (
      SELECT 1
      FROM jsonb_object_keys(v_style) AS factor_key
      WHERE factor_key <> ALL (ARRAY[
        'modern_simple',
        'cream',
        'new_chinese',
        'nordic',
        'light_luxury',
        'natural_wood',
        'american',
        'french',
        'wabi_sabi',
        'custom'
      ])
    )
    OR EXISTS (
      SELECT 1
      FROM jsonb_each(v_layout) AS factor(key, value)
      WHERE public.douyin_budget_json_integer_in_range(factor.value, 1, 100000)
        IS NOT TRUE
    )
    OR EXISTS (
      SELECT 1
      FROM jsonb_each(v_style) AS factor(key, value)
      WHERE public.douyin_budget_json_integer_in_range(factor.value, 1, 100000)
        IS NOT TRUE
    )
  THEN
    RETURN false;
  END IF;

  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.is_valid_douyin_budget_pricing_factor_payload(
  jsonb
) FROM PUBLIC, anon, authenticated, service_role;

ALTER TABLE public.douyin_budget_pricing_versions
ADD COLUMN IF NOT EXISTS factor_payload jsonb;

CREATE OR REPLACE FUNCTION public.protect_douyin_budget_pricing_version()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'draft' THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'DOUYIN_BUDGET_PRICING_VERSION_IMMUTABLE';
    END IF;

    DELETE FROM public.douyin_budget_pricing_items
    WHERE pricing_version_id = OLD.id;
    RETURN OLD;
  END IF;

  IF OLD.factor_payload IS NULL
    AND public.is_valid_douyin_budget_pricing_factor_payload(
      NEW.factor_payload
    ) IS TRUE
    AND NEW.id IS NOT DISTINCT FROM OLD.id
    AND NEW.tenant_id IS NOT DISTINCT FROM OLD.tenant_id
    AND NEW.version_no IS NOT DISTINCT FROM OLD.version_no
    AND NEW.status IS NOT DISTINCT FROM OLD.status
    AND NEW.effective_from IS NOT DISTINCT FROM OLD.effective_from
    AND NEW.effective_to IS NOT DISTINCT FROM OLD.effective_to
    AND NEW.currency IS NOT DISTINCT FROM OLD.currency
    AND NEW.disclaimer IS NOT DISTINCT FROM OLD.disclaimer
    AND NEW.created_by_employee_id IS NOT DISTINCT FROM OLD.created_by_employee_id
    AND NEW.created_at IS NOT DISTINCT FROM OLD.created_at
  THEN
    RETURN NEW;
  END IF;

  IF OLD.status = 'archived' THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'DOUYIN_BUDGET_PRICING_VERSION_IMMUTABLE';
  END IF;

  IF OLD.status = 'active' AND (
    NEW.status <> 'archived'
    OR NEW.id IS DISTINCT FROM OLD.id
    OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
    OR NEW.version_no IS DISTINCT FROM OLD.version_no
    OR NEW.effective_from IS DISTINCT FROM OLD.effective_from
    OR NEW.effective_to IS DISTINCT FROM OLD.effective_to
    OR NEW.currency IS DISTINCT FROM OLD.currency
    OR NEW.disclaimer IS DISTINCT FROM OLD.disclaimer
    OR NEW.factor_payload IS DISTINCT FROM OLD.factor_payload
    OR NEW.created_by_employee_id IS DISTINCT FROM OLD.created_by_employee_id
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'DOUYIN_BUDGET_PRICING_VERSION_IMMUTABLE';
  END IF;

  RETURN NEW;
END;
$function$;

UPDATE public.douyin_budget_pricing_versions
SET factor_payload = public.douyin_budget_default_pricing_factor_payload()
WHERE factor_payload IS NULL;

CREATE OR REPLACE FUNCTION public.protect_douyin_budget_pricing_version()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'draft' THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'DOUYIN_BUDGET_PRICING_VERSION_IMMUTABLE';
    END IF;

    DELETE FROM public.douyin_budget_pricing_items
    WHERE pricing_version_id = OLD.id;
    RETURN OLD;
  END IF;

  IF OLD.status = 'archived' THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'DOUYIN_BUDGET_PRICING_VERSION_IMMUTABLE';
  END IF;

  IF OLD.status = 'active' AND (
    NEW.status <> 'archived'
    OR NEW.id IS DISTINCT FROM OLD.id
    OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
    OR NEW.version_no IS DISTINCT FROM OLD.version_no
    OR NEW.effective_from IS DISTINCT FROM OLD.effective_from
    OR NEW.effective_to IS DISTINCT FROM OLD.effective_to
    OR NEW.currency IS DISTINCT FROM OLD.currency
    OR NEW.disclaimer IS DISTINCT FROM OLD.disclaimer
    OR NEW.factor_payload IS DISTINCT FROM OLD.factor_payload
    OR NEW.created_by_employee_id IS DISTINCT FROM OLD.created_by_employee_id
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'DOUYIN_BUDGET_PRICING_VERSION_IMMUTABLE';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.protect_douyin_budget_pricing_version()
FROM PUBLIC, anon, authenticated, service_role;

ALTER TABLE public.douyin_budget_pricing_versions
ALTER COLUMN factor_payload
SET DEFAULT public.douyin_budget_default_pricing_factor_payload();

ALTER TABLE public.douyin_budget_pricing_versions
ALTER COLUMN factor_payload SET NOT NULL;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'douyin_budget_pricing_versions_factor_payload_check'
      AND conrelid = 'public.douyin_budget_pricing_versions'::regclass
  ) THEN
    ALTER TABLE public.douyin_budget_pricing_versions
    ADD CONSTRAINT douyin_budget_pricing_versions_factor_payload_check
    CHECK (
      public.is_valid_douyin_budget_pricing_factor_payload(factor_payload)
      IS TRUE
    ) NOT VALID;
  END IF;
END
$do$;

ALTER TABLE public.douyin_budget_pricing_versions
VALIDATE CONSTRAINT douyin_budget_pricing_versions_factor_payload_check;

CREATE OR REPLACE FUNCTION public.douyin_budget_pricing_version_payload(
  p_tenant_id uuid,
  p_pricing_version_id uuid
)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public
AS $function$
  SELECT jsonb_build_object(
    'id', pricing_version.id,
    'tenant_id', pricing_version.tenant_id,
    'version_no', pricing_version.version_no,
    'status', pricing_version.status,
    'effective_from', pricing_version.effective_from,
    'effective_to', pricing_version.effective_to,
    'currency', pricing_version.currency,
    'disclaimer', pricing_version.disclaimer,
    'factor_payload', pricing_version.factor_payload,
    'created_by_employee_id', pricing_version.created_by_employee_id,
    'created_at', pricing_version.created_at,
    'updated_at', pricing_version.updated_at,
    'items', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', item.id,
          'pricing_version_id', item.pricing_version_id,
          'category_code', item.category_code,
          'item_code', item.item_code,
          'label', item.label,
          'unit', item.unit,
          'minimum_amount', item.minimum_amount,
          'maximum_amount', item.maximum_amount,
          'condition_payload', item.condition_payload,
          'sort_order', item.sort_order,
          'status', item.status,
          'created_at', item.created_at,
          'updated_at', item.updated_at
        ) ORDER BY item.sort_order, item.id
      )
      FROM public.douyin_budget_pricing_items AS item
      WHERE item.pricing_version_id = pricing_version.id
    ), '[]'::jsonb)
  )
  FROM public.douyin_budget_pricing_versions AS pricing_version
  WHERE pricing_version.id = p_pricing_version_id
    AND pricing_version.tenant_id = p_tenant_id;
$function$;

REVOKE ALL ON FUNCTION public.douyin_budget_pricing_version_payload(uuid, uuid)
FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.create_douyin_budget_pricing_draft(
  p_tenant_id uuid,
  p_created_by_employee_id uuid,
  p_effective_from timestamptz,
  p_effective_to timestamptz,
  p_disclaimer text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_version public.douyin_budget_pricing_versions%ROWTYPE;
  v_version_no bigint;
BEGIN
  IF p_tenant_id IS NULL
    OR p_created_by_employee_id IS NULL
    OR p_effective_from IS NULL
    OR p_disclaimer IS NULL
    OR p_disclaimer <> btrim(p_disclaimer)
    OR char_length(p_disclaimer) NOT BETWEEN 1 AND 500
    OR (p_effective_to IS NOT NULL AND p_effective_to <= p_effective_from)
    OR NOT EXISTS (
      SELECT 1
      FROM public.employees AS employee
      WHERE employee.id = p_created_by_employee_id
        AND employee.tenant_id = p_tenant_id
    )
  THEN
    RETURN jsonb_build_object('error', jsonb_build_object(
      'status_code', 400,
      'code', 'DOUYIN_BUDGET_PRICING_INVALID',
      'message', '报价版本信息无效'
    ));
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text, 0));
  SELECT COALESCE(MAX(pricing_version.version_no), 0) + 1
  INTO v_version_no
  FROM public.douyin_budget_pricing_versions AS pricing_version
  WHERE pricing_version.tenant_id = p_tenant_id;

  INSERT INTO public.douyin_budget_pricing_versions (
    tenant_id,
    version_no,
    status,
    effective_from,
    effective_to,
    currency,
    disclaimer,
    factor_payload,
    created_by_employee_id
  ) VALUES (
    p_tenant_id,
    v_version_no,
    'draft',
    p_effective_from,
    p_effective_to,
    'CNY',
    p_disclaimer,
    public.douyin_budget_default_pricing_factor_payload(),
    p_created_by_employee_id
  ) RETURNING * INTO v_version;

  RETURN jsonb_build_object(
    'data',
    public.douyin_budget_pricing_version_payload(p_tenant_id, v_version.id)
  );
END;
$function$;

CREATE FUNCTION public.update_douyin_budget_pricing_factors(
  p_tenant_id uuid,
  p_pricing_version_id uuid,
  p_expected_updated_at timestamptz,
  p_factor_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_version public.douyin_budget_pricing_versions%ROWTYPE;
BEGIN
  IF p_tenant_id IS NULL
    OR p_pricing_version_id IS NULL
    OR p_expected_updated_at IS NULL
    OR public.is_valid_douyin_budget_pricing_factor_payload(
      p_factor_payload
    ) IS NOT TRUE
  THEN
    RETURN jsonb_build_object('error', jsonb_build_object(
      'status_code', 400,
      'code', 'DOUYIN_BUDGET_PRICING_INVALID',
      'message', '报价系数配置无效'
    ));
  END IF;

  SELECT pricing_version.*
  INTO v_version
  FROM public.douyin_budget_pricing_versions AS pricing_version
  WHERE pricing_version.id = p_pricing_version_id
    AND pricing_version.tenant_id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', jsonb_build_object(
      'status_code', 404,
      'code', 'DOUYIN_BUDGET_PRICING_NOT_FOUND',
      'message', '报价版本不存在'
    ));
  END IF;
  IF v_version.status <> 'draft' THEN
    RETURN jsonb_build_object('error', jsonb_build_object(
      'status_code', 409,
      'code', 'DOUYIN_BUDGET_PRICING_NOT_DRAFT',
      'message', '仅草稿报价可以修改系数'
    ));
  END IF;
  IF v_version.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RETURN jsonb_build_object('error', jsonb_build_object(
      'status_code', 409,
      'code', 'DOUYIN_BUDGET_PRICING_STALE',
      'message', '报价版本已更新，请刷新后重试'
    ));
  END IF;

  UPDATE public.douyin_budget_pricing_versions AS pricing_version
  SET factor_payload = p_factor_payload
  WHERE pricing_version.id = p_pricing_version_id
    AND pricing_version.tenant_id = p_tenant_id;

  RETURN jsonb_build_object(
    'data',
    public.douyin_budget_pricing_version_payload(
      p_tenant_id,
      p_pricing_version_id
    )
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.create_douyin_budget_pricing_draft(
  uuid, uuid, timestamptz, timestamptz, text
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_douyin_budget_pricing_factors(
  uuid, uuid, timestamptz, jsonb
) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.create_douyin_budget_pricing_draft(
  uuid, uuid, timestamptz, timestamptz, text
) TO service_role;
GRANT EXECUTE ON FUNCTION public.update_douyin_budget_pricing_factors(
  uuid, uuid, timestamptz, jsonb
) TO service_role;

REVOKE INSERT, UPDATE, DELETE
ON TABLE public.douyin_budget_pricing_versions
FROM service_role;
REVOKE INSERT, UPDATE, DELETE
ON TABLE public.douyin_budget_pricing_items
FROM service_role;

COMMIT;
