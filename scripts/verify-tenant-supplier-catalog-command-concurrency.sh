#!/usr/bin/env bash
set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
container_name="supabase_db_gooes"
baseline_database="gooes_catalog_v2_b_baseline"
temporary_database="gooes_catalog_v2_command_concurrency_tmp"
schema_file="${repository_root}/supabase/migrations/20260818122000_materialize_tenant_supplier_catalog_schema.sql"
command_file="${repository_root}/supabase/migrations/20260818123000_materialize_tenant_supplier_catalog_commands.sql"
hardening_file="${repository_root}/supabase/migrations/20260818130000_harden_tenant_private_catalog_contracts.sql"

docker inspect "${container_name}" >/dev/null
for file in "${schema_file}" "${command_file}" "${hardening_file}"; do
  test -f "${file}"
done

psql_admin() {
  local database="$1"
  shift
  docker exec -i \
    --env "PGAPPNAME=${PGAPPNAME:-catalog-category-concurrency-verifier}" \
    "${container_name}" sh -c '
      database="$1"
      shift
      test -n "${POSTGRES_PASSWORD:-}"
      PGPASSWORD="${POSTGRES_PASSWORD}" exec psql \
        -X -q -U supabase_admin -d "${database}" -v ON_ERROR_STOP=1 "$@"
    ' sh "${database}" "$@"
}

if [ "$(psql_admin postgres -Atc "SELECT count(*) FROM pg_database WHERE datname = '${temporary_database}';")" != "0" ]; then
  echo "error=temporary_database_already_exists database=${temporary_database}" >&2
  exit 1
fi

scratch_directory="$(mktemp -d /tmp/gooes-catalog-concurrency.XXXXXX)"
cleanup() {
  local cleanup_status=$?
  set +e
  psql_admin postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${temporary_database}' AND pid <> pg_backend_pid();" >/dev/null 2>&1
  psql_admin postgres -c "DROP DATABASE IF EXISTS ${temporary_database};" >/dev/null 2>&1
  rm -rf "${scratch_directory}"
  return "${cleanup_status}"
}
trap cleanup EXIT HUP INT TERM

psql_admin postgres -c \
  "CREATE DATABASE ${temporary_database} WITH TEMPLATE ${baseline_database} OWNER supabase_admin;" \
  >/dev/null

psql_admin "${temporary_database}" < "${schema_file}" >/dev/null
psql_admin "${temporary_database}" < "${command_file}" >/dev/null
psql_admin "${temporary_database}" < "${hardening_file}" >/dev/null

psql_admin "${temporary_database}" >/dev/null <<'SQL'
BEGIN;

INSERT INTO public.tenants(id, name, slug, status)
VALUES (
  'a1000000-0000-0000-0000-000000000001',
  'Catalog category concurrency tenant',
  'catalog-category-concurrency-tenant',
  'active'
);

INSERT INTO auth.users(id, role, created_at, updated_at)
VALUES (
  'a1100000-0000-0000-0000-000000000001',
  'authenticated',
  now(),
  now()
);

INSERT INTO public.employees(id, name, status, user_id, tenant_id)
VALUES (
  'a1200000-0000-0000-0000-000000000001',
  'Catalog category concurrency actor',
  'active',
  'a1100000-0000-0000-0000-000000000001',
  'a1000000-0000-0000-0000-000000000001'
);

INSERT INTO public.tenant_supplier_settings(
  tenant_id,
  module_enabled,
  ownership_reads_enabled,
  private_supplier_writes_enabled,
  private_catalog_writes_enabled,
  enabled_by_employee_id,
  enabled_at
)
VALUES (
  'a1000000-0000-0000-0000-000000000001',
  true,
  true,
  true,
  true,
  'a1200000-0000-0000-0000-000000000001',
  now()
)
ON CONFLICT (tenant_id) DO UPDATE
SET module_enabled = EXCLUDED.module_enabled,
    ownership_reads_enabled = EXCLUDED.ownership_reads_enabled,
    private_supplier_writes_enabled = EXCLUDED.private_supplier_writes_enabled,
    private_catalog_writes_enabled = EXCLUDED.private_catalog_writes_enabled,
    enabled_by_employee_id = EXCLUDED.enabled_by_employee_id,
    enabled_at = EXCLUDED.enabled_at;

