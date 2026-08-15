-- Rollback: forward-only. Recreate the platform directory and guarded RPCs in
-- a new migration. Do not re-expose unguarded supplier commands.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';

CREATE OR REPLACE VIEW public.platform_supplier_directory
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
      OR supplier.supplier_type = ANY (
        qualification_type.applicable_supplier_types
      )
    )
  WHERE supplier.ownership_scope = 'platform'
    AND supplier.owner_tenant_id IS NULL
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
    bool_or(qualification.verification_status = 'verified') AS has_verified,
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
  WHERE supplier.ownership_scope = 'platform'
    AND supplier.owner_tenant_id IS NULL
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
JOIN supplier_health ON supplier_health.supplier_id = supplier.id
WHERE supplier.ownership_scope = 'platform'
  AND supplier.owner_tenant_id IS NULL;

CREATE FUNCTION public.assert_platform_supplier(p_supplier_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM supplier.id
  FROM public.suppliers AS supplier
  WHERE supplier.id = p_supplier_id
    AND supplier.ownership_scope = 'platform'
    AND supplier.owner_tenant_id IS NULL
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SUPPLIER_NOT_FOUND';
  END IF;
END;
$$;

CREATE FUNCTION public.create_supplier_qualification_guarded(
  p_qualification_id uuid, p_supplier_id uuid, p_qualification_type_id uuid,
  p_document_file_id uuid, p_certificate_no text, p_valid_from date,
  p_valid_until date, p_actor_user_id uuid, p_actor_employee_id uuid,
  p_idempotency_key text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
BEGIN
  PERFORM public.assert_platform_supplier(p_supplier_id);
  RETURN public.create_supplier_qualification(
    p_qualification_id, p_supplier_id, p_qualification_type_id,
    p_document_file_id, p_certificate_no, p_valid_from, p_valid_until,
    p_actor_user_id, p_actor_employee_id, p_idempotency_key
  );
END;
$$;

CREATE FUNCTION public.create_supplier_service_region_guarded(
  p_region_id uuid, p_supplier_id uuid, p_region_code text,
  p_region_level text, p_status text, p_valid_from date, p_valid_until date,
  p_actor_user_id uuid, p_actor_employee_id uuid, p_idempotency_key text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
BEGIN
  PERFORM public.assert_platform_supplier(p_supplier_id);
  RETURN public.create_supplier_service_region(
    p_region_id, p_supplier_id, p_region_code, p_region_level, p_status,
    p_valid_from, p_valid_until, p_actor_user_id, p_actor_employee_id,
    p_idempotency_key
  );
END;
$$;

CREATE FUNCTION public.create_supplier_address_guarded(
  p_address_id uuid, p_supplier_id uuid, p_address_type text, p_province text,
  p_city text, p_district text, p_region_code text, p_address_detail text,
  p_longitude numeric, p_latitude numeric, p_is_default boolean, p_status text,
  p_actor_user_id uuid, p_actor_employee_id uuid, p_idempotency_key text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
BEGIN
  PERFORM public.assert_platform_supplier(p_supplier_id);
  RETURN public.create_supplier_address(
    p_address_id, p_supplier_id, p_address_type, p_province, p_city,
    p_district, p_region_code, p_address_detail, p_longitude, p_latitude,
    p_is_default, p_status, p_actor_user_id, p_actor_employee_id,
    p_idempotency_key
  );
END;
$$;

CREATE FUNCTION public.create_supplier_contact_guarded(
  p_contact_id uuid, p_supplier_id uuid, p_contact_type text, p_name text,
  p_phone text, p_email text, p_is_public boolean, p_is_primary boolean,
  p_status text, p_actor_user_id uuid, p_actor_employee_id uuid,
  p_idempotency_key text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
BEGIN
  PERFORM public.assert_platform_supplier(p_supplier_id);
  RETURN public.create_supplier_contact(
    p_contact_id, p_supplier_id, p_contact_type, p_name, p_phone, p_email,
    p_is_public, p_is_primary, p_status, p_actor_user_id,
    p_actor_employee_id, p_idempotency_key
  );
END;
$$;

CREATE FUNCTION public.mutate_platform_supplier_guarded(
  p_supplier_id uuid, p_action text, p_expected_version integer,
  p_actor_user_id uuid, p_actor_employee_id uuid, p_idempotency_key text,
  p_reason text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
BEGIN
  PERFORM public.assert_platform_supplier(p_supplier_id);
  RETURN public.mutate_platform_supplier(
    p_supplier_id, p_action, p_expected_version, p_actor_user_id,
    p_actor_employee_id, p_idempotency_key, p_reason
  );
END;
$$;

CREATE FUNCTION public.review_supplier_qualification_guarded(
  p_supplier_id uuid, p_qualification_id uuid, p_verification_status text,
  p_expected_version integer, p_actor_user_id uuid, p_actor_employee_id uuid,
  p_idempotency_key text, p_reason text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
BEGIN
  PERFORM public.assert_platform_supplier(p_supplier_id);
  RETURN public.review_supplier_qualification(
    p_supplier_id, p_qualification_id, p_verification_status,
    p_expected_version, p_actor_user_id, p_actor_employee_id,
    p_idempotency_key, p_reason
  );
END;
$$;

REVOKE ALL ON FUNCTION public.assert_platform_supplier(uuid)
FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.create_supplier_qualification(uuid, uuid, uuid, uuid, text, date, date, uuid, uuid, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.create_supplier_service_region(uuid, uuid, text, text, text, date, date, uuid, uuid, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.create_supplier_address(uuid, uuid, text, text, text, text, text, text, numeric, numeric, boolean, text, uuid, uuid, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.create_supplier_contact(uuid, uuid, text, text, text, text, boolean, boolean, text, uuid, uuid, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.mutate_platform_supplier(uuid, text, integer, uuid, uuid, text, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.review_supplier_qualification(uuid, uuid, text, integer, uuid, uuid, text, text) FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.create_supplier_qualification_guarded(uuid, uuid, uuid, uuid, text, date, date, uuid, uuid, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_supplier_qualification_guarded(uuid, uuid, uuid, uuid, text, date, date, uuid, uuid, text) TO service_role;
REVOKE ALL ON FUNCTION public.create_supplier_service_region_guarded(uuid, uuid, text, text, text, date, date, uuid, uuid, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_supplier_service_region_guarded(uuid, uuid, text, text, text, date, date, uuid, uuid, text) TO service_role;
REVOKE ALL ON FUNCTION public.create_supplier_address_guarded(uuid, uuid, text, text, text, text, text, text, numeric, numeric, boolean, text, uuid, uuid, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_supplier_address_guarded(uuid, uuid, text, text, text, text, text, text, numeric, numeric, boolean, text, uuid, uuid, text) TO service_role;
REVOKE ALL ON FUNCTION public.create_supplier_contact_guarded(uuid, uuid, text, text, text, text, boolean, boolean, text, uuid, uuid, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_supplier_contact_guarded(uuid, uuid, text, text, text, text, boolean, boolean, text, uuid, uuid, text) TO service_role;
REVOKE ALL ON FUNCTION public.mutate_platform_supplier_guarded(uuid, text, integer, uuid, uuid, text, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mutate_platform_supplier_guarded(uuid, text, integer, uuid, uuid, text, text) TO service_role;
REVOKE ALL ON FUNCTION public.review_supplier_qualification_guarded(uuid, uuid, text, integer, uuid, uuid, text, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.review_supplier_qualification_guarded(uuid, uuid, text, integer, uuid, uuid, text, text) TO service_role;

COMMIT;
