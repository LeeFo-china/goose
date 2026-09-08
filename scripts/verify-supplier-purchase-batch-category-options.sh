#!/usr/bin/env bash
set -euo pipefail

readonly container_name="supabase_db_gooes"
readonly migration_file="supabase/migrations/20260908110000_resolve_supplier_purchase_batch_category_options.sql"
readonly test_file="supabase/tests/supplier_purchase_batch_category_options.sql"
readonly function_signature="public.resolve_supplier_purchase_batch_category_options(uuid,timestamptz,text,integer,integer)"

if [[ ! -f "$migration_file" || ! -f "$test_file" ]]; then
  echo "run this verifier from the Gooes repository root" >&2
  exit 2
fi

docker inspect "$container_name" >/dev/null

existing_function="$({
  docker exec "$container_name" psql -X -U postgres -d postgres -Atc \
    "select to_regprocedure('$function_signature')::text"
} | tr -d '[:space:]')"
if [[ -n "$existing_function" ]]; then
  echo "refusing to replace an existing local category options RPC" >&2
  exit 2
fi

cleanup() {
  docker exec "$container_name" psql -X -v ON_ERROR_STOP=1 \
    -U postgres -d postgres -c \
    "DROP FUNCTION IF EXISTS $function_signature;" >/dev/null
}
trap cleanup EXIT

docker exec -i "$container_name" psql -X -v ON_ERROR_STOP=1 \
  -U postgres -d postgres < "$migration_file"
docker exec -i "$container_name" psql -X -v ON_ERROR_STOP=1 \
  -U postgres -d postgres < "$test_file"

cleanup
trap - EXIT

remaining_function="$({
  docker exec "$container_name" psql -X -U postgres -d postgres -Atc \
    "select to_regprocedure('$function_signature')::text"
} | tr -d '[:space:]')"
remaining_fixture_rows="$({
  docker exec "$container_name" psql -X -U postgres -d postgres -Atc \
    "select count(*) from public.tenants where slug like 'category-option-fixture-%'"
} | tr -d '[:space:]')"

if [[ -n "$remaining_function" || "$remaining_fixture_rows" != "0" ]]; then
  echo "local category options verifier cleanup failed" >&2
  exit 3
fi

echo "category options SQL integration passed; local function and fixtures cleaned"
