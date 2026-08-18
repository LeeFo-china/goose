#!/usr/bin/env bash
set -euo pipefail

repository_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
container_name="${SUPPLIER_CATALOG_DB_CONTAINER:-supabase_db_gooes}"
repository_database="${SUPPLIER_CATALOG_A_DATABASE:-postgres}"
granular_database="${SUPPLIER_CATALOG_B_DATABASE:-gooes_catalog_v2_b_baseline}"
materialization_file="${repository_root}/supabase/migrations/20260818122000_materialize_tenant_supplier_catalog_schema.sql"
hardening_file="${repository_root}/supabase/migrations/20260818130000_harden_tenant_private_catalog_contracts.sql"

for database in "${repository_database}" "${granular_database}"; do
  if [[ ! "${database}" =~ ^[a-zA-Z0-9_]+$ ]]; then
    echo "error=invalid_local_database database=${database}" >&2
    exit 1
  fi
done

docker inspect "${container_name}" >/dev/null
test -f "${materialization_file}"
test -f "${hardening_file}"

psql_admin() {
  local database="$1"
  shift
  docker exec -i "${container_name}" sh -c '
    database="$1"
    shift
    test -n "${POSTGRES_PASSWORD:-}"
    PGPASSWORD="${POSTGRES_PASSWORD}" exec psql \
      -X -U supabase_admin -d "${database}" -v ON_ERROR_STOP=1 "$@"
  ' sh "${database}" "$@"
}

render_migration_body() {
  local file="$1"
  local begin_line
  local commit_line
  local final_line

  begin_line="$(awk '$0 == "BEGIN;" { print NR; exit }' "${file}")"
  commit_line="$(awk '$0 == "COMMIT;" { line = NR } END { print line }' "${file}")"
  final_line="$(awk 'NF { line = $0 } END { print line }' "${file}")"
  if [ -z "${begin_line}" ] || [ -z "${commit_line}" ] || [ "${final_line}" != "COMMIT;" ]; then
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
  SELECT 'migration|' || coalesce(string_agg(version, ',' ORDER BY version), '') AS value
  FROM supabase_migrations.schema_migrations
  WHERE version >= '20260813170000'
  UNION ALL
  SELECT 'index|' || c.relname || '|' || i.relname || '|' || pg_get_indexdef(i.oid)
  FROM pg_index AS x
  JOIN pg_class AS i ON i.oid = x.indexrelid
  JOIN pg_class AS c ON c.oid = x.indrelid
  JOIN pg_namespace AS n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname IN (
      'catalog_categories', 'catalog_brands', 'catalog_units',
      'catalog_spec_definitions', 'catalog_unit_suggestions', 'supplier_products'
    )
  UNION ALL
  SELECT 'trigger|' || c.relname || '|' || t.tgname || '|' || pg_get_triggerdef(t.oid)
  FROM pg_trigger AS t
  JOIN pg_class AS c ON c.oid = t.tgrelid
  JOIN pg_namespace AS n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND NOT t.tgisinternal
    AND c.relname IN (
      'catalog_categories', 'catalog_brands', 'catalog_units',
      'catalog_spec_definitions', 'catalog_unit_suggestions', 'supplier_products'
    )
  UNION ALL
  SELECT 'count|catalog_categories|' || count(*) FROM public.catalog_categories
  UNION ALL
  SELECT 'count|catalog_brands|' || count(*) FROM public.catalog_brands
  UNION ALL
  SELECT 'count|catalog_units|' || count(*) FROM public.catalog_units
  UNION ALL
  SELECT 'count|catalog_spec_definitions|' || count(*) FROM public.catalog_spec_definitions
  UNION ALL
  SELECT 'count|catalog_unit_suggestions|' || count(*) FROM public.catalog_unit_suggestions
  UNION ALL
  SELECT 'count|supplier_products|' || count(*) FROM public.supplier_products
)
SELECT md5(string_agg(value, E'\n' ORDER BY value)) FROM facts;
SQL
}

