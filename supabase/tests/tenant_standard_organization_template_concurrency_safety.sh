#!/usr/bin/env bash
set -euo pipefail

script_directory="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
target="${script_directory}/tenant_standard_organization_template_concurrency.sh"
scratch_directory="$(mktemp -d /tmp/gooes-tenant-template-safety.XXXXXX)"

cleanup() {
  rm -R "${scratch_directory}"
}
trap cleanup EXIT

mkdir "${scratch_directory}/bin" "${scratch_directory}/empty"
printf '%s\n' \
  '#!/bin/bash' \
  'if [ "${ASSERT_SANITIZED_LIBPQ:-}" = "1" ]; then' \
  '  if [ "${PGHOST+x}" = x ] || [ "${PGHOSTADDR+x}" = x ] || [ "${PGPORT+x}" = x ] || [ "${PGDATABASE+x}" = x ] || [ "${PGUSER+x}" = x ] || [ "${PGPASSWORD+x}" = x ] || [ "${PGPASSFILE+x}" = x ] || [ "${PGSERVICE+x}" = x ] || [ "${PGSERVICEFILE+x}" = x ] || [ "${PGCHANNELBINDING+x}" = x ] || [ "${PGCLIENTENCODING+x}" = x ] || [ "${PGSSLMODE+x}" = x ] || [ "${PGTARGETSESSIONATTRS+x}" = x ] || [ "${PGLOADBALANCEHOSTS+x}" = x ]; then' \
  '    printf "unsafe_libpq_environment\n" >"${PSQL_ENV_MARKER}"' \
  '    exit 96' \
  '  fi' \
  '  if [ "${PGAPPNAME:-}" = "inherited-app" ] || [ "${PGCONNECT_TIMEOUT:-}" != "3" ] || [ "${PGOPTIONS:-}" != "-c statement_timeout=15s -c lock_timeout=8s" ]; then' \
  '    printf "uncontrolled_libpq_environment\n" >"${PSQL_ENV_MARKER}"' \
  '    exit 95' \
  '  fi' \
  '  printf "sanitized\n" >"${PSQL_ENV_MARKER}"' \
  'fi' \
  'if [ "${FAKE_PSQL_MODE:-}" = "setup-failure" ]; then' \
  '  case "${PGAPPNAME}" in' \
  '    tenant-template-concurrency-manifest)' \
  '      printf "%s\n" "11111111-1111-4111-8111-111111111111|22222222-2222-4222-8222-222222222222|33333333-3333-4333-8333-333333333333|44444444-4444-4444-8444-444444444444|55555555-5555-4555-8555-555555555555|66666666-6666-4666-8666-666666666666|77777777-7777-4777-8777-777777777777|17111111111|17222222222|999999"' \
  '      exit 0' \
  '      ;;' \
  '    tenant-template-1111111111114111-prerequisite)' \
  '      exit 0' \
  '      ;;' \
  '    tenant-template-1111111111114111-setup)' \
  '      printf "fixture\n" >"${FAKE_RESIDUE_MARKER}"' \
  '      exit 88' \
  '      ;;' \
  '    tenant-template-1111111111114111-cleanup)' \
  '      /bin/rm -f "${FAKE_RESIDUE_MARKER}"' \
  '      printf "cleanup\n" >"${FAKE_CLEANUP_MARKER}"' \
  '      exit 0' \
  '      ;;' \
  '    *) exit 94 ;;' \
  '  esac' \
  'fi' \
  'printf "invoked\n" >"${PSQL_INVOKED_MARKER}"' \
  'exit 97' >"${scratch_directory}/bin/psql"
chmod +x "${scratch_directory}/bin/psql"

assert_rejected_before_psql() {
  local database_url="$1"
  local output_file="${scratch_directory}/malicious.out"
  local marker_file="${scratch_directory}/psql-invoked"
  local exit_code

  rm -f "${marker_file}"
  set +e
  PATH="${scratch_directory}/bin" \
    DATABASE_URL="${database_url}" \
    PSQL_INVOKED_MARKER="${marker_file}" \
    /bin/bash "${target}" >"${output_file}" 2>&1
  exit_code=$?
  set -e

  if [ "${exit_code}" -eq 0 ] \
    || [ -e "${marker_file}" ] \
    || ! grep -Fq 'error=database_url_query_or_fragment_rejected' \
      "${output_file}"; then
    echo "error=malicious_database_url_not_rejected url=${database_url}" >&2
    sed -n '1,80p' "${output_file}" >&2
    return 1
  fi
}

