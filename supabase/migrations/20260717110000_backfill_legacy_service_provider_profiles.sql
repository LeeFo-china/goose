-- Backfill service-provider public profiles for active tenants that existed
-- before the local service-provider onboarding workflow.

INSERT INTO public.tenant_service_provider_profiles (
  tenant_id,
  public_name,
  public_phone,
  status
)
SELECT
  tenant.id,
  pg_catalog.btrim(tenant.name),
  NULLIF(pg_catalog.btrim(tenant.contact_phone), ''),
  'draft'
FROM public.tenants AS tenant
WHERE tenant.status = 'active'
  AND NOT EXISTS (
    SELECT 1
    FROM public.tenant_service_provider_profiles AS existing_profile
    WHERE existing_profile.tenant_id = tenant.id
  )
ON CONFLICT (tenant_id) DO NOTHING;

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

  SELECT profile.* INTO v_profile
  FROM public.tenant_service_provider_profiles AS profile
  WHERE profile.tenant_id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN RETURN pg_catalog.jsonb_build_object('status', 'not_found'); END IF;
  IF v_profile.version <> p_expected_version THEN RETURN pg_catalog.jsonb_build_object('status', 'version_conflict'); END IF;
  IF v_profile.status <> 'draft' THEN RETURN pg_catalog.jsonb_build_object('status', 'state_conflict'); END IF;

  IF NULLIF(pg_catalog.btrim(v_profile.public_name), '') IS NULL
    OR NULLIF(pg_catalog.btrim(v_profile.public_phone), '') IS NULL
    OR v_profile.public_phone !~ '^1[3-9][0-9]{9}$'
    OR NULLIF(pg_catalog.btrim(v_profile.address), '') IS NULL
    OR v_profile.address_latitude IS NULL OR v_profile.address_longitude IS NULL
    OR NOT EXISTS (
      SELECT 1
      FROM public.tenant_service_areas AS area
      WHERE area.tenant_id = p_tenant_id
    )
  THEN RETURN pg_catalog.jsonb_build_object('status', 'validation_failed'); END IF;

  UPDATE public.tenant_service_areas
  SET status = 'inactive'
  WHERE tenant_id = p_tenant_id
    AND status <> 'inactive';

  UPDATE public.tenant_service_provider_profiles AS profile SET
    status = 'pending_review',
    submitted_at = pg_catalog.now(),
    reviewed_by_employee_id = NULL,
    reviewed_at = NULL,
    review_remark = NULL,
    version = profile.version + 1
  WHERE profile.id = v_profile.id
  RETURNING profile.* INTO v_after;

  RETURN pg_catalog.jsonb_build_object('status', 'updated', 'profile', pg_catalog.to_jsonb(v_after));
END;
$$;

REVOKE ALL ON FUNCTION public.submit_tenant_service_provider_profile(uuid, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_tenant_service_provider_profile(uuid, integer)
  TO service_role;
