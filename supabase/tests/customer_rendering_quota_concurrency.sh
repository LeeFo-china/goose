#!/usr/bin/env bash
set -euo pipefail

default_database_url="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
default_container_name="supabase_db_gooes"
database_url="${DATABASE_URL:-${default_database_url}}"
container_name="${SUPABASE_DB_CONTAINER:-${default_container_name}}"

case "${database_url}" in
  *\?*|*\#*|*%3[fF]*|*%23*|*%25*)
    echo "error=database_url_query_or_fragment_rejected" >&2
    exit 1
    ;;
esac

if [[ "${database_url}" =~ ^postgres(ql)?://([^/@[:space:]]+@)?(\[[^][]+\]|[^:/#?[:space:]]+)(:([0-9]+))?/([A-Za-z0-9_-]+)$ ]]; then
  database_host="${BASH_REMATCH[3]}"
  database_name="${BASH_REMATCH[6]}"
else
  echo "error=invalid_database_url" >&2
  exit 1
fi

case "${database_host}" in
  localhost|127.0.0.1|::1|\[::1\]) ;;
  *)
    echo "error=nonlocal_database_rejected host=${database_host}" >&2
    exit 1
    ;;
esac

psql_mode="native"
if ! command -v psql >/dev/null 2>&1; then
  if [ "${database_url}" != "${default_database_url}" ] \
    || [ "${container_name}" != "${default_container_name}" ]; then
    echo "error=custom_database_requires_native_psql" >&2
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
      PGOPTIONS="-c statement_timeout=15s -c lock_timeout=8s" \
      psql "${database_url}" -X -q -v ON_ERROR_STOP=1 "$@"
    return
  fi

  docker exec -i "${container_name}" \
    env PGAPPNAME="${application_name}" \
      PGCONNECT_TIMEOUT=3 \
      PGOPTIONS="-c statement_timeout=15s -c lock_timeout=8s" \
      psql -h /var/run/postgresql -X -q -U postgres -d "${database_name}" \
        -v ON_ERROR_STOP=1 "$@"
}

is_uuid() {
  [[ "$1" =~ ^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$ ]]
}

scratch_directory="$(mktemp -d)"
tenant_id="$(psql_run "rendering-quota-concurrency-manifest" -Atc \
  "SELECT pg_catalog.gen_random_uuid();")"
tenant_slug="rendering-quota-concurrency-${tenant_id:0:8}"
fixture_file="$(cd "$(dirname "$0")" && pwd -P)/customer_rendering_quota_concurrency_fixture.sql"

cleanup() {
  if is_uuid "${tenant_id}"; then
    psql_run "rendering-quota-concurrency-cleanup" <<SQL >/dev/null 2>&1 || true
DELETE FROM public.customer_rendering_quota_events WHERE tenant_id = '${tenant_id}'::uuid;
DELETE FROM public.customer_rendering_quota_reservations WHERE tenant_id = '${tenant_id}'::uuid;
DELETE FROM public.customer_rendering_identity_commands WHERE tenant_id = '${tenant_id}'::uuid;
DELETE FROM public.customer_rendering_identity_bindings WHERE tenant_id = '${tenant_id}'::uuid;
DELETE FROM public.customer_rendering_quota_accounts WHERE tenant_id = '${tenant_id}'::uuid;
DELETE FROM public.tenants WHERE id = '${tenant_id}'::uuid;
SQL
  fi
  rm -rf "${scratch_directory}"
}
trap cleanup EXIT

if ! is_uuid "${tenant_id}"; then
  echo "error=invalid_fixture_tenant_id" >&2
  exit 1
fi

psql_run "rendering-quota-concurrency-fixture" \
  -v "tenant_id=${tenant_id}" \
  -v "tenant_slug=${tenant_slug}" < "${fixture_file}"

scenario_one_subject="$(printf '1%.0s' {1..64})"
scenario_one_phone="$(printf '2%.0s' {1..64})"
request_hash="$(printf 'e%.0s' {1..64})"
other_hash="$(printf 'f%.0s' {1..64})"

psql_run "rendering-quota-concurrency-remaining-setup" <<SQL
DO \$\$
DECLARE
  v_job_id uuid;
  v_result jsonb;
