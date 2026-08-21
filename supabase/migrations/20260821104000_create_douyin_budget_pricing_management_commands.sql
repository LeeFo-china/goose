-- Forward rollback procedure:
-- 1. Disable tenant pricing-management routes before changing command ACLs.
-- 2. In a reviewed forward migration, restore direct service_role writes only
--    if every caller is converted back to scoped and atomic table operations.
-- 3. Revoke command execution, then remove the four public commands and their
--    private validation/payload helpers. Preserve all pricing history.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE FUNCTION public.douyin_budget_json_integer_in_range(
  p_value jsonb,
  p_minimum numeric,
  p_maximum numeric
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public
AS $function$
  SELECT jsonb_typeof(p_value) = 'number'
    AND p_value #>> '{}' ~ '^(0|[1-9][0-9]*)$'
    AND (p_value #>> '{}')::numeric BETWEEN p_minimum AND p_maximum;
$function$;

REVOKE ALL ON FUNCTION public.douyin_budget_json_integer_in_range(
  jsonb, numeric, numeric
) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.is_valid_douyin_budget_pricing_item(p_item jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_condition jsonb;
  v_role text;
  v_property text;
  v_tier text;
BEGIN
  IF jsonb_typeof(p_item) <> 'object'
    OR NOT p_item ?& ARRAY[
      'category_code', 'item_code', 'label', 'unit', 'minimum_amount',
      'maximum_amount', 'condition_payload', 'sort_order', 'status'
    ]
    OR EXISTS (
      SELECT 1
      FROM jsonb_object_keys(p_item) AS item_key
      WHERE item_key <> ALL (ARRAY[
        'category_code', 'item_code', 'label', 'unit', 'minimum_amount',
        'maximum_amount', 'condition_payload', 'sort_order', 'status'
      ])
    )
  THEN
    RETURN false;
  END IF;

  IF p_item->>'category_code' NOT IN (
      'base', 'water_electricity', 'materials', 'custom', 'other'
    )
    OR p_item->>'unit' NOT IN ('sqm', 'fixed')
    OR p_item->>'status' NOT IN ('active', 'inactive')
    OR p_item->>'label' IS NULL
    OR p_item->>'label' <> btrim(p_item->>'label')
    OR char_length(p_item->>'label') NOT BETWEEN 1 AND 40
    OR public.douyin_budget_json_integer_in_range(
      p_item->'minimum_amount', 0, 9007199254740991
    ) IS NOT TRUE
    OR public.douyin_budget_json_integer_in_range(
      p_item->'maximum_amount', 0, 9007199254740991
    ) IS NOT TRUE
    OR (p_item->>'minimum_amount')::numeric
      > (p_item->>'maximum_amount')::numeric
    OR public.douyin_budget_json_integer_in_range(
      p_item->'sort_order', 0, 99
    ) IS NOT TRUE
  THEN
    RETURN false;
  END IF;

  v_condition := p_item->'condition_payload';
  IF jsonb_typeof(v_condition) <> 'object' THEN
    RETURN false;
  END IF;
  v_role := v_condition->>'role';

  IF v_role = 'base' THEN
    IF p_item->>'category_code' <> 'base'
      OR p_item->>'unit' <> 'sqm'
      OR NOT v_condition ?& ARRAY[
        'role', 'property_conditions', 'decoration_tiers',
        'decoration_scopes', 'property_condition_coefficient_bps',
        'decoration_scope_coefficient_bps'
      ]
      OR EXISTS (
        SELECT 1
        FROM jsonb_object_keys(v_condition) AS condition_key
        WHERE condition_key <> ALL (ARRAY[
          'role', 'property_conditions', 'decoration_tiers',
          'decoration_scopes', 'property_condition_coefficient_bps',
          'decoration_scope_coefficient_bps'
        ])
      )
      OR v_condition->'property_conditions' NOT IN (
        '["rough"]'::jsonb, '["old_house"]'::jsonb
      )
      OR v_condition->'decoration_tiers' NOT IN (
        '["economy"]'::jsonb,
        '["comfortable"]'::jsonb,
        '["quality"]'::jsonb
      )
      OR v_condition->'decoration_scopes'
        <> '["whole_house","partial"]'::jsonb
      OR public.douyin_budget_json_integer_in_range(
        v_condition->'property_condition_coefficient_bps', 1, 100000
      ) IS NOT TRUE
      OR jsonb_typeof(v_condition->'decoration_scope_coefficient_bps')
        <> 'object'
      OR v_condition->'decoration_scope_coefficient_bps'
        ?& ARRAY['whole_house', 'partial'] IS NOT TRUE
      OR EXISTS (
        SELECT 1
        FROM jsonb_object_keys(
          v_condition->'decoration_scope_coefficient_bps'
        ) AS coefficient_key
        WHERE coefficient_key <> ALL (ARRAY['whole_house', 'partial'])
      )
      OR public.douyin_budget_json_integer_in_range(
        v_condition->'decoration_scope_coefficient_bps'->'whole_house',
        1,
        100000
      ) IS NOT TRUE
      OR public.douyin_budget_json_integer_in_range(
        v_condition->'decoration_scope_coefficient_bps'->'partial',
        1,
        100000
      ) IS NOT TRUE
    THEN
      RETURN false;
    END IF;
    v_property := v_condition->'property_conditions'->>0;
    v_tier := v_condition->'decoration_tiers'->>0;
    RETURN p_item->>'item_code' = 'base.' || v_tier || '.' || v_property;
  END IF;

  IF v_role = 'option' THEN
    IF p_item->>'item_code' NOT IN (
        'demolition', 'water_electricity_upgrade', 'custom_cabinet'
      )
      OR EXISTS (
        SELECT 1
        FROM jsonb_object_keys(v_condition) AS condition_key
        WHERE condition_key <> ALL (ARRAY[
          'role', 'property_conditions', 'decoration_tiers',
          'decoration_scopes'
        ])
      )
      OR (
        v_condition ? 'property_conditions'
        AND v_condition->'property_conditions' NOT IN (
          '["rough"]'::jsonb,
          '["old_house"]'::jsonb,
          '["rough","old_house"]'::jsonb
        )
      )
      OR (
        v_condition ? 'decoration_tiers'
        AND v_condition->'decoration_tiers' NOT IN (
          '["economy"]'::jsonb,
          '["comfortable"]'::jsonb,
          '["quality"]'::jsonb,
          '["economy","comfortable"]'::jsonb,
          '["economy","quality"]'::jsonb,
          '["comfortable","quality"]'::jsonb,
          '["economy","comfortable","quality"]'::jsonb
        )
      )
      OR (
        v_condition ? 'decoration_scopes'
        AND v_condition->'decoration_scopes' NOT IN (
          '["whole_house"]'::jsonb,
          '["partial"]'::jsonb,
          '["whole_house","partial"]'::jsonb
        )
      )
    THEN
      RETURN false;
    END IF;
    RETURN true;
  END IF;

  RETURN false;
END;
$function$;

REVOKE ALL ON FUNCTION public.is_valid_douyin_budget_pricing_item(jsonb)
FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.douyin_budget_pricing_version_payload(
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

CREATE FUNCTION public.create_douyin_budget_pricing_draft(
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
    created_by_employee_id
  ) VALUES (
    p_tenant_id,
    v_version_no,
    'draft',
    p_effective_from,
    p_effective_to,
    'CNY',
    p_disclaimer,
    p_created_by_employee_id
  ) RETURNING * INTO v_version;

  RETURN jsonb_build_object(
    'data',
    public.douyin_budget_pricing_version_payload(p_tenant_id, v_version.id)
  );
END;
$function$;

CREATE FUNCTION public.replace_douyin_budget_pricing_items(
  p_tenant_id uuid,
  p_pricing_version_id uuid,
  p_expected_updated_at timestamptz,
  p_items jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_version public.douyin_budget_pricing_versions%ROWTYPE;
  v_next_updated_at timestamptz;
BEGIN
  IF p_tenant_id IS NULL
    OR p_pricing_version_id IS NULL
    OR p_expected_updated_at IS NULL
    OR jsonb_typeof(p_items) <> 'array'
    OR jsonb_array_length(p_items) NOT BETWEEN 1 AND 100
  THEN
    RETURN jsonb_build_object('error', jsonb_build_object(
      'status_code', 400,
      'code', 'DOUYIN_BUDGET_PRICING_INVALID',
      'message', '报价项目无效'
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
      'message', '仅草稿报价可以修改项目'
    ));
  END IF;
  IF v_version.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RETURN jsonb_build_object('error', jsonb_build_object(
      'status_code', 409,
      'code', 'DOUYIN_BUDGET_PRICING_STALE',
      'message', '报价版本已更新，请刷新后重试'
    ));
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_items) AS candidate(item)
    WHERE public.is_valid_douyin_budget_pricing_item(candidate.item) IS NOT TRUE
  ) OR EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_items) AS candidate(
      item_code text,
      label text,
      sort_order integer
    )
    GROUP BY candidate.item_code
    HAVING COUNT(*) > 1
  ) OR EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_items) AS candidate(
      item_code text,
      label text,
      sort_order integer
    )
    GROUP BY candidate.label
    HAVING COUNT(*) > 1
  ) OR EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_items) AS candidate(
      item_code text,
      label text,
      sort_order integer
    )
    GROUP BY candidate.sort_order
    HAVING COUNT(*) > 1
  ) THEN
    RETURN jsonb_build_object('error', jsonb_build_object(
      'status_code', 400,
      'code', 'DOUYIN_BUDGET_PRICING_INVALID',
      'message', '报价项目无效'
    ));
  END IF;

  DELETE FROM public.douyin_budget_pricing_items AS item
  WHERE item.pricing_version_id = p_pricing_version_id;

  INSERT INTO public.douyin_budget_pricing_items (
    pricing_version_id,
    category_code,
    item_code,
    label,
    unit,
    minimum_amount,
    maximum_amount,
    condition_payload,
    sort_order,
    status
  )
  SELECT
    p_pricing_version_id,
    candidate.category_code,
    candidate.item_code,
    candidate.label,
    candidate.unit,
    candidate.minimum_amount,
    candidate.maximum_amount,
    candidate.condition_payload,
    candidate.sort_order,
    candidate.status
  FROM jsonb_to_recordset(p_items) AS candidate(
    category_code text,
    item_code text,
    label text,
    unit text,
    minimum_amount bigint,
    maximum_amount bigint,
    condition_payload jsonb,
    sort_order integer,
    status text
  );

  v_next_updated_at := GREATEST(
    clock_timestamp(),
    v_version.updated_at + interval '1 microsecond'
  );
  UPDATE public.douyin_budget_pricing_versions AS pricing_version
  SET updated_at = v_next_updated_at
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

