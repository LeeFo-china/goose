-- Expose decoration-company master contacts separately from immutable trial
-- application contacts. Responses are masked at the SQL boundary.
DO $fixture_contact$
DECLARE
  v_is_develop boolean;
  v_fixture_count integer;
  v_updated_count integer;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM public.system_settings
    WHERE tenant_id IS NULL
      AND key = 'WECHAT_MINIPROGRAM_ENV_VERSION'
      AND status = 'active'
      AND lower(btrim(value_text)) = 'develop'
  ) INTO v_is_develop;

  IF NOT v_is_develop THEN
    RETURN;
  END IF;

  SELECT count(*)
  INTO v_fixture_count
  FROM public.tenants
  WHERE id IN (
    '9f090000-0000-4000-8000-000000000001',
    '9f090000-0000-4000-8000-000000000002',
    '9f090000-0000-4000-8000-000000000003',
    '9f090000-0000-4000-8000-000000000004',
    '9f090000-0000-4000-8000-000000000005',
    '9f090000-0000-4000-8000-000000000006'
  );

  IF v_fixture_count = 0 THEN
    RETURN;
  END IF;
  IF v_fixture_count <> 6 THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SERVICE_TRIAL_DEV_CONTACT_FIXTURE_PARTIAL';
  END IF;

  UPDATE public.tenants AS tenant
  SET contact_name = fixture.contact_name,
    contact_phone = fixture.contact_phone,
    updated_at = clock_timestamp()
  FROM (VALUES
    ('9f090000-0000-4000-8000-000000000001'::uuid, 'dev-trial-application', 'Task9 Dev Fixture', '19900009101'),
    ('9f090000-0000-4000-8000-000000000002'::uuid, 'dev-trial-platform-grant', 'Task9 Dev Fixture', '19900009102'),
    ('9f090000-0000-4000-8000-000000000003'::uuid, 'dev-trial-active', 'Task9 Dev Fixture', '19900009103'),
    ('9f090000-0000-4000-8000-000000000004'::uuid, 'dev-trial-grace', 'Task9 Dev Fixture', '19900009104'),
    ('9f090000-0000-4000-8000-000000000005'::uuid, 'dev-trial-expired', 'Task9 Dev Fixture', '19900009105'),
    ('9f090000-0000-4000-8000-000000000006'::uuid, 'dev-trial-converted', 'Task9 Dev Fixture', '19900009106')
  ) AS fixture(tenant_id, slug, contact_name, contact_phone)
  WHERE tenant.id = fixture.tenant_id
    AND tenant.slug = fixture.slug;

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  IF v_updated_count <> 6 THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'SERVICE_TRIAL_DEV_CONTACT_FIXTURE_PARTIAL';
  END IF;
END;
$fixture_contact$;