BEGIN
  PERFORM public.bind_customer_rendering_phone(
    '${tenant_id}'::uuid, 'wechat', 1::smallint, '${scenario_one_subject}',
    NULL::text, NULL::uuid, 1::smallint, '${scenario_one_phone}',
    pg_catalog.gen_random_uuid(), '${request_hash}'
  );
  FOR v_iteration IN 1..4 LOOP
    v_job_id := pg_catalog.gen_random_uuid();
    v_result := public.reserve_customer_rendering_quota(
      '${tenant_id}'::uuid, 'wechat', 1::smallint, '${scenario_one_subject}',
      NULL::text, NULL::uuid, 1::smallint, '${scenario_one_phone}',
      v_job_id, pg_catalog.gen_random_uuid(), '${request_hash}'
    );
    IF v_result->>'decision' <> 'reserved' THEN
      RAISE EXCEPTION 'remaining setup reserve failed: %', v_result;
    END IF;
    PERFORM public.settle_customer_rendering_quota(
      '${tenant_id}'::uuid, v_job_id, 'consume'
    );
  END LOOP;
END;
\$\$;
SQL

scenario_one_job_a="$(psql_run "rendering-quota-concurrency-id" -Atc "SELECT pg_catalog.gen_random_uuid();")"
scenario_one_job_b="$(psql_run "rendering-quota-concurrency-id" -Atc "SELECT pg_catalog.gen_random_uuid();")"
scenario_one_key_a="$(psql_run "rendering-quota-concurrency-id" -Atc "SELECT pg_catalog.gen_random_uuid();")"
scenario_one_key_b="$(psql_run "rendering-quota-concurrency-id" -Atc "SELECT pg_catalog.gen_random_uuid();")"
for value in "${scenario_one_job_a}" "${scenario_one_job_b}" "${scenario_one_key_a}" "${scenario_one_key_b}"; do
  is_uuid "${value}" || { echo "error=invalid_generated_uuid" >&2; exit 1; }
done

psql_run "rendering-quota-concurrency-remaining-a" -Atc "
SELECT public.reserve_customer_rendering_quota(
  '${tenant_id}'::uuid, 'wechat', 1::smallint, '${scenario_one_subject}',
  NULL::text, NULL::uuid, 1::smallint, '${scenario_one_phone}',
  '${scenario_one_job_a}'::uuid, '${scenario_one_key_a}'::uuid, '${request_hash}'
)->>'decision';" >"${scratch_directory}/remaining-a" &
pid_a=$!
psql_run "rendering-quota-concurrency-remaining-b" -Atc "
SELECT public.reserve_customer_rendering_quota(
  '${tenant_id}'::uuid, 'wechat', 1::smallint, '${scenario_one_subject}',
  NULL::text, NULL::uuid, 1::smallint, '${scenario_one_phone}',
  '${scenario_one_job_b}'::uuid, '${scenario_one_key_b}'::uuid, '${other_hash}'
)->>'decision';" >"${scratch_directory}/remaining-b" &
pid_b=$!
wait "${pid_a}"
wait "${pid_b}"

remaining_results="$(sort "${scratch_directory}/remaining-a" "${scratch_directory}/remaining-b" | tr '\n' ' ')"
if [ "${remaining_results}" != "job_active reserved " ]; then
  echo "error=remaining_concurrency_mismatch results=${remaining_results}" >&2
  exit 1
fi

scenario_two_subject="$(printf '3%.0s' {1..64})"
scenario_two_job="$(psql_run "rendering-quota-concurrency-id" -Atc "SELECT pg_catalog.gen_random_uuid();")"
scenario_two_key="$(psql_run "rendering-quota-concurrency-id" -Atc "SELECT pg_catalog.gen_random_uuid();")"

for suffix in a b; do
  psql_run "rendering-quota-concurrency-replay-${suffix}" -Atc "
SELECT public.reserve_customer_rendering_quota(
  '${tenant_id}'::uuid, 'wechat', 1::smallint, '${scenario_two_subject}',
  NULL::text, NULL::uuid, NULL::smallint, NULL::text,
  '${scenario_two_job}'::uuid, '${scenario_two_key}'::uuid, '${request_hash}'
)->>'decision';" >"${scratch_directory}/replay-${suffix}" &
  if [ "${suffix}" = "a" ]; then pid_a=$!; else pid_b=$!; fi
done
wait "${pid_a}"
wait "${pid_b}"

replay_results="$(sort "${scratch_directory}/replay-a" "${scratch_directory}/replay-b" | tr '\n' ' ')"
if [ "${replay_results}" != "existing reserved " ]; then
  echo "error=idempotent_replay_mismatch results=${replay_results}" >&2
  exit 1
fi

