#!/usr/bin/env bash
set -euo pipefail

database_url="${DATABASE_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
allow_nonlocal="${TENANT_STANDARD_SMOKE_ALLOW_NONLOCAL_DISPOSABLE:-0}"
container_name="${SUPABASE_DB_CONTAINER:-supabase_db_gooes}"

if [[ "${database_url}" =~ ^postgres(ql)?://([^/@]+@)?(\[[^]]+\]|[^:/?]+) ]]; then
  database_host="${BASH_REMATCH[3]}"
else
  echo "error=invalid_database_url" >&2
  exit 1
fi

case "${database_host}" in
  localhost|127.0.0.1|::1|\[::1\]) ;;
  *)
    if [ "${allow_nonlocal}" != "1" ]; then
      echo "error=nonlocal_database_rejected host=${database_host}" >&2
      echo "Set TENANT_STANDARD_SMOKE_ALLOW_NONLOCAL_DISPOSABLE=1 only for an explicitly disposable database." >&2
      exit 1
    fi
    ;;
esac

database_without_query="${database_url%%\?*}"
database_name="${database_without_query##*/}"
if [[ ! "${database_name}" =~ ^[A-Za-z0-9_-]+$ ]]; then
  echo "error=unsafe_database_name database=${database_name}" >&2
  exit 1
fi

psql_mode="native"
if ! command -v psql >/dev/null 2>&1; then
  if [ "${database_host}" != "localhost" ] \
    && [ "${database_host}" != "127.0.0.1" ]; then
    echo "error=psql_not_found_for_database_host host=${database_host}" >&2
    exit 1
  fi
  if ! docker inspect "${container_name}" >/dev/null 2>&1; then
    echo "error=psql_not_found_and_local_supabase_container_unavailable" >&2
    exit 1
  fi
  psql_mode="docker"
fi

psql_run() {
  local application_name="$1"
  shift
  if [ "${psql_mode}" = "native" ]; then
    PGAPPNAME="${application_name}" \
      PGCONNECT_TIMEOUT=3 \
      psql "${database_url}" -X -q -v ON_ERROR_STOP=1 "$@"
    return
  fi

  docker exec -i \
    --env "PGAPPNAME=${application_name}" \
    "${container_name}" \
    psql -X -q -U postgres -d "${database_name}" -v ON_ERROR_STOP=1 "$@"
}

scratch_directory="$(mktemp -d /tmp/gooes-tenant-template-concurrency.XXXXXX)"
run_token="$(date -u +%Y%m%d%H%M%S)-${$}"
phone_number="$(printf '19%09d' "$((($(date -u +%s) + $$) % 1000000000))")"
approval_phone_number="$(printf '18%09d' "$((($(date -u +%s) + $$ + 17) % 1000000000))")"
direct_holder_slug="tenant-template-lock-holder-${run_token}"
direct_slug="tenant-template-lock-direct-${run_token}"
approval_holder_slug="tenant-template-lock-approval-${run_token}"
background_pids=()

cleanup_rows() {
  psql_run "tenant-template-concurrency-cleanup" \
    -v direct_holder_slug="${direct_holder_slug}" \
    -v direct_slug="${direct_slug}" \
    -v approval_holder_slug="${approval_holder_slug}" >/dev/null <<'SQL'
DELETE FROM public.employees AS employee
USING public.tenants AS tenant
WHERE employee.tenant_id = tenant.id
  AND tenant.slug IN (
    :'direct_holder_slug',
    :'direct_slug',
    :'approval_holder_slug'
  );

DELETE FROM public.tenants
WHERE slug IN (
  :'direct_holder_slug',
  :'direct_slug',
  :'approval_holder_slug'
);
SQL
}

cleanup() {
  local exit_status=$?
  trap - EXIT
  set +e
  for background_pid in "${background_pids[@]:-}"; do
    if kill -0 "${background_pid}" >/dev/null 2>&1; then
      kill "${background_pid}" >/dev/null 2>&1
    fi
    wait "${background_pid}" >/dev/null 2>&1
  done
  cleanup_rows
  rm -R "${scratch_directory}"
  exit "${exit_status}"
}
trap cleanup EXIT
trap 'exit 130' HUP INT TERM

