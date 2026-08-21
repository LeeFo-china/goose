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

drop_catalog_triggers_sql() {
  cat <<'SQL'
DO $drop_catalog_triggers$
DECLARE
  v_trigger_name text;
BEGIN
  FOR v_trigger_name IN
    SELECT trigger_definition.tgname
    FROM pg_trigger AS trigger_definition
    WHERE trigger_definition.tgrelid = 'public.supplier_products'::regclass
      AND NOT trigger_definition.tgisinternal
      AND (
        trigger_definition.tgname IN (
          'tr_supplier_products_validate_catalog',
          'tr_supplier_products_v2_validate_catalog'
        )
        OR trigger_definition.tgfoid =
          'public.validate_supplier_product_catalog()'::regprocedure
      )
    ORDER BY trigger_definition.tgname
  LOOP
    EXECUTE format(
      'DROP TRIGGER %I ON public.supplier_products',
      v_trigger_name
    );
  END LOOP;
END
$drop_catalog_triggers$;
SQL
}

assert_final_schema_sql() {
  cat <<'SQL'
DO $verify$
DECLARE
  v_catalog_trigger_count integer;
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

  SELECT count(*)
  INTO v_catalog_trigger_count
  FROM pg_trigger AS trigger_definition
  WHERE trigger_definition.tgrelid = 'public.supplier_products'::regclass
    AND NOT trigger_definition.tgisinternal
    AND (
      trigger_definition.tgname IN (
        'tr_supplier_products_validate_catalog',
        'tr_supplier_products_v2_validate_catalog'
      )
      OR trigger_definition.tgfoid =
        'public.validate_supplier_product_catalog()'::regprocedure
    );

  IF v_catalog_trigger_count <> 1 OR NOT EXISTS (
    SELECT 1
    FROM pg_trigger AS trigger_definition
    WHERE trigger_definition.tgrelid = 'public.supplier_products'::regclass
      AND NOT trigger_definition.tgisinternal
      AND trigger_definition.tgenabled = 'O'
      AND trigger_definition.tgname =
        'tr_supplier_products_v2_validate_catalog'
      AND trigger_definition.tgfoid =
        'public.validate_supplier_product_catalog()'::regprocedure
      AND trigger_definition.tgtype = 23
      AND ARRAY(
        SELECT attribute_definition.attname::text
        FROM unnest(trigger_definition.tgattr::smallint[])
          WITH ORDINALITY AS trigger_attribute(attnum, ordinality)
        JOIN pg_attribute AS attribute_definition
          ON attribute_definition.attrelid = trigger_definition.tgrelid
          AND attribute_definition.attnum = trigger_attribute.attnum
        ORDER BY trigger_attribute.ordinality
      ) = ARRAY['category_id', 'brand_id', 'status']::text[]
  ) THEN
    RAISE EXCEPTION 'supplier product catalog trigger is not canonical';
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

assert_catalog_product_writes_sql() {
  cat <<'SQL'
INSERT INTO public.catalog_categories(
  code, name, level, status, created_by_employee_id,
  updated_by_employee_id, ownership_scope, owner_tenant_id
)
VALUES (
  'VERIFY_PRODUCT_ROOT', 'Verify product root', 1, 'active',
  :'fixture_employee_id', :'fixture_employee_id', 'tenant',
  :'fixture_tenant_id'
)
RETURNING id AS product_root_category_id
\gset fixture_

INSERT INTO public.catalog_categories(
  code, name, parent_id, level, status, created_by_employee_id,
  updated_by_employee_id, ownership_scope, owner_tenant_id
)
VALUES (
  'VERIFY_LEAF', 'Verify leaf', :'fixture_product_root_category_id', 2, 'active',
  :'fixture_employee_id', :'fixture_employee_id', 'tenant',
  :'fixture_tenant_id'
)
RETURNING id AS leaf_category_id
\gset fixture_

INSERT INTO public.catalog_categories(
  code, name, level, status, created_by_employee_id,
  updated_by_employee_id, ownership_scope, owner_tenant_id
)
VALUES (
  'VERIFY_INACTIVE', 'Verify inactive category', 1, 'inactive',
  :'fixture_employee_id', :'fixture_employee_id', 'tenant',
  :'fixture_tenant_id'
)
RETURNING id AS inactive_category_id
\gset fixture_

INSERT INTO public.catalog_brands(
  code, name, status, created_by_employee_id,
  updated_by_employee_id, ownership_scope, owner_tenant_id
)
VALUES (
  'VERIFY_ACTIVE_BRAND', 'Verify active brand', 'active',
  :'fixture_employee_id', :'fixture_employee_id', 'tenant',
  :'fixture_tenant_id'
)
RETURNING id AS active_brand_id
\gset fixture_

INSERT INTO public.catalog_brands(
  code, name, status, created_by_employee_id,
  updated_by_employee_id, ownership_scope, owner_tenant_id
)
VALUES (
  'VERIFY_INACTIVE_BRAND', 'Verify inactive brand', 'inactive',
  :'fixture_employee_id', :'fixture_employee_id', 'tenant',
  :'fixture_tenant_id'
)
RETURNING id AS inactive_brand_id
\gset fixture_

INSERT INTO public.catalog_units(
  code, name, symbol, unit_dimension, status,
  created_by_employee_id, updated_by_employee_id
)
VALUES (
  'VERIFY_PRODUCT_UNIT', 'Verify product unit', 'vpu',
  'verify_product', 'active', :'fixture_employee_id', :'fixture_employee_id'
)
RETURNING id AS unit_id
\gset fixture_

INSERT INTO public.suppliers(
  code, name, legal_name, supplier_type, onboarding_status,
  operational_status, ownership_scope, owner_tenant_id,
  created_by_employee_id, updated_by_employee_id
)
VALUES (
  'VERIFY_CATALOG_V2_SUPPLIER', 'Verify catalog v2 supplier',
  'Verify catalog v2 supplier', 'other', 'approved', 'active',
  'tenant', :'fixture_tenant_id', :'fixture_employee_id',
  :'fixture_employee_id'
)
RETURNING id AS supplier_id
\gset fixture_

INSERT INTO public.supplier_products(
  supplier_id, product_code, name, category_id, brand_id, status,
  acting_tenant_id, acting_employee_id, operation_source, proxy_reason,
  created_by_employee_id, updated_by_employee_id,
  ownership_scope, owner_tenant_id
)
VALUES (
  :'fixture_supplier_id', 'VERIFY_CATALOG_V2_PRODUCT',
  'Verify catalog v2 product', :'fixture_leaf_category_id',
  :'fixture_active_brand_id', 'draft', :'fixture_tenant_id',
  :'fixture_employee_id', 'tenant_proxy', 'migration verifier',
  :'fixture_employee_id', :'fixture_employee_id', 'tenant',
  :'fixture_tenant_id'
)
RETURNING id AS product_id
\gset fixture_

INSERT INTO public.supplier_skus(
  supplier_id, supplier_product_id, sku_code, name, purchase_unit_id,
  base_unit_id, base_unit_conversion, status, acting_tenant_id,
  acting_employee_id, operation_source, proxy_reason,
  created_by_employee_id, updated_by_employee_id,
  ownership_scope, owner_tenant_id
)
VALUES (
  :'fixture_supplier_id', :'fixture_product_id', 'VERIFY_CATALOG_V2_SKU',
  'Verify catalog v2 SKU', :'fixture_unit_id', :'fixture_unit_id', 1,
  'active', :'fixture_tenant_id', :'fixture_employee_id', 'tenant_proxy',
  'migration verifier', :'fixture_employee_id', :'fixture_employee_id',
  'tenant', :'fixture_tenant_id'
);

UPDATE public.supplier_products
SET status = 'active'
WHERE id = :'fixture_product_id';

SELECT set_config(
  'supplier_catalog_verifier.product_id',
  :'fixture_product_id',
  true
);
SELECT set_config(
  'supplier_catalog_verifier.non_leaf_category_id',
  :'fixture_product_root_category_id',
  true
);
SELECT set_config(
  'supplier_catalog_verifier.inactive_category_id',
  :'fixture_inactive_category_id',
  true
);
SELECT set_config(
  'supplier_catalog_verifier.inactive_brand_id',
  :'fixture_inactive_brand_id',
  true
);

DO $legal_active_product$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.supplier_products AS product
    WHERE product.id =
      current_setting('supplier_catalog_verifier.product_id')::uuid
      AND product.status = 'active'
  ) THEN
    RAISE EXCEPTION 'legal_active_product was not written';
  END IF;
END
$legal_active_product$;

DO $non_leaf_category$
BEGIN
  BEGIN
    UPDATE public.supplier_products
    SET category_id = current_setting(
      'supplier_catalog_verifier.non_leaf_category_id'
    )::uuid
    WHERE id = current_setting(
      'supplier_catalog_verifier.product_id'
    )::uuid;
    RAISE EXCEPTION 'non_leaf_category accepted';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM <> 'SUPPLIER_CATALOG_REFERENCE_INVALID' THEN
      RAISE;
    END IF;
  END;
END
$non_leaf_category$;

DO $inactive_category$
BEGIN
  BEGIN
    UPDATE public.supplier_products
    SET category_id = current_setting(
      'supplier_catalog_verifier.inactive_category_id'
    )::uuid
    WHERE id = current_setting(
      'supplier_catalog_verifier.product_id'
    )::uuid;
    RAISE EXCEPTION 'inactive_category accepted';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM <> 'SUPPLIER_CATALOG_REFERENCE_INVALID' THEN
      RAISE;
    END IF;
  END;
END
$inactive_category$;

DO $inactive_brand$
BEGIN
  BEGIN
    UPDATE public.supplier_products
    SET brand_id = current_setting(
      'supplier_catalog_verifier.inactive_brand_id'
    )::uuid
    WHERE id = current_setting(
      'supplier_catalog_verifier.product_id'
    )::uuid;
    RAISE EXCEPTION 'inactive_brand accepted';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM <> 'SUPPLIER_CATALOG_REFERENCE_INVALID' THEN
      RAISE;
    END IF;
  END;
END
$inactive_brand$;
SQL
}

