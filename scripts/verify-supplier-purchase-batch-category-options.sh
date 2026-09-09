#!/usr/bin/env bash
set -euo pipefail

readonly container_name="supabase_db_gooes"
readonly migration_version="20260908110000"
readonly migration_file="supabase/migrations/${migration_version}_resolve_supplier_purchase_batch_category_options.sql"
readonly test_file="supabase/tests/supplier_purchase_batch_category_options.sql"
readonly function_signature="public.resolve_supplier_purchase_batch_category_options(uuid,timestamptz,text,integer,integer)"

if [[ ! -f "$migration_file" || ! -f "$test_file" ]]; then
  echo "run this verifier from the Gooes repository root" >&2
  exit 2
fi

docker inspect "$container_name" >/dev/null

query_scalar() {
  docker exec "$container_name" psql -X -v ON_ERROR_STOP=1 \
    -U postgres -d postgres -Atq -c "$1" | tr -d '[:space:]'
}

read_migration_applied() {
  local ledger_relation
  ledger_relation="$(query_scalar \
    "select coalesce(to_regclass('supabase_migrations.schema_migrations')::text, '')")" || return $?

  if [[ -z "$ledger_relation" ]]; then
    echo "migration ledger table is absent; treating target migration as not applied" >&2
    printf '0'
    return
  fi

  local applied_count
  applied_count="$(query_scalar \
    "select count(*) from supabase_migrations.schema_migrations where version = '$migration_version'")" || return $?
  if [[ ! "$applied_count" =~ ^[0-9]+$ || "$applied_count" -gt 1 ]]; then
    echo "schema drift: invalid migration ledger count for $migration_version: $applied_count" >&2
    exit 3
  fi
  printf '%s' "$applied_count"
}

read_function_exists() {
  local resolved_function
  resolved_function="$(query_scalar \
    "select coalesce(to_regprocedure('$function_signature')::text, '')")" || return $?
  if [[ -n "$resolved_function" ]]; then
    printf '1'
  else
    printf '0'
  fi
}

run_integration_test() {
  docker exec -i "$container_name" psql -X -v ON_ERROR_STOP=1 \
    -U postgres -d postgres < "$test_file"
}

assert_fixtures_clean() {
  local remaining_fixture_rows
  remaining_fixture_rows="$(query_scalar \
    "select count(*) from public.tenants where slug like 'category-option-fixture-%'")"
  if [[ "$remaining_fixture_rows" != "0" ]]; then
    echo "category options SQL fixtures were not rolled back" >&2
    exit 4
  fi
}

initial_applied="$(read_migration_applied)"
readonly initial_applied
initial_function="$(read_function_exists)"
readonly initial_function

if [[ "$initial_applied:$initial_function" == "1:0" || \
      "$initial_applied:$initial_function" == "0:1" ]]; then
  echo "schema drift: migration applied=$initial_applied, function exists=$initial_function" >&2
  exit 3
fi

if [[ "$initial_applied:$initial_function" == "1:1" ]]; then
  echo "category options verifier: installed migration mode"
  run_integration_test
  assert_fixtures_clean

  final_applied="$(read_migration_applied)"
  final_function="$(read_function_exists)"
  if [[ "$final_applied:$final_function" != "1:1" ]]; then
    echo "schema drift: installed migration state changed during verification" >&2
    exit 3
  fi

  echo "category options SQL integration passed using the installed migration"
  exit 0
fi

if [[ "$initial_applied:$initial_function" != "0:0" ]]; then
  echo "schema drift: unsupported migration state $initial_applied:$initial_function" >&2
  exit 3
fi

echo "category options verifier: temporary local migration mode"
temporary_function_created=0

drop_temporary_function() {
  docker exec "$container_name" psql -X -v ON_ERROR_STOP=1 \
    -U postgres -d postgres -c \
    "DROP FUNCTION $function_signature;" >/dev/null
}

cleanup_on_exit() {
  local exit_code=$?
  trap - EXIT
  if [[ "$temporary_function_created" == "1" ]]; then
    if ! drop_temporary_function; then
      echo "failed to clean the temporary category options function" >&2
      if [[ "$exit_code" == "0" ]]; then
        exit_code=4
      fi
    fi
  fi
  exit "$exit_code"
}
trap cleanup_on_exit EXIT

# Apply only the target migration for local verification. This deliberately
# does not insert or update the Supabase migration ledger.
docker exec -i "$container_name" psql -X -v ON_ERROR_STOP=1 \
  -U postgres -d postgres < "$migration_file"
temporary_function_created=1

run_integration_test
drop_temporary_function
temporary_function_created=0
trap - EXIT

final_applied="$(read_migration_applied)"
final_function="$(read_function_exists)"
assert_fixtures_clean

if [[ "$final_applied:$final_function" != "0:0" ]]; then
  echo "schema drift: temporary verification changed migration state to $final_applied:$final_function" >&2
  exit 3
fi

echo "category options SQL integration passed; temporary function and fixtures cleaned"
