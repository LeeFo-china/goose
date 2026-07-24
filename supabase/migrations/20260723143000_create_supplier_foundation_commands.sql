-- Rollback: in a new migration, first DROP VIEW IF EXISTS public.platform_supplier_directory
-- and DROP INDEX IF EXISTS
-- public.suppliers_available_directory_idx, then revoke and drop the nineteen
-- supplier command functions plus the internal set-based eligibility helper,
-- including create_supplier_contract and list_tenant_suppliers_for_tenant.
-- Preserve/export supplier_command_events before
-- dropping the ledger because it is the lifecycle audit source of truth.

BEGIN;

CREATE TABLE public.supplier_command_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  resource_type text NOT NULL CHECK (
    resource_type IN (
      'supplier',
      'supplier_qualification_type',
      'supplier_qualification',
      'supplier_service_region',
      'supplier_address',
      'supplier_contact',
      'catalog_category',
      'catalog_brand',
      'catalog_unit',
      'tenant_supplier',
      'supplier_contract'
    )
  ),
  resource_id uuid NOT NULL,
  command text NOT NULL,
  from_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  to_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  reason text NULL,
  actor_user_id uuid NOT NULL,
  actor_employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT,
  idempotency_key text NOT NULL CHECK (
    btrim(idempotency_key) <> '' AND char_length(idempotency_key) <= 120
  ),
  result_version integer NOT NULL CHECK (result_version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (actor_user_id, idempotency_key)
);

ALTER TABLE public.supplier_command_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_command_events FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.supplier_command_events FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT ON TABLE public.supplier_command_events TO service_role;
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE public.supplier_command_events FROM PUBLIC, anon, authenticated, service_role;

CREATE INDEX suppliers_available_directory_idx
ON public.suppliers(onboarding_status, operational_status, name, id);

CREATE VIEW public.platform_supplier_directory
WITH (security_invoker = true)
AS
WITH required_types AS (
  SELECT
    supplier.id AS supplier_id,
    qualification_type.id AS qualification_type_id,
    qualification_type.warning_days
  FROM public.suppliers AS supplier
  JOIN public.supplier_qualification_types AS qualification_type
    ON qualification_type.status = 'active'
    AND qualification_type.is_required
    AND (
      cardinality(qualification_type.applicable_supplier_types) = 0
      OR supplier.supplier_type = ANY (qualification_type.applicable_supplier_types)
    )
),
required_type_documents AS (
  SELECT
    required_type.supplier_id,
    required_type.qualification_type_id,
    bool_or(
      qualification.verification_status = 'verified'
      AND (qualification.valid_from IS NULL OR qualification.valid_from <= CURRENT_DATE)
      AND (qualification.valid_until IS NULL OR qualification.valid_until >= CURRENT_DATE)
    ) AS has_current_verified,
    bool_or(
      qualification.verification_status = 'verified'
      AND (qualification.valid_from IS NULL OR qualification.valid_from <= CURRENT_DATE)
      AND (qualification.valid_until IS NULL OR qualification.valid_until >= CURRENT_DATE)
      AND (
        qualification.valid_until IS NULL
        OR qualification.valid_until > CURRENT_DATE + required_type.warning_days
      )
    ) AS has_long_valid_verified,
    bool_or(
      qualification.verification_status = 'verified'
    ) AS has_verified,
    bool_and(
      qualification.valid_until IS NOT NULL
      AND qualification.valid_until < CURRENT_DATE
    ) FILTER (WHERE qualification.verification_status = 'verified')
      AS all_verified_expired
  FROM required_types AS required_type
  LEFT JOIN public.supplier_qualifications AS qualification
    ON qualification.supplier_id = required_type.supplier_id
    AND qualification.qualification_type_id = required_type.qualification_type_id
  GROUP BY required_type.supplier_id,
    required_type.qualification_type_id,
    required_type.warning_days
),
required_type_health AS (
  SELECT
    required_type_document.supplier_id,
    required_type_document.qualification_type_id,
    CASE
      WHEN COALESCE(required_type_document.has_long_valid_verified, false)
        THEN 'valid'
      WHEN COALESCE(required_type_document.has_current_verified, false)
        THEN 'expiring'
      WHEN COALESCE(required_type_document.has_verified, false)
        AND COALESCE(required_type_document.all_verified_expired, false)
        THEN 'expired'
      ELSE 'missing'
    END AS qualification_health
  FROM required_type_documents AS required_type_document
),
supplier_health AS (
  SELECT
    supplier.id AS supplier_id,
    CASE
      WHEN COUNT(required_type_health.qualification_type_id) = 0 THEN 'valid'
      WHEN bool_or(required_type_health.qualification_health = 'missing') THEN 'missing'
      WHEN bool_or(required_type_health.qualification_health = 'expired') THEN 'expired'
      WHEN bool_or(required_type_health.qualification_health = 'expiring') THEN 'expiring'
      ELSE 'valid'
    END AS qualification_health
  FROM public.suppliers AS supplier
  LEFT JOIN required_type_health
    ON required_type_health.supplier_id = supplier.id
  GROUP BY supplier.id
)
SELECT
  supplier.id,
  supplier.code,
  supplier.name,
  supplier.legal_name,
  supplier.unified_social_credit_code,
  supplier.supplier_type,
  supplier.onboarding_status,
  supplier.operational_status,
  supplier.version,
  supplier.created_at,
  supplier.updated_at,
  supplier_health.qualification_health
FROM public.suppliers AS supplier
JOIN supplier_health
  ON supplier_health.supplier_id = supplier.id;

CREATE FUNCTION public.create_platform_supplier(
  p_supplier_id uuid,
  p_code text,
  p_name text,
  p_legal_name text,
  p_unified_social_credit_code text,
  p_supplier_type text,
  p_expected_version integer,
  p_actor_user_id uuid,
  p_actor_employee_id uuid,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_event public.supplier_command_events%ROWTYPE;
  v_supplier public.suppliers%ROWTYPE;
  v_request jsonb;
BEGIN
  IF p_supplier_id IS NULL OR p_actor_user_id IS NULL OR p_actor_employee_id IS NULL
    OR p_expected_version IS DISTINCT FROM 0
    OR p_idempotency_key IS NULL OR btrim(p_idempotency_key) = ''
    OR char_length(p_idempotency_key) > 120
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SUPPLIER_VERSION_CONFLICT';
  END IF;
  v_request := jsonb_build_object(
    'code', p_code, 'name', p_name,
    'legal_name', p_legal_name,
    'unified_social_credit_code', p_unified_social_credit_code,
    'supplier_type', p_supplier_type, 'expected_version', p_expected_version,
    'actor_employee_id', p_actor_employee_id
  );

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('supplier-command:' || p_actor_user_id::text || ':' || p_idempotency_key, 0)
  );
  SELECT event.* INTO v_event
  FROM public.supplier_command_events AS event
  WHERE event.actor_user_id = p_actor_user_id
    AND event.idempotency_key = p_idempotency_key
  FOR UPDATE;
  IF FOUND THEN
    IF v_event.from_state -> '_request' IS DISTINCT FROM v_request
      OR v_event.resource_type <> 'supplier'
      OR v_event.command <> 'create_platform_supplier'
    THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SUPPLIER_IDEMPOTENCY_CONFLICT';
    END IF;
    RETURN jsonb_build_object('status', 'created', 'idempotent', true, 'supplier', v_event.to_state, 'version', v_event.result_version);
  END IF;

  IF EXISTS (SELECT 1 FROM public.suppliers AS supplier WHERE supplier.id = p_supplier_id OR supplier.code = p_code) THEN
    RETURN jsonb_build_object('status', 'state_conflict', 'error_code', 'SUPPLIER_STATE_CONFLICT');
  END IF;

  BEGIN
    INSERT INTO public.suppliers (
      id, code, name, legal_name, unified_social_credit_code, supplier_type,
      onboarding_status, operational_status, version,
      created_by_employee_id, updated_by_employee_id
    )
    VALUES (
      p_supplier_id, p_code, p_name, p_legal_name, p_unified_social_credit_code,
      p_supplier_type, 'draft', 'active', 1, p_actor_employee_id, p_actor_employee_id
    )
    RETURNING * INTO v_supplier;
  EXCEPTION
    WHEN unique_violation THEN
      RETURN jsonb_build_object(
        'status', 'state_conflict',
        'error_code', 'SUPPLIER_STATE_CONFLICT'
      );
  END;

  INSERT INTO public.supplier_command_events (
    resource_type, resource_id, command, from_state, to_state,
    actor_user_id, actor_employee_id, idempotency_key, result_version
  )
  VALUES (
    'supplier', v_supplier.id, 'create_platform_supplier',
    jsonb_build_object('_request', v_request),
    to_jsonb(v_supplier), p_actor_user_id, p_actor_employee_id, p_idempotency_key, v_supplier.version
  );
  RETURN jsonb_build_object('status', 'created', 'idempotent', false, 'supplier', to_jsonb(v_supplier), 'version', v_supplier.version);
END;
$$;

