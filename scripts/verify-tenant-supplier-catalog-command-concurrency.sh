#!/usr/bin/env bash
set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
container_name="supabase_db_gooes"
baseline_database="gooes_catalog_v2_b_baseline"
schema_file="${repository_root}/supabase/migrations/20260818122000_materialize_tenant_supplier_catalog_schema.sql"
command_file="${repository_root}/supabase/migrations/20260818123000_materialize_tenant_supplier_catalog_commands.sql"
hardening_file="${repository_root}/supabase/migrations/20260818130000_harden_tenant_private_catalog_contracts.sql"

docker inspect "${container_name}" >/dev/null
for file in "${schema_file}" "${command_file}" "${hardening_file}"; do
  test -f "${file}"
done

scratch_directory="$(mktemp -d /tmp/gooes-catalog-concurrency.XXXXXX)"
database_suffix="$(basename "${scratch_directory}" | tr '[:upper:]' '[:lower:]' | tail -c 7)"
temporary_database="gooes_catalog_v2_cmd_concurrency_${$}_${database_suffix}"
database_created="false"

if [[ ! "${temporary_database}" =~ ^gooes_catalog_v2_cmd_concurrency_[0-9]+_[a-z0-9]{6}$ ]]; then
  echo "error=unsafe_temporary_database_name database=${temporary_database}" >&2
  exit 1
fi

psql_admin() {
  local database="$1"
  shift
  docker exec -i \
    --env "PGAPPNAME=${PGAPPNAME:-catalog-command-concurrency-verifier}" \
    "${container_name}" sh -c '
      database="$1"
      shift
      test -n "${POSTGRES_PASSWORD:-}"
      PGPASSWORD="${POSTGRES_PASSWORD}" exec psql \
        -X -q -U supabase_admin -d "${database}" -v ON_ERROR_STOP=1 "$@"
    ' sh "${database}" "$@"
}

cleanup_database() {
  if [ "${database_created}" = "true" ]; then
    if [[ ! "${temporary_database}" =~ ^gooes_catalog_v2_cmd_concurrency_[0-9]+_[a-z0-9]{6}$ ]]; then
      echo "error=refusing_unsafe_database_cleanup" >&2
      return 1
    fi
    psql_admin postgres -c \
      "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${temporary_database}' AND pid <> pg_backend_pid();" \
      >/dev/null
    psql_admin postgres -c "DROP DATABASE ${temporary_database};" >/dev/null
    database_created="false"
  fi
}

cleanup() {
  local cleanup_status=$?
  set +e
  cleanup_database
  rm -rf "${scratch_directory}"
  return "${cleanup_status}"
}
trap cleanup EXIT HUP INT TERM

# CREATE DATABASE is the ownership boundary. If it loses an improbable name
# collision, database_created stays false and cleanup cannot drop that database.
psql_admin postgres -c \
  "CREATE DATABASE ${temporary_database} WITH TEMPLATE ${baseline_database} OWNER supabase_admin;" \
  >/dev/null
database_created="true"

psql_admin "${temporary_database}" < "${schema_file}" >/dev/null
psql_admin "${temporary_database}" < "${command_file}" >/dev/null
psql_admin "${temporary_database}" < "${hardening_file}" >/dev/null

psql_admin "${temporary_database}" >/dev/null <<'SQL'
BEGIN;

INSERT INTO public.tenants(id, name, slug, status)
VALUES (
  'a1000000-0000-0000-0000-000000000001',
  'Catalog command concurrency tenant',
  'catalog-command-concurrency-tenant',
  'active'
);

INSERT INTO auth.users(id, role, created_at, updated_at)
VALUES
  (
    'a1100000-0000-0000-0000-000000000001',
    'authenticated', now(), now()
  ),
  (
    'a1100000-0000-0000-0000-000000000002',
    'authenticated', now(), now()
  );