psql_run "tenant-template-concurrency-prerequisite" -At >/dev/null <<'SQL'
DO $$
BEGIN
  IF pg_catalog.to_regprocedure(
    'public.create_tenant_with_default_template(text,text,text,text,text,text,text,text,text,text,numeric,numeric,text,numeric,timestamp with time zone,text,text,text,text,uuid,text,text,uuid)'
  ) IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.tenant_templates AS template
    WHERE template.code = 'default_decoration_company'
      AND template.version = '2026.08.30'
      AND template.status = 'active'
  ) THEN
    RAISE EXCEPTION 'tenant standard template migration is not applied';
  END IF;
END;
$$;
SQL

cleanup_rows

psql_run "tenant-template-concurrency-setup" \
  -v direct_holder_slug="${direct_holder_slug}" \
  -v approval_holder_slug="${approval_holder_slug}" >/dev/null <<'SQL'
INSERT INTO public.tenants (id, name, slug, status)
VALUES
  (
    pg_catalog.md5(:'direct_holder_slug')::uuid,
    'Tenant template direct lock holder',
    :'direct_holder_slug',
    'active'
  ),
  (
    pg_catalog.md5(:'approval_holder_slug')::uuid,
    'Tenant template approval lock holder',
    :'approval_holder_slug',
    'active'
  );
SQL

wait_for_session_sleep() {
  local application_name="$1"
  local attempt=0
  local active_count
  while [ "${attempt}" -lt 100 ]; do
    active_count="$(psql_run "tenant-template-concurrency-observer" -At \
      -v application_name="${application_name}" <<'SQL'
SELECT pg_catalog.count(*)
FROM pg_catalog.pg_stat_activity
WHERE application_name = :'application_name'
  AND state = 'active'
  AND query LIKE '%pg_sleep(3)%';
SQL
)"
    if [ "${active_count}" = "1" ]; then
      return 0
    fi
    attempt=$((attempt + 1))
    sleep 0.05
  done
  echo "error=session_not_ready application=${application_name}" >&2
  return 1
}

assert_no_deadlock() {
  if grep -Eiq '40P01|deadlock detected' "$@"; then
    echo "error=deadlock_detected" >&2
    sed -n '1,120p' "$@" >&2
    return 1
  fi
}

direct_holder_log="${scratch_directory}/direct-holder.log"
direct_create_log="${scratch_directory}/direct-create.log"

psql_run "tenant-template-direct-holder" \
  -v holder_slug="${direct_holder_slug}" \
  -v phone="${phone_number}" >"${direct_holder_log}" 2>&1 <<'SQL' &
BEGIN;
SET LOCAL statement_timeout = '12s';
SET LOCAL lock_timeout = '8s';
INSERT INTO public.employees (id, tenant_id, name, phone, status)
SELECT
  pg_catalog.md5(:'holder_slug' || ':employee')::uuid,
  tenant.id,
  'Tenant template direct phone holder',
  :'phone',
  'active'
FROM public.tenants AS tenant
WHERE tenant.slug = :'holder_slug';
SELECT pg_catalog.pg_sleep(3);
COMMIT;
SQL
direct_holder_pid=$!
background_pids+=("${direct_holder_pid}")
wait_for_session_sleep "tenant-template-direct-holder"

set +e
psql_run "tenant-template-direct-create" \
  -v direct_slug="${direct_slug}" \
  -v phone="${phone_number}" >"${direct_create_log}" 2>&1 <<'SQL'
SET statement_timeout = '12s';
SET lock_timeout = '8s';
SELECT public.create_tenant_with_default_template(
  p_name => 'Tenant template concurrent direct create',
  p_slug => :'direct_slug',
  p_status => 'active',
  p_address => NULL,
  p_address_title => NULL,
  p_address_poi_id => NULL,
  p_address_province => NULL,
  p_address_city => NULL,
  p_address_district => NULL,
  p_address_adcode => NULL,
  p_address_latitude => NULL,
  p_address_longitude => NULL,
  p_address_source => NULL,
  p_address_confidence => NULL,
  p_address_confirmed_at => NULL,
  p_contact_name => NULL,
  p_contact_phone => NULL,
  p_admin_name => 'Concurrent direct administrator',
  p_admin_phone => :'phone',
  p_admin_auth_user_id => NULL,
  p_admin_department_code => 'EXEC_OFFICE',
  p_admin_post_code => 'SYSTEM_ADMIN',
  p_operator_employee_id => NULL
);
SQL
direct_create_status=$?
wait "${direct_holder_pid}"
direct_holder_status=$?
set -e