run_sequence() {
  local database="$1"
  local before_snapshot
  local after_snapshot

  before_snapshot="$(snapshot_database "${database}")"
  {
    echo 'BEGIN;'
    drop_catalog_triggers_sql
    render_migration_body "${materialization_file}"
    render_migration_body "${hardening_file}"
    assert_final_schema_sql
    assert_service_role_writes_sql
    assert_catalog_product_writes_sql
    echo 'ROLLBACK;'
  } | psql_admin "${database}" >/dev/null
  after_snapshot="$(snapshot_database "${database}")"

  if [ "${before_snapshot}" != "${after_snapshot}" ]; then
    echo "error=rollback_residue database=${database}" >&2
    exit 1
  fi
  echo "sequence_ok database=${database} missing_catalog_trigger=repaired catalog_writes=legal_active_product,non_leaf_category_rejected,inactive_category_rejected,inactive_brand_rejected rollback_residue=0"
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

assert_b_tampered_trigger_is_normalized() {
  local before_snapshot
  local after_snapshot

  before_snapshot="$(snapshot_database "${granular_database}")"
  {
    echo 'BEGIN;'
    drop_catalog_triggers_sql
    cat <<'SQL'
CREATE TRIGGER tr_supplier_products_v2_validate_catalog
BEFORE INSERT ON public.supplier_products
FOR EACH ROW
EXECUTE FUNCTION public.validate_supplier_product_catalog();

CREATE TRIGGER tr_supplier_products_duplicate_validate_catalog
BEFORE UPDATE OF brand_id ON public.supplier_products
FOR EACH ROW
EXECUTE FUNCTION public.validate_supplier_product_catalog();
SQL
    render_migration_body "${materialization_file}"
    render_migration_body "${hardening_file}"
    assert_final_schema_sql
    echo 'ROLLBACK;'
  } | psql_admin "${granular_database}" >/dev/null
  after_snapshot="$(snapshot_database "${granular_database}")"

  if [ "${before_snapshot}" != "${after_snapshot}" ]; then
    echo "error=tampered_trigger_rollback_residue database=${granular_database}" >&2
    exit 1
  fi
  echo "normalization_ok database=${granular_database} tampered_catalog_trigger=repaired duplicate_catalog_trigger=removed rollback_residue=0"
}

assert_b_disabled_category_trigger_fails_closed() {
  local before_snapshot
  local after_snapshot
  local output
  local status

  before_snapshot="$(snapshot_database "${granular_database}")"
  set +e
  output="$({
    echo 'BEGIN;'
    render_migration_body "${materialization_file}"
    echo 'ALTER TABLE public.catalog_categories DISABLE TRIGGER tr_catalog_categories_v2_validate_hierarchy;'
    echo '\set ON_ERROR_STOP off'
    render_migration_body "${hardening_file}"
    echo 'ROLLBACK;'
  } | psql_admin "${granular_database}" 2>&1)"
  status=$?
  set -e
  after_snapshot="$(snapshot_database "${granular_database}")"

  if [ "${status}" -ne 0 ] ||
    [[ "${output}" != *"SUPPLIER_CATALOG_SCHEMA_PRECONDITION_FAILED"* ]] ||
    [[ "${output}" != *"ROLLBACK"* ]]; then
    echo "error=disabled_category_hierarchy_trigger_not_rejected" >&2
    echo "${output}" >&2
    exit 1
  fi
  if [ "${before_snapshot}" != "${after_snapshot}" ]; then
    echo "error=disabled_trigger_rollback_residue database=${granular_database}" >&2
    exit 1
  fi
  echo "hardening_ok database=${granular_database} disabled_category_hierarchy_trigger=rejected rollback_residue=0"
}

