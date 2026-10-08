-- Fix manual tenant creation omitting the editable service-provider profile.
-- Rollback: restore the previous creation RPC in a forward migration if needed.
-- Preserve all initialized profiles; deleting them could discard tenant edits.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE OR REPLACE FUNCTION public.create_tenant_with_default_template(
  p_name text,
  p_slug text,
  p_status text DEFAULT 'active',
  p_address text DEFAULT NULL,
  p_address_title text DEFAULT NULL,
  p_address_poi_id text DEFAULT NULL,
  p_address_province text DEFAULT NULL,
  p_address_city text DEFAULT NULL,
  p_address_district text DEFAULT NULL,
  p_address_adcode text DEFAULT NULL,
  p_address_latitude numeric DEFAULT NULL,
  p_address_longitude numeric DEFAULT NULL,
  p_address_source text DEFAULT NULL,
  p_address_confidence numeric DEFAULT NULL,
  p_address_confirmed_at timestamptz DEFAULT NULL,
  p_contact_name text DEFAULT NULL,
  p_contact_phone text DEFAULT NULL,
  p_admin_name text DEFAULT NULL,
  p_admin_phone text DEFAULT NULL,
  p_admin_auth_user_id uuid DEFAULT NULL,
  p_admin_department_code text DEFAULT 'EXEC_OFFICE',
  p_admin_post_code text DEFAULT 'SYSTEM_ADMIN',
  p_operator_employee_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  v_name text := NULLIF(pg_catalog.btrim(COALESCE(p_name, '')), '');
  v_slug text := pg_catalog.btrim(COALESCE(p_slug, ''));
  v_address text := NULLIF(pg_catalog.btrim(COALESCE(p_address, '')), '');
  v_address_title text :=
    NULLIF(pg_catalog.btrim(COALESCE(p_address_title, '')), '');
  v_address_poi_id text :=
    NULLIF(pg_catalog.btrim(COALESCE(p_address_poi_id, '')), '');
  v_address_province text :=
    NULLIF(pg_catalog.btrim(COALESCE(p_address_province, '')), '');
  v_address_city text :=
    NULLIF(pg_catalog.btrim(COALESCE(p_address_city, '')), '');
  v_address_district text :=
    NULLIF(pg_catalog.btrim(COALESCE(p_address_district, '')), '');
  v_address_adcode text :=
    NULLIF(pg_catalog.btrim(COALESCE(p_address_adcode, '')), '');
  v_address_source text := p_address_source;
  v_contact_name text :=
    NULLIF(pg_catalog.btrim(COALESCE(p_contact_name, '')), '');
  v_contact_phone text :=
    NULLIF(pg_catalog.btrim(COALESCE(p_contact_phone, '')), '');
  v_admin_name text := NULLIF(pg_catalog.btrim(COALESCE(p_admin_name, '')), '');
  v_admin_phone text := NULLIF(pg_catalog.btrim(COALESCE(p_admin_phone, '')), '');
  v_admin_employee_id uuid;
  v_constraint_name text;
  v_tenant public.tenants%ROWTYPE;
  v_initialization jsonb;
BEGIN
  IF v_name IS NULL
    OR pg_catalog.char_length(v_name) > 100
    OR p_slug IS NULL
    OR pg_catalog.char_length(v_slug) NOT BETWEEN 2 AND 64
    OR v_slug !~ '^[a-z0-9][a-z0-9_-]*[a-z0-9]$'
    OR p_status IS NULL
    OR p_status NOT IN ('active', 'suspended')
    OR pg_catalog.char_length(v_address) > 200
    OR pg_catalog.char_length(v_address_title) > 120
    OR pg_catalog.char_length(v_address_poi_id) > 120
    OR pg_catalog.char_length(v_address_province) > 40
    OR pg_catalog.char_length(v_address_city) > 40
    OR pg_catalog.char_length(v_address_district) > 40
    OR pg_catalog.char_length(v_address_adcode) > 20
    OR pg_catalog.char_length(v_contact_name) > 80
    OR pg_catalog.char_length(v_contact_phone) > 30
    OR (
      p_address_latitude IS NOT NULL
      AND p_address_latitude NOT BETWEEN -90 AND 90
    )
    OR (
      p_address_longitude IS NOT NULL
      AND p_address_longitude NOT BETWEEN -180 AND 180
    )
    OR (
      p_address_confidence IS NOT NULL
      AND p_address_confidence NOT BETWEEN 0 AND 1
    )
    OR (
      v_address_source IS NOT NULL
      AND v_address_source NOT IN (
        'manual',
        'tencent_suggestion',
        'tencent_geocoder',
        'map_picker'
      )
    )
    OR p_admin_department_code IS DISTINCT FROM 'EXEC_OFFICE'
    OR p_admin_post_code IS DISTINCT FROM 'SYSTEM_ADMIN'
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'TENANT_CREATION_INPUT_INVALID';
  END IF;

  IF (v_admin_name IS NULL) <> (v_admin_phone IS NULL)
    OR (v_admin_name IS NOT NULL AND pg_catalog.char_length(v_admin_name) > 50)
    OR (v_admin_phone IS NOT NULL AND v_admin_phone !~ '^1[3-9][0-9]{9}$')
    OR (p_admin_auth_user_id IS NOT NULL AND v_admin_name IS NULL)
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'TENANT_INITIALIZATION_INPUT_INVALID';
  END IF;

  IF v_admin_phone IS NOT NULL
    AND public.lock_and_check_active_employee_phone(v_admin_phone)
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '23505',
      MESSAGE = 'TENANT_ADMIN_PHONE_EXISTS';
  END IF;

  PERFORM tenant.id
  FROM public.tenants AS tenant
  WHERE tenant.slug = v_slug
  LIMIT 1
  FOR SHARE;
  IF FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '23505',
      MESSAGE = 'TENANT_SLUG_EXISTS';
  END IF;

  BEGIN
    INSERT INTO public.tenants (
      name,
      slug,
      status,
      address,
      address_title,
      address_poi_id,
      address_province,
      address_city,
      address_district,
      address_adcode,
      address_latitude,
      address_longitude,
      address_source,
      address_confidence,
      address_confirmed_at,
      contact_name,
      contact_phone
    )
    VALUES (
      v_name,
      v_slug,
      p_status,
      v_address,
      v_address_title,
      v_address_poi_id,
      v_address_province,
      v_address_city,
      v_address_district,
      v_address_adcode,
      p_address_latitude,
      p_address_longitude,
      v_address_source,
      p_address_confidence,
      p_address_confirmed_at,
      v_contact_name,
      v_contact_phone
    )
    RETURNING tenants.* INTO v_tenant;
  EXCEPTION
    WHEN unique_violation THEN
      GET STACKED DIAGNOSTICS v_constraint_name = CONSTRAINT_NAME;
      IF v_constraint_name = 'tenants_slug_key' THEN
        RAISE EXCEPTION USING
          ERRCODE = '23505',
          MESSAGE = 'TENANT_SLUG_EXISTS';
      END IF;
      RAISE;
  END;

  v_initialization := public.initialize_default_decoration_tenant(
    v_tenant.id,
    v_admin_name,
    v_admin_phone,
    p_operator_employee_id
  );

  IF v_initialization ->> 'template_code' IS DISTINCT FROM
      'default_decoration_company'
    OR v_initialization ->> 'template_version' IS DISTINCT FROM '2026.08.30'
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'TENANT_TEMPLATE_STATE_CONFLICT';
  END IF;

  IF p_admin_auth_user_id IS NOT NULL THEN
    v_admin_employee_id := NULLIF(
      v_initialization ->> 'admin_employee_id',
      ''
    )::uuid;

    IF v_admin_employee_id IS NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'TENANT_TEMPLATE_STATE_CONFLICT';
    END IF;

    UPDATE public.employees AS employee
    SET user_id = p_admin_auth_user_id
    WHERE employee.id = v_admin_employee_id
      AND employee.tenant_id = v_tenant.id;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'TENANT_TEMPLATE_STATE_CONFLICT';
    END IF;
  END IF;

  -- Manual/partner platform creation needs the same editable draft as onboarding.
  -- A login/contact phone is not automatically a public contact phone.
  INSERT INTO public.tenant_service_provider_profiles (
    tenant_id, public_name, public_phone, address_province, address_city,
    address_district, address_region_code, address,
    address_latitude, address_longitude, status
  ) VALUES (
    v_tenant.id, v_tenant.name, NULL, v_tenant.address_province, v_tenant.address_city,
    v_tenant.address_district, v_tenant.address_adcode, v_tenant.address,
    v_tenant.address_latitude, v_tenant.address_longitude, 'draft'
  );

  RETURN pg_catalog.jsonb_build_object(
    'tenant', pg_catalog.to_jsonb(v_tenant),
    'initialization', v_initialization
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_tenant_with_default_template(
  text,text,text,text,text,text,text,text,text,text,numeric,numeric,text,numeric,
  timestamptz,text,text,text,text,uuid,text,text,uuid
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_tenant_with_default_template(
  text,text,text,text,text,text,text,text,text,text,numeric,numeric,text,numeric,
  timestamptz,text,text,text,text,uuid,text,text,uuid
) TO service_role;

-- Backfill only missing drafts. Existing drafts, reviews, publications and
-- service areas are untouched; no contact phone is made public implicitly.
INSERT INTO public.tenant_service_provider_profiles (
  tenant_id, public_name, public_phone, address_province, address_city,
  address_district, address_region_code, address,
  address_latitude, address_longitude, status
)
SELECT
  tenant.id, NULLIF(pg_catalog.btrim(tenant.name), ''), NULL,
  tenant.address_province, tenant.address_city, tenant.address_district,
  tenant.address_adcode, tenant.address, tenant.address_latitude,
  tenant.address_longitude, 'draft'
FROM public.tenants AS tenant
WHERE (tenant.status = 'active' OR tenant.creation_source = 'platform_manual')
  AND NOT EXISTS (
    SELECT 1 FROM public.tenant_service_provider_profiles AS profile
    WHERE profile.tenant_id = tenant.id
  )
ON CONFLICT (tenant_id) DO NOTHING;

COMMIT;