CREATE OR REPLACE FUNCTION public.platform_service_trial_list(
  p_tenant_id uuid DEFAULT NULL,
  p_platform boolean DEFAULT false,
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 20,
  p_keyword text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_source text DEFAULT NULL,
  p_trial_type text DEFAULT NULL,
  p_assignee_employee_id uuid DEFAULT NULL,
  p_applied_from timestamptz DEFAULT NULL,
  p_applied_to timestamptz DEFAULT NULL,
  p_expires_from timestamptz DEFAULT NULL,
  p_expires_to timestamptz DEFAULT NULL,
  p_now timestamptz DEFAULT clock_timestamp()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF p_platform IS NULL OR p_page IS NULL OR p_page < 1
    OR p_page_size IS NULL OR p_page_size NOT BETWEEN 1 AND 100
    OR p_now IS NULL
    OR (p_platform AND p_tenant_id IS NOT NULL)
    OR (NOT p_platform AND p_tenant_id IS NULL)
    OR (p_status IS NOT NULL AND p_status NOT IN (
      'pending_review', 'scheduled', 'active', 'grace_period', 'expired',
      'rejected', 'withdrawn', 'revoked', 'converted'
    ))
    OR (p_source IS NOT NULL
      AND p_source NOT IN ('tenant_application', 'platform_grant'))
    OR (p_trial_type IS NOT NULL AND p_trial_type NOT IN ('standard', 'guided'))
    OR (NOT p_platform AND (
      p_keyword IS NOT NULL OR p_source IS NOT NULL OR p_trial_type IS NOT NULL
      OR p_assignee_employee_id IS NOT NULL OR p_applied_from IS NOT NULL
      OR p_applied_to IS NOT NULL OR p_expires_from IS NOT NULL
      OR p_expires_to IS NOT NULL
    ))
  THEN
    RAISE EXCEPTION 'SERVICE_TRIAL_ACTION_NOT_ALLOWED' USING ERRCODE = 'P0001';
  END IF;

  WITH effective AS MATERIALIZED (
    SELECT trial.*,
      CASE
        WHEN trial.status IN ('scheduled', 'active', 'grace_period')
          AND p_now >= trial.grace_ends_at THEN 'expired'
        WHEN trial.status IN ('scheduled', 'active')
          AND p_now >= trial.trial_ends_at
          AND p_now < trial.grace_ends_at THEN 'grace_period'
        WHEN trial.status = 'scheduled' AND p_now >= trial.starts_at THEN 'active'
        ELSE trial.status
      END AS effective_status,
      tenant.contact_name AS tenant_contact_name,
      tenant.contact_phone AS tenant_contact_phone,
      jsonb_build_object(
        'id', tenant.id,
        'name', tenant.name,
        'slug', tenant.slug,
        'contact_name', CASE WHEN tenant.contact_name IS NULL THEN NULL
          WHEN NULLIF(btrim(tenant.contact_name), '') IS NULL THEN NULL
          ELSE substring(btrim(tenant.contact_name) FROM 1 FOR 1)
            || repeat('*', greatest(1, char_length(btrim(tenant.contact_name)) - 1))
        END,
        'contact_phone', CASE WHEN tenant.contact_phone IS NULL THEN NULL
          WHEN NULLIF(btrim(tenant.contact_phone), '') IS NULL THEN NULL
          WHEN char_length(btrim(tenant.contact_phone)) = 1 THEN '****'
          WHEN char_length(btrim(tenant.contact_phone)) < 8 THEN
            left(btrim(tenant.contact_phone), 1) || '****'
              || right(btrim(tenant.contact_phone), 1)
          ELSE left(btrim(tenant.contact_phone), 3) || '****'
            || right(btrim(tenant.contact_phone), 4)
        END
      ) AS tenant,
      CASE WHEN assignee.id IS NULL THEN NULL ELSE jsonb_build_object(
        'id', assignee.id, 'name', assignee.name,
        'phone', CASE WHEN assignee.phone IS NULL THEN NULL ELSE
          substring(assignee.phone FROM 1 FOR 3) || '****' || right(assignee.phone, 4)
        END, 'status', assignee.status
      ) END AS assignee
    FROM public.tenant_service_trials AS trial
    JOIN public.tenants AS tenant ON tenant.id = trial.tenant_id
    LEFT JOIN public.employees AS assignee
      ON assignee.id = trial.assignee_employee_id
    WHERE p_platform OR trial.tenant_id = p_tenant_id
  ), filtered AS MATERIALIZED (
    SELECT * FROM effective
    WHERE (p_status IS NULL OR effective_status = p_status)
      AND (p_source IS NULL OR source = p_source)
      AND (p_trial_type IS NULL OR trial_type = p_trial_type)
      AND (p_assignee_employee_id IS NULL
        OR assignee_employee_id = p_assignee_employee_id)
      AND (p_applied_from IS NULL OR requested_at >= p_applied_from)
      AND (p_applied_to IS NULL OR requested_at <= p_applied_to)
      AND (p_expires_from IS NULL OR trial_ends_at >= p_expires_from)
      AND (p_expires_to IS NULL OR trial_ends_at <= p_expires_to)
      AND (NULLIF(btrim(p_keyword), '') IS NULL
        OR strpos(lower(tenant->>'name'), lower(btrim(p_keyword))) > 0
        OR strpos(lower(coalesce(tenant_contact_name, '')), lower(btrim(p_keyword))) > 0
        OR strpos(lower(coalesce(tenant_contact_phone, '')), lower(btrim(p_keyword))) > 0
        OR strpos(lower(coalesce(contact_name, '')), lower(btrim(p_keyword))) > 0
        OR strpos(lower(coalesce(contact_phone, '')), lower(btrim(p_keyword))) > 0)
  ), paged AS MATERIALIZED (
    SELECT * FROM filtered
    ORDER BY created_at DESC, id DESC
    LIMIT p_page_size OFFSET (p_page - 1) * p_page_size
  ), aggregate AS (
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'trial', (CASE WHEN p_platform THEN
        to_jsonb(paged) - ARRAY[
          'enterprise_identity_hash', 'effective_status',
          'tenant_contact_name', 'tenant_contact_phone'
        ]
      ELSE to_jsonb(paged) - ARRAY[
        'enterprise_identity_hash', 'effective_status', 'tenant', 'assignee',
        'tenant_contact_name', 'tenant_contact_phone'
      ] END) || jsonb_build_object(
        'contact_name', CASE WHEN contact_name IS NULL THEN NULL ELSE
          substring(contact_name FROM 1 FOR 1)
            || repeat('*', greatest(1, char_length(contact_name) - 1)) END,
        'contact_phone', CASE WHEN contact_phone IS NULL THEN NULL ELSE
          substring(contact_phone FROM 1 FOR 3) || '****' || right(contact_phone, 4) END
      ),
      'effective_status', effective_status
    ) ORDER BY created_at DESC, id DESC), '[]'::jsonb) AS items
    FROM paged
  )
  SELECT jsonb_build_object(
    'items', aggregate.items,
    'total', (SELECT count(*) FROM filtered),
    'page', p_page, 'page_size', p_page_size, 'server_time', p_now
  ) INTO v_result
  FROM aggregate;
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.platform_service_trial_list(
  uuid, boolean, integer, integer, text, text, text, text, uuid,
  timestamptz, timestamptz, timestamptz, timestamptz, timestamptz
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.platform_service_trial_list(
  uuid, boolean, integer, integer, text, text, text, text, uuid,
  timestamptz, timestamptz, timestamptz, timestamptz, timestamptz
) FROM anon;
REVOKE ALL ON FUNCTION public.platform_service_trial_list(
  uuid, boolean, integer, integer, text, text, text, text, uuid,
  timestamptz, timestamptz, timestamptz, timestamptz, timestamptz
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.platform_service_trial_list(
  uuid, boolean, integer, integer, text, text, text, text, uuid,
  timestamptz, timestamptz, timestamptz, timestamptz, timestamptz
) TO service_role;
