#!/usr/bin/env bash
set -euo pipefail

default_database_url="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
default_container_name="supabase_db_gooes"
database_url="${DATABASE_URL:-${default_database_url}}"
container_name="${SUPABASE_DB_CONTAINER:-${default_container_name}}"
database_url_is_default=false
container_name_is_default=false
if [ "${database_url}" = "${default_database_url}" ]; then
  database_url_is_default=true
fi
if [ "${container_name}" = "${default_container_name}" ]; then
  container_name_is_default=true
fi

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
  if [ "${database_url_is_default}" != true ] \
    || [ "${container_name_is_default}" != true ]; then
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

  docker exec -i \
    --env "PGAPPNAME=${application_name}" \
    --env "PGCONNECT_TIMEOUT=3" \
    --env "PGOPTIONS=-c statement_timeout=15s -c lock_timeout=8s" \
    "${container_name}" \
    psql -X -q -U postgres -d "${database_name}" -v ON_ERROR_STOP=1 "$@"
}

is_uuid() {
  [[ "$1" =~ ^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$ ]]
}

scratch_directory=""
background_pids=()
fixtures_created=false

manifest="$(psql_run "tenant-template-concurrency-manifest" -At -F '|' <<'SQL'
WITH fixture AS (
  SELECT
    pg_catalog.gen_random_uuid() AS ownership_id,
    pg_catalog.gen_random_uuid() AS direct_tenant_id,
    pg_catalog.gen_random_uuid() AS direct_employee_id,
    pg_catalog.gen_random_uuid() AS approval_tenant_id,
    pg_catalog.gen_random_uuid() AS approval_employee_id,
    pg_catalog.gen_random_uuid() AS approval_application_id,
    pg_catalog.gen_random_uuid() AS approval_file_id
),
candidate_pool AS (
  SELECT
    candidate.ordinal,
    '17' || pg_catalog.lpad(
      (
        (
          pg_catalog.hashtextextended(
            fixture.ownership_id::text || ':phone:' || candidate.ordinal::text,
            0
          ) & 9223372036854775807
        ) % 1000000000
      )::text,
      9,
      '0'
    ) AS phone
  FROM fixture
  CROSS JOIN pg_catalog.generate_series(0, 2047) AS candidate(ordinal)
),
unique_candidates AS (
  SELECT candidate.phone, pg_catalog.min(candidate.ordinal) AS ordinal
  FROM candidate_pool AS candidate
  GROUP BY candidate.phone
),
available_candidates AS (
  SELECT candidate.phone, candidate.ordinal
  FROM unique_candidates AS candidate
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.employees AS employee
    WHERE employee.status = 'active'
      AND employee.phone IS NOT NULL
      AND pg_catalog.btrim(employee.phone) <> ''
      AND pg_catalog.btrim(employee.phone) = candidate.phone
  )
),
selected_candidates AS (
  SELECT
    candidate.phone,
    pg_catalog.row_number() OVER (
      ORDER BY candidate.ordinal, candidate.phone
    ) AS selection_rank
  FROM available_candidates AS candidate
  ORDER BY candidate.ordinal, candidate.phone
  LIMIT 2
)
SELECT
  fixture.ownership_id,
  fixture.direct_tenant_id,
  fixture.direct_employee_id,
  fixture.approval_tenant_id,
  fixture.approval_employee_id,
  fixture.approval_application_id,
  fixture.approval_file_id,
  (
    SELECT selected.phone
    FROM selected_candidates AS selected
    WHERE selected.selection_rank = 1
  ),
  (
    SELECT selected.phone
    FROM selected_candidates AS selected
    WHERE selected.selection_rank = 2
  )
FROM fixture;
SQL
)"
IFS='|' read -r ownership_id direct_holder_tenant_id direct_holder_employee_id \
  approval_holder_tenant_id approval_holder_employee_id approval_application_id \
  approval_file_id phone_number approval_phone_number <<<"${manifest}"

for fixture_uuid in \
  "${ownership_id}" \
  "${direct_holder_tenant_id}" \
  "${direct_holder_employee_id}" \
  "${approval_holder_tenant_id}" \
  "${approval_holder_employee_id}" \
  "${approval_application_id}" \
  "${approval_file_id}"; do
  if ! is_uuid "${fixture_uuid}"; then
    echo "error=invalid_fixture_uuid value=${fixture_uuid}" >&2
    exit 1
  fi
