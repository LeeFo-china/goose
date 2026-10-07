BEGIN;

CREATE OR REPLACE FUNCTION public.create_platform_tenant_with_trial(
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
  p_operator_employee_id uuid DEFAULT NULL,
  p_trial_days integer DEFAULT NULL,
  p_trial_reason text DEFAULT NULL,
  p_trial_idempotency_key uuid DEFAULT NULL,
  p_allow_override boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  v_created jsonb;
  v_tenant public.tenants%ROWTYPE;
  v_grant jsonb;
  v_trial jsonb := NULL;
BEGIN
  IF p_operator_employee_id IS NULL
    OR (p_trial_days IS NULL) <> (p_trial_reason IS NULL)
    OR (p_trial_days IS NULL) <> (p_trial_idempotency_key IS NULL)
  THEN
    RAISE EXCEPTION 'TENANT_CREATION_INPUT_INVALID' USING ERRCODE = '22023';
  END IF;

  v_created := public.create_tenant_with_default_template(
    p_name => p_name,
    p_slug => p_slug,
    p_status => p_status,
    p_address => p_address,
    p_address_title => p_address_title,
    p_address_poi_id => p_address_poi_id,
    p_address_province => p_address_province,
    p_address_city => p_address_city,
    p_address_district => p_address_district,
    p_address_adcode => p_address_adcode,
    p_address_latitude => p_address_latitude,
    p_address_longitude => p_address_longitude,
    p_address_source => p_address_source,
    p_address_confidence => p_address_confidence,
    p_address_confirmed_at => p_address_confirmed_at,
    p_contact_name => p_contact_name,
    p_contact_phone => p_contact_phone,
    p_admin_name => p_admin_name,
    p_admin_phone => p_admin_phone,
    p_admin_auth_user_id => p_admin_auth_user_id,
    p_admin_department_code => p_admin_department_code,
    p_admin_post_code => p_admin_post_code,
    p_operator_employee_id => p_operator_employee_id
  );

  UPDATE public.tenants
  SET creation_source = 'platform_manual',
      service_access_policy = 'entitlement_required'
  WHERE id = (v_created->'tenant'->>'id')::uuid
  RETURNING * INTO v_tenant;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TENANT_CREATION_INPUT_INVALID' USING ERRCODE = '22023';
  END IF;

  IF p_trial_days IS NOT NULL THEN
    v_grant := public.platform_service_trial_grant(
      p_tenant_id => v_tenant.id,
      p_actor_employee_id => p_operator_employee_id,
      p_trial_type => 'standard',
      p_scope => NULL,
      p_reason => p_trial_reason,
      p_idempotency_key => p_trial_idempotency_key,
      p_trial_days => p_trial_days,
      p_grace_days => 7,
      p_starts_at => NULL,
      p_assignee_employee_id => NULL,
      p_allow_override => p_allow_override
    );
    v_trial := jsonb_build_object(
      'id', v_grant->'trial_snapshot'->>'id',
      'status', v_grant->'trial_snapshot'->>'status',
      'trial_ends_at', v_grant->'trial_snapshot'->>'trial_ends_at',
      'grace_ends_at', v_grant->'trial_snapshot'->>'grace_ends_at'
    );
  END IF;

  RETURN jsonb_set(v_created, '{tenant}', to_jsonb(v_tenant))
    || jsonb_build_object('trial', v_trial);
END;
$$;

REVOKE ALL ON FUNCTION public.create_platform_tenant_with_trial(
  text, text, text, text, text, text, text, text, text, text,
  numeric, numeric, text, numeric, timestamptz, text, text,
  text, text, uuid, text, text, uuid, integer, text, uuid, boolean
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_platform_tenant_with_trial(
  text, text, text, text, text, text, text, text, text, text,
  numeric, numeric, text, numeric, timestamptz, text, text,
  text, text, uuid, text, text, uuid, integer, text, uuid, boolean
) TO service_role;

COMMIT;