CREATE FUNCTION public.create_supplier_qualification_type(
  p_qualification_type_id uuid,
  p_code text,
  p_name text,
  p_applicable_supplier_types text[],
  p_warning_days integer,
  p_is_required boolean,
  p_blocks_new_orders boolean,
  p_status text,
  p_sort_order integer,
  p_actor_user_id uuid,
  p_actor_employee_id uuid,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_event public.supplier_command_events%ROWTYPE;
  v_type public.supplier_qualification_types%ROWTYPE;
  v_request jsonb;
BEGIN
  IF p_qualification_type_id IS NULL OR p_actor_user_id IS NULL
    OR p_actor_employee_id IS NULL OR p_idempotency_key IS NULL
    OR btrim(p_idempotency_key) = '' OR char_length(p_idempotency_key) > 120
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SUPPLIER_STATE_CONFLICT';
  END IF;
  v_request := jsonb_build_object(
    'code', p_code, 'name', p_name,
    'applicable_supplier_types', p_applicable_supplier_types,
    'warning_days', p_warning_days, 'is_required', p_is_required,
    'blocks_new_orders', p_blocks_new_orders, 'status', p_status,
    'sort_order', p_sort_order, 'actor_employee_id', p_actor_employee_id
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('supplier-command:' || p_actor_user_id::text || ':' || p_idempotency_key, 0)
  );
  SELECT event.* INTO v_event
  FROM public.supplier_command_events AS event
  WHERE event.actor_user_id = p_actor_user_id
    AND event.idempotency_key = p_idempotency_key
  FOR UPDATE;
  IF FOUND THEN
    IF v_event.from_state -> '_request' IS DISTINCT FROM v_request
      OR v_event.resource_type <> 'supplier_qualification_type'
      OR v_event.command <> 'create_supplier_qualification_type'
    THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SUPPLIER_IDEMPOTENCY_CONFLICT';
    END IF;
    RETURN jsonb_build_object('status', 'created', 'idempotent', true, 'qualification_type', v_event.to_state, 'version', v_event.result_version);
  END IF;
  BEGIN
    INSERT INTO public.supplier_qualification_types (
      id, code, name, applicable_supplier_types, warning_days, is_required,
      blocks_new_orders, status, sort_order, version
    ) VALUES (
      p_qualification_type_id, p_code, p_name, p_applicable_supplier_types,
      p_warning_days, p_is_required, p_blocks_new_orders, p_status,
      p_sort_order, 1
    ) RETURNING * INTO v_type;
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('status', 'state_conflict', 'error_code', 'SUPPLIER_STATE_CONFLICT');
  END;
  INSERT INTO public.supplier_command_events (
    resource_type, resource_id, command, from_state, to_state,
    actor_user_id, actor_employee_id, idempotency_key, result_version
  ) VALUES (
    'supplier_qualification_type', v_type.id,
    'create_supplier_qualification_type',
    jsonb_build_object('_request', v_request), to_jsonb(v_type),
    p_actor_user_id, p_actor_employee_id, p_idempotency_key, v_type.version
  );
  RETURN jsonb_build_object('status', 'created', 'idempotent', false, 'qualification_type', to_jsonb(v_type), 'version', v_type.version);
END;
$$;

CREATE FUNCTION public.create_supplier_qualification(
  p_qualification_id uuid,
  p_supplier_id uuid,
  p_qualification_type_id uuid,
  p_document_file_id uuid,
  p_certificate_no text,
  p_valid_from date,
  p_valid_until date,
  p_actor_user_id uuid,
  p_actor_employee_id uuid,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_event public.supplier_command_events%ROWTYPE;
  v_qualification public.supplier_qualifications%ROWTYPE;
  v_request jsonb;
BEGIN
  IF p_qualification_id IS NULL OR p_supplier_id IS NULL
    OR p_actor_user_id IS NULL OR p_actor_employee_id IS NULL
    OR p_idempotency_key IS NULL OR btrim(p_idempotency_key) = ''
    OR char_length(p_idempotency_key) > 120
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SUPPLIER_STATE_CONFLICT';
  END IF;
  v_request := jsonb_build_object(
    'supplier_id', p_supplier_id,
    'qualification_type_id', p_qualification_type_id,
    'document_file_id', p_document_file_id,
    'certificate_no', p_certificate_no, 'valid_from', p_valid_from,
    'valid_until', p_valid_until, 'actor_employee_id', p_actor_employee_id
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('supplier-command:' || p_actor_user_id::text || ':' || p_idempotency_key, 0)
  );
  SELECT event.* INTO v_event
  FROM public.supplier_command_events AS event
  WHERE event.actor_user_id = p_actor_user_id
    AND event.idempotency_key = p_idempotency_key
  FOR UPDATE;
  IF FOUND THEN
    IF v_event.from_state -> '_request' IS DISTINCT FROM v_request
      OR v_event.resource_type <> 'supplier_qualification'
      OR v_event.command <> 'create_supplier_qualification'
    THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SUPPLIER_IDEMPOTENCY_CONFLICT';
    END IF;
    RETURN jsonb_build_object('status', 'created', 'idempotent', true, 'qualification', v_event.to_state, 'version', v_event.result_version);
  END IF;
  PERFORM 1 FROM public.suppliers AS supplier
  WHERE supplier.id = p_supplier_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'supplier_not_found', 'error_code', 'SUPPLIER_NOT_FOUND');
  END IF;
  PERFORM 1 FROM public.supplier_qualification_types AS qualification_type
  WHERE qualification_type.id = p_qualification_type_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'state_conflict', 'error_code', 'SUPPLIER_STATE_CONFLICT');
  END IF;
  BEGIN
    INSERT INTO public.supplier_qualifications (
      id, supplier_id, qualification_type_id, document_file_id,
      certificate_no, valid_from, valid_until, verification_status, version,
      created_by_employee_id, updated_by_employee_id
    ) VALUES (
      p_qualification_id, p_supplier_id, p_qualification_type_id,
      p_document_file_id, p_certificate_no, p_valid_from, p_valid_until,
      'pending', 1, p_actor_employee_id, p_actor_employee_id
    ) RETURNING * INTO v_qualification;
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('status', 'state_conflict', 'error_code', 'SUPPLIER_STATE_CONFLICT');
  END;
  INSERT INTO public.supplier_command_events (
    resource_type, resource_id, command, from_state, to_state,
    actor_user_id, actor_employee_id, idempotency_key, result_version
  ) VALUES (
    'supplier_qualification', v_qualification.id,
    'create_supplier_qualification',
    jsonb_build_object('_request', v_request), to_jsonb(v_qualification),
    p_actor_user_id, p_actor_employee_id, p_idempotency_key,
    v_qualification.version
  );
  RETURN jsonb_build_object('status', 'created', 'idempotent', false, 'qualification', to_jsonb(v_qualification), 'version', v_qualification.version);
END;
$$;

CREATE FUNCTION public.create_supplier_service_region(
  p_region_id uuid,
  p_supplier_id uuid,
  p_region_code text,
  p_region_level text,
  p_status text,
  p_valid_from date,
  p_valid_until date,
  p_actor_user_id uuid,
  p_actor_employee_id uuid,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_event public.supplier_command_events%ROWTYPE;
  v_region public.supplier_service_regions%ROWTYPE;
  v_request jsonb;
BEGIN
  IF p_region_id IS NULL OR p_supplier_id IS NULL OR p_actor_user_id IS NULL
    OR p_actor_employee_id IS NULL OR p_idempotency_key IS NULL
    OR btrim(p_idempotency_key) = '' OR char_length(p_idempotency_key) > 120
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SUPPLIER_STATE_CONFLICT';
  END IF;
  v_request := jsonb_build_object(
    'supplier_id', p_supplier_id, 'region_code', p_region_code,
    'region_level', p_region_level, 'status', p_status,
    'valid_from', p_valid_from, 'valid_until', p_valid_until,
    'actor_employee_id', p_actor_employee_id
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('supplier-command:' || p_actor_user_id::text || ':' || p_idempotency_key, 0)
  );
  SELECT event.* INTO v_event
  FROM public.supplier_command_events AS event
  WHERE event.actor_user_id = p_actor_user_id
    AND event.idempotency_key = p_idempotency_key
  FOR UPDATE;
  IF FOUND THEN
    IF v_event.from_state -> '_request' IS DISTINCT FROM v_request
      OR v_event.resource_type <> 'supplier_service_region'
      OR v_event.command <> 'create_supplier_service_region'
    THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SUPPLIER_IDEMPOTENCY_CONFLICT';
    END IF;
    RETURN jsonb_build_object('status', 'created', 'idempotent', true, 'service_region', v_event.to_state, 'version', v_event.result_version);
  END IF;
  PERFORM 1
  FROM public.administrative_areas AS area
  WHERE area.adcode = p_region_code
    AND area.status = 'active'
    AND area.level = p_region_level
  FOR SHARE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'status', 'validation_error',
      'error_code', 'VALIDATION_ERROR',
      'reason', '行政区划不存在、已停用或级别不匹配'
    );
  END IF;
  PERFORM 1 FROM public.suppliers AS supplier
  WHERE supplier.id = p_supplier_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'supplier_not_found', 'error_code', 'SUPPLIER_NOT_FOUND');
  END IF;
  BEGIN
    INSERT INTO public.supplier_service_regions (
      id, supplier_id, region_code, region_level, status,
      valid_from, valid_until, version,
      created_by_employee_id, updated_by_employee_id
    ) VALUES (
      p_region_id, p_supplier_id, p_region_code, p_region_level, p_status,
      p_valid_from, p_valid_until, 1, p_actor_employee_id, p_actor_employee_id
    ) RETURNING * INTO v_region;
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('status', 'state_conflict', 'error_code', 'SUPPLIER_STATE_CONFLICT');
  END;
  INSERT INTO public.supplier_command_events (
    resource_type, resource_id, command, from_state, to_state,
    actor_user_id, actor_employee_id, idempotency_key, result_version
  ) VALUES (
    'supplier_service_region', v_region.id,
    'create_supplier_service_region',
    jsonb_build_object('_request', v_request), to_jsonb(v_region),
    p_actor_user_id, p_actor_employee_id, p_idempotency_key, v_region.version
  );
  RETURN jsonb_build_object('status', 'created', 'idempotent', false, 'service_region', to_jsonb(v_region), 'version', v_region.version);
END;
$$;

CREATE FUNCTION public.create_supplier_address(
  p_address_id uuid,
  p_supplier_id uuid,
  p_address_type text,
  p_province text,
  p_city text,
  p_district text,
  p_region_code text,
  p_address_detail text,
  p_longitude numeric,
  p_latitude numeric,
  p_is_default boolean,
  p_status text,
  p_actor_user_id uuid,
  p_actor_employee_id uuid,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_event public.supplier_command_events%ROWTYPE;
  v_address public.supplier_addresses%ROWTYPE;
  v_request jsonb;
BEGIN
  IF p_address_id IS NULL OR p_supplier_id IS NULL OR p_actor_user_id IS NULL
    OR p_actor_employee_id IS NULL OR p_idempotency_key IS NULL
    OR btrim(p_idempotency_key) = '' OR char_length(p_idempotency_key) > 120
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SUPPLIER_STATE_CONFLICT';
  END IF;
  v_request := jsonb_build_object(
    'supplier_id', p_supplier_id, 'address_type', p_address_type,
    'province', p_province, 'city', p_city, 'district', p_district,
    'region_code', p_region_code, 'address_detail', p_address_detail,
    'longitude', p_longitude, 'latitude', p_latitude,
    'is_default', p_is_default, 'status', p_status,
    'actor_employee_id', p_actor_employee_id
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('supplier-command:' || p_actor_user_id::text || ':' || p_idempotency_key, 0)
  );
  SELECT event.* INTO v_event
  FROM public.supplier_command_events AS event
  WHERE event.actor_user_id = p_actor_user_id
    AND event.idempotency_key = p_idempotency_key
  FOR UPDATE;
  IF FOUND THEN
    IF v_event.from_state -> '_request' IS DISTINCT FROM v_request
      OR v_event.resource_type <> 'supplier_address'
      OR v_event.command <> 'create_supplier_address'
    THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SUPPLIER_IDEMPOTENCY_CONFLICT';
    END IF;
    RETURN jsonb_build_object('status', 'created', 'idempotent', true, 'address', v_event.to_state, 'version', v_event.result_version);
  END IF;
  PERFORM 1 FROM public.suppliers AS supplier
  WHERE supplier.id = p_supplier_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'supplier_not_found', 'error_code', 'SUPPLIER_NOT_FOUND');
  END IF;
  BEGIN
    INSERT INTO public.supplier_addresses (
      id, supplier_id, address_type, province, city, district, region_code,
      address_detail, longitude, latitude, is_default, status, version,
      created_by_employee_id, updated_by_employee_id
    ) VALUES (
      p_address_id, p_supplier_id, p_address_type, p_province, p_city,
      p_district, p_region_code, p_address_detail, p_longitude, p_latitude,
      p_is_default, p_status, 1, p_actor_employee_id, p_actor_employee_id
    ) RETURNING * INTO v_address;
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('status', 'state_conflict', 'error_code', 'SUPPLIER_STATE_CONFLICT');
  END;
  INSERT INTO public.supplier_command_events (
    resource_type, resource_id, command, from_state, to_state,
    actor_user_id, actor_employee_id, idempotency_key, result_version
  ) VALUES (
    'supplier_address', v_address.id, 'create_supplier_address',
    jsonb_build_object('_request', v_request), to_jsonb(v_address),
    p_actor_user_id, p_actor_employee_id, p_idempotency_key, v_address.version
  );
  RETURN jsonb_build_object('status', 'created', 'idempotent', false, 'address', to_jsonb(v_address), 'version', v_address.version);
END;
$$;