done
if [[ ! "${phone_number}" =~ ^[0-9]{11}$ ]] \
  || [[ ! "${approval_phone_number}" =~ ^[0-9]{11}$ ]]; then
  echo "error=invalid_fixture_phone" >&2
  exit 1
fi

ownership_short="${ownership_id//-/}"
ownership_short="${ownership_short:0:16}"
ownership_marker="tts-owner:${ownership_id}"
application_prefix="tenant-template-${ownership_short}"
direct_holder_slug="tts-direct-holder-${ownership_short}"
direct_slug="tts-direct-create-${ownership_short}"
approval_holder_slug="tts-approval-holder-${ownership_short}"
approval_rpc_slug="tts-approval-rpc-${ownership_short}"

cleanup_rows() {
  psql_run "${application_prefix}-cleanup" \
    -v ownership_marker="${ownership_marker}" \
    -v direct_holder_tenant_id="${direct_holder_tenant_id}" \
    -v direct_holder_employee_id="${direct_holder_employee_id}" \
    -v direct_holder_slug="${direct_holder_slug}" \
    -v direct_phone="${phone_number}" \
    -v approval_holder_tenant_id="${approval_holder_tenant_id}" \
    -v approval_holder_employee_id="${approval_holder_employee_id}" \
    -v approval_holder_slug="${approval_holder_slug}" \
    -v approval_phone="${approval_phone_number}" \
    -v direct_slug="${direct_slug}" \
    -v approval_application_id="${approval_application_id}" \
    -v approval_file_id="${approval_file_id}" >/dev/null <<'SQL'
BEGIN;

CREATE TEMP TABLE cleanup_run (
  ownership_marker text PRIMARY KEY,
  direct_slug text UNIQUE NOT NULL,
  direct_phone text NOT NULL,
  approval_phone text NOT NULL,
  approval_application_id uuid UNIQUE NOT NULL,
  approval_file_id uuid UNIQUE NOT NULL,
  application_no text UNIQUE NOT NULL,
  credit_code text UNIQUE NOT NULL
) ON COMMIT DROP;

INSERT INTO cleanup_run (
  ownership_marker,
  direct_slug,
  direct_phone,
  approval_phone,
  approval_application_id,
  approval_file_id,
  application_no,
  credit_code
)
VALUES (
  :'ownership_marker',
  :'direct_slug',
  :'direct_phone',
  :'approval_phone',
  :'approval_application_id'::uuid,
  :'approval_file_id'::uuid,
  'TTS-' || :'ownership_marker',
  'TTS-CREDIT-' || :'ownership_marker'
);

CREATE TEMP TABLE expected_cleanup_tenants (
  id uuid PRIMARY KEY,
  slug text NOT NULL,
  ownership_marker text NOT NULL
) ON COMMIT DROP;

CREATE TEMP TABLE unexpected_direct_tenant (
  id uuid PRIMARY KEY,
  slug text NOT NULL,
  ownership_marker text NOT NULL
) ON COMMIT DROP;

CREATE TEMP TABLE expected_cleanup_employees (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  ownership_marker text NOT NULL,
  phone text NOT NULL
) ON COMMIT DROP;

INSERT INTO expected_cleanup_tenants (id, slug, ownership_marker)
VALUES
  (
    :'direct_holder_tenant_id'::uuid,
    :'direct_holder_slug',
    :'ownership_marker'
  ),
  (
    :'approval_holder_tenant_id'::uuid,
    :'approval_holder_slug',
    :'ownership_marker'
  );

INSERT INTO expected_cleanup_employees (id, tenant_id, ownership_marker, phone)
VALUES
  (
    :'direct_holder_employee_id'::uuid,
    :'direct_holder_tenant_id'::uuid,
    :'ownership_marker',
    :'direct_phone'
  ),
  (
    :'approval_holder_employee_id'::uuid,
    :'approval_holder_tenant_id'::uuid,
    :'ownership_marker',
    :'approval_phone'
  );

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM expected_cleanup_tenants AS expected
    JOIN public.tenants AS tenant ON tenant.id = expected.id
    WHERE tenant.slug IS DISTINCT FROM expected.slug
       OR tenant.name IS DISTINCT FROM expected.ownership_marker
       OR tenant.contact_name IS DISTINCT FROM expected.ownership_marker
  ) OR EXISTS (
    SELECT 1
    FROM expected_cleanup_employees AS expected
    JOIN public.employees AS employee ON employee.id = expected.id
    WHERE employee.tenant_id IS DISTINCT FROM expected.tenant_id
       OR employee.name IS DISTINCT FROM expected.ownership_marker
       OR employee.phone IS DISTINCT FROM expected.phone
  ) OR EXISTS (
    SELECT 1
    FROM public.tenants AS tenant
    CROSS JOIN cleanup_run AS run
    WHERE tenant.slug = run.direct_slug
      AND (
        tenant.name IS DISTINCT FROM run.ownership_marker
        OR tenant.contact_name IS DISTINCT FROM run.ownership_marker
        OR tenant.contact_phone IS DISTINCT FROM run.direct_phone
      )
  ) OR EXISTS (
    SELECT 1
    FROM public.tenant_onboarding_applications AS application
    CROSS JOIN cleanup_run AS run
    WHERE application.id = run.approval_application_id
      AND (
        application.application_no IS DISTINCT FROM run.application_no
        OR application.visitor_id IS DISTINCT FROM run.ownership_marker
        OR application.company_name IS DISTINCT FROM run.ownership_marker
        OR application.unified_social_credit_code IS DISTINCT FROM run.credit_code
        OR application.business_license_file_id IS DISTINCT FROM run.approval_file_id
        OR application.admin_name IS DISTINCT FROM run.ownership_marker
        OR application.admin_phone IS DISTINCT FROM run.approval_phone
        OR application.idempotency_key IS DISTINCT FROM run.ownership_marker
        OR application.status IS DISTINCT FROM 'submitted'
        OR application.version IS DISTINCT FROM 1
      )
  ) OR EXISTS (
    SELECT 1
    FROM public.platform_file_objects AS file
    CROSS JOIN cleanup_run AS run
    WHERE file.id = run.approval_file_id
      AND (
        file.object_key IS DISTINCT FROM run.ownership_marker
        OR file.owner_visitor_id IS DISTINCT FROM run.ownership_marker
        OR file.metadata ->> 'ownership_marker' IS DISTINCT FROM
          run.ownership_marker
      )
  ) THEN
    RAISE EXCEPTION 'TENANT_TEMPLATE_CONCURRENCY_CLEANUP_OWNERSHIP_MISMATCH';
  END IF;