assert_b_wrong_category_trigger_fails_closed() {
  local before_snapshot
  local after_snapshot
  local output
  local status

  before_snapshot="$(snapshot_database "${granular_database}")"
  set +e
  output="$({
    echo 'BEGIN;'
    render_migration_body "${materialization_file}"
    cat <<'SQL'
DROP TRIGGER tr_catalog_categories_v2_validate_hierarchy
ON public.catalog_categories;
CREATE TRIGGER tr_catalog_categories_v2_validate_hierarchy
AFTER UPDATE ON public.catalog_categories
FOR EACH STATEMENT
EXECUTE FUNCTION public.lock_catalog_category_hierarchy();
\set ON_ERROR_STOP off
SQL
    render_migration_body "${hardening_file}"
    echo 'ROLLBACK;'
  } | psql_admin "${granular_database}" 2>&1)"
  status=$?
  set -e
  after_snapshot="$(snapshot_database "${granular_database}")"

  if [ "${status}" -ne 0 ] ||
    [[ "${output}" != *"SUPPLIER_CATALOG_SCHEMA_PRECONDITION_FAILED"* ]] ||
    [[ "${output}" != *"ROLLBACK"* ]]; then
    echo "error=wrong_category_hierarchy_trigger_not_rejected" >&2
    echo "${output}" >&2
    exit 1
  fi
  if [ "${before_snapshot}" != "${after_snapshot}" ]; then
    echo "error=wrong_trigger_rollback_residue database=${granular_database}" >&2
    exit 1
  fi
  echo "hardening_ok database=${granular_database} wrong_category_hierarchy_trigger=rejected rollback_residue=0"
}