CREATE FUNCTION public.create_supplier_contact(
  p_contact_id uuid,
  p_supplier_id uuid,
  p_contact_type text,
  p_name text,
  p_phone text,
  p_email text,
  p_is_public boolean,
  p_is_primary boolean,
  p_status text,
  p_actor_user_id uuid,
  p_actor_employee_id uuid,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_event public.supplier_command_events%ROWTYPE;
  v_contact public.supplier_contacts%ROWTYPE;
  v_request jsonb;
BEGIN
  IF p_contact_id IS NULL OR p_supplier_id IS NULL OR p_actor_user_id IS NULL
    OR p_actor_employee_id IS NULL OR p_idempotency_key IS NULL
    OR btrim(p_idempotency_key) = '' OR char_length(p_idempotency_key) > 120
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SUPPLIER_STATE_CONFLICT';
  END IF;
  v_request := jsonb_build_object(
    'supplier_id', p_supplier_id, 'contact_type', p_contact_type,
    'name', p_name, 'phone', p_phone, 'email', p_email,
    'is_public', p_is_public, 'is_primary', p_is_primary,
    'status', p_status, 'actor_employee_id', p_actor_employee_id
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('supplier-command:' || p_actor_user_id::text || ':' || p_idempotency_key, 0)
  );
  SELECT event.* INTO v_event
  FROM public.supplier_command_events AS event
  WHERE event.actor_user_id = p_actor_user_id
    AND event.idempotency_key = p_idempotency_key
  FOR UPDATE;
  IF FOUND THEN
    IF v_event.from_state -> '_request' IS DISTINCT FROM v_request
      OR v_event.resource_type <> 'supplier_contact'
      OR v_event.command <> 'create_supplier_contact'
    THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SUPPLIER_IDEMPOTENCY_CONFLICT';
    END IF;
    RETURN jsonb_build_object('status', 'created', 'idempotent', true, 'contact', v_event.to_state, 'version', v_event.result_version);
  END IF;
  PERFORM 1 FROM public.suppliers AS supplier
  WHERE supplier.id = p_supplier_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'supplier_not_found', 'error_code', 'SUPPLIER_NOT_FOUND');
  END IF;
  BEGIN
    INSERT INTO public.supplier_contacts (
      id, supplier_id, contact_type, name, phone, email, is_public,
      is_primary, status, version, created_by_employee_id,
      updated_by_employee_id
    ) VALUES (
      p_contact_id, p_supplier_id, p_contact_type, p_name, p_phone, p_email,
      p_is_public, p_is_primary, p_status, 1,
      p_actor_employee_id, p_actor_employee_id
    ) RETURNING * INTO v_contact;
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('status', 'state_conflict', 'error_code', 'SUPPLIER_STATE_CONFLICT');
  END;
  INSERT INTO public.supplier_command_events (
    resource_type, resource_id, command, from_state, to_state,
    actor_user_id, actor_employee_id, idempotency_key, result_version
  ) VALUES (
    'supplier_contact', v_contact.id, 'create_supplier_contact',
    jsonb_build_object('_request', v_request), to_jsonb(v_contact),
    p_actor_user_id, p_actor_employee_id, p_idempotency_key, v_contact.version
  );
  RETURN jsonb_build_object('status', 'created', 'idempotent', false, 'contact', to_jsonb(v_contact), 'version', v_contact.version);
END;
$$;