END;
$$;

INSERT INTO unexpected_direct_tenant (id, slug, ownership_marker)
SELECT tenant.id, tenant.slug, run.ownership_marker
FROM public.tenants AS tenant
CROSS JOIN cleanup_run AS run
WHERE tenant.slug = run.direct_slug
  AND tenant.name = run.ownership_marker
  AND tenant.contact_name = run.ownership_marker
  AND tenant.contact_phone = run.direct_phone;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.employees AS employee
    JOIN unexpected_direct_tenant AS tenant
      ON tenant.id = employee.tenant_id
    CROSS JOIN cleanup_run AS run
    WHERE employee.name IS DISTINCT FROM run.ownership_marker
       OR employee.phone IS DISTINCT FROM run.direct_phone
  ) THEN
    RAISE EXCEPTION 'TENANT_TEMPLATE_CONCURRENCY_CLEANUP_OWNERSHIP_MISMATCH';
  END IF;
END;
$$;

INSERT INTO expected_cleanup_tenants (id, slug, ownership_marker)
SELECT tenant.id, tenant.slug, tenant.ownership_marker
FROM unexpected_direct_tenant AS tenant;

INSERT INTO expected_cleanup_employees (id, tenant_id, ownership_marker, phone)
SELECT employee.id, employee.tenant_id, run.ownership_marker, run.direct_phone
FROM public.employees AS employee
JOIN unexpected_direct_tenant AS tenant ON tenant.id = employee.tenant_id
CROSS JOIN cleanup_run AS run
WHERE employee.name = run.ownership_marker
  AND employee.phone = run.direct_phone;

DELETE FROM public.tenant_onboarding_applications AS application
USING cleanup_run AS run
WHERE application.id = run.approval_application_id
  AND application.application_no = run.application_no
  AND application.visitor_id = run.ownership_marker
  AND application.company_name = run.ownership_marker
  AND application.unified_social_credit_code = run.credit_code
  AND application.business_license_file_id = run.approval_file_id
  AND application.admin_name = run.ownership_marker
  AND application.admin_phone = run.approval_phone
  AND application.idempotency_key = run.ownership_marker;

