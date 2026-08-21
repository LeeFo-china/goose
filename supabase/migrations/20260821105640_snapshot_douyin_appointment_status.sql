-- Persist the appointment status that was current when a customer source was
-- created. Existing source rows are repaired once under a bounded preflight;
-- the immutable customer-source guard remains enabled throughout.
BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE OR REPLACE FUNCTION public.douyin_measurement_source_metadata(
  p_appointment public.douyin_measurement_appointments
)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public
AS $function$
  SELECT jsonb_build_object(
    'installation_id', p_appointment.douyin_miniapp_installation_id,
    'marketing_lead_id', p_appointment.marketing_lead_id,
    'appointment_id', p_appointment.id,
    'appointment_no', p_appointment.appointment_no,
    'appointment_status', p_appointment.status,
    'community', p_appointment.community,
    'preferred_visit_date', p_appointment.preferred_visit_date,
    'preferred_visit_period', p_appointment.preferred_visit_period,
    'attribution', p_appointment.source_snapshot->'attribution',
    'budget_estimate_id', p_appointment.budget_estimate_id,
    'budget_estimate', p_appointment.source_snapshot->'budget_estimate'
  );
$function$;

REVOKE ALL ON FUNCTION public.douyin_measurement_source_metadata(
  public.douyin_measurement_appointments
) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.is_valid_douyin_measurement_source_metadata(
  p_metadata jsonb
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public
AS $function$
  SELECT jsonb_typeof(p_metadata) = 'object'
    AND p_metadata - ARRAY[
      'installation_id', 'marketing_lead_id', 'appointment_id',
      'appointment_no', 'appointment_status', 'community',
      'preferred_visit_date', 'preferred_visit_period', 'attribution',
      'budget_estimate_id', 'budget_estimate'
    ] = '{}'::jsonb
    AND NOT p_metadata ?| ARRAY[
      'request_ip', 'user_agent', 'sms_code', 'subject_hash',
      'create_request_hash'
    ]
    AND p_metadata->>'appointment_status' IN (
      'pending_confirmation', 'confirmed', 'completed', 'canceled', 'invalid'
    )
    AND jsonb_typeof(p_metadata->'attribution') = 'object'
    AND jsonb_typeof(p_metadata->'budget_estimate') IN ('object', 'null')
    AND pg_column_size(p_metadata) <= 65536;
$function$;

REVOKE ALL ON FUNCTION public.is_valid_douyin_measurement_source_metadata(jsonb)
FROM PUBLIC, anon, authenticated, service_role;

-- The temporary definition accepts only the exact metadata-only repair below.
-- It does not disable the trigger or permit service-role direct writes.
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

DO $backfill$
DECLARE
  v_backfill_limit CONSTANT bigint := 10000;
  v_backfill_count bigint;
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
      MESSAGE = 'DOUYIN_CUSTOMER_SOURCE_STATUS_BACKFILL_LIMIT_EXCEEDED',
      DETAIL = pg_catalog.format(
        'matching rows %s exceed audited migration limit %s',
        v_backfill_count,
        v_backfill_limit
      );
  END IF;
END;
$backfill$;

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

-- Restore the original immutable behavior after the audited repair.
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

COMMENT ON FUNCTION public.douyin_measurement_source_metadata(
  public.douyin_measurement_appointments
) IS 'Builds the immutable, privacy-safe customer source snapshot including appointment status.';

COMMENT ON FUNCTION public.is_valid_douyin_measurement_source_metadata(jsonb)
IS 'Validates the exact privacy-safe Douyin appointment customer source snapshot.';

COMMIT;
