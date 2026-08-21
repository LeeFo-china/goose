-- Harden nested source snapshots and replace unbounded customer-source summary
-- reads with one tenant-scoped, service-role-only aggregate command.
BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- This lock is intentionally first. It prevents old appointment commands from
-- inserting a snapshot between validator replacement and the repair pass.
LOCK TABLE public.customer_sources IN SHARE ROW EXCLUSIVE MODE;

CREATE OR REPLACE FUNCTION public.is_valid_douyin_measurement_attribution_snapshot(
  p_snapshot jsonb
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public
AS $function$
  SELECT CASE
    WHEN jsonb_typeof(p_snapshot) <> 'object' THEN false
    ELSE p_snapshot - ARRAY[
      'source_type', 'entry_path', 'scene', 'campaign_code', 'content_id'
    ] = '{}'::jsonb
      AND jsonb_typeof(p_snapshot->'source_type') = 'string'
      AND p_snapshot->>'source_type' IN (
        'short_video', 'live', 'search', 'profile', 'share', 'direct', 'other'
      )
      AND jsonb_typeof(p_snapshot->'entry_path') = 'string'
      AND p_snapshot->>'entry_path' IN (
        'pages/home/index', 'pages/company/index', 'pages/privacy/index',
        'pages/cases/index', 'pages/case-detail/index', 'pages/sites/index',
        'pages/site-detail/index', 'pages/lead/index',
        'pages/lead-success/index'
      )
      AND jsonb_typeof(p_snapshot->'scene') = 'string'
      AND p_snapshot->>'scene' ~ '^[0-9]{1,20}$'
      AND (
        NOT p_snapshot ? 'campaign_code'
        OR jsonb_typeof(p_snapshot->'campaign_code') = 'null'
        OR (
          jsonb_typeof(p_snapshot->'campaign_code') = 'string'
          AND p_snapshot->>'campaign_code' = btrim(p_snapshot->>'campaign_code')
          AND p_snapshot->>'campaign_code' ~ '^[A-Za-z0-9_-]{1,64}$'
        )
      )
      AND (
        NOT p_snapshot ? 'content_id'
        OR jsonb_typeof(p_snapshot->'content_id') = 'null'
        OR (
          jsonb_typeof(p_snapshot->'content_id') = 'string'
          AND p_snapshot->>'content_id' = btrim(p_snapshot->>'content_id')
          AND p_snapshot->>'content_id' ~ '^[A-Za-z0-9_-]{1,64}$'
        )
      )
  END;
$function$;

REVOKE ALL ON FUNCTION public.is_valid_douyin_measurement_attribution_snapshot(jsonb)
FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.is_valid_douyin_measurement_budget_ai_snapshot(
  p_snapshot jsonb
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public
AS $function$
  SELECT CASE
    WHEN jsonb_typeof(p_snapshot) = 'null' THEN true
    WHEN jsonb_typeof(p_snapshot) <> 'object' THEN false
    ELSE p_snapshot - ARRAY[
      'summary', 'allocation_advice', 'risk_factors', 'onsite_questions'
    ] = '{}'::jsonb
      AND jsonb_typeof(p_snapshot->'summary') = 'string'
      AND p_snapshot->>'summary' = btrim(p_snapshot->>'summary')
      AND char_length(p_snapshot->>'summary') BETWEEN 1 AND 1000
      AND jsonb_typeof(p_snapshot->'allocation_advice') = 'array'
      AND jsonb_array_length(p_snapshot->'allocation_advice') <= 10
      AND NOT EXISTS (
        SELECT 1
        FROM jsonb_array_elements(p_snapshot->'allocation_advice') AS item(value)
        WHERE jsonb_typeof(item.value) <> 'string'
          OR item.value #>> '{}' <> btrim(item.value #>> '{}')
          OR char_length(item.value #>> '{}') NOT BETWEEN 1 AND 300
      )
      AND jsonb_typeof(p_snapshot->'risk_factors') = 'array'
      AND jsonb_array_length(p_snapshot->'risk_factors') <= 10
      AND NOT EXISTS (
        SELECT 1
        FROM jsonb_array_elements(p_snapshot->'risk_factors') AS item(value)
        WHERE jsonb_typeof(item.value) <> 'string'
          OR item.value #>> '{}' <> btrim(item.value #>> '{}')
          OR char_length(item.value #>> '{}') NOT BETWEEN 1 AND 300
      )
      AND jsonb_typeof(p_snapshot->'onsite_questions') = 'array'
      AND jsonb_array_length(p_snapshot->'onsite_questions') <= 10
      AND NOT EXISTS (
        SELECT 1
        FROM jsonb_array_elements(p_snapshot->'onsite_questions') AS item(value)
        WHERE jsonb_typeof(item.value) <> 'string'
          OR item.value #>> '{}' <> btrim(item.value #>> '{}')
          OR char_length(item.value #>> '{}') NOT BETWEEN 1 AND 300
      )
  END;
$function$;

REVOKE ALL ON FUNCTION public.is_valid_douyin_measurement_budget_ai_snapshot(jsonb)
FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.is_valid_douyin_measurement_budget_result_snapshot(
  p_snapshot jsonb
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public
AS $function$
  SELECT CASE
    WHEN jsonb_typeof(p_snapshot) <> 'object' THEN false
    ELSE p_snapshot - ARRAY[
      'id', 'estimate_no', 'minimum_total', 'maximum_total', 'categories',
      'calculation_basis', 'included_items', 'excluded_items',
      'pricing_version', 'pricing_effective_from', 'pricing_effective_to',
      'disclaimer', 'ai_status'
    ] = '{}'::jsonb
      AND jsonb_typeof(p_snapshot->'id') = 'string'
      AND p_snapshot->>'id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      AND jsonb_typeof(p_snapshot->'estimate_no') = 'string'
      AND p_snapshot->>'estimate_no' ~ '^DYYS-[0-9]{8}-[0-9]{6}$'
      AND jsonb_typeof(p_snapshot->'minimum_total') = 'number'
      AND (p_snapshot->>'minimum_total')::numeric >= 0
      AND trunc((p_snapshot->>'minimum_total')::numeric) =
        (p_snapshot->>'minimum_total')::numeric
      AND jsonb_typeof(p_snapshot->'maximum_total') = 'number'
      AND (p_snapshot->>'maximum_total')::numeric >=
        (p_snapshot->>'minimum_total')::numeric
      AND trunc((p_snapshot->>'maximum_total')::numeric) =
        (p_snapshot->>'maximum_total')::numeric
      AND jsonb_typeof(p_snapshot->'categories') = 'array'
      AND jsonb_array_length(p_snapshot->'categories') <= 5
      AND NOT EXISTS (
        SELECT 1
        FROM jsonb_array_elements(p_snapshot->'categories') AS category(value)
        WHERE jsonb_typeof(category.value) <> 'object'
          OR category.value - ARRAY[
            'category_code', 'label', 'minimum_amount', 'maximum_amount'
          ] <> '{}'::jsonb
          OR jsonb_typeof(category.value->'category_code') <> 'string'
          OR category.value->>'category_code' NOT IN (
            'base', 'water_electricity', 'materials', 'custom', 'other'
          )
          OR jsonb_typeof(category.value->'label') <> 'string'
          OR category.value->>'label' <> btrim(category.value->>'label')
          OR char_length(category.value->>'label') NOT BETWEEN 1 AND 40
          OR jsonb_typeof(category.value->'minimum_amount') <> 'number'
          OR (category.value->>'minimum_amount')::numeric < 0
          OR trunc((category.value->>'minimum_amount')::numeric) <>
            (category.value->>'minimum_amount')::numeric
          OR jsonb_typeof(category.value->'maximum_amount') <> 'number'
          OR (category.value->>'maximum_amount')::numeric <
            (category.value->>'minimum_amount')::numeric
          OR trunc((category.value->>'maximum_amount')::numeric) <>
            (category.value->>'maximum_amount')::numeric
      )
      AND jsonb_typeof(p_snapshot->'calculation_basis') = 'array'
      AND jsonb_array_length(p_snapshot->'calculation_basis') <= 20
      AND NOT EXISTS (
        SELECT 1
        FROM jsonb_array_elements(p_snapshot->'calculation_basis') AS item(value)
        WHERE jsonb_typeof(item.value) <> 'string'
          OR item.value #>> '{}' <> btrim(item.value #>> '{}')
          OR char_length(item.value #>> '{}') NOT BETWEEN 1 AND 300
      )
      AND jsonb_typeof(p_snapshot->'included_items') = 'array'
      AND jsonb_array_length(p_snapshot->'included_items') <= 50
      AND NOT EXISTS (
        SELECT 1
        FROM jsonb_array_elements(p_snapshot->'included_items') AS item(value)
        WHERE jsonb_typeof(item.value) <> 'string'
          OR item.value #>> '{}' <> btrim(item.value #>> '{}')
          OR char_length(item.value #>> '{}') NOT BETWEEN 1 AND 300
      )
      AND jsonb_typeof(p_snapshot->'excluded_items') = 'array'
      AND jsonb_array_length(p_snapshot->'excluded_items') <= 50
      AND NOT EXISTS (
        SELECT 1
        FROM jsonb_array_elements(p_snapshot->'excluded_items') AS item(value)
        WHERE jsonb_typeof(item.value) <> 'string'
          OR item.value #>> '{}' <> btrim(item.value #>> '{}')
          OR char_length(item.value #>> '{}') NOT BETWEEN 1 AND 300
      )
      AND jsonb_typeof(p_snapshot->'pricing_version') = 'string'
      AND p_snapshot->>'pricing_version' = btrim(p_snapshot->>'pricing_version')
      AND char_length(p_snapshot->>'pricing_version') BETWEEN 1 AND 40
      AND jsonb_typeof(p_snapshot->'pricing_effective_from') = 'string'
      AND char_length(p_snapshot->>'pricing_effective_from') BETWEEN 1 AND 64
      AND (
        jsonb_typeof(p_snapshot->'pricing_effective_to') = 'null'
        OR (
          jsonb_typeof(p_snapshot->'pricing_effective_to') = 'string'
          AND char_length(p_snapshot->>'pricing_effective_to') BETWEEN 1 AND 64
        )
      )
      AND jsonb_typeof(p_snapshot->'disclaimer') = 'string'
      AND p_snapshot->>'disclaimer' = btrim(p_snapshot->>'disclaimer')
      AND char_length(p_snapshot->>'disclaimer') BETWEEN 1 AND 500
      AND jsonb_typeof(p_snapshot->'ai_status') = 'string'
      AND p_snapshot->>'ai_status' IN (
        'pending', 'succeeded', 'failed', 'skipped'
      )
  END;
$function$;

REVOKE ALL ON FUNCTION public.is_valid_douyin_measurement_budget_result_snapshot(jsonb)
FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.is_valid_douyin_measurement_budget_estimate_snapshot(
  p_snapshot jsonb
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public
AS $function$
  SELECT CASE
    WHEN jsonb_typeof(p_snapshot) = 'null' THEN true
    WHEN jsonb_typeof(p_snapshot) <> 'object' THEN false
    ELSE p_snapshot - ARRAY[
      'estimate_no', 'result', 'ai_status', 'ai_analysis', 'expired'
    ] = '{}'::jsonb
      AND jsonb_typeof(p_snapshot->'estimate_no') = 'string'
      AND p_snapshot->>'estimate_no' ~ '^DYYS-[0-9]{8}-[0-9]{6}$'
      AND public.is_valid_douyin_measurement_budget_result_snapshot(
        p_snapshot->'result'
      )
      AND jsonb_typeof(p_snapshot->'ai_status') = 'string'
      AND p_snapshot->>'ai_status' IN (
        'pending', 'succeeded', 'failed', 'skipped'
      )
      AND public.is_valid_douyin_measurement_budget_ai_snapshot(
        p_snapshot->'ai_analysis'
      )
      AND (
        (p_snapshot->>'ai_status' = 'succeeded'
          AND jsonb_typeof(p_snapshot->'ai_analysis') = 'object')
        OR (p_snapshot->>'ai_status' <> 'succeeded'
          AND jsonb_typeof(p_snapshot->'ai_analysis') = 'null')
      )
      AND jsonb_typeof(p_snapshot->'expired') = 'boolean'
  END;
$function$;

REVOKE ALL ON FUNCTION public.is_valid_douyin_measurement_budget_estimate_snapshot(jsonb)
FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.is_valid_douyin_measurement_source_metadata(
  p_metadata jsonb
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public
AS $function$
  SELECT CASE
    WHEN jsonb_typeof(p_metadata) <> 'object' THEN false
    ELSE p_metadata - ARRAY[
      'installation_id', 'marketing_lead_id', 'appointment_id',
      'appointment_no', 'appointment_status', 'community',
      'preferred_visit_date', 'preferred_visit_period', 'attribution',
      'budget_estimate_id', 'budget_estimate'
    ] = '{}'::jsonb
      AND NOT p_metadata ?| ARRAY[
        'request_ip', 'user_agent', 'sms_code', 'subject_hash',
        'create_request_hash', 'raw_response', 'condition_payload'
      ]
      AND jsonb_typeof(p_metadata->'installation_id') = 'string'
      AND jsonb_typeof(p_metadata->'marketing_lead_id') = 'string'
      AND jsonb_typeof(p_metadata->'appointment_id') = 'string'
      AND jsonb_typeof(p_metadata->'appointment_no') = 'string'
      AND p_metadata->>'appointment_no' ~ '^DYLF-[0-9]{8}-[0-9]{6}$'
      AND p_metadata->>'appointment_status' IN (
        'pending_confirmation', 'confirmed', 'completed', 'canceled', 'invalid'
      )
      AND jsonb_typeof(p_metadata->'community') = 'string'
      AND p_metadata->>'community' = btrim(p_metadata->>'community')
      AND char_length(p_metadata->>'community') BETWEEN 1 AND 80
      AND jsonb_typeof(p_metadata->'preferred_visit_date') = 'string'
      AND p_metadata->>'preferred_visit_date' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      AND p_metadata->>'preferred_visit_period' IN (
        'morning', 'afternoon', 'evening'
      )
      AND public.is_valid_douyin_measurement_attribution_snapshot(
        p_metadata->'attribution'
      )
      AND (
        (jsonb_typeof(p_metadata->'budget_estimate_id') = 'null'
          AND jsonb_typeof(p_metadata->'budget_estimate') = 'null')
        OR (
          jsonb_typeof(p_metadata->'budget_estimate_id') = 'string'
          AND public.is_valid_douyin_measurement_budget_estimate_snapshot(
            p_metadata->'budget_estimate'
          )
          AND jsonb_typeof(p_metadata->'budget_estimate') = 'object'
        )
      )
      AND pg_column_size(p_metadata) <= 65536
  END;
$function$;

REVOKE ALL ON FUNCTION public.is_valid_douyin_measurement_source_metadata(jsonb)
FROM PUBLIC, anon, authenticated, service_role;

-- The temporary trigger body accepts only the exact owner-run status repair.
-- The trigger remains installed and enabled while the table lock is held.
CREATE OR REPLACE FUNCTION public.douyin_measurement_customer_source_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_table_owner name;
  v_is_measurement boolean;
BEGIN
  SELECT pg_catalog.pg_get_userbyid(class.relowner)
  INTO v_table_owner
  FROM pg_catalog.pg_class AS class
  WHERE class.oid = TG_RELID;

  v_is_measurement := CASE TG_OP
    WHEN 'INSERT' THEN NEW.douyin_measurement_appointment_id IS NOT NULL
    WHEN 'DELETE' THEN OLD.douyin_measurement_appointment_id IS NOT NULL
    ELSE OLD.douyin_measurement_appointment_id IS NOT NULL
      OR NEW.douyin_measurement_appointment_id IS NOT NULL
  END;

  IF v_is_measurement
    AND TG_OP = 'UPDATE'
    AND current_user = v_table_owner
    AND to_jsonb(NEW) - 'metadata' = to_jsonb(OLD) - 'metadata'
    AND NEW.metadata - 'appointment_status' = OLD.metadata - 'appointment_status'
    AND public.is_valid_douyin_measurement_source_metadata(NEW.metadata)
      IS TRUE
    AND EXISTS (
      SELECT 1
      FROM public.douyin_measurement_appointments AS appointment
      WHERE appointment.id = NEW.douyin_measurement_appointment_id
        AND appointment.tenant_id = NEW.tenant_id
        AND appointment.marketing_lead_id = NEW.marketing_lead_id
        AND appointment.status = NEW.metadata->>'appointment_status'
    )
  THEN
    RETURN NEW;
  END IF;

  IF v_is_measurement AND TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'DOUYIN_MEASUREMENT_CUSTOMER_SOURCE_IMMUTABLE';
  END IF;

  IF v_is_measurement AND current_user <> v_table_owner THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'DOUYIN_MEASUREMENT_CUSTOMER_SOURCE_DIRECT_WRITE_FORBIDDEN';
  END IF;

  IF v_is_measurement AND (
    NEW.source IS DISTINCT FROM 'douyin_miniapp'
    OR NEW.source_label IS DISTINCT FROM '抖音小程序'
    OR NEW.marketing_lead_id IS NULL
    OR public.is_valid_douyin_measurement_source_metadata(NEW.metadata)
      IS NOT TRUE
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'DOUYIN_MEASUREMENT_CUSTOMER_SOURCE_INVALID';
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$function$;

REVOKE ALL ON FUNCTION public.douyin_measurement_customer_source_guard()
FROM PUBLIC, anon, authenticated, service_role;

DO $preflight$
DECLARE
  v_backfill_limit CONSTANT bigint := 10000;
  v_backfill_count bigint;
  v_invalid_count bigint;
BEGIN
  SELECT count(*)
  INTO v_backfill_count
  FROM public.customer_sources AS source
  JOIN public.douyin_measurement_appointments AS appointment
    ON appointment.id = source.douyin_measurement_appointment_id
   AND appointment.tenant_id = source.tenant_id
   AND appointment.marketing_lead_id = source.marketing_lead_id
  WHERE source.source = 'douyin_miniapp'
    AND source.source_label = '抖音小程序'
    AND source.metadata->>'appointment_status' IS DISTINCT FROM appointment.status;

  IF v_backfill_count > v_backfill_limit THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'DOUYIN_CUSTOMER_SOURCE_STATUS_BACKFILL_LIMIT_EXCEEDED';
  END IF;

  SELECT count(*)
  INTO v_invalid_count
  FROM public.customer_sources AS source
  JOIN public.douyin_measurement_appointments AS appointment
    ON appointment.id = source.douyin_measurement_appointment_id
   AND appointment.tenant_id = source.tenant_id
   AND appointment.marketing_lead_id = source.marketing_lead_id
  WHERE source.source = 'douyin_miniapp'
    AND source.source_label = '抖音小程序'
    AND public.is_valid_douyin_measurement_source_metadata(
      source.metadata || pg_catalog.jsonb_build_object(
        'appointment_status', appointment.status
      )
    ) IS NOT TRUE;

  IF v_invalid_count > 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'DOUYIN_CUSTOMER_SOURCE_UNSAFE_SNAPSHOT_FOUND';
  END IF;
END;
$preflight$;

UPDATE public.customer_sources AS source
SET metadata = source.metadata || pg_catalog.jsonb_build_object(
  'appointment_status', appointment.status
)
FROM public.douyin_measurement_appointments AS appointment
WHERE source.douyin_measurement_appointment_id = appointment.id
  AND source.tenant_id = appointment.tenant_id
  AND source.marketing_lead_id = appointment.marketing_lead_id
  AND source.source = 'douyin_miniapp'
  AND source.source_label = '抖音小程序'
  AND source.metadata->>'appointment_status' IS DISTINCT FROM appointment.status;

-- Restore the fully immutable customer-source guard.
CREATE OR REPLACE FUNCTION public.douyin_measurement_customer_source_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_table_owner name;
  v_is_measurement boolean;
BEGIN
  SELECT pg_catalog.pg_get_userbyid(class.relowner)
  INTO v_table_owner
  FROM pg_catalog.pg_class AS class
  WHERE class.oid = TG_RELID;

  v_is_measurement := CASE TG_OP
    WHEN 'INSERT' THEN NEW.douyin_measurement_appointment_id IS NOT NULL
    WHEN 'DELETE' THEN OLD.douyin_measurement_appointment_id IS NOT NULL
    ELSE OLD.douyin_measurement_appointment_id IS NOT NULL
      OR NEW.douyin_measurement_appointment_id IS NOT NULL
  END;

  IF v_is_measurement AND TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'DOUYIN_MEASUREMENT_CUSTOMER_SOURCE_IMMUTABLE';
  END IF;

  IF v_is_measurement AND current_user <> v_table_owner THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'DOUYIN_MEASUREMENT_CUSTOMER_SOURCE_DIRECT_WRITE_FORBIDDEN';
  END IF;

  IF v_is_measurement AND (
    NEW.source IS DISTINCT FROM 'douyin_miniapp'
    OR NEW.source_label IS DISTINCT FROM '抖音小程序'
    OR NEW.marketing_lead_id IS NULL
    OR public.is_valid_douyin_measurement_source_metadata(NEW.metadata)
      IS NOT TRUE
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'DOUYIN_MEASUREMENT_CUSTOMER_SOURCE_INVALID';
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$function$;

REVOKE ALL ON FUNCTION public.douyin_measurement_customer_source_guard()
FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.list_customer_source_summaries(
  p_tenant_id uuid,
  p_customer_ids uuid[]
)
RETURNS TABLE (
  customer_id uuid,
  total bigint,
  latest_source jsonb,
  has_old_customer_new_lead boolean,
  has_platform_new_lead boolean,
  has_employee_share boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
BEGIN
  IF p_tenant_id IS NULL
    OR p_customer_ids IS NULL
    OR cardinality(p_customer_ids) = 0
    OR cardinality(p_customer_ids) > 100
    OR EXISTS (SELECT 1 FROM unnest(p_customer_ids) AS value WHERE value IS NULL)
    OR (
      SELECT count(DISTINCT requested.customer_id)
      FROM unnest(p_customer_ids) AS requested(customer_id)
    ) <> cardinality(p_customer_ids)
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'CUSTOMER_SOURCE_SUMMARY_INPUT_INVALID';
  END IF;

  RETURN QUERY
  WITH requested AS (
    SELECT unnest(p_customer_ids) AS customer_id
  ), aggregate_source AS (
    SELECT
      requested.customer_id,
      count(source.id) AS total,
      coalesce(bool_or(
        source.source = 'platform_lead'
        AND source.metadata->>'dedupe_result' = 'existing_customer'
      ), false) AS has_old_customer_new_lead,
      coalesce(bool_or(
        source.source = 'platform_lead'
        AND source.metadata->>'dedupe_result' = 'created_customer'
      ), false) AS has_platform_new_lead,
      coalesce(bool_or(source.source IN (
        'employee_share', 'h5_campaign', 'quote_form', 'miniprogram_qrcode'
      )), false) AS has_employee_share
    FROM requested
    LEFT JOIN public.customer_sources AS source
      ON source.tenant_id = p_tenant_id
     AND source.customer_id = requested.customer_id
    GROUP BY requested.customer_id
  )
  SELECT
    aggregate_source.customer_id,
    aggregate_source.total,
    latest.latest_source,
    aggregate_source.has_old_customer_new_lead,
    aggregate_source.has_platform_new_lead,
    aggregate_source.has_employee_share
  FROM aggregate_source
  LEFT JOIN LATERAL (
    SELECT jsonb_build_object(
      'id', latest.id,
      'tenant_id', latest.tenant_id,
      'customer_id', latest.customer_id,
      'source', latest.source,
      'source_label', latest.source_label,
      'platform_lead_id', latest.platform_lead_id,
      'assigned_by_employee_id', latest.assigned_by_employee_id,
      'assigned_at', latest.assigned_at,
      'metadata', latest.metadata,
      'created_at', latest.created_at,
      'source_employee_id', latest.source_employee_id,
      'related_type', latest.related_type,
      'related_id', latest.related_id,
      'share_link_id', latest.share_link_id,
      'marketing_lead_id', latest.marketing_lead_id,
      'douyin_measurement_appointment_id',
        latest.douyin_measurement_appointment_id
    ) AS latest_source
    FROM public.customer_sources AS latest
    WHERE latest.tenant_id = p_tenant_id
      AND latest.customer_id = aggregate_source.customer_id
    ORDER BY latest.created_at DESC, latest.id DESC
    LIMIT 1
  ) AS latest ON true;
END;
$function$;

REVOKE ALL ON FUNCTION public.list_customer_source_summaries(uuid, uuid[])
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_customer_source_summaries(uuid, uuid[])
TO service_role;

COMMENT ON FUNCTION public.list_customer_source_summaries(uuid, uuid[])
IS 'Returns one bounded tenant-scoped source summary and latest source per customer.';

COMMIT;