CREATE FUNCTION public.create_catalog_category(
  p_category_id uuid,
  p_parent_id uuid,
  p_code text,
  p_name text,
  p_level integer,
  p_status text,
  p_sort_order integer,
  p_actor_user_id uuid,
  p_actor_employee_id uuid,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_event public.supplier_command_events%ROWTYPE;
  v_category public.catalog_categories%ROWTYPE;
  v_request jsonb;
BEGIN
  IF p_category_id IS NULL OR p_actor_user_id IS NULL
    OR p_actor_employee_id IS NULL OR p_idempotency_key IS NULL
    OR btrim(p_idempotency_key) = '' OR char_length(p_idempotency_key) > 120
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SUPPLIER_STATE_CONFLICT';
  END IF;
  v_request := jsonb_build_object(
    'parent_id', p_parent_id, 'code', p_code, 'name', p_name,
    'level', p_level, 'status', p_status, 'sort_order', p_sort_order,
    'actor_employee_id', p_actor_employee_id
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('supplier-command:' || p_actor_user_id::text || ':' || p_idempotency_key, 0)
  );
  SELECT event.* INTO v_event
  FROM public.supplier_command_events AS event
  WHERE event.actor_user_id = p_actor_user_id
    AND event.idempotency_key = p_idempotency_key
  FOR UPDATE;
  IF FOUND THEN
    IF v_event.from_state -> '_request' IS DISTINCT FROM v_request
      OR v_event.resource_type <> 'catalog_category'
      OR v_event.command <> 'create_catalog_category'
    THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SUPPLIER_IDEMPOTENCY_CONFLICT';
    END IF;
    RETURN jsonb_build_object('status', 'created', 'idempotent', true, 'category', v_event.to_state, 'version', v_event.result_version);
  END IF;
  IF p_parent_id IS NOT NULL THEN
    PERFORM 1 FROM public.catalog_categories AS parent
    WHERE parent.id = p_parent_id FOR UPDATE;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('status', 'state_conflict', 'error_code', 'SUPPLIER_CATALOG_CONFLICT');
    END IF;
  END IF;
  BEGIN
    INSERT INTO public.catalog_categories (
      id, parent_id, code, name, level, status, sort_order, version,
      created_by_employee_id, updated_by_employee_id
    ) VALUES (
      p_category_id, p_parent_id, p_code, p_name, p_level, p_status,
      p_sort_order, 1, p_actor_employee_id, p_actor_employee_id
    ) RETURNING * INTO v_category;
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('status', 'state_conflict', 'error_code', 'SUPPLIER_CATALOG_CONFLICT');
  END;
  INSERT INTO public.supplier_command_events (
    resource_type, resource_id, command, from_state, to_state,
    actor_user_id, actor_employee_id, idempotency_key, result_version
  ) VALUES (
    'catalog_category', v_category.id, 'create_catalog_category',
    jsonb_build_object('_request', v_request), to_jsonb(v_category),
    p_actor_user_id, p_actor_employee_id, p_idempotency_key, v_category.version
  );
  RETURN jsonb_build_object('status', 'created', 'idempotent', false, 'category', to_jsonb(v_category), 'version', v_category.version);
END;
$$;

CREATE FUNCTION public.create_catalog_brand(
  p_brand_id uuid,
  p_code text,
  p_name text,
  p_legal_name text,
  p_logo_file_id uuid,
  p_status text,
  p_sort_order integer,
  p_actor_user_id uuid,
  p_actor_employee_id uuid,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_event public.supplier_command_events%ROWTYPE;
  v_brand public.catalog_brands%ROWTYPE;
  v_request jsonb;
BEGIN
  IF p_brand_id IS NULL OR p_actor_user_id IS NULL
    OR p_actor_employee_id IS NULL OR p_idempotency_key IS NULL
    OR btrim(p_idempotency_key) = '' OR char_length(p_idempotency_key) > 120
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SUPPLIER_STATE_CONFLICT';
  END IF;
  v_request := jsonb_build_object(
    'code', p_code, 'name', p_name, 'legal_name', p_legal_name,
    'logo_file_id', p_logo_file_id, 'status', p_status,
    'sort_order', p_sort_order, 'actor_employee_id', p_actor_employee_id
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('supplier-command:' || p_actor_user_id::text || ':' || p_idempotency_key, 0)
  );
  SELECT event.* INTO v_event
  FROM public.supplier_command_events AS event
  WHERE event.actor_user_id = p_actor_user_id
    AND event.idempotency_key = p_idempotency_key
  FOR UPDATE;
  IF FOUND THEN
    IF v_event.from_state -> '_request' IS DISTINCT FROM v_request
      OR v_event.resource_type <> 'catalog_brand'
      OR v_event.command <> 'create_catalog_brand'
    THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SUPPLIER_IDEMPOTENCY_CONFLICT';
    END IF;
    RETURN jsonb_build_object('status', 'created', 'idempotent', true, 'brand', v_event.to_state, 'version', v_event.result_version);
  END IF;
  BEGIN
    INSERT INTO public.catalog_brands (
      id, code, name, legal_name, logo_file_id, status, sort_order, version,
      created_by_employee_id, updated_by_employee_id
    ) VALUES (
      p_brand_id, p_code, p_name, p_legal_name, p_logo_file_id, p_status,
      p_sort_order, 1, p_actor_employee_id, p_actor_employee_id
    ) RETURNING * INTO v_brand;
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('status', 'state_conflict', 'error_code', 'SUPPLIER_CATALOG_CONFLICT');
  END;
  INSERT INTO public.supplier_command_events (
    resource_type, resource_id, command, from_state, to_state,
    actor_user_id, actor_employee_id, idempotency_key, result_version
  ) VALUES (
    'catalog_brand', v_brand.id, 'create_catalog_brand',
    jsonb_build_object('_request', v_request), to_jsonb(v_brand),
    p_actor_user_id, p_actor_employee_id, p_idempotency_key, v_brand.version
  );
  RETURN jsonb_build_object('status', 'created', 'idempotent', false, 'brand', to_jsonb(v_brand), 'version', v_brand.version);
END;
$$;

CREATE FUNCTION public.create_catalog_unit(
  p_unit_id uuid,
  p_code text,
  p_name text,
  p_symbol text,
  p_base_unit_id uuid,
  p_conversion_factor text,
  p_status text,
  p_sort_order integer,
  p_actor_user_id uuid,
  p_actor_employee_id uuid,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_event public.supplier_command_events%ROWTYPE;
  v_unit public.catalog_units%ROWTYPE;
  v_request jsonb;
  v_snapshot jsonb;
BEGIN
  IF p_unit_id IS NULL OR p_actor_user_id IS NULL
    OR p_actor_employee_id IS NULL OR p_idempotency_key IS NULL
    OR btrim(p_idempotency_key) = '' OR char_length(p_idempotency_key) > 120
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SUPPLIER_STATE_CONFLICT';
  END IF;
  v_request := jsonb_build_object(
    'code', p_code, 'name', p_name, 'symbol', p_symbol,
    'base_unit_id', p_base_unit_id, 'conversion_factor', p_conversion_factor,
    'status', p_status, 'sort_order', p_sort_order,
    'actor_employee_id', p_actor_employee_id
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('supplier-command:' || p_actor_user_id::text || ':' || p_idempotency_key, 0)
  );
  SELECT event.* INTO v_event
  FROM public.supplier_command_events AS event
  WHERE event.actor_user_id = p_actor_user_id
    AND event.idempotency_key = p_idempotency_key
  FOR UPDATE;
  IF FOUND THEN
    IF v_event.from_state -> '_request' IS DISTINCT FROM v_request
      OR v_event.resource_type <> 'catalog_unit'
      OR v_event.command <> 'create_catalog_unit'
    THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SUPPLIER_IDEMPOTENCY_CONFLICT';
    END IF;
    RETURN jsonb_build_object('status', 'created', 'idempotent', true, 'unit', v_event.to_state, 'version', v_event.result_version);
  END IF;
  IF p_base_unit_id IS NOT NULL THEN
    PERFORM 1 FROM public.catalog_units AS base_unit
    WHERE base_unit.id = p_base_unit_id FOR UPDATE;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('status', 'state_conflict', 'error_code', 'SUPPLIER_CATALOG_CONFLICT');
    END IF;
  END IF;
  BEGIN
    INSERT INTO public.catalog_units (
      id, code, name, symbol, base_unit_id, conversion_factor, status,
      sort_order, version, created_by_employee_id, updated_by_employee_id
    ) VALUES (
      p_unit_id, p_code, p_name, p_symbol, p_base_unit_id,
      p_conversion_factor::numeric(18, 6), p_status, p_sort_order, 1,
      p_actor_employee_id, p_actor_employee_id
    ) RETURNING * INTO v_unit;
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('status', 'state_conflict', 'error_code', 'SUPPLIER_CATALOG_CONFLICT');
  END;
  v_snapshot := to_jsonb(v_unit) ||
    jsonb_build_object('conversion_factor', v_unit.conversion_factor::text);
  INSERT INTO public.supplier_command_events (
    resource_type, resource_id, command, from_state, to_state,
    actor_user_id, actor_employee_id, idempotency_key, result_version
  ) VALUES (
    'catalog_unit', v_unit.id, 'create_catalog_unit',
    jsonb_build_object('_request', v_request), v_snapshot,
    p_actor_user_id, p_actor_employee_id, p_idempotency_key, v_unit.version
  );
  RETURN jsonb_build_object('status', 'created', 'idempotent', false, 'unit', v_snapshot, 'version', v_unit.version);
END;
$$;

CREATE FUNCTION public.mutate_platform_supplier(
  p_supplier_id uuid,
  p_action text,
  p_expected_version integer,
  p_actor_user_id uuid,
  p_actor_employee_id uuid,
  p_idempotency_key text,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_event public.supplier_command_events%ROWTYPE;
  v_supplier public.suppliers%ROWTYPE;
  v_before jsonb;
  v_next_onboarding text;
  v_next_operational text;
  v_request jsonb;
BEGIN
  IF p_supplier_id IS NULL OR p_action IS NULL OR p_expected_version IS NULL
    OR p_actor_user_id IS NULL OR p_actor_employee_id IS NULL
    OR p_idempotency_key IS NULL OR btrim(p_idempotency_key) = ''
    OR char_length(p_idempotency_key) > 120
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SUPPLIER_IDEMPOTENCY_CONFLICT';
  END IF;
  IF p_idempotency_key IS NULL OR btrim(p_idempotency_key) = ''
    OR char_length(p_idempotency_key) > 120 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SUPPLIER_IDEMPOTENCY_CONFLICT';
  END IF;
  v_request := jsonb_build_object(
    'supplier_id', p_supplier_id, 'action', p_action,
    'expected_version', p_expected_version, 'reason', p_reason,
    'actor_employee_id', p_actor_employee_id
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('supplier-command:' || p_actor_user_id::text || ':' || p_idempotency_key, 0)
  );
  SELECT event.* INTO v_event
  FROM public.supplier_command_events AS event
  WHERE event.actor_user_id = p_actor_user_id AND event.idempotency_key = p_idempotency_key
  FOR UPDATE;
  IF FOUND THEN
    IF v_event.from_state -> '_request' IS DISTINCT FROM v_request
      OR v_event.resource_type <> 'supplier' OR v_event.resource_id <> p_supplier_id
      OR v_event.command <> 'mutate_platform_supplier:' || p_action
    THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SUPPLIER_IDEMPOTENCY_CONFLICT';
    END IF;
    RETURN jsonb_build_object('status', 'updated', 'idempotent', true, 'supplier', v_event.to_state, 'previous_supplier', v_event.from_state - '_request', 'version', v_event.result_version);
  END IF;

  SELECT supplier.* INTO v_supplier
  FROM public.suppliers AS supplier
  WHERE supplier.id = p_supplier_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'supplier_not_found', 'error_code', 'SUPPLIER_NOT_FOUND');
  END IF;
  IF v_supplier.version <> p_expected_version THEN
    RETURN jsonb_build_object('status', 'version_conflict', 'error_code', 'SUPPLIER_VERSION_CONFLICT', 'version', v_supplier.version);
  END IF;

  v_next_onboarding := v_supplier.onboarding_status;
  v_next_operational := v_supplier.operational_status;
  IF p_action = 'submit' AND v_supplier.onboarding_status IN ('draft', 'rejected') THEN
    IF EXISTS (
      SELECT 1
      FROM public.supplier_qualification_types AS qualification_type
      WHERE qualification_type.status = 'active'
        AND qualification_type.is_required
        AND (
          cardinality(qualification_type.applicable_supplier_types) = 0
          OR v_supplier.supplier_type = ANY (qualification_type.applicable_supplier_types)
        )
        AND NOT EXISTS (
          SELECT 1
          FROM public.supplier_qualifications AS qualification
          WHERE qualification.supplier_id = v_supplier.id
            AND qualification.qualification_type_id = qualification_type.id
            AND qualification.verification_status = 'verified'
            AND (qualification.valid_from IS NULL OR qualification.valid_from <= CURRENT_DATE)
            AND (qualification.valid_until IS NULL OR qualification.valid_until >= CURRENT_DATE)
        )
    ) THEN
      RETURN jsonb_build_object('status', 'state_conflict', 'error_code', 'SUPPLIER_STATE_CONFLICT', 'reason', 'required_qualification_missing');
    END IF;
    v_next_onboarding := 'pending_review';
  ELSIF p_action = 'approve' AND v_supplier.onboarding_status = 'pending_review' THEN
    IF EXISTS (
      SELECT 1
      FROM public.supplier_qualification_types AS qualification_type
      WHERE qualification_type.status = 'active'
        AND qualification_type.is_required
        AND (
          cardinality(qualification_type.applicable_supplier_types) = 0
          OR v_supplier.supplier_type = ANY (qualification_type.applicable_supplier_types)
        )
        AND NOT EXISTS (
          SELECT 1
          FROM public.supplier_qualifications AS qualification
          WHERE qualification.supplier_id = v_supplier.id
            AND qualification.qualification_type_id = qualification_type.id
            AND qualification.verification_status = 'verified'
            AND (qualification.valid_from IS NULL OR qualification.valid_from <= CURRENT_DATE)
            AND (qualification.valid_until IS NULL OR qualification.valid_until >= CURRENT_DATE)
        )
    ) THEN
      RETURN jsonb_build_object('status', 'state_conflict', 'error_code', 'SUPPLIER_STATE_CONFLICT', 'reason', 'required_qualification_missing');
    END IF;
    v_next_onboarding := 'approved';
  ELSIF p_action = 'reject' AND v_supplier.onboarding_status = 'pending_review' THEN
    v_next_onboarding := 'rejected';
  ELSIF p_action = 'suspend' AND v_supplier.operational_status = 'active' THEN
    v_next_operational := 'suspended';
  ELSIF p_action = 'resume' AND v_supplier.operational_status = 'suspended' THEN
    v_next_operational := 'active';
  ELSIF p_action = 'blacklist' AND v_supplier.operational_status IN ('active', 'suspended') THEN
    v_next_operational := 'blacklisted';
  ELSE
    RETURN jsonb_build_object('status', 'state_conflict', 'error_code', 'SUPPLIER_STATE_CONFLICT');
  END IF;

  v_before := to_jsonb(v_supplier);
  UPDATE public.suppliers AS supplier
  SET onboarding_status = v_next_onboarding,
      operational_status = v_next_operational,
      review_remark = CASE WHEN p_action IN ('approve', 'reject') THEN p_reason ELSE supplier.review_remark END,
      reviewed_by_employee_id = CASE WHEN p_action IN ('approve', 'reject') THEN p_actor_employee_id ELSE supplier.reviewed_by_employee_id END,
      reviewed_at = CASE WHEN p_action IN ('approve', 'reject') THEN now() ELSE supplier.reviewed_at END,
      blacklisted_by_employee_id = CASE WHEN p_action = 'blacklist' THEN p_actor_employee_id ELSE supplier.blacklisted_by_employee_id END,
      blacklisted_at = CASE WHEN p_action = 'blacklist' THEN now() ELSE supplier.blacklisted_at END,
      blacklist_reason = CASE WHEN p_action = 'blacklist' THEN p_reason ELSE supplier.blacklist_reason END,
      updated_by_employee_id = p_actor_employee_id,
      version = supplier.version + 1
  WHERE supplier.id = p_supplier_id
  RETURNING * INTO v_supplier;

  INSERT INTO public.supplier_command_events (
    resource_type, resource_id, command, from_state, to_state, reason,
    actor_user_id, actor_employee_id, idempotency_key, result_version
  )
  VALUES (
    'supplier', v_supplier.id, 'mutate_platform_supplier:' || p_action,
    v_before || jsonb_build_object('_request', v_request),
    to_jsonb(v_supplier), p_reason, p_actor_user_id,
    p_actor_employee_id, p_idempotency_key, v_supplier.version
  );
  RETURN jsonb_build_object('status', 'updated', 'idempotent', false, 'supplier', to_jsonb(v_supplier), 'previous_supplier', v_before, 'version', v_supplier.version);
END;
$$;

CREATE FUNCTION public.review_supplier_qualification(
  p_supplier_id uuid,
  p_qualification_id uuid,
  p_verification_status text,
  p_expected_version integer,
  p_actor_user_id uuid,
  p_actor_employee_id uuid,
  p_idempotency_key text,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_event public.supplier_command_events%ROWTYPE;
  v_supplier public.suppliers%ROWTYPE;
  v_qualification public.supplier_qualifications%ROWTYPE;
  v_qualification_supplier_id uuid;
  v_before jsonb;
  v_request jsonb;
BEGIN
  IF p_supplier_id IS NULL OR p_qualification_id IS NULL
    OR p_expected_version IS NULL OR p_actor_user_id IS NULL
    OR p_actor_employee_id IS NULL OR p_idempotency_key IS NULL
    OR btrim(p_idempotency_key) = '' OR char_length(p_idempotency_key) > 120
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SUPPLIER_IDEMPOTENCY_CONFLICT';
  END IF;
  IF p_verification_status NOT IN ('verified', 'rejected') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SUPPLIER_STATE_CONFLICT';
  END IF;
  v_request := jsonb_build_object(
    'supplier_id', p_supplier_id, 'qualification_id', p_qualification_id,
    'verification_status', p_verification_status,
    'expected_version', p_expected_version, 'reason', p_reason,
    'actor_employee_id', p_actor_employee_id
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('supplier-command:' || p_actor_user_id::text || ':' || p_idempotency_key, 0)
  );
  SELECT event.* INTO v_event
  FROM public.supplier_command_events AS event
  WHERE event.actor_user_id = p_actor_user_id AND event.idempotency_key = p_idempotency_key
  FOR UPDATE;
  IF FOUND THEN
    IF v_event.from_state -> '_request' IS DISTINCT FROM v_request
      OR v_event.resource_type <> 'supplier_qualification'
      OR v_event.resource_id <> p_qualification_id
      OR v_event.command <> 'review_supplier_qualification:' || p_verification_status
    THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SUPPLIER_IDEMPOTENCY_CONFLICT';
    END IF;
    RETURN jsonb_build_object('status', 'updated', 'idempotent', true, 'qualification', v_event.to_state, 'previous_qualification', v_event.from_state - '_request', 'version', v_event.result_version);
  END IF;
  SELECT qualification.supplier_id
  INTO v_qualification_supplier_id
  FROM public.supplier_qualifications AS qualification
  WHERE qualification.id = p_qualification_id;
  IF NOT FOUND OR v_qualification_supplier_id IS DISTINCT FROM p_supplier_id THEN
    RETURN jsonb_build_object('status', 'supplier_not_found', 'error_code', 'SUPPLIER_NOT_FOUND');
  END IF;
  SELECT supplier.* INTO v_supplier
  FROM public.suppliers AS supplier
  WHERE supplier.id = v_qualification_supplier_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'supplier_not_found', 'error_code', 'SUPPLIER_NOT_FOUND');
  END IF;
  SELECT qualification.* INTO v_qualification
  FROM public.supplier_qualifications AS qualification
  WHERE qualification.id = p_qualification_id
  FOR UPDATE;
  IF NOT FOUND OR v_qualification.supplier_id IS DISTINCT FROM p_supplier_id THEN
    RETURN jsonb_build_object('status', 'supplier_not_found', 'error_code', 'SUPPLIER_NOT_FOUND');
  END IF;
  IF v_qualification.version <> p_expected_version THEN
    RETURN jsonb_build_object('status', 'version_conflict', 'error_code', 'SUPPLIER_VERSION_CONFLICT', 'version', v_qualification.version);
  END IF;
  v_before := to_jsonb(v_qualification);
  UPDATE public.supplier_qualifications AS qualification
  SET verification_status = p_verification_status,
      verified_by_employee_id = p_actor_employee_id,
      verified_at = now(),
      rejection_reason = CASE WHEN p_verification_status = 'rejected' THEN p_reason ELSE NULL END,
      updated_by_employee_id = p_actor_employee_id,
      version = qualification.version + 1
  WHERE qualification.id = p_qualification_id
  RETURNING * INTO v_qualification;
  INSERT INTO public.supplier_command_events (
    resource_type, resource_id, command, from_state, to_state, reason,
    actor_user_id, actor_employee_id, idempotency_key, result_version
  )
  VALUES (
    'supplier_qualification', v_qualification.id,
    'review_supplier_qualification:' || p_verification_status,
    v_before || jsonb_build_object('_request', v_request),
    to_jsonb(v_qualification), p_reason, p_actor_user_id,
    p_actor_employee_id, p_idempotency_key, v_qualification.version
  );
  RETURN jsonb_build_object('status', 'updated', 'idempotent', false, 'qualification', to_jsonb(v_qualification), 'previous_qualification', v_before, 'version', v_qualification.version);
END;
$$;

CREATE FUNCTION public.set_tenant_supplier_module(
  p_tenant_id uuid,
  p_module_enabled boolean,
  p_require_active_contract_for_new_order boolean,
  p_expected_version integer,
  p_actor_user_id uuid,
  p_actor_employee_id uuid,
  p_idempotency_key text,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_event public.supplier_command_events%ROWTYPE;
  v_setting public.tenant_supplier_settings%ROWTYPE;
  v_before jsonb := '{}'::jsonb;
  v_request jsonb;
BEGIN
  IF p_tenant_id IS NULL OR p_module_enabled IS NULL
    OR p_require_active_contract_for_new_order IS NULL
    OR p_expected_version IS NULL OR p_actor_user_id IS NULL
    OR p_actor_employee_id IS NULL OR p_idempotency_key IS NULL
    OR btrim(p_idempotency_key) = '' OR char_length(p_idempotency_key) > 120
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SUPPLIER_IDEMPOTENCY_CONFLICT';
  END IF;
  IF NOT p_module_enabled AND (p_reason IS NULL OR btrim(p_reason) = '') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SUPPLIER_STATE_CONFLICT';
  END IF;
  IF p_reason IS NOT NULL AND char_length(btrim(p_reason)) > 500 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SUPPLIER_STATE_CONFLICT';
  END IF;
  p_reason := NULLIF(btrim(p_reason), '');
  v_request := jsonb_build_object(
    'tenant_id', p_tenant_id, 'module_enabled', p_module_enabled,
    'require_active_contract_for_new_order', p_require_active_contract_for_new_order,
    'expected_version', p_expected_version, 'reason', p_reason,
    'actor_employee_id', p_actor_employee_id
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('supplier-command:' || p_actor_user_id::text || ':' || p_idempotency_key, 0)
  );
  SELECT event.* INTO v_event
  FROM public.supplier_command_events AS event
  WHERE event.actor_user_id = p_actor_user_id AND event.idempotency_key = p_idempotency_key
  FOR UPDATE;
  IF FOUND THEN
    IF v_event.tenant_id IS DISTINCT FROM p_tenant_id
      OR v_event.from_state -> '_request' IS DISTINCT FROM v_request
      OR v_event.resource_type <> 'tenant_supplier' OR v_event.resource_id <> p_tenant_id
      OR v_event.command <> 'set_tenant_supplier_module'
    THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SUPPLIER_IDEMPOTENCY_CONFLICT';
    END IF;
    RETURN jsonb_build_object('status', 'updated', 'idempotent', true, 'setting', v_event.to_state, 'previous_setting', v_event.from_state - '_request', 'version', v_event.result_version);
  END IF;
  PERFORM 1 FROM public.tenants AS tenant WHERE tenant.id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'supplier_not_found', 'error_code', 'SUPPLIER_NOT_FOUND');
  END IF;
  SELECT setting.* INTO v_setting
  FROM public.tenant_supplier_settings AS setting
  WHERE setting.tenant_id = p_tenant_id
  FOR UPDATE;
  IF FOUND THEN
    IF v_setting.version <> p_expected_version THEN
      RETURN jsonb_build_object('status', 'version_conflict', 'error_code', 'SUPPLIER_VERSION_CONFLICT', 'version', v_setting.version);
    END IF;
    v_before := to_jsonb(v_setting);
    UPDATE public.tenant_supplier_settings AS setting
    SET module_enabled = p_module_enabled,
        require_active_contract_for_new_order = p_require_active_contract_for_new_order,
        enabled_by_employee_id = CASE WHEN p_module_enabled THEN p_actor_employee_id ELSE NULL END,
        enabled_at = CASE WHEN p_module_enabled THEN now() ELSE NULL END,
        version = setting.version + 1
    WHERE setting.tenant_id = p_tenant_id
    RETURNING * INTO v_setting;
  ELSE
    IF p_expected_version <> 0 THEN
      RETURN jsonb_build_object('status', 'version_conflict', 'error_code', 'SUPPLIER_VERSION_CONFLICT', 'version', 0);
    END IF;
    INSERT INTO public.tenant_supplier_settings (
      tenant_id, module_enabled, require_active_contract_for_new_order,
      enabled_by_employee_id, enabled_at, version
    )
    VALUES (
      p_tenant_id, p_module_enabled, p_require_active_contract_for_new_order,
      CASE WHEN p_module_enabled THEN p_actor_employee_id ELSE NULL END,
      CASE WHEN p_module_enabled THEN now() ELSE NULL END, 1
    )
    RETURNING * INTO v_setting;
  END IF;
  INSERT INTO public.supplier_command_events (
    tenant_id, resource_type, resource_id, command, from_state, to_state,
    reason, actor_user_id, actor_employee_id, idempotency_key, result_version
  )
  VALUES (
    p_tenant_id, 'tenant_supplier', p_tenant_id, 'set_tenant_supplier_module',
    v_before || jsonb_build_object('_request', v_request),
    to_jsonb(v_setting), p_reason, p_actor_user_id, p_actor_employee_id,
    p_idempotency_key, v_setting.version
  );
  RETURN jsonb_build_object('status', 'updated', 'idempotent', false, 'setting', to_jsonb(v_setting), 'previous_setting', v_before, 'version', v_setting.version);
END;
$$;

CREATE FUNCTION public.create_tenant_supplier(
  p_tenant_supplier_id uuid,
  p_tenant_id uuid,
  p_supplier_id uuid,
  p_expected_version integer,
  p_actor_user_id uuid,
  p_actor_employee_id uuid,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_event public.supplier_command_events%ROWTYPE;
  v_supplier public.suppliers%ROWTYPE;
  v_setting public.tenant_supplier_settings%ROWTYPE;
  v_relationship public.tenant_suppliers%ROWTYPE;
  v_request jsonb;
  v_snapshot jsonb;
BEGIN
  IF p_tenant_supplier_id IS NULL OR p_tenant_id IS NULL OR p_supplier_id IS NULL
    OR p_expected_version IS DISTINCT FROM 0 OR p_actor_user_id IS NULL
    OR p_actor_employee_id IS NULL OR p_idempotency_key IS NULL
    OR btrim(p_idempotency_key) = '' OR char_length(p_idempotency_key) > 120
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SUPPLIER_VERSION_CONFLICT';
  END IF;
  v_request := jsonb_build_object(
    'tenant_id', p_tenant_id,
    'supplier_id', p_supplier_id, 'expected_version', p_expected_version,
    'actor_employee_id', p_actor_employee_id
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('supplier-command:' || p_actor_user_id::text || ':' || p_idempotency_key, 0)
  );
  SELECT event.* INTO v_event
  FROM public.supplier_command_events AS event
  WHERE event.actor_user_id = p_actor_user_id AND event.idempotency_key = p_idempotency_key
  FOR UPDATE;
  IF FOUND THEN
    IF v_event.tenant_id IS DISTINCT FROM p_tenant_id
      OR v_event.from_state -> '_request' IS DISTINCT FROM v_request
      OR v_event.resource_type <> 'tenant_supplier'
      OR v_event.command <> 'create_tenant_supplier'
    THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SUPPLIER_IDEMPOTENCY_CONFLICT';
    END IF;
    RETURN jsonb_build_object('status', 'created', 'idempotent', true, 'tenant_supplier', v_event.to_state, 'version', v_event.result_version);
  END IF;
  PERFORM 1
  FROM public.tenants AS tenant
  WHERE tenant.id = p_tenant_id
  FOR UPDATE;
  SELECT setting.* INTO v_setting
  FROM public.tenant_supplier_settings AS setting
  WHERE setting.tenant_id = p_tenant_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SUPPLIER_MODULE_DISABLED';
  END IF;
  IF NOT v_setting.module_enabled THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SUPPLIER_MODULE_DISABLED';
  END IF;
  SELECT supplier.* INTO v_supplier
  FROM public.suppliers AS supplier
  WHERE supplier.id = p_supplier_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'supplier_not_found', 'error_code', 'SUPPLIER_NOT_FOUND');
  END IF;
  IF v_supplier.onboarding_status <> 'approved'
    OR v_supplier.operational_status <> 'active'
  THEN
    RETURN jsonb_build_object('status', 'state_conflict', 'error_code', 'SUPPLIER_STATE_CONFLICT');
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.tenant_suppliers AS relationship
    WHERE relationship.tenant_id = p_tenant_id AND relationship.supplier_id = p_supplier_id
  ) THEN
    RETURN jsonb_build_object('status', 'state_conflict', 'error_code', 'TENANT_SUPPLIER_STATE_CONFLICT');
  END IF;
  INSERT INTO public.tenant_suppliers (
    id, tenant_id, supplier_id, relationship_status, version,
    created_by_employee_id, updated_by_employee_id
  )
  VALUES (
    p_tenant_supplier_id, p_tenant_id, p_supplier_id, 'evaluating', 1,
    p_actor_employee_id, p_actor_employee_id
  )
  RETURNING * INTO v_relationship;
  v_snapshot := to_jsonb(v_relationship) || jsonb_build_object(
    'supplier', jsonb_build_object(
      'id', v_supplier.id,
      'code', v_supplier.code,
      'name', v_supplier.name,
      'legal_name', v_supplier.legal_name,
      'supplier_type', v_supplier.supplier_type,
      'onboarding_status', v_supplier.onboarding_status,
      'operational_status', v_supplier.operational_status,
      'version', v_supplier.version
    )
  );
  INSERT INTO public.supplier_command_events (
    tenant_id, resource_type, resource_id, command, from_state, to_state,
    actor_user_id, actor_employee_id, idempotency_key, result_version
  )
  VALUES (
    p_tenant_id, 'tenant_supplier', v_relationship.id, 'create_tenant_supplier',
    jsonb_build_object('_request', v_request),
    v_snapshot, p_actor_user_id, p_actor_employee_id,
    p_idempotency_key, v_relationship.version
  );
  RETURN jsonb_build_object('status', 'created', 'idempotent', false, 'tenant_supplier', v_snapshot, 'version', v_relationship.version);
END;
$$;

CREATE FUNCTION public.mutate_tenant_supplier(
  p_tenant_id uuid,
  p_tenant_supplier_id uuid,
  p_action text,
  p_expected_version integer,
  p_actor_user_id uuid,
  p_actor_employee_id uuid,
  p_idempotency_key text,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_event public.supplier_command_events%ROWTYPE;
  v_relationship public.tenant_suppliers%ROWTYPE;
  v_supplier public.suppliers%ROWTYPE;
  v_before jsonb;
  v_next_status text;
  v_request jsonb;
  v_snapshot jsonb;
BEGIN
  IF p_tenant_id IS NULL OR p_tenant_supplier_id IS NULL OR p_action IS NULL
    OR p_expected_version IS NULL OR p_actor_user_id IS NULL
    OR p_actor_employee_id IS NULL OR p_idempotency_key IS NULL
    OR btrim(p_idempotency_key) = '' OR char_length(p_idempotency_key) > 120
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SUPPLIER_IDEMPOTENCY_CONFLICT';
  END IF;
  v_request := jsonb_build_object(
    'tenant_id', p_tenant_id, 'tenant_supplier_id', p_tenant_supplier_id,
    'action', p_action, 'expected_version', p_expected_version,
    'reason', p_reason, 'actor_employee_id', p_actor_employee_id
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('supplier-command:' || p_actor_user_id::text || ':' || p_idempotency_key, 0)
  );
  SELECT event.* INTO v_event
  FROM public.supplier_command_events AS event
  WHERE event.actor_user_id = p_actor_user_id AND event.idempotency_key = p_idempotency_key
  FOR UPDATE;
  IF FOUND THEN
    IF v_event.tenant_id IS DISTINCT FROM p_tenant_id
      OR v_event.from_state -> '_request' IS DISTINCT FROM v_request
      OR v_event.resource_type <> 'tenant_supplier' OR v_event.resource_id <> p_tenant_supplier_id
      OR v_event.command <> 'mutate_tenant_supplier:' || p_action
    THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SUPPLIER_IDEMPOTENCY_CONFLICT';
    END IF;
    RETURN jsonb_build_object('status', 'updated', 'idempotent', true, 'tenant_supplier', v_event.to_state, 'version', v_event.result_version);
  END IF;
  SELECT relationship.* INTO v_relationship
  FROM public.tenant_suppliers AS relationship
  WHERE relationship.id = p_tenant_supplier_id AND relationship.tenant_id = p_tenant_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'tenant_supplier_not_found', 'error_code', 'TENANT_SUPPLIER_NOT_FOUND');
  END IF;
  SELECT supplier.* INTO v_supplier
  FROM public.suppliers AS supplier
  WHERE supplier.id = v_relationship.supplier_id
  FOR SHARE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'status', 'supplier_not_found',
      'error_code', 'SUPPLIER_NOT_FOUND'
    );
  END IF;
  IF v_relationship.version <> p_expected_version THEN
    RETURN jsonb_build_object('status', 'version_conflict', 'error_code', 'SUPPLIER_VERSION_CONFLICT', 'version', v_relationship.version);
  END IF;
  IF p_action = 'activate' AND v_relationship.relationship_status IN ('evaluating', 'suspended') THEN
    v_next_status := 'active';
  ELSIF p_action = 'suspend' AND v_relationship.relationship_status = 'active' THEN
    v_next_status := 'suspended';
  ELSIF p_action = 'terminate' AND v_relationship.relationship_status IN ('evaluating', 'active', 'suspended') THEN
    v_next_status := 'terminated';
  ELSIF p_action = 'blacklist' AND v_relationship.relationship_status IN ('evaluating', 'active', 'suspended') THEN
    v_next_status := 'blacklisted';
  ELSE
    RETURN jsonb_build_object('status', 'state_conflict', 'error_code', 'TENANT_SUPPLIER_STATE_CONFLICT');
  END IF;
  v_before := to_jsonb(v_relationship) || jsonb_build_object(
    'supplier', jsonb_build_object(
      'id', v_supplier.id,
      'code', v_supplier.code,
      'name', v_supplier.name,
      'legal_name', v_supplier.legal_name,
      'supplier_type', v_supplier.supplier_type,
      'onboarding_status', v_supplier.onboarding_status,
      'operational_status', v_supplier.operational_status,
      'version', v_supplier.version
    )
  );
  UPDATE public.tenant_suppliers AS relationship
  SET relationship_status = v_next_status,
      started_at = CASE WHEN p_action = 'activate' THEN COALESCE(relationship.started_at, CURRENT_DATE) ELSE relationship.started_at END,
      ended_at = CASE WHEN p_action IN ('terminate', 'blacklist') THEN CURRENT_DATE ELSE relationship.ended_at END,
      remark = COALESCE(p_reason, relationship.remark),
      updated_by_employee_id = p_actor_employee_id,
      version = relationship.version + 1
  WHERE relationship.id = p_tenant_supplier_id
  RETURNING * INTO v_relationship;
  v_snapshot := to_jsonb(v_relationship) || jsonb_build_object(
    'supplier', jsonb_build_object(
      'id', v_supplier.id,
      'code', v_supplier.code,
      'name', v_supplier.name,
      'legal_name', v_supplier.legal_name,
      'supplier_type', v_supplier.supplier_type,
      'onboarding_status', v_supplier.onboarding_status,
      'operational_status', v_supplier.operational_status,
      'version', v_supplier.version
    )
  );
  INSERT INTO public.supplier_command_events (
    tenant_id, resource_type, resource_id, command, from_state, to_state, reason,
    actor_user_id, actor_employee_id, idempotency_key, result_version
  )
  VALUES (
    p_tenant_id, 'tenant_supplier', v_relationship.id,
    'mutate_tenant_supplier:' || p_action,
    v_before || jsonb_build_object('_request', v_request), v_snapshot,
    p_reason, p_actor_user_id, p_actor_employee_id, p_idempotency_key, v_relationship.version
  );
  RETURN jsonb_build_object('status', 'updated', 'idempotent', false, 'tenant_supplier', v_snapshot, 'version', v_relationship.version);
END;
$$;

CREATE FUNCTION public.create_supplier_contract(
  p_contract_id uuid,
  p_tenant_id uuid,
  p_tenant_supplier_id uuid,
  p_contract_no text,
  p_name text,
  p_valid_from date,
  p_valid_until date,
  p_settlement_term_days integer,
  p_invoice_required_before_payment boolean,
  p_document_file_id uuid,
  p_expected_version integer,
  p_actor_user_id uuid,
  p_actor_employee_id uuid,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_event public.supplier_command_events%ROWTYPE;
  v_relationship public.tenant_suppliers%ROWTYPE;
  v_setting public.tenant_supplier_settings%ROWTYPE;
  v_contract public.supplier_contracts%ROWTYPE;
  v_request jsonb;
BEGIN
  IF p_contract_id IS NULL OR p_tenant_id IS NULL
    OR p_tenant_supplier_id IS NULL OR p_contract_no IS NULL
    OR btrim(p_contract_no) = '' OR p_name IS NULL OR btrim(p_name) = ''
    OR p_valid_from IS NULL OR p_valid_until IS NULL
    OR p_valid_until < p_valid_from OR p_settlement_term_days IS NULL
    OR p_invoice_required_before_payment IS NULL
    OR p_document_file_id IS NULL OR p_expected_version IS DISTINCT FROM 0
    OR p_actor_user_id IS NULL OR p_actor_employee_id IS NULL
    OR p_idempotency_key IS NULL OR btrim(p_idempotency_key) = ''
    OR char_length(p_idempotency_key) > 120
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'SUPPLIER_VERSION_CONFLICT';
  END IF;

  v_request := jsonb_build_object(
    'tenant_id', p_tenant_id,
    'tenant_supplier_id', p_tenant_supplier_id,
    'contract_no', p_contract_no,
    'name', p_name,
    'valid_from', p_valid_from,
    'valid_until', p_valid_until,
    'settlement_term_days', p_settlement_term_days,
    'invoice_required_before_payment', p_invoice_required_before_payment,
    'document_file_id', p_document_file_id,
    'expected_version', p_expected_version,
    'actor_employee_id', p_actor_employee_id
  );

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'supplier-command:' || p_actor_user_id::text || ':' || p_idempotency_key,
      0
    )
  );
  SELECT event.* INTO v_event
  FROM public.supplier_command_events AS event
  WHERE event.actor_user_id = p_actor_user_id
    AND event.idempotency_key = p_idempotency_key
  FOR UPDATE;
  IF FOUND THEN
    IF v_event.tenant_id IS DISTINCT FROM p_tenant_id
      OR v_event.from_state -> '_request' IS DISTINCT FROM v_request
      OR v_event.resource_type <> 'supplier_contract'
      OR v_event.command <> 'create_supplier_contract'
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'SUPPLIER_IDEMPOTENCY_CONFLICT';
    END IF;
    RETURN jsonb_build_object(
      'status', 'created',
      'idempotent', true,
      'contract', v_event.to_state,
      'version', v_event.result_version
    );
  END IF;

  SELECT relationship.* INTO v_relationship
  FROM public.tenant_suppliers AS relationship
  WHERE relationship.id = p_tenant_supplier_id
    AND relationship.tenant_id = p_tenant_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'status', 'tenant_supplier_not_found',
      'error_code', 'TENANT_SUPPLIER_NOT_FOUND'
    );
  END IF;

  SELECT setting.* INTO v_setting
  FROM public.tenant_supplier_settings AS setting
  WHERE setting.tenant_id = p_tenant_id
  FOR UPDATE;
  IF NOT FOUND OR NOT COALESCE(v_setting.module_enabled, false) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SUPPLIER_MODULE_DISABLED';
  END IF;

  BEGIN
    INSERT INTO public.supplier_contracts (
      id, tenant_id, tenant_supplier_id, contract_no, name,
      lifecycle_status, valid_from, valid_until, settlement_term_days,
      invoice_required_before_payment, document_file_id, version,
      created_by_employee_id, updated_by_employee_id
    )
    VALUES (
      p_contract_id, p_tenant_id, p_tenant_supplier_id, p_contract_no, p_name,
      'draft', p_valid_from, p_valid_until, p_settlement_term_days,
      p_invoice_required_before_payment, p_document_file_id, 1,
      p_actor_employee_id, p_actor_employee_id
    )
    RETURNING * INTO v_contract;
  EXCEPTION
    WHEN unique_violation THEN
      RETURN jsonb_build_object(
        'status', 'state_conflict',
        'error_code', 'TENANT_SUPPLIER_STATE_CONFLICT'
      );
  END;

  INSERT INTO public.supplier_command_events (
    tenant_id, resource_type, resource_id, command, from_state, to_state,
    actor_user_id, actor_employee_id, idempotency_key, result_version
  )
  VALUES (
    p_tenant_id, 'supplier_contract', v_contract.id,
    'create_supplier_contract',
    jsonb_build_object('_request', v_request),
    to_jsonb(v_contract),
    p_actor_user_id, p_actor_employee_id, p_idempotency_key, v_contract.version
  );

  RETURN jsonb_build_object(
    'status', 'created',
    'idempotent', false,
    'contract', to_jsonb(v_contract),
    'version', v_contract.version
  );