DELETE FROM public.employees AS employee
USING expected_cleanup_employees AS expected
WHERE employee.id = expected.id
  AND employee.tenant_id = expected.tenant_id
  AND employee.name = expected.ownership_marker
  AND employee.phone = expected.phone;

DELETE FROM public.tenants AS tenant
USING expected_cleanup_tenants AS expected
WHERE tenant.id = expected.id
  AND tenant.slug = expected.slug
  AND tenant.name = expected.ownership_marker
  AND tenant.contact_name = expected.ownership_marker;

DELETE FROM public.platform_file_objects AS file
USING cleanup_run AS run
WHERE file.id = run.approval_file_id
  AND file.object_key = run.ownership_marker
  AND file.owner_visitor_id = run.ownership_marker
  AND file.metadata ->> 'ownership_marker' = run.ownership_marker;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM expected_cleanup_tenants AS expected
    JOIN public.tenants AS tenant ON tenant.id = expected.id
  ) OR EXISTS (
    SELECT 1
    FROM expected_cleanup_employees AS expected
    JOIN public.employees AS employee ON employee.id = expected.id
  ) OR EXISTS (
    SELECT 1
    FROM public.tenant_onboarding_applications AS application
    CROSS JOIN cleanup_run AS run
    WHERE application.id = run.approval_application_id
  ) OR EXISTS (
    SELECT 1
    FROM public.platform_file_objects AS file
    CROSS JOIN cleanup_run AS run
    WHERE file.id = run.approval_file_id
  ) THEN
    RAISE EXCEPTION 'TENANT_TEMPLATE_CONCURRENCY_CLEANUP_INCOMPLETE';
  END IF;
END;
$$;

COMMIT;
SQL
}

cleanup() {
  local original_status=$?
  local cleanup_status=0
  trap - EXIT
  set +e

  for background_pid in "${background_pids[@]:-}"; do
    if kill -0 "${background_pid}" >/dev/null 2>&1; then
      kill "${background_pid}" >/dev/null 2>&1
    fi
    wait "${background_pid}" >/dev/null 2>&1
  done

  if [ "${fixtures_created}" = true ]; then
    cleanup_rows || cleanup_status=$?
  fi
  if [ -n "${scratch_directory}" ] && [ -d "${scratch_directory}" ]; then
    rm -R "${scratch_directory}" || cleanup_status=$?
  fi

  if [ "${cleanup_status}" -ne 0 ]; then
    echo "error=concurrency_cleanup_failed status=${cleanup_status}" >&2
  fi
  if [ "${original_status}" -ne 0 ]; then
    exit "${original_status}"
  fi
  exit "${cleanup_status}"
}
trap cleanup EXIT
trap 'exit 130' HUP INT TERM

scratch_directory="$(mktemp -d /tmp/gooes-tenant-template-concurrency.XXXXXX)"