CREATE FUNCTION public.activate_douyin_budget_pricing_version(
  p_tenant_id uuid,
  p_pricing_version_id uuid,
  p_expected_updated_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_version public.douyin_budget_pricing_versions%ROWTYPE;
  v_now timestamptz := clock_timestamp();
  v_base_count integer;
  v_valid_base_count integer;
BEGIN
  IF p_tenant_id IS NULL
    OR p_pricing_version_id IS NULL
    OR p_expected_updated_at IS NULL
  THEN
    RETURN jsonb_build_object('error', jsonb_build_object(
      'status_code', 400,
      'code', 'DOUYIN_BUDGET_PRICING_INVALID',
      'message', '报价启用参数无效'
    ));
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text, 0));
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
      'message', '仅草稿报价可以启用'
    ));
  END IF;
  IF v_version.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RETURN jsonb_build_object('error', jsonb_build_object(
      'status_code', 409,
      'code', 'DOUYIN_BUDGET_PRICING_STALE',
      'message', '报价版本已更新，请刷新后重试'
    ));
  END IF;
  IF v_now < v_version.effective_from
    OR (v_version.effective_to IS NOT NULL AND v_now >= v_version.effective_to)
  THEN
    RETURN jsonb_build_object('error', jsonb_build_object(
      'status_code', 409,
      'code', 'DOUYIN_BUDGET_PRICING_NOT_EFFECTIVE',
      'message', '当前时间不在报价有效期内'
    ));
  END IF;

  SELECT
    COUNT(DISTINCT item.item_code),
    COUNT(*) FILTER (
      WHERE public.is_valid_douyin_budget_pricing_item(
        to_jsonb(item)
          - 'id'
          - 'pricing_version_id'
          - 'created_at'
          - 'updated_at'
      )
    )
  INTO v_base_count, v_valid_base_count
  FROM public.douyin_budget_pricing_items AS item
  WHERE item.pricing_version_id = p_pricing_version_id
    AND item.status = 'active'
    AND item.item_code LIKE 'base.%';

  IF v_base_count <> 6 OR v_valid_base_count <> 6 THEN
    RETURN jsonb_build_object('error', jsonb_build_object(
      'status_code', 400,
      'code', 'DOUYIN_BUDGET_PRICING_BASE_COVERAGE_INVALID',
      'message', '启用前必须完整配置六组基础报价'
    ));
  END IF;

  UPDATE public.douyin_budget_pricing_versions AS pricing_version
  SET status = 'archived'
  WHERE pricing_version.tenant_id = p_tenant_id
    AND pricing_version.status = 'active'
    AND pricing_version.id <> p_pricing_version_id;

  UPDATE public.douyin_budget_pricing_versions AS pricing_version
  SET status = 'active'
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