replay_counts="$(psql_run "rendering-quota-concurrency-replay-check" -At -F '|' -c "
SELECT
  count(DISTINCT reservation.id),
  count(event.id) FILTER (WHERE event.event_type = 'reserve')
FROM public.customer_rendering_quota_reservations AS reservation
LEFT JOIN public.customer_rendering_quota_events AS event
  ON event.tenant_id = reservation.tenant_id
 AND event.reservation_id = reservation.id
WHERE reservation.tenant_id = '${tenant_id}'::uuid
  AND reservation.job_id = '${scenario_two_job}'::uuid;")"
if [ "${replay_counts}" != "1|1" ]; then
  echo "error=idempotent_replay_fact_mismatch counts=${replay_counts}" >&2
  exit 1
fi

scenario_three_wechat="$(printf '4%.0s' {1..64})"
scenario_three_douyin="$(printf '5%.0s' {1..64})"
scenario_three_phone="$(printf '6%.0s' {1..64})"
scenario_three_installation="$(psql_run "rendering-quota-concurrency-id" -Atc "SELECT pg_catalog.gen_random_uuid();")"
scenario_three_job="$(psql_run "rendering-quota-concurrency-id" -Atc "SELECT pg_catalog.gen_random_uuid();")"

psql_run "rendering-quota-concurrency-merge-setup" <<SQL
DO \$\$
DECLARE
  v_wechat_job uuid := pg_catalog.gen_random_uuid();
BEGIN
  PERFORM public.bind_customer_rendering_phone(
    '${tenant_id}'::uuid, 'wechat', 1::smallint, '${scenario_three_wechat}',
    NULL::text, NULL::uuid, 1::smallint, '${scenario_three_phone}',
    pg_catalog.gen_random_uuid(), '${request_hash}'
  );
  PERFORM public.reserve_customer_rendering_quota(
    '${tenant_id}'::uuid, 'wechat', 1::smallint, '${scenario_three_wechat}',
    NULL::text, NULL::uuid, 1::smallint, '${scenario_three_phone}',
    v_wechat_job, pg_catalog.gen_random_uuid(), '${request_hash}'
  );
  PERFORM public.settle_customer_rendering_quota(
    '${tenant_id}'::uuid, v_wechat_job, 'consume'
  );
  PERFORM public.reserve_customer_rendering_quota(
    '${tenant_id}'::uuid, 'douyin', 1::smallint, '${scenario_three_douyin}',
    'tt-concurrency-app', '${scenario_three_installation}'::uuid,
    NULL::smallint, NULL::text, '${scenario_three_job}'::uuid,
    pg_catalog.gen_random_uuid(), '${request_hash}'
  );
END;
\$\$;
SQL

psql_run "rendering-quota-concurrency-bind" -Atc "
SELECT public.bind_customer_rendering_phone(
  '${tenant_id}'::uuid, 'douyin', 1::smallint, '${scenario_three_douyin}',
  'tt-concurrency-app', '${scenario_three_installation}'::uuid,
  1::smallint, '${scenario_three_phone}', pg_catalog.gen_random_uuid(), '${other_hash}'
)->>'decision';" >"${scratch_directory}/merge-bind" &
pid_a=$!
psql_run "rendering-quota-concurrency-settle" -Atc "
SELECT public.settle_customer_rendering_quota(
  '${tenant_id}'::uuid, '${scenario_three_job}'::uuid, 'consume'
)->>'decision';" >"${scratch_directory}/merge-settle" &
pid_b=$!
wait "${pid_a}"
wait "${pid_b}"

merge_facts="$(psql_run "rendering-quota-concurrency-merge-check" -At -F '|' -c "
WITH quota AS (
  SELECT public.get_customer_rendering_quota(
    '${tenant_id}'::uuid, 'douyin', 1::smallint, '${scenario_three_douyin}',
    1::smallint, '${scenario_three_phone}'
  ) AS value
), bindings AS (
  SELECT count(DISTINCT quota_account_id) AS account_count
  FROM public.customer_rendering_identity_bindings
  WHERE tenant_id = '${tenant_id}'::uuid
    AND subject_digest IN ('${scenario_three_wechat}', '${scenario_three_douyin}')
)
SELECT quota.value->>'consumed', quota.value->>'reserved', bindings.account_count
FROM quota CROSS JOIN bindings;")"
if [ "${merge_facts}" != "2|0|1" ]; then
  echo "error=merge_settlement_concurrency_mismatch facts=${merge_facts}" >&2
  exit 1
fi

echo "remaining_race=pass"
echo "idempotent_replay=pass"
echo "merge_settlement_race=pass"