psql_run "${application_prefix}-prerequisite" -At >/dev/null <<'SQL'
DO $$
BEGIN
  IF pg_catalog.to_regprocedure(
    'public.create_tenant_with_default_template(text,text,text,text,text,text,text,text,text,text,numeric,numeric,text,numeric,timestamp with time zone,text,text,text,text,uuid,text,text,uuid)'
  ) IS NULL OR pg_catalog.to_regprocedure(
    'public.lock_and_check_active_employee_phone(text)'
  ) IS NULL OR pg_catalog.to_regprocedure(
    'public.approve_tenant_onboarding_application(uuid,integer,uuid,text,uuid,text,text)'
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

psql_run "${application_prefix}-setup" \
  -v ownership_marker="${ownership_marker}" \
  -v direct_holder_tenant_id="${direct_holder_tenant_id}" \
  -v direct_holder_employee_id="${direct_holder_employee_id}" \
  -v direct_holder_slug="${direct_holder_slug}" \
  -v direct_slug="${direct_slug}" \
  -v direct_phone="${phone_number}" \
  -v approval_holder_tenant_id="${approval_holder_tenant_id}" \
  -v approval_holder_employee_id="${approval_holder_employee_id}" \
  -v approval_holder_slug="${approval_holder_slug}" \
  -v approval_phone="${approval_phone_number}" \
  -v approval_application_id="${approval_application_id}" \
  -v approval_file_id="${approval_file_id}" \
  -v approval_rpc_slug="${approval_rpc_slug}" >/dev/null <<'SQL'
BEGIN;

CREATE TEMP TABLE concurrency_fixture (
  tenant_id uuid PRIMARY KEY,
  employee_id uuid UNIQUE NOT NULL,
  slug text UNIQUE NOT NULL,
  phone text UNIQUE NOT NULL,
  ownership_marker text NOT NULL
) ON COMMIT DROP;

CREATE TEMP TABLE concurrency_run (
  ownership_marker text PRIMARY KEY,
  direct_slug text UNIQUE NOT NULL,
  approval_rpc_slug text UNIQUE NOT NULL,
  approval_application_id uuid UNIQUE NOT NULL,
  approval_file_id uuid UNIQUE NOT NULL,
  application_no text UNIQUE NOT NULL,
  credit_code text UNIQUE NOT NULL
) ON COMMIT DROP;

INSERT INTO concurrency_run (
  ownership_marker,
  direct_slug,
  approval_rpc_slug,
  approval_application_id,
  approval_file_id,
  application_no,
  credit_code
)
VALUES (
  :'ownership_marker',
  :'direct_slug',
  :'approval_rpc_slug',
  :'approval_application_id'::uuid,
  :'approval_file_id'::uuid,
  'TTS-' || :'ownership_marker',
  'TTS-CREDIT-' || :'ownership_marker'
);

INSERT INTO concurrency_fixture (tenant_id, employee_id, slug, phone, ownership_marker)
VALUES
  (
    :'direct_holder_tenant_id'::uuid,
    :'direct_holder_employee_id'::uuid,
    :'direct_holder_slug',
    :'direct_phone',
    :'ownership_marker'
  ),
  (
    :'approval_holder_tenant_id'::uuid,
    :'approval_holder_employee_id'::uuid,
    :'approval_holder_slug',
    :'approval_phone',
    :'ownership_marker'
  );

DO $$
BEGIN
  IF (SELECT pg_catalog.count(*) FROM concurrency_fixture) <> 2
    OR (
      SELECT pg_catalog.count(DISTINCT fixture.phone)
      FROM concurrency_fixture AS fixture
    ) <> 2
    OR EXISTS (
      SELECT 1
      FROM public.employees AS employee
      JOIN concurrency_fixture AS fixture
        ON pg_catalog.btrim(employee.phone) = fixture.phone
      WHERE employee.status = 'active'
        AND employee.phone IS NOT NULL
        AND pg_catalog.btrim(employee.phone) <> ''
    )
  THEN
    RAISE EXCEPTION 'TENANT_TEMPLATE_CONCURRENCY_PHONE_COLLISION';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.tenants AS tenant
    WHERE tenant.id IN (SELECT fixture.tenant_id FROM concurrency_fixture AS fixture)
       OR tenant.slug IN (
         SELECT fixture.slug FROM concurrency_fixture AS fixture
         UNION ALL
         SELECT run.direct_slug FROM concurrency_run AS run
         UNION ALL
         SELECT run.approval_rpc_slug FROM concurrency_run AS run
       )
       OR tenant.contact_name IN (
         SELECT run.ownership_marker FROM concurrency_run AS run
       )
  ) OR EXISTS (
    SELECT 1
    FROM public.employees AS employee
    WHERE employee.id IN (SELECT fixture.employee_id FROM concurrency_fixture AS fixture)
       OR employee.name IN (
         SELECT run.ownership_marker FROM concurrency_run AS run
       )
  ) OR EXISTS (
    SELECT 1
    FROM public.platform_file_objects AS file
    CROSS JOIN concurrency_run AS run
    WHERE file.id = run.approval_file_id
       OR file.object_key = run.ownership_marker
  ) OR EXISTS (
    SELECT 1
    FROM public.tenant_onboarding_applications AS application
    CROSS JOIN concurrency_run AS run
    WHERE application.id = run.approval_application_id
       OR application.application_no = run.application_no
       OR (
         application.visitor_id = run.ownership_marker
         AND application.idempotency_key = run.ownership_marker
       )
       OR pg_catalog.upper(
         pg_catalog.btrim(application.unified_social_credit_code)
       ) = run.credit_code
  ) THEN
    RAISE EXCEPTION 'TENANT_TEMPLATE_CONCURRENCY_FIXTURE_COLLISION';
  END IF;
END;
$$;