INSERT INTO public.employees(id, name, status, user_id, tenant_id)
VALUES
  (
    'a1200000-0000-0000-0000-000000000001',
    'Catalog tenant concurrency actor', 'active',
    'a1100000-0000-0000-0000-000000000001',
    'a1000000-0000-0000-0000-000000000001'
  ),
  (
    'a1200000-0000-0000-0000-000000000002',
    'Catalog platform concurrency actor', 'active',
    'a1100000-0000-0000-0000-000000000002', NULL
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
  true, true, true, true,
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
  'a1300000-0000-0000-0000-000000000001', NULL,
  'CONCURRENCY_A', 'Concurrency A', 'active', 10, NULL,
  'a1000000-0000-0000-0000-000000000001',
  'a1100000-0000-0000-0000-000000000001',
  'a1200000-0000-0000-0000-000000000001',
  'concurrency-create-a'
);

SELECT public.create_tenant_catalog_category(
  'a1300000-0000-0000-0000-000000000002', NULL,
  'CONCURRENCY_B', 'Concurrency B', 'active', 20, NULL,
  'a1000000-0000-0000-0000-000000000001',
  'a1100000-0000-0000-0000-000000000001',
  'a1200000-0000-0000-0000-000000000001',
  'concurrency-create-b'
);

SELECT public.create_catalog_unit(
  'a1600000-0000-0000-0000-000000000001',
  'CONCURRENCY_BASE', 'Concurrency base unit', 'cbu', NULL, '1', 'mass',
  'active', 10,
  'a1100000-0000-0000-0000-000000000002',
  'a1200000-0000-0000-0000-000000000002',
  'concurrency-create-base-unit'
);

SELECT public.create_catalog_category(
  'a1400000-0000-0000-0000-000000000001', NULL,
  'CONCURRENCY_PLATFORM_PARENT', 'Concurrency platform parent',
  1, 'active', 10,
  'a1100000-0000-0000-0000-000000000002',
  'a1200000-0000-0000-0000-000000000002',
  'concurrency-create-platform-parent'
);

RESET ROLE;

CREATE FUNCTION public.verify_pause_catalog_unit_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(6720240723142991::bigint);
  RETURN NULL;
END;
$$;

CREATE TRIGGER tr_000_catalog_units_pause_insert
BEFORE INSERT ON public.catalog_units
FOR EACH STATEMENT
EXECUTE FUNCTION public.verify_pause_catalog_unit_insert();

CREATE FUNCTION public.verify_pause_catalog_category_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(6720240723142992::bigint);
  RETURN NULL;
END;
$$;

CREATE TRIGGER tr_000_catalog_categories_pause_insert
BEFORE INSERT ON public.catalog_categories
FOR EACH STATEMENT
EXECUTE FUNCTION public.verify_pause_catalog_category_insert();

COMMIT;
SQL