assert_final_schema_sql() {
  cat <<'SQL'
DO $verify$
DECLARE
  v_duplicate_index_groups integer;
  v_plan text := '';
  v_plan_line text;
BEGIN
  IF current_user <> 'supabase_admin'
    OR NOT coalesce((SELECT rolsuper FROM pg_roles WHERE rolname = current_user), false)
  THEN
    RAISE EXCEPTION 'migration runner is not supabase_admin superuser';
  END IF;

  IF has_table_privilege('service_role', 'public.employees', 'SELECT')
    OR has_table_privilege('service_role', 'public.supplier_products', 'SELECT')
  THEN
    RAISE EXCEPTION 'service_role received whole-table reference reads';
  END IF;

  IF NOT has_column_privilege('service_role', 'public.employees', 'id', 'SELECT')
    OR NOT has_column_privilege('service_role', 'public.employees', 'tenant_id', 'SELECT')
    OR NOT has_column_privilege('service_role', 'public.employees', 'status', 'SELECT')
    OR NOT has_column_privilege('service_role', 'public.supplier_products', 'category_id', 'SELECT')
    OR NOT has_column_privilege('service_role', 'public.supplier_products', 'brand_id', 'SELECT')
    OR NOT has_column_privilege('service_role', 'public.supplier_products', 'status', 'SELECT')
  THEN
    RAISE EXCEPTION 'service_role reference column grants are incomplete';
  END IF;

  IF has_table_privilege('anon', 'public.catalog_categories', 'SELECT')
    OR has_table_privilege('authenticated', 'public.catalog_categories', 'SELECT')
    OR has_table_privilege('anon', 'public.catalog_brands', 'INSERT')
    OR has_table_privilege('authenticated', 'public.catalog_brands', 'UPDATE')
  THEN
    RAISE EXCEPTION 'browser roles received direct catalog table access';
  END IF;

  IF to_regclass('public.supplier_products_active_category_ref_idx') IS NULL
    OR to_regclass('public.supplier_products_active_brand_ref_idx') IS NULL
  THEN
    RAISE EXCEPTION 'active supplier product reference indexes are missing';
  END IF;

  WITH normalized_indexes AS (
    SELECT regexp_replace(
      pg_get_indexdef(index_definition.indexrelid),
      '^CREATE (UNIQUE )?INDEX [^ ]+ ',
      'CREATE \1INDEX '
    ) AS definition
    FROM pg_index AS index_definition
    JOIN pg_class AS table_definition
      ON table_definition.oid = index_definition.indrelid
    JOIN pg_namespace AS namespace_definition
      ON namespace_definition.oid = table_definition.relnamespace
    LEFT JOIN pg_constraint AS constraint_definition
      ON constraint_definition.conindid = index_definition.indexrelid
    WHERE namespace_definition.nspname = 'public'
      AND constraint_definition.oid IS NULL
      AND table_definition.relname IN (
        'catalog_categories', 'catalog_brands', 'catalog_units',
        'catalog_spec_definitions', 'catalog_unit_suggestions', 'supplier_products'
      )
  ), duplicate_index_groups AS (
    SELECT definition
    FROM normalized_indexes
    GROUP BY definition
    HAVING count(*) > 1
  )
  SELECT count(*) INTO v_duplicate_index_groups FROM duplicate_index_groups;

  IF v_duplicate_index_groups <> 0 THEN
    RAISE EXCEPTION 'duplicate_index_groups=%', v_duplicate_index_groups;
  END IF;

  PERFORM set_config('enable_seqscan', 'off', true);
  FOR v_plan_line IN EXECUTE $explain$
    EXPLAIN (COSTS OFF)
    SELECT id FROM public.supplier_products
    WHERE category_id = '00000000-0000-0000-0000-000000000001'::uuid
      AND status = 'active'
  $explain$ LOOP
    v_plan := v_plan || E'\n' || v_plan_line;
  END LOOP;
  IF position('supplier_products_active_category_ref_idx' IN v_plan) = 0 THEN
    RAISE EXCEPTION 'category reference plan did not use its partial index: %', v_plan;
  END IF;

  v_plan := '';
  FOR v_plan_line IN EXECUTE $explain$
    EXPLAIN (COSTS OFF)
    SELECT id FROM public.supplier_products
    WHERE brand_id = '00000000-0000-0000-0000-000000000001'::uuid
      AND status = 'active'
  $explain$ LOOP
    v_plan := v_plan || E'\n' || v_plan_line;
  END LOOP;
  IF position('supplier_products_active_brand_ref_idx' IN v_plan) = 0 THEN
    RAISE EXCEPTION 'brand reference plan did not use its partial index: %', v_plan;
  END IF;
END
$verify$;
SQL
}

