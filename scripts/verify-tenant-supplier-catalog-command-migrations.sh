#!/usr/bin/env bash
set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
container_name="supabase_db_gooes"
databases=("postgres" "gooes_catalog_v2_b_baseline")
schema_file="${repository_root}/supabase/migrations/20260818122000_materialize_tenant_supplier_catalog_schema.sql"
command_file="${repository_root}/supabase/migrations/20260818123000_materialize_tenant_supplier_catalog_commands.sql"
hardening_file="${repository_root}/supabase/migrations/20260818130000_harden_tenant_private_catalog_contracts.sql"
pre123_seed_file="${repository_root}/scripts/fixtures/seed-tenant-supplier-catalog-command-pre-123.sql"
fixture_file="${repository_root}/scripts/fixtures/verify-tenant-supplier-catalog-command-behavior.sql"

docker inspect "${container_name}" >/dev/null
for file in \
  "${schema_file}" \
  "${command_file}" \
  "${hardening_file}" \
  "${pre123_seed_file}" \
  "${fixture_file}"; do
  test -f "${file}"
done

psql_admin() {
  local database="$1"
  shift
  docker exec -i "${container_name}" sh -c '
    database="$1"
    shift
    test -n "${POSTGRES_PASSWORD:-}"
    PGPASSWORD="${POSTGRES_PASSWORD}" exec psql \
      -X -q -U supabase_admin -d "${database}" -v ON_ERROR_STOP=1 "$@"
  ' sh "${database}" "$@"
}

render_migration_body() {
  local file="$1"
  local begin_line
  local commit_line

  begin_line="$(awk '$0 == "BEGIN;" { print NR; exit }' "${file}")"
  commit_line="$(awk '$0 == "COMMIT;" { line = NR } END { print line }' "${file}")"
  if [ -z "${begin_line}" ] || [ -z "${commit_line}" ] ||
    [ "$(awk 'NF { line = $0 } END { print line }' "${file}")" != "COMMIT;" ]; then
    echo "error=explicit_migration_shape_invalid file=${file}" >&2
    return 1
  fi

  awk -v begin_line="${begin_line}" -v commit_line="${commit_line}" '
    NR != begin_line && NR != commit_line { print }
  ' "${file}"
}

snapshot_database() {
  local database="$1"
  psql_admin "${database}" -At <<'SQL'
WITH facts AS (
  SELECT 'table|' || table_name || '|' || count_value AS value
  FROM (
    SELECT 'tenants' AS table_name, count(*)::text AS count_value
    FROM public.tenants
    UNION ALL SELECT 'employees', count(*)::text FROM public.employees
    UNION ALL SELECT 'settings', count(*)::text FROM public.tenant_supplier_settings
    UNION ALL SELECT 'categories', count(*)::text FROM public.catalog_categories
    UNION ALL SELECT 'brands', count(*)::text FROM public.catalog_brands
    UNION ALL SELECT 'units', count(*)::text FROM public.catalog_units
    UNION ALL SELECT 'specs', count(*)::text FROM public.catalog_spec_definitions
    UNION ALL SELECT 'suggestions', count(*)::text FROM public.catalog_unit_suggestions
    UNION ALL SELECT 'events', count(*)::text FROM public.supplier_command_events
    UNION ALL SELECT 'auth_users', count(*)::text FROM auth.users
  ) AS table_counts
  UNION ALL
  SELECT 'function|' || procedure.proname || '|' ||
    pg_catalog.oidvectortypes(procedure.proargtypes) || '|' ||
    procedure.prosecdef::text || '|' || owner_role.rolname || '|' ||
    coalesce(procedure.proacl::text, '')
  FROM pg_proc AS procedure
  JOIN pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
  JOIN pg_roles AS owner_role ON owner_role.oid = procedure.proowner
  WHERE namespace.nspname = 'public'
    AND procedure.proname = ANY (ARRAY[
      'assert_platform_catalog_actor', 'create_catalog_category',
      'create_catalog_brand', 'create_catalog_unit',
      'create_tenant_catalog_category', 'update_tenant_catalog_category',
      'create_tenant_catalog_brand', 'update_tenant_catalog_brand',
      'create_catalog_spec_definition', 'update_catalog_spec_definition',
      'copy_platform_category_specs', 'submit_catalog_unit_suggestion',
      'submit_tenant_catalog_unit_suggestion',
      'list_catalog_unit_suggestions', 'review_catalog_unit_suggestion'
    ]::text[])
  UNION ALL
  SELECT 'index|' || index_class.relname || '|' ||
    pg_get_indexdef(index_class.oid)
  FROM pg_class AS index_class
  JOIN pg_index AS index_definition
    ON index_definition.indexrelid = index_class.oid
  WHERE index_definition.indrelid =
    'public.catalog_unit_suggestions'::regclass
)
SELECT md5(string_agg(value, E'\n' ORDER BY value)) FROM facts;
SQL
}

run_database() {
  local database="$1"
  local before_snapshot
  local after_snapshot

  before_snapshot="$(snapshot_database "${database}")"
  {
    echo 'BEGIN;'
    render_migration_body "${schema_file}"
    cat "${pre123_seed_file}"
    render_migration_body "${command_file}"
    # Re-enter through the canonical_v2 preflight before the validation gate.
    render_migration_body "${command_file}"
    render_migration_body "${hardening_file}"
    cat "${fixture_file}"
    echo 'ROLLBACK;'
  } | psql_admin "${database}" >/dev/null
  after_snapshot="$(snapshot_database "${database}")"

  if [ "${before_snapshot}" != "${after_snapshot}" ]; then
    echo "error=rollback_residue database=${database}" >&2
    exit 1
  fi

  echo "command_behavior_ok database=${database} migration_replay=rollout_v2 command_signatures=12 legacy_platform_creates=2 compatibility_unit=service_role_replay,derived_dimension acl=pg_proc,proacl,proowner idempotency=replay,conflict version_conflict=no_write actor_filter=platform_and_tenant unit_factor=canonical_decimal pagination=max100 review=no_unit_insert rollback_residue=0"
}

for database in "${databases[@]}"; do
  run_database "${database}"
done