for malicious_url in \
  'postgresql://postgres:postgres@127.0.0.1:1/postgres?host=/var/run/postgresql&port=5432' \
  'postgresql://postgres:postgres@127.0.0.1:54322/postgres#service=remote' \
  'postgresql://postgres:postgres@127.0.0.1:54322/postgres%3fhost=/var/run/postgresql' \
  'postgresql://postgres:postgres@127.0.0.1:54322/postgres%3Foptions=-cstatement_timeout=0' \
  'postgresql://postgres:postgres@127.0.0.1:54322/postgres%23application_name=override' \
  'postgresql://postgres:postgres@127.0.0.1:54322/postgres%253fservice=remote'; do
  assert_rejected_before_psql "${malicious_url}"
done

libpq_output="${scratch_directory}/libpq.out"
libpq_marker="${scratch_directory}/libpq-environment"
set +e
PATH="${scratch_directory}/bin:${PATH}" \
  DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:54322/postgres' \
  ASSERT_SANITIZED_LIBPQ=1 \
  PSQL_ENV_MARKER="${libpq_marker}" \
  PSQL_INVOKED_MARKER="${scratch_directory}/libpq-psql-invoked" \
  PGHOST='/var/run/postgresql' \
  PGHOSTADDR='203.0.113.10' \
  PGPORT='6543' \
  PGDATABASE='remote' \
  PGUSER='remote' \
  PGPASSWORD='secret' \
  PGPASSFILE='/tmp/remote.pgpass' \
  PGSERVICE='remote' \
  PGSERVICEFILE='/tmp/remote.pg_service.conf' \
  PGCHANNELBINDING='disable' \
  PGCLIENTENCODING='LATIN1' \
  PGSSLMODE='disable' \
  PGTARGETSESSIONATTRS='read-write' \
  PGLOADBALANCEHOSTS='random' \
  PGOPTIONS='-c statement_timeout=0' \
  PGAPPNAME='inherited-app' \
  PGCONNECT_TIMEOUT='99' \
  /bin/bash "${target}" >"${libpq_output}" 2>&1
libpq_status=$?
set -e
if [ "${libpq_status}" -eq 0 ] \
  || [ "$(sed -n '1p' "${libpq_marker}" 2>/dev/null || true)" != 'sanitized' ]; then
  echo "error=inherited_libpq_environment_not_sanitized" >&2
  sed -n '1,80p' "${libpq_output}" >&2
  exit 1
fi

setup_output="${scratch_directory}/setup-failure.out"
setup_cleanup_marker="${scratch_directory}/setup-cleanup"
setup_residue_marker="${scratch_directory}/setup-residue"
set +e
PATH="${scratch_directory}/bin:${PATH}" \
  DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:54322/postgres' \
  ASSERT_SANITIZED_LIBPQ=1 \
  FAKE_PSQL_MODE='setup-failure' \
  FAKE_CLEANUP_MARKER="${setup_cleanup_marker}" \
  FAKE_RESIDUE_MARKER="${setup_residue_marker}" \
  PSQL_ENV_MARKER="${scratch_directory}/setup-libpq-environment" \
  PSQL_INVOKED_MARKER="${scratch_directory}/setup-psql-invoked" \
  PGHOST='/var/run/postgresql' \
  PGSERVICE='remote' \
  PGOPTIONS='-c statement_timeout=0' \
  PGAPPNAME='inherited-app' \
  PGCONNECT_TIMEOUT='99' \
  /bin/bash "${target}" >"${setup_output}" 2>&1
setup_status=$?
set -e
if [ "${setup_status}" -ne 88 ] \
  || [ ! -e "${setup_cleanup_marker}" ] \
  || [ -e "${setup_residue_marker}" ]; then
  echo "error=setup_failure_cleanup_not_guaranteed status=${setup_status}" >&2
  sed -n '1,120p' "${setup_output}" >&2
  exit 1
fi

custom_output="${scratch_directory}/custom.out"
set +e
PATH="${scratch_directory}/empty" \
  DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:54323/postgres' \
  /bin/bash "${target}" >"${custom_output}" 2>&1
custom_status=$?
set -e
if [ "${custom_status}" -eq 0 ] \
  || ! grep -Fq 'error=custom_database_requires_native_psql' "${custom_output}"; then
  echo "error=custom_database_docker_fallback_not_rejected" >&2
  sed -n '1,80p' "${custom_output}" >&2
  exit 1
fi

echo "tenant_template_concurrency_safety_ok"