wait_for_activity() {
  local application_name="$1"
  local predicate="$2"
  for _attempt in $(seq 1 200); do
    if [ "$(psql_admin "${temporary_database}" -Atc "SELECT count(*) FROM pg_stat_activity WHERE application_name = '${application_name}' AND ${predicate};")" = "1" ]; then
      return 0
    fi
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

# The insert holds the unit hierarchy lock and then pauses. A correctly ordered
# base UPDATE waits on the same hierarchy lock instead of forming a row deadlock.
unit_gate_output="${scratch_directory}/unit-gate.log"
unit_create_output="${scratch_directory}/unit-create.log"
unit_update_output="${scratch_directory}/unit-update.log"

PGAPPNAME="catalog-unit-pause-gate" \
psql_admin "${temporary_database}" -At >"${unit_gate_output}" 2>&1 <<'SQL' &
BEGIN;
SELECT pg_advisory_xact_lock(6720240723142991::bigint);
SELECT pg_sleep(30);
ROLLBACK;
SQL
unit_gate_pid=$!
wait_for_activity "catalog-unit-pause-gate" \
  "state = 'active' AND query LIKE '%pg_sleep(30)%'"

PGAPPNAME="catalog-unit-create-session" \
psql_admin "${temporary_database}" -At >"${unit_create_output}" 2>&1 <<'SQL' &
SET ROLE service_role;
SELECT public.create_catalog_unit(
  'a1600000-0000-0000-0000-000000000002',
  'CONCURRENCY_DERIVED', 'Concurrency derived unit', 'cdu',
  'a1600000-0000-0000-0000-000000000001', '0.5', 'active', 20,
  'a1100000-0000-0000-0000-000000000002',
  'a1200000-0000-0000-0000-000000000002',
  'concurrency-create-derived-unit'
);
SQL
unit_create_pid=$!
wait_for_activity "catalog-unit-create-session" \
  "wait_event_type = 'Lock' AND wait_event = 'advisory'"

PGAPPNAME="catalog-unit-update-session" \
psql_admin "${temporary_database}" -At >"${unit_update_output}" 2>&1 <<'SQL' &
UPDATE public.catalog_units
SET name = name || ' updated'
WHERE id = 'a1600000-0000-0000-0000-000000000001'
RETURNING 'updated';
SQL
unit_update_pid=$!
wait_for_activity "catalog-unit-update-session" \
  "wait_event_type = 'Lock' AND wait_event = 'advisory'"

psql_admin "${temporary_database}" -Atc \
  "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE application_name = 'catalog-unit-pause-gate';" \
  >/dev/null
set +e
wait "${unit_gate_pid}"
wait "${unit_create_pid}"
unit_create_status=$?
wait "${unit_update_pid}"
unit_update_status=$?
set -e

assert_no_deadlock "${unit_create_output}" "${unit_update_output}"
if [ "${unit_create_status}" -ne 0 ] \
  || ! grep -Fq '"status": "created"' "${unit_create_output}" \
  || [ "${unit_update_status}" -ne 0 ] \
  || ! grep -Fxq 'updated' "${unit_update_output}"; then
  echo "error=unit_lock_order_failed" >&2
  sed -n '1,120p' "${unit_create_output}" >&2
  sed -n '1,120p' "${unit_update_output}" >&2
  exit 1
fi
echo "unit_lock_order_ok create=created update=updated deadlocks=0"

# Repeat the same inversion at the legacy platform category boundary.
category_gate_output="${scratch_directory}/category-gate.log"
legacy_category_create_output="${scratch_directory}/legacy-category-create.log"
legacy_category_update_output="${scratch_directory}/legacy-category-update.log"

PGAPPNAME="legacy-category-pause-gate" \
psql_admin "${temporary_database}" -At >"${category_gate_output}" 2>&1 <<'SQL' &
BEGIN;
SELECT pg_advisory_xact_lock(6720240723142992::bigint);
SELECT pg_sleep(30);
ROLLBACK;
SQL
category_gate_pid=$!
wait_for_activity "legacy-category-pause-gate" \
  "state = 'active' AND query LIKE '%pg_sleep(30)%'"

PGAPPNAME="legacy-category-create-session" \
psql_admin "${temporary_database}" -At >"${legacy_category_create_output}" 2>&1 <<'SQL' &
SET ROLE service_role;
SELECT public.create_catalog_category(
  'a1400000-0000-0000-0000-000000000002',
  'a1400000-0000-0000-0000-000000000001',
  'CONCURRENCY_PLATFORM_CHILD', 'Concurrency platform child',
  2, 'active', 20,
  'a1100000-0000-0000-0000-000000000002',
  'a1200000-0000-0000-0000-000000000002',
  'concurrency-create-platform-child'
);
SQL
legacy_category_create_pid=$!
if ! wait_for_activity "legacy-category-create-session" \
  "wait_event_type = 'Lock' AND wait_event = 'advisory'"; then
  set +e
  wait "${legacy_category_create_pid}"
  set -e
  sed -n '1,120p' "${legacy_category_create_output}" >&2
  exit 1
fi

PGAPPNAME="legacy-category-update-session" \
psql_admin "${temporary_database}" -At >"${legacy_category_update_output}" 2>&1 <<'SQL' &
UPDATE public.catalog_categories
SET name = name || ' updated'
WHERE id = 'a1400000-0000-0000-0000-000000000001'
RETURNING 'updated';
SQL
legacy_category_update_pid=$!
wait_for_activity "legacy-category-update-session" \
  "wait_event_type = 'Lock' AND wait_event = 'advisory'"

psql_admin "${temporary_database}" -Atc \
  "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE application_name = 'legacy-category-pause-gate';" \
  >/dev/null
set +e
wait "${category_gate_pid}"
wait "${legacy_category_create_pid}"
legacy_category_create_status=$?
wait "${legacy_category_update_pid}"
legacy_category_update_status=$?
set -e

assert_no_deadlock \
  "${legacy_category_create_output}" "${legacy_category_update_output}"
if [ "${legacy_category_create_status}" -ne 0 ] \
  || ! grep -Fq '"status": "created"' "${legacy_category_create_output}" \
  || [ "${legacy_category_update_status}" -ne 0 ] \
  || ! grep -Fxq 'updated' "${legacy_category_update_output}"; then
  echo "error=legacy_category_lock_order_failed" >&2
  sed -n '1,120p' "${legacy_category_create_output}" >&2
  sed -n '1,120p' "${legacy_category_update_output}" >&2
  exit 1
fi
echo "legacy_category_lock_order_ok create=created update=updated deadlocks=0"

# Existing A<->B tenant reparenting regression: serialize, then report a domain
# cycle error rather than PostgreSQL 40P01.
session_a_output="${scratch_directory}/session-a.log"
session_b_output="${scratch_directory}/session-b.log"

PGAPPNAME="catalog-category-session-a" \
psql_admin "${temporary_database}" -At >"${session_a_output}" 2>&1 <<'SQL' &
SET ROLE service_role;
BEGIN;
SELECT public.update_tenant_catalog_category(
  'a1300000-0000-0000-0000-000000000001',
  'a1300000-0000-0000-0000-000000000002',
  'CONCURRENCY_A', 'Concurrency A', 'active', 10, NULL, 1,
  'a1000000-0000-0000-0000-000000000001',
  'a1100000-0000-0000-0000-000000000001',
  'a1200000-0000-0000-0000-000000000001',
  'concurrency-update-a'
);
SELECT pg_sleep(3);
COMMIT;
SQL
session_a_pid=$!
wait_for_activity "catalog-category-session-a" \
  "state = 'active' AND query LIKE '%pg_sleep(3)%'"

set +e
PGAPPNAME="catalog-category-session-b" \
psql_admin "${temporary_database}" -At >"${session_b_output}" 2>&1 <<'SQL'
SET ROLE service_role;
BEGIN;
SELECT public.update_tenant_catalog_category(
  'a1300000-0000-0000-0000-000000000002',
  'a1300000-0000-0000-0000-000000000001',
  'CONCURRENCY_B', 'Concurrency B', 'active', 20, NULL, 1,
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
assert_no_deadlock "${session_a_output}" "${session_b_output}"
echo "category_concurrency_ok database=${temporary_database} session_a=updated session_b=SUPPLIER_CATALOG_CYCLE deadlocks=0"

cleanup_database
cleanup_residue="$(psql_admin postgres -Atc "SELECT count(*) FROM pg_database WHERE datname = '${temporary_database}';")"
if [ "${cleanup_residue}" != "0" ]; then
  echo "error=temporary_database_cleanup_residue count=${cleanup_residue}" >&2
  exit 1
fi
echo "concurrency_cleanup_ok database=${temporary_database} cleanup_residue=0"
