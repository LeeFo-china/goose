\set ON_ERROR_STOP on

\if :{?tenant_id}
\else
  \echo '缺少 tenant_id'
  \quit 2
\endif

BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SELECT set_config('tenant_transfer.tenant_id', :'tenant_id', true)
\g /dev/null

DO $audit$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.tenants
    WHERE id = current_setting('tenant_transfer.tenant_id')::uuid
  ) THEN
    RAISE EXCEPTION '源租户不存在';
  END IF;
END
$audit$;

WITH active_users AS (
  SELECT DISTINCT membership.user_id
  FROM public.user_business_memberships AS membership
  WHERE membership.tenant_id = :'tenant_id'::uuid
    AND membership.status = 'active'
), audit AS (
  SELECT
    (SELECT count(*) FROM public.tenants WHERE id = :'tenant_id'::uuid) AS tenant_rows,
    (SELECT count(*) FROM public.employees WHERE tenant_id = :'tenant_id'::uuid) AS employees,
    (SELECT count(*) FROM public.customers WHERE tenant_id = :'tenant_id'::uuid) AS customers,
    (SELECT count(*) FROM public.projects WHERE tenant_id = :'tenant_id'::uuid) AS projects,
    (SELECT count(*) FROM active_users) AS active_users,
    (
      SELECT count(*)
      FROM public.user_business_memberships AS membership
      WHERE membership.tenant_id = :'tenant_id'::uuid
        AND membership.status <> 'active'
    ) AS excluded_memberships,
    (
      SELECT count(*)
      FROM auth.identities AS identity
      JOIN active_users ON active_users.user_id = identity.user_id
    ) AS auth_identities,
    (
      SELECT count(*)
      FROM public.user_oauth_identities AS oauth
      JOIN active_users ON active_users.user_id = oauth.user_id
      WHERE oauth.status = 'active'
    ) AS active_oauth_identities,
    (
      SELECT count(*)
      FROM public.platform_file_objects AS file
      WHERE file.tenant_id = :'tenant_id'::uuid
        AND file.bucket = 'dev-fixture-placeholder'
    ) AS excluded_placeholder_files
)
SELECT jsonb_build_object(
  'tenant_id', :'tenant_id',
  'tenant_rows', tenant_rows,
  'employees', employees,
  'customers', customers,
  'projects', projects,
  'active_users', active_users,
  'auth_identities', auth_identities,
  'active_oauth_identities', active_oauth_identities,
  'excluded_memberships', excluded_memberships,
  'excluded_placeholder_files', excluded_placeholder_files
)::text
FROM audit;

ROLLBACK;