SET LOCAL ROLE service_role;

SELECT public.create_tenant_catalog_category(
  'a1300000-0000-0000-0000-000000000001',
  NULL,
  'CONCURRENCY_A',
  'Concurrency A',
  'active',
  10,
  NULL,
  'a1000000-0000-0000-0000-000000000001',
  'a1100000-0000-0000-0000-000000000001',
  'a1200000-0000-0000-0000-000000000001',
  'concurrency-create-a'
);

SELECT public.create_tenant_catalog_category(
  'a1300000-0000-0000-0000-000000000002',
  NULL,
  'CONCURRENCY_B',
  'Concurrency B',
  'active',
  20,
  NULL,
  'a1000000-0000-0000-0000-000000000001',
  'a1100000-0000-0000-0000-000000000001',
  'a1200000-0000-0000-0000-000000000001',
  'concurrency-create-b'
);

COMMIT;
SQL

session_a_output="${scratch_directory}/session-a.log"
session_b_output="${scratch_directory}/session-b.log"

PGAPPNAME="catalog-category-session-a" \
psql_admin "${temporary_database}" -At >"${session_a_output}" 2>&1 <<'SQL' &
SET ROLE service_role;
BEGIN;
SELECT public.update_tenant_catalog_category(
  'a1300000-0000-0000-0000-000000000001',
  'a1300000-0000-0000-0000-000000000002',
  'CONCURRENCY_A',
  'Concurrency A',
  'active',
  10,
  NULL,
  1,
  'a1000000-0000-0000-0000-000000000001',
  'a1100000-0000-0000-0000-000000000001',
  'a1200000-0000-0000-0000-000000000001',
  'concurrency-update-a'
);
SELECT pg_sleep(3);
COMMIT;
SQL
session_a_pid=$!

session_a_ready="false"
for _attempt in $(seq 1 100); do
  if [ "$(psql_admin "${temporary_database}" -Atc "SELECT count(*) FROM pg_stat_activity WHERE application_name = 'catalog-category-session-a' AND query LIKE '%pg_sleep(3)%' AND state = 'active';")" = "1" ]; then
    session_a_ready="true"
    break
  fi
done
if [ "${session_a_ready}" != "true" ]; then
  echo "error=session_a_not_ready" >&2
  wait "${session_a_pid}" || true
  exit 1
fi

set +e
PGAPPNAME="catalog-category-session-b" \
psql_admin "${temporary_database}" -At >"${session_b_output}" 2>&1 <<'SQL'
SET ROLE service_role;
BEGIN;
SELECT public.update_tenant_catalog_category(
  'a1300000-0000-0000-0000-000000000002',
  'a1300000-0000-0000-0000-000000000001',
  'CONCURRENCY_B',
  'Concurrency B',
  'active',
  20,
  NULL,
  1,
  'a1000000-0000-0000-0000-000000000001',
  'a1100000-0000-0000-0000-000000000001',
  'a1200000-0000-0000-0000-000000000001',
  'concurrency-update-b'
);
COMMIT;
SQL
session_b_status=$?
wait "${session_a_pid}"
session_a_status=$?
set -e

if [ "${session_a_status}" -ne 0 ] \
  || ! grep -Fq '"status": "updated"' "${session_a_output}"; then
  echo "error=session_a_update_failed" >&2
  sed -n '1,120p' "${session_a_output}" >&2
  exit 1
fi

if [ "${session_b_status}" -eq 0 ] \
  || ! grep -Fq 'SUPPLIER_CATALOG_CYCLE' "${session_b_output}"; then
  echo "error=session_b_cycle_not_detected status=${session_b_status}" >&2
  sed -n '1,120p' "${session_b_output}" >&2
  exit 1
fi

if grep -Eiq '40P01|deadlock detected' \
  "${session_a_output}" "${session_b_output}"; then
  echo "error=category_update_deadlock_detected" >&2
  sed -n '1,120p' "${session_a_output}" >&2
  sed -n '1,120p' "${session_b_output}" >&2
  exit 1
fi

echo "category_concurrency_ok database=${temporary_database} session_a=updated session_b=SUPPLIER_CATALOG_CYCLE deadlocks=0 cleanup=trap"