END;
$$;

CREATE FUNCTION public.mutate_supplier_contract(
  p_tenant_id uuid,
  p_tenant_supplier_id uuid,
  p_contract_id uuid,
  p_action text,
  p_expected_version integer,
  p_actor_user_id uuid,
  p_actor_employee_id uuid,
  p_idempotency_key text,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_event public.supplier_command_events%ROWTYPE;
  v_contract public.supplier_contracts%ROWTYPE;
  v_relationship public.tenant_suppliers%ROWTYPE;
  v_before jsonb;
  v_next_status text;
  v_request jsonb;
BEGIN
  IF p_tenant_id IS NULL OR p_tenant_supplier_id IS NULL
    OR p_contract_id IS NULL OR p_action IS NULL
    OR p_expected_version IS NULL OR p_actor_user_id IS NULL
    OR p_actor_employee_id IS NULL OR p_idempotency_key IS NULL
    OR btrim(p_idempotency_key) = '' OR char_length(p_idempotency_key) > 120
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SUPPLIER_IDEMPOTENCY_CONFLICT';
  END IF;
  v_request := jsonb_build_object(
    'tenant_id', p_tenant_id,
    'tenant_supplier_id', p_tenant_supplier_id,
    'contract_id', p_contract_id,
    'action', p_action, 'expected_version', p_expected_version,
    'reason', p_reason, 'actor_employee_id', p_actor_employee_id
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('supplier-command:' || p_actor_user_id::text || ':' || p_idempotency_key, 0)
  );
  SELECT event.* INTO v_event
  FROM public.supplier_command_events AS event
  WHERE event.actor_user_id = p_actor_user_id AND event.idempotency_key = p_idempotency_key
  FOR UPDATE;
  IF FOUND THEN
    IF v_event.tenant_id IS DISTINCT FROM p_tenant_id
      OR v_event.from_state -> '_request' IS DISTINCT FROM v_request
      OR v_event.resource_type <> 'supplier_contract' OR v_event.resource_id <> p_contract_id
      OR v_event.command <> 'mutate_supplier_contract:' || p_action
    THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SUPPLIER_IDEMPOTENCY_CONFLICT';
    END IF;
    RETURN jsonb_build_object('status', 'updated', 'idempotent', true, 'contract', v_event.to_state, 'version', v_event.result_version);
  END IF;
  SELECT contract.* INTO v_contract
  FROM public.supplier_contracts AS contract
  WHERE contract.id = p_contract_id
    AND contract.tenant_id = p_tenant_id
    AND contract.tenant_supplier_id = p_tenant_supplier_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'tenant_supplier_not_found', 'error_code', 'TENANT_SUPPLIER_NOT_FOUND');
  END IF;
  SELECT relationship.* INTO v_relationship
  FROM public.tenant_suppliers AS relationship
  WHERE relationship.id = v_contract.tenant_supplier_id
    AND relationship.tenant_id = p_tenant_id
  FOR UPDATE;
  IF NOT FOUND
    OR v_relationship.id IS DISTINCT FROM p_tenant_supplier_id
    OR v_relationship.tenant_id IS DISTINCT FROM v_contract.tenant_id
  THEN
    RETURN jsonb_build_object('status', 'state_conflict', 'error_code', 'TENANT_SUPPLIER_STATE_CONFLICT');
  END IF;
  IF v_contract.version <> p_expected_version THEN
    RETURN jsonb_build_object('status', 'version_conflict', 'error_code', 'SUPPLIER_VERSION_CONFLICT', 'version', v_contract.version);
  END IF;
  IF p_action = 'activate' AND v_contract.lifecycle_status = 'draft' THEN
    v_next_status := 'active';
  ELSIF p_action = 'terminate' AND v_contract.lifecycle_status IN ('draft', 'active') THEN
    v_next_status := 'terminated';
  ELSE
    RETURN jsonb_build_object('status', 'state_conflict', 'error_code', 'TENANT_SUPPLIER_STATE_CONFLICT');
  END IF;
  v_before := to_jsonb(v_contract);
  UPDATE public.supplier_contracts AS contract
  SET lifecycle_status = v_next_status,
      updated_by_employee_id = p_actor_employee_id,
      version = contract.version + 1
  WHERE contract.id = p_contract_id
  RETURNING * INTO v_contract;
  INSERT INTO public.supplier_command_events (
    tenant_id, resource_type, resource_id, command, from_state, to_state, reason,
    actor_user_id, actor_employee_id, idempotency_key, result_version
  )
  VALUES (
    p_tenant_id, 'supplier_contract', v_contract.id,
    'mutate_supplier_contract:' || p_action,
    v_before || jsonb_build_object('_request', v_request), to_jsonb(v_contract),
    p_reason, p_actor_user_id, p_actor_employee_id, p_idempotency_key, v_contract.version
  );
  RETURN jsonb_build_object('status', 'updated', 'idempotent', false, 'contract', to_jsonb(v_contract), 'version', v_contract.version);