assert_no_deadlock "${direct_holder_log}" "${direct_create_log}"
if [ "${direct_holder_status}" -ne 0 ] \
  || [ "${direct_create_status}" -eq 0 ] \
  || ! grep -Fq 'TENANT_ADMIN_PHONE_EXISTS' "${direct_create_log}"; then
  echo "error=direct_phone_conflict_unstable holder_status=${direct_holder_status} direct_status=${direct_create_status}" >&2
  sed -n '1,120p' "${direct_holder_log}" >&2
  sed -n '1,120p' "${direct_create_log}" >&2
  exit 1
fi

echo "direct_phone_concurrency_ok conflict=TENANT_ADMIN_PHONE_EXISTS deadlocks=0"

approval_holder_log="${scratch_directory}/approval-holder.log"
approval_check_log="${scratch_directory}/approval-check.log"

# The production approval RPC uses this exact helper and then performs the same
# active-phone precheck. Isolating those two statements avoids coupling this
# lock-order smoke to onboarding file, region, and partner fixture graphs.
psql_run "tenant-template-approval-holder" \
  -v holder_slug="${approval_holder_slug}" \
  -v phone="${approval_phone_number}" >"${approval_holder_log}" 2>&1 <<'SQL' &
BEGIN;
SET LOCAL statement_timeout = '12s';
SET LOCAL lock_timeout = '8s';
INSERT INTO public.employees (id, tenant_id, name, phone, status)
SELECT
  pg_catalog.md5(:'holder_slug' || ':employee')::uuid,
  tenant.id,
  'Tenant template approval phone holder',
  :'phone',
  'active'
FROM public.tenants AS tenant
WHERE tenant.slug = :'holder_slug';
SELECT pg_catalog.pg_sleep(3);
COMMIT;
SQL
approval_holder_pid=$!
background_pids+=("${approval_holder_pid}")
wait_for_session_sleep "tenant-template-approval-holder"

psql_run "tenant-template-approval-check" -At \
  -v phone="${approval_phone_number}" >"${approval_check_log}" 2>&1 <<'SQL'
BEGIN;
SET LOCAL statement_timeout = '12s';
SET LOCAL lock_timeout = '8s';
SELECT public.lock_tenant_onboarding_employee_phones(
  ARRAY[:'phone']::text[]
);
SELECT pg_catalog.jsonb_build_object(
  'status',
  CASE
    WHEN EXISTS (
      SELECT 1
      FROM public.employees AS employee
      WHERE employee.status = 'active'
        AND employee.phone IS NOT NULL
        AND pg_catalog.btrim(employee.phone) = :'phone'
    ) THEN 'admin_phone_exists'
    ELSE 'phone_available'
  END
);
COMMIT;
SQL
approval_check_status=$?
wait "${approval_holder_pid}"
approval_holder_status=$?

assert_no_deadlock "${approval_holder_log}" "${approval_check_log}"
if [ "${approval_holder_status}" -ne 0 ] \
  || [ "${approval_check_status}" -ne 0 ] \
  || ! grep -Fq '"status": "admin_phone_exists"' "${approval_check_log}"; then
  echo "error=approval_phone_conflict_unstable holder_status=${approval_holder_status} approval_status=${approval_check_status}" >&2
  sed -n '1,120p' "${approval_holder_log}" >&2
  sed -n '1,120p' "${approval_check_log}" >&2
  exit 1
fi

echo "approval_phone_concurrency_ok conflict=admin_phone_exists deadlocks=0"

cleanup_rows
residue_count="$(psql_run "tenant-template-concurrency-residue" -At \
  -v direct_holder_slug="${direct_holder_slug}" \
  -v direct_slug="${direct_slug}" \
  -v approval_holder_slug="${approval_holder_slug}" <<'SQL'
SELECT pg_catalog.count(*)
FROM public.tenants
WHERE slug IN (
  :'direct_holder_slug',
  :'direct_slug',
  :'approval_holder_slug'
);
SQL
)"
if [ "${residue_count}" != "0" ]; then
  echo "error=concurrency_cleanup_residue count=${residue_count}" >&2
  exit 1
fi

echo "tenant_template_concurrency_cleanup_ok residue=0"