INSERT INTO public.tenants (id, name, slug, status, contact_name)
SELECT
  fixture.tenant_id,
  fixture.ownership_marker,
  fixture.slug,
  'active',
  fixture.ownership_marker
FROM concurrency_fixture AS fixture;

INSERT INTO public.platform_file_objects (
  id,
  owner_type,
  scene,
  bucket,
  object_key,
  mime_type,
  size_bytes,
  visibility,
  status,
  metadata,
  owner_visitor_id
)
SELECT
  run.approval_file_id,
  'visitor',
  'tenant_onboarding_license',
  'local-smoke',
  run.ownership_marker,
  'application/octet-stream',
  0,
  'private',
  'active',
  pg_catalog.jsonb_build_object('ownership_marker', run.ownership_marker),
  run.ownership_marker
FROM concurrency_run AS run;

INSERT INTO public.tenant_onboarding_applications (
  id,
  application_no,
  visitor_id,
  company_name,
  unified_social_credit_code,
  business_license_file_id,
  admin_name,
  admin_phone,
  address_city,
  address_region_code,
  address,
  service_region_codes,
  source_channel,
  privacy_policy_version,
  onboarding_terms_version,
  consented_at,
  idempotency_key
)
SELECT
  run.approval_application_id,
  run.application_no,
  run.ownership_marker,
  run.ownership_marker,
  run.credit_code,
  run.approval_file_id,
  run.ownership_marker,
  fixture.phone,
  'Local city',
  '000000',
  'Local smoke address',
  ARRAY['000000']::text[],
  'local_services',
  'local-smoke',
  'local-smoke',
  pg_catalog.now(),
  run.ownership_marker
FROM concurrency_run AS run
CROSS JOIN concurrency_fixture AS fixture
WHERE fixture.tenant_id = :'approval_holder_tenant_id'::uuid;

COMMIT;
SQL
fixtures_created=true