assert_b_pg_catalog_search_path_succeeds() {
  local before_snapshot
  local after_snapshot
  local output
  local status

  before_snapshot="$(snapshot_database "${granular_database}")"
  set +e
  output="$({
    echo 'BEGIN;'
    render_migration_body "${materialization_file}"
    echo 'SET LOCAL search_path = pg_catalog;'
    echo '\set ON_ERROR_STOP off'
    render_migration_body "${hardening_file}"
    echo 'ROLLBACK;'
  } | psql_admin "${granular_database}" 2>&1)"
  status=$?
  set -e
  after_snapshot="$(snapshot_database "${granular_database}")"

  if [ "${status}" -ne 0 ] || [[ "${output}" == *"ERROR:"* ]] ||
    [[ "${output}" != *"ROLLBACK"* ]]; then
    echo "error=search_path_pg_catalog_rejected_valid_schema" >&2
    echo "${output}" >&2
    exit 1
  fi
  if [ "${before_snapshot}" != "${after_snapshot}" ]; then
    echo "error=search_path_rollback_residue database=${granular_database}" >&2
    exit 1
  fi
  echo "hardening_ok database=${granular_database} search_path_pg_catalog=accepted rollback_residue=0"
}

assert_b_missing_index_fails_closed
assert_b_tampered_trigger_is_normalized
assert_b_disabled_category_trigger_fails_closed
assert_b_wrong_category_trigger_fails_closed
assert_b_pg_catalog_search_path_succeeds
run_sequence "${repository_database}"
run_sequence "${granular_database}"
