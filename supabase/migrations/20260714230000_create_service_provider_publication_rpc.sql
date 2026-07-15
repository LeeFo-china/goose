-- Atomic tenant service-provider profile editing and platform publication.
-- Rollback: revoke/drop the eight functions and the two search indexes below.
-- Existing profile/area rows are business data and must not be deleted during rollback;
-- published rows should first be suspended through the application workflow.

BEGIN;

CREATE OR REPLACE FUNCTION public.update_tenant_service_provider_profile(
  p_tenant_id uuid,
  p_expected_version integer,
  p_patch jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_profile public.tenant_service_provider_profiles%ROWTYPE;
  v_after public.tenant_service_provider_profiles%ROWTYPE;
  v_next_status text;
  v_critical boolean;
BEGIN
  IF p_tenant_id IS NULL OR p_expected_version IS NULL OR p_expected_version < 1
    OR p_patch IS NULL OR pg_catalog.jsonb_typeof(p_patch) <> 'object'
    OR p_patch = '{}'::jsonb
    OR EXISTS (
      SELECT 1 FROM pg_catalog.jsonb_object_keys(p_patch) AS keys(key)
      WHERE keys.key <> ALL (ARRAY[
        'public_name', 'introduction', 'public_phone', 'address_province',
        'address_city', 'address_district', 'address_region_code', 'address',
        'address_latitude', 'address_longitude'
      ])
    )
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SERVICE_PROVIDER_PROFILE_PATCH_INVALID';
  END IF;

  SELECT profile.* INTO v_profile
  FROM public.tenant_service_provider_profiles AS profile
  WHERE profile.tenant_id = p_tenant_id
  FOR UPDATE;
  IF NOT FOUND THEN RETURN pg_catalog.jsonb_build_object('status', 'not_found'); END IF;
  IF v_profile.version <> p_expected_version THEN
    RETURN pg_catalog.jsonb_build_object('status', 'version_conflict');
  END IF;

  v_critical := p_patch ?| ARRAY[
    'public_name', 'public_phone', 'address_province', 'address_city',
    'address_district', 'address_region_code', 'address',
    'address_latitude', 'address_longitude'
  ];
  v_next_status := CASE
    WHEN v_profile.status = 'pending_review' THEN 'draft'
    WHEN v_profile.status IN ('published', 'suspended') AND v_critical THEN 'pending_review'
    ELSE v_profile.status
  END;

  IF v_next_status <> v_profile.status THEN
    UPDATE public.tenant_service_areas SET status = 'inactive'
    WHERE tenant_id = p_tenant_id AND status <> 'inactive';
  END IF;

  UPDATE public.tenant_service_provider_profiles AS profile SET
    public_name = CASE WHEN p_patch ? 'public_name' THEN NULLIF(pg_catalog.btrim(p_patch->>'public_name'), '') ELSE profile.public_name END,
    introduction = CASE WHEN p_patch ? 'introduction' THEN NULLIF(pg_catalog.btrim(p_patch->>'introduction'), '') ELSE profile.introduction END,
    public_phone = CASE WHEN p_patch ? 'public_phone' THEN NULLIF(pg_catalog.btrim(p_patch->>'public_phone'), '') ELSE profile.public_phone END,
    address_province = CASE WHEN p_patch ? 'address_province' THEN NULLIF(pg_catalog.btrim(p_patch->>'address_province'), '') ELSE profile.address_province END,
    address_city = CASE WHEN p_patch ? 'address_city' THEN NULLIF(pg_catalog.btrim(p_patch->>'address_city'), '') ELSE profile.address_city END,
    address_district = CASE WHEN p_patch ? 'address_district' THEN NULLIF(pg_catalog.btrim(p_patch->>'address_district'), '') ELSE profile.address_district END,
    address_region_code = CASE WHEN p_patch ? 'address_region_code' THEN NULLIF(pg_catalog.btrim(p_patch->>'address_region_code'), '') ELSE profile.address_region_code END,
    address = CASE WHEN p_patch ? 'address' THEN NULLIF(pg_catalog.btrim(p_patch->>'address'), '') ELSE profile.address END,
    address_latitude = CASE WHEN p_patch ? 'address_latitude' THEN (p_patch->>'address_latitude')::double precision ELSE profile.address_latitude END,
    address_longitude = CASE WHEN p_patch ? 'address_longitude' THEN (p_patch->>'address_longitude')::double precision ELSE profile.address_longitude END,
    status = v_next_status,
    submitted_at = CASE WHEN v_next_status = 'pending_review' THEN pg_catalog.now() WHEN v_next_status = 'draft' THEN NULL ELSE profile.submitted_at END,
    reviewed_by_employee_id = CASE WHEN v_next_status <> profile.status THEN NULL ELSE profile.reviewed_by_employee_id END,
    reviewed_at = CASE WHEN v_next_status <> profile.status THEN NULL ELSE profile.reviewed_at END,
    review_remark = CASE WHEN v_next_status <> profile.status THEN NULL ELSE profile.review_remark END,
    version = profile.version + 1
  WHERE profile.id = v_profile.id
  RETURNING profile.* INTO v_after;

  RETURN pg_catalog.jsonb_build_object('status', 'updated', 'profile', pg_catalog.to_jsonb(v_after));
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_tenant_service_provider_area(
  p_tenant_id uuid,
  p_area_id uuid,
  p_expected_profile_version integer,
  p_area jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_profile public.tenant_service_provider_profiles%ROWTYPE;
  v_after public.tenant_service_provider_profiles%ROWTYPE;
  v_area public.tenant_service_areas%ROWTYPE;
  v_next_status text;
BEGIN
  IF p_tenant_id IS NULL OR p_expected_profile_version IS NULL
    OR p_expected_profile_version < 1 OR p_area IS NULL
    OR pg_catalog.jsonb_typeof(p_area) <> 'object' OR p_area = '{}'::jsonb
    OR EXISTS (
      SELECT 1 FROM pg_catalog.jsonb_object_keys(p_area) AS keys(key)
      WHERE keys.key <> ALL (ARRAY[
        'province', 'city', 'district', 'adcode', 'center_latitude',
        'center_longitude', 'service_radius_km', 'priority'
      ])
    )
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SERVICE_PROVIDER_AREA_PATCH_INVALID';
  END IF;

  SELECT profile.* INTO v_profile
  FROM public.tenant_service_provider_profiles AS profile
  WHERE profile.tenant_id = p_tenant_id
  FOR UPDATE;
  IF NOT FOUND THEN RETURN pg_catalog.jsonb_build_object('status', 'not_found'); END IF;
  IF v_profile.version <> p_expected_profile_version THEN
    RETURN pg_catalog.jsonb_build_object('status', 'version_conflict');
  END IF;

  IF p_area_id IS NOT NULL THEN
    SELECT area.* INTO v_area
    FROM public.tenant_service_areas AS area
    WHERE area.id = p_area_id AND area.tenant_id = p_tenant_id
    FOR UPDATE;
    IF NOT FOUND THEN RETURN pg_catalog.jsonb_build_object('status', 'not_found'); END IF;
  END IF;

  v_next_status := CASE
    WHEN v_profile.status = 'pending_review' THEN 'draft'
    WHEN v_profile.status IN ('published', 'suspended') THEN 'pending_review'
    ELSE v_profile.status
  END;
  UPDATE public.tenant_service_areas SET status = 'inactive'
  WHERE tenant_id = p_tenant_id AND status <> 'inactive';

  IF p_area_id IS NULL THEN
    IF NULLIF(pg_catalog.btrim(p_area->>'city'), '') IS NULL
      OR NULLIF(pg_catalog.btrim(p_area->>'adcode'), '') IS NULL
    THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SERVICE_PROVIDER_AREA_FIELDS_REQUIRED';
    END IF;
    INSERT INTO public.tenant_service_areas (
      tenant_id, province, city, district, adcode, center_latitude,
      center_longitude, service_radius_km, priority, status
    ) VALUES (
      p_tenant_id, NULLIF(pg_catalog.btrim(p_area->>'province'), ''),
      pg_catalog.btrim(p_area->>'city'), NULLIF(pg_catalog.btrim(p_area->>'district'), ''),
      pg_catalog.btrim(p_area->>'adcode'), (p_area->>'center_latitude')::double precision,
      (p_area->>'center_longitude')::double precision, (p_area->>'service_radius_km')::numeric,
      COALESCE((p_area->>'priority')::integer, 100), 'inactive'
    ) RETURNING * INTO v_area;
  ELSE
    UPDATE public.tenant_service_areas AS area SET
      province = CASE WHEN p_area ? 'province' THEN NULLIF(pg_catalog.btrim(p_area->>'province'), '') ELSE area.province END,
      city = CASE WHEN p_area ? 'city' THEN pg_catalog.btrim(p_area->>'city') ELSE area.city END,
      district = CASE WHEN p_area ? 'district' THEN NULLIF(pg_catalog.btrim(p_area->>'district'), '') ELSE area.district END,
      adcode = CASE WHEN p_area ? 'adcode' THEN pg_catalog.btrim(p_area->>'adcode') ELSE area.adcode END,
      center_latitude = CASE WHEN p_area ? 'center_latitude' THEN (p_area->>'center_latitude')::double precision ELSE area.center_latitude END,
      center_longitude = CASE WHEN p_area ? 'center_longitude' THEN (p_area->>'center_longitude')::double precision ELSE area.center_longitude END,
      service_radius_km = CASE WHEN p_area ? 'service_radius_km' THEN (p_area->>'service_radius_km')::numeric ELSE area.service_radius_km END,
      priority = CASE WHEN p_area ? 'priority' THEN (p_area->>'priority')::integer ELSE area.priority END,
      status = 'inactive'
    WHERE area.id = p_area_id AND area.tenant_id = p_tenant_id
    RETURNING area.* INTO v_area;
    IF NOT FOUND THEN RETURN pg_catalog.jsonb_build_object('status', 'not_found'); END IF;
  END IF;

  IF NULLIF(pg_catalog.btrim(v_area.city), '') IS NULL
    OR NULLIF(pg_catalog.btrim(v_area.adcode), '') IS NULL
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SERVICE_PROVIDER_AREA_FIELDS_REQUIRED';
  END IF;

  UPDATE public.tenant_service_provider_profiles AS profile SET
    status = v_next_status,
    submitted_at = CASE WHEN v_next_status = 'pending_review' THEN pg_catalog.now() WHEN v_next_status = 'draft' THEN NULL ELSE profile.submitted_at END,
    reviewed_by_employee_id = CASE WHEN v_next_status <> profile.status THEN NULL ELSE profile.reviewed_by_employee_id END,
    reviewed_at = CASE WHEN v_next_status <> profile.status THEN NULL ELSE profile.reviewed_at END,
    review_remark = CASE WHEN v_next_status <> profile.status THEN NULL ELSE profile.review_remark END,
    version = profile.version + 1
  WHERE profile.id = v_profile.id
  RETURNING profile.* INTO v_after;

  RETURN pg_catalog.jsonb_build_object(
    'status', 'updated', 'profile', pg_catalog.to_jsonb(v_after),
    'area', pg_catalog.to_jsonb(v_area)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_tenant_service_provider_profile(
  p_tenant_id uuid,
  p_expected_version integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_profile public.tenant_service_provider_profiles%ROWTYPE;
  v_after public.tenant_service_provider_profiles%ROWTYPE;
BEGIN
  IF p_tenant_id IS NULL OR p_expected_version IS NULL OR p_expected_version < 1 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SERVICE_PROVIDER_SUBMIT_INPUT_INVALID';
  END IF;
  SELECT profile.* INTO v_profile FROM public.tenant_service_provider_profiles AS profile
  WHERE profile.tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RETURN pg_catalog.jsonb_build_object('status', 'not_found'); END IF;
  IF v_profile.version <> p_expected_version THEN RETURN pg_catalog.jsonb_build_object('status', 'version_conflict'); END IF;
  IF v_profile.status <> 'draft' THEN RETURN pg_catalog.jsonb_build_object('status', 'state_conflict'); END IF;
  IF NULLIF(pg_catalog.btrim(v_profile.public_name), '') IS NULL
    OR NULLIF(pg_catalog.btrim(v_profile.public_phone), '') IS NULL
    OR v_profile.public_phone !~ '^1[3-9][0-9]{9}$'
    OR NULLIF(pg_catalog.btrim(v_profile.address), '') IS NULL
    OR v_profile.address_latitude IS NULL OR v_profile.address_longitude IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM public.tenant_service_areas AS area
      WHERE area.tenant_id = p_tenant_id AND area.status = 'inactive'
    )
  THEN RETURN pg_catalog.jsonb_build_object('status', 'validation_failed'); END IF;

  UPDATE public.tenant_service_provider_profiles AS profile SET
    status = 'pending_review', submitted_at = pg_catalog.now(),
    reviewed_by_employee_id = NULL, reviewed_at = NULL, review_remark = NULL,
    version = profile.version + 1
  WHERE profile.id = v_profile.id RETURNING profile.* INTO v_after;
  RETURN pg_catalog.jsonb_build_object('status', 'updated', 'profile', pg_catalog.to_jsonb(v_after));
END;
$$;

CREATE OR REPLACE FUNCTION public.publish_tenant_service_provider(
  p_tenant_id uuid,
  p_expected_version integer,
  p_reviewer_employee_id uuid,
  p_review_remark text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_profile public.tenant_service_provider_profiles%ROWTYPE;
  v_after public.tenant_service_provider_profiles%ROWTYPE;
  v_remark text := NULLIF(pg_catalog.btrim(COALESCE(p_review_remark, '')), '');
BEGIN
  IF p_tenant_id IS NULL OR p_expected_version IS NULL OR p_expected_version < 1
    OR p_reviewer_employee_id IS NULL OR v_remark IS NULL OR pg_catalog.length(v_remark) > 500
  THEN RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SERVICE_PROVIDER_PUBLISH_INPUT_INVALID'; END IF;
  SELECT profile.* INTO v_profile FROM public.tenant_service_provider_profiles AS profile
  WHERE profile.tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RETURN pg_catalog.jsonb_build_object('status', 'not_found'); END IF;
  IF v_profile.version <> p_expected_version THEN RETURN pg_catalog.jsonb_build_object('status', 'version_conflict'); END IF;
  IF v_profile.status <> 'pending_review' THEN
    RETURN pg_catalog.jsonb_build_object('status', 'state_conflict');
  END IF;
  PERFORM 1 FROM public.tenants AS tenant
  WHERE tenant.id = p_tenant_id AND tenant.status = 'active'
  FOR SHARE;
  IF NOT FOUND THEN RETURN pg_catalog.jsonb_build_object('status', 'state_conflict'); END IF;
  PERFORM 1 FROM public.tenant_service_areas AS area
  WHERE area.tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RETURN pg_catalog.jsonb_build_object('status', 'validation_failed'); END IF;
  UPDATE public.tenant_service_areas SET status = 'active' WHERE tenant_id = p_tenant_id;
  UPDATE public.tenant_service_provider_profiles AS profile SET
    status = 'published', reviewed_by_employee_id = p_reviewer_employee_id,
    reviewed_at = pg_catalog.now(), review_remark = v_remark,
    published_at = pg_catalog.now(), suspended_at = NULL,
    version = profile.version + 1
  WHERE profile.id = v_profile.id RETURNING profile.* INTO v_after;
  RETURN pg_catalog.jsonb_build_object('status', 'updated', 'profile', pg_catalog.to_jsonb(v_after));
END;
$$;

CREATE OR REPLACE FUNCTION public.return_tenant_service_provider_to_draft(
  p_tenant_id uuid,
  p_expected_version integer,
  p_reviewer_employee_id uuid,
  p_review_remark text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_profile public.tenant_service_provider_profiles%ROWTYPE;
  v_after public.tenant_service_provider_profiles%ROWTYPE;
  v_remark text := NULLIF(pg_catalog.btrim(COALESCE(p_review_remark, '')), '');
BEGIN
  IF p_tenant_id IS NULL OR p_expected_version IS NULL OR p_expected_version < 1
    OR p_reviewer_employee_id IS NULL OR v_remark IS NULL OR pg_catalog.length(v_remark) > 500
  THEN RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SERVICE_PROVIDER_RETURN_INPUT_INVALID'; END IF;
  SELECT profile.* INTO v_profile FROM public.tenant_service_provider_profiles AS profile
  WHERE profile.tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RETURN pg_catalog.jsonb_build_object('status', 'not_found'); END IF;
  IF v_profile.version <> p_expected_version THEN RETURN pg_catalog.jsonb_build_object('status', 'version_conflict'); END IF;
  IF v_profile.status <> 'pending_review' THEN
    RETURN pg_catalog.jsonb_build_object('status', 'state_conflict');
  END IF;
  UPDATE public.tenant_service_areas SET status = 'inactive'
  WHERE tenant_id = p_tenant_id AND status <> 'inactive';
  UPDATE public.tenant_service_provider_profiles AS profile SET
    status = 'draft', submitted_at = NULL,
    reviewed_by_employee_id = p_reviewer_employee_id,
    reviewed_at = pg_catalog.now(), review_remark = v_remark,
    version = profile.version + 1
  WHERE profile.id = v_profile.id RETURNING profile.* INTO v_after;
  RETURN pg_catalog.jsonb_build_object('status', 'updated', 'profile', pg_catalog.to_jsonb(v_after));
END;
$$;

CREATE OR REPLACE FUNCTION public.suspend_tenant_service_provider(
  p_tenant_id uuid,
  p_expected_version integer,
  p_reviewer_employee_id uuid,
  p_review_remark text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_profile public.tenant_service_provider_profiles%ROWTYPE;
  v_after public.tenant_service_provider_profiles%ROWTYPE;
  v_remark text := NULLIF(pg_catalog.btrim(COALESCE(p_review_remark, '')), '');
BEGIN
  IF p_tenant_id IS NULL OR p_expected_version IS NULL OR p_expected_version < 1
    OR p_reviewer_employee_id IS NULL OR v_remark IS NULL OR pg_catalog.length(v_remark) > 500
  THEN RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SERVICE_PROVIDER_SUSPEND_INPUT_INVALID'; END IF;
  SELECT profile.* INTO v_profile FROM public.tenant_service_provider_profiles AS profile
  WHERE profile.tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RETURN pg_catalog.jsonb_build_object('status', 'not_found'); END IF;
  IF v_profile.version <> p_expected_version THEN RETURN pg_catalog.jsonb_build_object('status', 'version_conflict'); END IF;
  IF v_profile.status <> 'published' THEN RETURN pg_catalog.jsonb_build_object('status', 'state_conflict'); END IF;
  UPDATE public.tenant_service_areas SET status = 'inactive'
  WHERE tenant_id = p_tenant_id AND status <> 'inactive';
  UPDATE public.tenant_service_provider_profiles AS profile SET
    status = 'suspended', reviewed_by_employee_id = p_reviewer_employee_id,
    reviewed_at = pg_catalog.now(), review_remark = v_remark,
    suspended_at = pg_catalog.now(), version = profile.version + 1
  WHERE profile.id = v_profile.id RETURNING profile.* INTO v_after;
  RETURN pg_catalog.jsonb_build_object('status', 'updated', 'profile', pg_catalog.to_jsonb(v_after));
END;
$$;

CREATE INDEX IF NOT EXISTS tenant_service_provider_profiles_public_name_trgm_idx
  ON public.tenant_service_provider_profiles
  USING gin (public_name extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS tenants_name_trgm_idx
  ON public.tenants USING gin (name extensions.gin_trgm_ops);

CREATE OR REPLACE FUNCTION public.list_tenant_service_provider_publications(
  p_status text,
  p_keyword text
)
RETURNS TABLE(
  tenant_id uuid, tenant_name text, public_name text, public_phone text,
  address_city text, address_district text, status text, version integer,
  submitted_at timestamptz, updated_at timestamptz, area_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT
    profile.tenant_id, tenant.name, profile.public_name, profile.public_phone,
    profile.address_city, profile.address_district, profile.status,
    profile.version, profile.submitted_at, profile.updated_at,
    pg_catalog.count(area.id) AS area_count
  FROM public.tenant_service_provider_profiles AS profile
  JOIN public.tenants AS tenant ON tenant.id = profile.tenant_id
  LEFT JOIN public.tenant_service_areas AS area ON area.tenant_id = profile.tenant_id
  WHERE (p_status IS NULL OR profile.status = p_status)
    AND (
      NULLIF(pg_catalog.btrim(COALESCE(p_keyword, '')), '') IS NULL
      OR profile.public_name ILIKE '%' || pg_catalog.btrim(p_keyword) || '%'
      OR tenant.name ILIKE '%' || pg_catalog.btrim(p_keyword) || '%'
    )
  GROUP BY profile.id, tenant.id
  ORDER BY profile.updated_at DESC, profile.tenant_id DESC;
$$;

CREATE OR REPLACE FUNCTION public.list_visitor_local_service_providers(
  p_region_codes text[]
)
RETURNS TABLE(
  tenant_id uuid, public_name text, introduction text, public_phone text,
  address_province text, address_city text, address_district text,
  address_region_code text, address text, address_latitude double precision,
  address_longitude double precision, matched_region_code text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT
    profile.tenant_id, profile.public_name, profile.introduction,
    profile.public_phone, profile.address_province, profile.address_city,
    profile.address_district, profile.address_region_code, profile.address,
    profile.address_latitude, profile.address_longitude,
    (pg_catalog.array_agg(
      area.adcode ORDER BY pg_catalog.array_position(p_region_codes, area.adcode)
    ))[1] AS matched_region_code
  FROM public.tenant_service_provider_profiles AS profile
  JOIN public.tenants AS tenant
    ON tenant.id = profile.tenant_id AND tenant.status = 'active'
  JOIN public.tenant_service_areas AS area
    ON area.tenant_id = profile.tenant_id
   AND area.status = 'active'
   AND area.adcode = ANY (COALESCE(p_region_codes, '{}'::text[]))
  WHERE profile.status = 'published'
  GROUP BY profile.id
  ORDER BY pg_catalog.max(area.priority) DESC, profile.updated_at DESC,
    profile.tenant_id DESC;
$$;

REVOKE ALL ON FUNCTION public.update_tenant_service_provider_profile(uuid, integer, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_tenant_service_provider_profile(uuid, integer, jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.upsert_tenant_service_provider_area(uuid, uuid, integer, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_tenant_service_provider_area(uuid, uuid, integer, jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.submit_tenant_service_provider_profile(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_tenant_service_provider_profile(uuid, integer) TO service_role;
REVOKE ALL ON FUNCTION public.publish_tenant_service_provider(uuid, integer, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.publish_tenant_service_provider(uuid, integer, uuid, text) TO service_role;
REVOKE ALL ON FUNCTION public.return_tenant_service_provider_to_draft(uuid, integer, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.return_tenant_service_provider_to_draft(uuid, integer, uuid, text) TO service_role;
REVOKE ALL ON FUNCTION public.suspend_tenant_service_provider(uuid, integer, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.suspend_tenant_service_provider(uuid, integer, uuid, text) TO service_role;
REVOKE ALL ON FUNCTION public.list_tenant_service_provider_publications(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_tenant_service_provider_publications(text, text) TO service_role;
REVOKE ALL ON FUNCTION public.list_visitor_local_service_providers(text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_visitor_local_service_providers(text[]) TO service_role;

COMMIT;