CREATE FUNCTION public.archive_douyin_budget_pricing_version(
  p_tenant_id uuid,
  p_pricing_version_id uuid,
  p_expected_updated_at timestamptz
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
  THEN
    RETURN jsonb_build_object('error', jsonb_build_object(
      'status_code', 400,
      'code', 'DOUYIN_BUDGET_PRICING_INVALID',
      'message', '报价归档参数无效'
    ));
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text, 0));
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
  IF v_version.status NOT IN ('draft', 'active') THEN
    RETURN jsonb_build_object('error', jsonb_build_object(
      'status_code', 409,
      'code', 'DOUYIN_BUDGET_PRICING_NOT_ARCHIVABLE',
      'message', '当前报价版本不能归档'
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
  SET status = 'archived'
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
REVOKE ALL ON FUNCTION public.replace_douyin_budget_pricing_items(
  uuid, uuid, timestamptz, jsonb
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.activate_douyin_budget_pricing_version(
  uuid, uuid, timestamptz
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.archive_douyin_budget_pricing_version(
  uuid, uuid, timestamptz
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.create_douyin_budget_pricing_draft(
  uuid, uuid, timestamptz, timestamptz, text
) TO service_role;
GRANT EXECUTE ON FUNCTION public.replace_douyin_budget_pricing_items(
  uuid, uuid, timestamptz, jsonb
) TO service_role;
GRANT EXECUTE ON FUNCTION public.activate_douyin_budget_pricing_version(
  uuid, uuid, timestamptz
) TO service_role;
GRANT EXECUTE ON FUNCTION public.archive_douyin_budget_pricing_version(
  uuid, uuid, timestamptz
) TO service_role;

REVOKE INSERT, UPDATE, DELETE
ON TABLE public.douyin_budget_pricing_versions
FROM service_role;
REVOKE INSERT, UPDATE, DELETE
ON TABLE public.douyin_budget_pricing_items
FROM service_role;

COMMIT;