wait_for_session_sleep() {
  local application_name="$1"
  local attempt=0
  local active_count
  while [ "${attempt}" -lt 100 ]; do
    active_count="$(psql_run "${application_prefix}-observer" -At \
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
direct_holder_application="${application_prefix}-direct-holder"

psql_run "${direct_holder_application}" \
  -v tenant_id="${direct_holder_tenant_id}" \
  -v employee_id="${direct_holder_employee_id}" \
  -v ownership_marker="${ownership_marker}" \
  -v phone="${phone_number}" >"${direct_holder_log}" 2>&1 <<'SQL' &
BEGIN;
INSERT INTO public.employees (id, tenant_id, name, phone, status)
VALUES (
  :'employee_id'::uuid,
  :'tenant_id'::uuid,
  :'ownership_marker',
  :'phone',
  'active'
);
SELECT pg_catalog.pg_sleep(3);
COMMIT;
SQL
direct_holder_pid=$!
background_pids+=("${direct_holder_pid}")
if ! wait_for_session_sleep "${direct_holder_application}"; then
  sed -n '1,120p' "${direct_holder_log}" >&2
  exit 1
fi

set +e
psql_run "${application_prefix}-direct-create" \
  -v ownership_marker="${ownership_marker}" \
  -v direct_slug="${direct_slug}" \
  -v phone="${phone_number}" >"${direct_create_log}" 2>&1 <<'SQL'
SELECT public.create_tenant_with_default_template(
  p_name => :'ownership_marker',
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
  p_contact_name => :'ownership_marker',
  p_contact_phone => :'phone',
  p_admin_name => :'ownership_marker',
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
background_pids=()
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
approval_check_log="${scratch_directory}/approval-rpc.log"
approval_holder_application="${application_prefix}-approval-holder"

psql_run "${approval_holder_application}" \
  -v tenant_id="${approval_holder_tenant_id}" \
  -v employee_id="${approval_holder_employee_id}" \
  -v ownership_marker="${ownership_marker}" \
  -v phone="${approval_phone_number}" >"${approval_holder_log}" 2>&1 <<'SQL' &
BEGIN;
INSERT INTO public.employees (id, tenant_id, name, phone, status)
VALUES (
  :'employee_id'::uuid,
  :'tenant_id'::uuid,
  :'ownership_marker',
  :'phone',
  'active'
);
SELECT pg_catalog.pg_sleep(3);
COMMIT;
SQL
approval_holder_pid=$!
background_pids+=("${approval_holder_pid}")
if ! wait_for_session_sleep "${approval_holder_application}"; then
  sed -n '1,120p' "${approval_holder_log}" >&2
  exit 1
fi

set +e
psql_run "${application_prefix}-approval-rpc" -At \
  -v approval_application_id="${approval_application_id}" \
  -v approval_rpc_slug="${approval_rpc_slug}" \
  >"${approval_check_log}" 2>&1 <<'SQL'
SELECT public.approve_tenant_onboarding_application(
  p_application_id => :'approval_application_id'::uuid,
  p_expected_version => 1,
  p_reviewer_employee_id => NULL,
  p_tenant_slug => :'approval_rpc_slug',
  p_final_partner_id => NULL,
  p_attribution_source_type => NULL,
  p_review_remark => NULL
);
SQL
approval_check_status=$?
wait "${approval_holder_pid}"
approval_holder_status=$?
background_pids=()
set -e

assert_no_deadlock "${approval_holder_log}" "${approval_check_log}"
if [ "${approval_holder_status}" -ne 0 ] \
  || [ "${approval_check_status}" -ne 0 ] \
  || ! grep -Fq '"status": "admin_phone_exists"' "${approval_check_log}"; then
  echo "error=approval_phone_conflict_unstable holder_status=${approval_holder_status} approval_status=${approval_check_status}" >&2
  sed -n '1,120p' "${approval_holder_log}" >&2
  sed -n '1,120p' "${approval_check_log}" >&2
  exit 1
fi

echo "approval_rpc_phone_concurrency_ok rpc=approve_tenant_onboarding_application conflict=admin_phone_exists deadlocks=0"

cleanup_rows
fixtures_created=false

residue_count="$(psql_run "${application_prefix}-residue" -At \
  -v ownership_marker="${ownership_marker}" \
  -v direct_holder_tenant_id="${direct_holder_tenant_id}" \
  -v direct_holder_employee_id="${direct_holder_employee_id}" \
  -v direct_holder_slug="${direct_holder_slug}" \
  -v direct_slug="${direct_slug}" \
  -v approval_holder_tenant_id="${approval_holder_tenant_id}" \
  -v approval_holder_employee_id="${approval_holder_employee_id}" \
  -v approval_holder_slug="${approval_holder_slug}" \
  -v approval_rpc_slug="${approval_rpc_slug}" \
  -v approval_application_id="${approval_application_id}" \
  -v approval_file_id="${approval_file_id}" <<'SQL'
SELECT (
  SELECT pg_catalog.count(*)
  FROM public.tenants AS tenant
  WHERE tenant.id IN (
      :'direct_holder_tenant_id'::uuid,
      :'approval_holder_tenant_id'::uuid
    )
     OR tenant.slug IN (
       :'direct_holder_slug',
       :'direct_slug',
       :'approval_holder_slug',
       :'approval_rpc_slug'
     )
     OR tenant.contact_name = :'ownership_marker'
) + (
  SELECT pg_catalog.count(*)
  FROM public.employees AS employee
  WHERE employee.id IN (
      :'direct_holder_employee_id'::uuid,
      :'approval_holder_employee_id'::uuid
    )
     OR employee.name = :'ownership_marker'
) + (
  SELECT pg_catalog.count(*)
  FROM public.tenant_onboarding_applications AS application
  WHERE application.id = :'approval_application_id'::uuid
     OR (
       application.visitor_id = :'ownership_marker'
       AND application.idempotency_key = :'ownership_marker'
     )
) + (
  SELECT pg_catalog.count(*)
  FROM public.platform_file_objects AS file
  WHERE file.id = :'approval_file_id'::uuid
     OR file.object_key = :'ownership_marker'
);
SQL
)"
if [ "${residue_count}" != "0" ]; then
  echo "error=concurrency_cleanup_residue count=${residue_count}" >&2
  exit 1
fi

session_count="$(psql_run "${application_prefix}-sessions" -At \
  -v application_prefix="${application_prefix}" <<'SQL'
SELECT pg_catalog.count(*)
FROM pg_catalog.pg_stat_activity
WHERE application_name LIKE :'application_prefix' || '%'
  AND pid <> pg_catalog.pg_backend_pid();
SQL
)"
if [ "${session_count}" != "0" ]; then
  echo "error=concurrency_session_residue count=${session_count}" >&2
  exit 1
fi

echo "tenant_template_concurrency_cleanup_ok residue=0 sessions=0"
