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