assert_service_role_writes_sql() {
  cat <<'SQL'
SELECT id AS tenant_id
FROM public.tenants
ORDER BY id
LIMIT 1
\gset fixture_

INSERT INTO public.employees(name, tenant_id, status)
VALUES ('Catalog migration verifier', :'fixture_tenant_id', 'active')
RETURNING id AS employee_id
\gset fixture_

SET LOCAL ROLE service_role;

INSERT INTO public.catalog_categories(
  code, name, level, status, created_by_employee_id,
  updated_by_employee_id, ownership_scope, owner_tenant_id
)
VALUES (
  'VERIFY_ROOT', 'Verify root', 1, 'active', :'fixture_employee_id',
  :'fixture_employee_id', 'tenant', :'fixture_tenant_id'
)
RETURNING id AS category_id
\gset fixture_

INSERT INTO public.catalog_spec_definitions(
  category_id, code, name, value_type, enum_options,
  is_required, participates_in_sku_name, is_filterable,
  ownership_scope, owner_tenant_id, status,
  created_by_employee_id, updated_by_employee_id
)
VALUES (
  :'fixture_category_id', 'VERIFY_TEXT', 'Verify text', 'text', '[]'::jsonb,
  false, false, false, 'tenant', :'fixture_tenant_id', 'active',
  :'fixture_employee_id', :'fixture_employee_id'
);

INSERT INTO public.catalog_unit_suggestions(
  tenant_id, suggested_code, suggested_name, suggested_symbol,
  unit_dimension, reason, status, version, submitted_by_employee_id
)
VALUES (
  :'fixture_tenant_id', 'VERIFY_UNIT', 'Verify unit', 'vu',
  'verify_dimension', 'migration verifier', 'submitted', 1,
  :'fixture_employee_id'
);

RESET ROLE;
SQL
}

run_sequence() {
  local database="$1"
  local before_snapshot
  local after_snapshot

  before_snapshot="$(snapshot_database "${database}")"
  {
    echo 'BEGIN;'
    render_migration_body "${materialization_file}"
    render_migration_body "${hardening_file}"
    assert_final_schema_sql
    assert_service_role_writes_sql
    echo 'ROLLBACK;'
  } | psql_admin "${database}" >/dev/null
  after_snapshot="$(snapshot_database "${database}")"

  if [ "${before_snapshot}" != "${after_snapshot}" ]; then
    echo "error=rollback_residue database=${database}" >&2
    exit 1
  fi
  echo "sequence_ok database=${database} rollback_residue=0"
}

assert_b_missing_index_fails_closed() {
  local output
  local status

  set +e
  output="$({
    echo 'BEGIN;'
    echo 'DROP INDEX public.catalog_brands_platform_no_brand_identity_idx;'
    render_migration_body "${materialization_file}"
    echo 'ROLLBACK;'
  } | psql_admin "${granular_database}" 2>&1)"
  status=$?
  set -e

  if [ "${status}" -eq 0 ] ||
    [[ "${output}" != *"SUPPLIER_CATALOG_SCHEMA_STATE_UNSUPPORTED"* ]]; then
    echo "error=missing_index_fingerprint_not_rejected" >&2
    exit 1
  fi
  echo "fingerprint_ok database=${granular_database} missing_index=rejected"
}

assert_b_missing_index_fails_closed
run_sequence "${repository_database}"
run_sequence "${granular_database}"