END;
$$;

CREATE FUNCTION public.get_tenant_supplier_order_eligibility_set(
  p_tenant_id uuid,
  p_checked_at timestamptz,
  p_tenant_supplier_id uuid DEFAULT NULL
)
RETURNS TABLE (
  tenant_id uuid,
  tenant_supplier_id uuid,
  supplier_id uuid,
  supplier_version integer,
  tenant_supplier_version integer,
  checked_at timestamptz,
  eligible boolean,
  blocking_reasons text[]
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  WITH relationships AS MATERIALIZED (
    SELECT
      relationship.tenant_id,
      relationship.id AS tenant_supplier_id,
      relationship.supplier_id,
      relationship.relationship_status,
      relationship.version AS tenant_supplier_version,
      supplier.version AS supplier_version,
      supplier.supplier_type,
      supplier.onboarding_status,
      supplier.operational_status
    FROM public.tenant_suppliers AS relationship
    JOIN public.suppliers AS supplier
      ON supplier.id = relationship.supplier_id
    WHERE relationship.tenant_id = p_tenant_id
      AND (
        p_tenant_supplier_id IS NULL
        OR relationship.id = p_tenant_supplier_id
      )
  ),
  qualification_status AS MATERIALIZED (
    SELECT
      relationship.tenant_supplier_id,
      qualification_type.id AS qualification_type_id,
      COALESCE(
        bool_or(qualification.verification_status = 'verified'),
        false
      ) AS has_verified,
      COALESCE(bool_or(
        qualification.verification_status = 'verified'
        AND (qualification.valid_from IS NULL OR qualification.valid_from <= p_checked_at::date)
        AND (qualification.valid_until IS NULL OR qualification.valid_until >= p_checked_at::date)
      ), false) AS has_current_valid,
      COALESCE(bool_and(
        qualification.valid_until IS NOT NULL
        AND qualification.valid_until < p_checked_at::date
      ) FILTER (
        WHERE qualification.verification_status = 'verified'
      ), false) AS all_verified_expired
    FROM relationships AS relationship
    JOIN public.supplier_qualification_types AS qualification_type
      ON qualification_type.status = 'active'
      AND qualification_type.blocks_new_orders
      AND (
        cardinality(qualification_type.applicable_supplier_types) = 0
        OR relationship.supplier_type =
          ANY (qualification_type.applicable_supplier_types)
      )
    LEFT JOIN public.supplier_qualifications AS qualification
      ON qualification.supplier_id = relationship.supplier_id
      AND qualification.qualification_type_id = qualification_type.id
    GROUP BY
      relationship.tenant_supplier_id,
      qualification_type.id
  ),
  qualification_rollup AS MATERIALIZED (
    SELECT
      qualification_status.tenant_supplier_id,
      bool_or(
        NOT qualification_status.has_current_valid
        AND NOT (
          qualification_status.has_verified
          AND qualification_status.all_verified_expired
        )
      ) AS has_missing,
      bool_or(
        NOT qualification_status.has_current_valid
        AND qualification_status.has_verified
        AND qualification_status.all_verified_expired
      ) AS has_expired
    FROM qualification_status
    GROUP BY qualification_status.tenant_supplier_id
  ),
  contract_status AS MATERIALIZED (
    SELECT
      relationship.tenant_supplier_id,
      COALESCE(bool_or(
        contract.lifecycle_status = 'active'
        AND contract.valid_from <= p_checked_at::date
        AND contract.valid_until >= p_checked_at::date
      ), false) AS has_active_contract
    FROM relationships AS relationship
    LEFT JOIN public.supplier_contracts AS contract
      ON contract.tenant_id = relationship.tenant_id
      AND contract.tenant_supplier_id = relationship.tenant_supplier_id
    GROUP BY relationship.tenant_supplier_id
  ),
  evaluated AS MATERIALIZED (
    SELECT
      relationship.tenant_id,
      relationship.tenant_supplier_id,
      relationship.supplier_id,
      relationship.supplier_version,
      relationship.tenant_supplier_version,
      p_checked_at AS checked_at,
      ARRAY_REMOVE(ARRAY[
        CASE
          WHEN NOT COALESCE(setting.module_enabled, false)
            THEN 'module_disabled'
        END,
        CASE
          WHEN relationship.onboarding_status <> 'approved'
            THEN 'supplier_not_approved'
        END,
        CASE
          WHEN relationship.operational_status = 'suspended'
            THEN 'supplier_suspended'
        END,
        CASE
          WHEN relationship.operational_status = 'blacklisted'
            THEN 'supplier_blacklisted'
        END,
        CASE
          WHEN relationship.relationship_status <> 'active'
            THEN 'relationship_not_active'
        END,
        CASE
          WHEN COALESCE(qualification_rollup.has_missing, false)
            THEN 'required_qualification_missing'
        END,
        CASE
          WHEN COALESCE(qualification_rollup.has_expired, false)
            THEN 'required_qualification_expired'
        END,
        CASE
          WHEN COALESCE(
            setting.require_active_contract_for_new_order,
            false
          )
          AND NOT COALESCE(contract_status.has_active_contract, false)
            THEN 'active_contract_required'
        END
      ], NULL)::text[] AS blocking_reasons
    FROM relationships AS relationship
    LEFT JOIN public.tenant_supplier_settings AS setting
      ON setting.tenant_id = relationship.tenant_id
    LEFT JOIN qualification_rollup
      ON qualification_rollup.tenant_supplier_id =
        relationship.tenant_supplier_id
    LEFT JOIN contract_status
      ON contract_status.tenant_supplier_id =
        relationship.tenant_supplier_id
  )
  SELECT
    evaluated.tenant_id,
    evaluated.tenant_supplier_id,
    evaluated.supplier_id,
    evaluated.supplier_version,
    evaluated.tenant_supplier_version,
    evaluated.checked_at,
    cardinality(evaluated.blocking_reasons) = 0 AS eligible,
    evaluated.blocking_reasons
  FROM evaluated;
$$;

CREATE FUNCTION public.get_tenant_supplier_order_eligibility(
  p_tenant_id uuid,
  p_tenant_supplier_id uuid,
  p_checked_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_eligibility record;
BEGIN
  IF p_checked_at IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'SUPPLIER_ORDER_NOT_ELIGIBLE';
  END IF;

  SELECT eligibility.*
  INTO v_eligibility
  FROM public.get_tenant_supplier_order_eligibility_set(
    p_tenant_id,
    p_checked_at,
    p_tenant_supplier_id
  ) AS eligibility;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'eligible', false,
      'blocking_reasons', jsonb_build_array('relationship_not_active'),
      'checked_at', p_checked_at,
      'tenant_id', p_tenant_id,
      'tenant_supplier_id', p_tenant_supplier_id,
      'error_code', 'TENANT_SUPPLIER_NOT_FOUND'
    );
  END IF;

  RETURN jsonb_build_object(
    'eligible', v_eligibility.eligible,
    'blocking_reasons', to_jsonb(v_eligibility.blocking_reasons),
    'checked_at', v_eligibility.checked_at,
    'tenant_id', v_eligibility.tenant_id,
    'tenant_supplier_id', v_eligibility.tenant_supplier_id,
    'supplier_id', v_eligibility.supplier_id,
    'supplier_version', v_eligibility.supplier_version,
    'tenant_supplier_version', v_eligibility.tenant_supplier_version
  );
END;
$$;

CREATE FUNCTION public.list_tenant_suppliers_for_tenant(
  p_tenant_id uuid,
  p_keyword text DEFAULT NULL,
  p_relationship_status text DEFAULT NULL,
  p_eligible boolean DEFAULT NULL,
  p_checked_at timestamptz DEFAULT now(),
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 20
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_page integer := GREATEST(COALESCE(p_page, 1), 1);
  v_page_size integer :=
    LEAST(GREATEST(COALESCE(p_page_size, 20), 1), 100);
  v_total bigint;
  v_items jsonb;
BEGIN
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'TENANT_SUPPLIER_NOT_FOUND';
  END IF;
  IF p_checked_at IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'SUPPLIER_ORDER_NOT_ELIGIBLE';
  END IF;

  WITH eligibility AS MATERIALIZED (
    SELECT eligibility_result.*
    FROM public.get_tenant_supplier_order_eligibility_set(
      p_tenant_id,
      p_checked_at,
      NULL
    ) AS eligibility_result
  ),
  eligible_relationships AS MATERIALIZED (
    SELECT
      relationship.id,
      relationship.updated_at,
      to_jsonb(relationship)
        || jsonb_build_object(
          'supplier',
          jsonb_build_object(
            'id', supplier.id,
            'code', supplier.code,
            'name', supplier.name,
            'legal_name', supplier.legal_name,
            'supplier_type', supplier.supplier_type,
            'onboarding_status', supplier.onboarding_status,
            'operational_status', supplier.operational_status,
            'version', supplier.version
          ),
          'eligibility',
          jsonb_build_object(
            'eligible', eligibility.eligible,
            'blocking_reasons', to_jsonb(eligibility.blocking_reasons),
            'checked_at', eligibility.checked_at,
            'tenant_id', eligibility.tenant_id,
            'tenant_supplier_id', eligibility.tenant_supplier_id,
            'supplier_id', eligibility.supplier_id,
            'supplier_version', eligibility.supplier_version,
            'tenant_supplier_version',
              eligibility.tenant_supplier_version
          )
        ) AS item
    FROM public.tenant_suppliers AS relationship
    JOIN public.suppliers AS supplier
      ON supplier.id = relationship.supplier_id
    JOIN eligibility
      ON eligibility.tenant_supplier_id = relationship.id
    WHERE relationship.tenant_id = p_tenant_id
      AND (
        p_relationship_status IS NULL
        OR relationship.relationship_status = p_relationship_status
      )
      AND (
        p_keyword IS NULL OR btrim(p_keyword) = ''
        OR supplier.code ILIKE '%' || btrim(p_keyword) || '%'
        OR supplier.name ILIKE '%' || btrim(p_keyword) || '%'
        OR supplier.legal_name ILIKE '%' || btrim(p_keyword) || '%'
      )
      AND (
        p_eligible IS NULL
        OR eligibility.eligible = p_eligible
      )
  ),
  summary AS (
    SELECT count(*) AS total
    FROM eligible_relationships
  ),
  paged AS (
    SELECT item, updated_at, id
    FROM eligible_relationships
    ORDER BY updated_at DESC, id DESC
    LIMIT v_page_size
    OFFSET (v_page - 1) * v_page_size
  )
  SELECT
    summary.total,
    COALESCE(
      jsonb_agg(paged.item ORDER BY paged.updated_at DESC, paged.id DESC)
        FILTER (WHERE paged.item IS NOT NULL),
      '[]'::jsonb
    )
  INTO v_total, v_items
  FROM summary
  LEFT JOIN paged ON true
  GROUP BY summary.total;

  RETURN jsonb_build_object(
    'items', v_items,
    'total', v_total,
    'page', v_page,
    'page_size', v_page_size
  );
END;
$$;

CREATE FUNCTION public.list_available_suppliers_for_tenant(
  p_tenant_id uuid,
  p_keyword text DEFAULT NULL,
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 20
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_page integer := GREATEST(COALESCE(p_page, 1), 1);
  v_page_size integer :=
    LEAST(GREATEST(COALESCE(p_page_size, 20), 1), 100);
  v_total bigint;
  v_items jsonb;
BEGIN
  WITH eligible_suppliers AS MATERIALIZED (
    SELECT
      supplier.id,
      supplier.code,
      supplier.name,
      supplier.legal_name,
      supplier.supplier_type,
      supplier.onboarding_status,
      supplier.operational_status,
      supplier.version
    FROM public.suppliers AS supplier
    WHERE supplier.onboarding_status = 'approved'
      AND supplier.operational_status = 'active'
      AND (
        p_keyword IS NULL OR btrim(p_keyword) = ''
        OR supplier.code ILIKE '%' || btrim(p_keyword) || '%'
        OR supplier.name ILIKE '%' || btrim(p_keyword) || '%'
        OR supplier.legal_name ILIKE '%' || btrim(p_keyword) || '%'
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.tenant_suppliers AS blocked_relationship
        WHERE blocked_relationship.tenant_id = p_tenant_id
          AND blocked_relationship.supplier_id = supplier.id
          AND blocked_relationship.relationship_status IN ('blacklisted', 'terminated')
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.tenant_suppliers AS existing_relationship
        WHERE existing_relationship.tenant_id = p_tenant_id
          AND existing_relationship.supplier_id = supplier.id
      )
  ),
  summary AS (
    SELECT count(*) AS total
    FROM eligible_suppliers
  ),
  paged AS (
    SELECT *
    FROM eligible_suppliers
    ORDER BY name ASC, id ASC
    LIMIT v_page_size
    OFFSET (v_page - 1) * v_page_size
  )
  SELECT
    summary.total,
    COALESCE(
      jsonb_agg(to_jsonb(paged) ORDER BY paged.name ASC, paged.id ASC)
        FILTER (WHERE paged.id IS NOT NULL),
      '[]'::jsonb
    )
  INTO v_total, v_items
  FROM summary
  LEFT JOIN paged ON true
  GROUP BY summary.total;

  RETURN jsonb_build_object(
    'items', v_items,
    'total', v_total,
    'page', v_page,
    'page_size', v_page_size
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_platform_supplier(uuid, text, text, text, text, text, integer, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_platform_supplier(uuid, text, text, text, text, text, integer, uuid, uuid, text) TO service_role;
REVOKE ALL ON FUNCTION public.create_supplier_qualification_type(uuid, text, text, text[], integer, boolean, boolean, text, integer, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_supplier_qualification_type(uuid, text, text, text[], integer, boolean, boolean, text, integer, uuid, uuid, text) TO service_role;
REVOKE ALL ON FUNCTION public.create_supplier_qualification(uuid, uuid, uuid, uuid, text, date, date, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_supplier_qualification(uuid, uuid, uuid, uuid, text, date, date, uuid, uuid, text) TO service_role;
REVOKE ALL ON FUNCTION public.create_supplier_service_region(uuid, uuid, text, text, text, date, date, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_supplier_service_region(uuid, uuid, text, text, text, date, date, uuid, uuid, text) TO service_role;
REVOKE ALL ON FUNCTION public.create_supplier_address(uuid, uuid, text, text, text, text, text, text, numeric, numeric, boolean, text, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_supplier_address(uuid, uuid, text, text, text, text, text, text, numeric, numeric, boolean, text, uuid, uuid, text) TO service_role;
REVOKE ALL ON FUNCTION public.create_supplier_contact(uuid, uuid, text, text, text, text, boolean, boolean, text, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_supplier_contact(uuid, uuid, text, text, text, text, boolean, boolean, text, uuid, uuid, text) TO service_role;
REVOKE ALL ON FUNCTION public.create_catalog_category(uuid, uuid, text, text, integer, text, integer, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_catalog_category(uuid, uuid, text, text, integer, text, integer, uuid, uuid, text) TO service_role;
REVOKE ALL ON FUNCTION public.create_catalog_brand(uuid, text, text, text, uuid, text, integer, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_catalog_brand(uuid, text, text, text, uuid, text, integer, uuid, uuid, text) TO service_role;
REVOKE ALL ON FUNCTION public.create_catalog_unit(uuid, text, text, text, uuid, text, text, integer, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_catalog_unit(uuid, text, text, text, uuid, text, text, integer, uuid, uuid, text) TO service_role;
REVOKE ALL ON FUNCTION public.mutate_platform_supplier(uuid, text, integer, uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mutate_platform_supplier(uuid, text, integer, uuid, uuid, text, text) TO service_role;
REVOKE ALL ON FUNCTION public.review_supplier_qualification(uuid, uuid, text, integer, uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.review_supplier_qualification(uuid, uuid, text, integer, uuid, uuid, text, text) TO service_role;
REVOKE ALL ON FUNCTION public.set_tenant_supplier_module(uuid, boolean, boolean, integer, uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_tenant_supplier_module(uuid, boolean, boolean, integer, uuid, uuid, text, text) TO service_role;
REVOKE ALL ON FUNCTION public.create_tenant_supplier(uuid, uuid, uuid, integer, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_tenant_supplier(uuid, uuid, uuid, integer, uuid, uuid, text) TO service_role;
REVOKE ALL ON FUNCTION public.mutate_tenant_supplier(uuid, uuid, text, integer, uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mutate_tenant_supplier(uuid, uuid, text, integer, uuid, uuid, text, text) TO service_role;
REVOKE ALL ON FUNCTION public.create_supplier_contract(uuid, uuid, uuid, text, text, date, date, integer, boolean, uuid, integer, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_supplier_contract(uuid, uuid, uuid, text, text, date, date, integer, boolean, uuid, integer, uuid, uuid, text) TO service_role;
REVOKE ALL ON FUNCTION public.mutate_supplier_contract(uuid, uuid, uuid, text, integer, uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mutate_supplier_contract(uuid, uuid, uuid, text, integer, uuid, uuid, text, text) TO service_role;
REVOKE ALL ON FUNCTION public.get_tenant_supplier_order_eligibility_set(uuid, timestamptz, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_tenant_supplier_order_eligibility(uuid, uuid, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_tenant_supplier_order_eligibility(uuid, uuid, timestamptz) TO service_role;
REVOKE ALL ON FUNCTION public.list_tenant_suppliers_for_tenant(uuid, text, text, boolean, timestamptz, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_tenant_suppliers_for_tenant(uuid, text, text, boolean, timestamptz, integer, integer) TO service_role;
REVOKE ALL ON FUNCTION public.list_available_suppliers_for_tenant(uuid, text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_available_suppliers_for_tenant(uuid, text, integer, integer) TO service_role;
REVOKE ALL ON TABLE public.platform_supplier_directory FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.platform_supplier_directory TO service_role;

COMMIT;
