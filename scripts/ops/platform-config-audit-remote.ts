import {
  PLATFORM_CONFIG_ENV_SPECIFIC_KEYS,
  PLATFORM_CONFIG_MUST_MATCH_KEYS,
  PLATFORM_CONFIG_RUNTIME_STATE_KEYS,
} from "./platform-config-audit-core";

export type PlatformAuditEnvironment = "dev" | "production";

export interface EnvironmentDefinition {
  readonly environment: PlatformAuditEnvironment;
  readonly host: string;
  readonly envFile: string;
  readonly dbContainer: string;
}

const ENVIRONMENTS: Readonly<Record<PlatformAuditEnvironment, EnvironmentDefinition>> = {
  dev: {
    environment: "dev",
    host: "ubuntu@43.165.126.30",
    envFile: "/opt/gooes-dev/docker/.env.dev.api",
    dbContainer: "supabase-db",
  },
  production: {
    environment: "production",
    host: "ubuntu@1.13.20.39",
    envFile: "/opt/supabase/docker/.env.api",
    dbContainer: "supabase-db",
  },
};

export function getEnvironmentDefinition(
  environment: PlatformAuditEnvironment,
): EnvironmentDefinition {
  return ENVIRONMENTS[environment];
}

export function buildRemoteAuditCommand(
  environment: PlatformAuditEnvironment,
): string {
  const definition = ENVIRONMENTS[environment];
  const mustMatchKeys = pythonSet(PLATFORM_CONFIG_MUST_MATCH_KEYS);
  const envSpecificKeys = pythonSet(PLATFORM_CONFIG_ENV_SPECIFIC_KEYS);
  const runtimeStateKeys = pythonSet(PLATFORM_CONFIG_RUNTIME_STATE_KEYS);

  return [
    "set -euo pipefail",
    `readonly TARGET_ENVIRONMENT=${shellQuote(definition.environment)}`,
    `readonly TARGET_ENV_FILE=${shellQuote(definition.envFile)}`,
    `readonly DB_CONTAINER=${shellQuote(definition.dbContainer)}`,
    "export TARGET_ENVIRONMENT TARGET_ENV_FILE DB_CONTAINER",
    "python3 <<'PY'",
    "import hashlib",
    "import json",
    "import os",
    "import re",
    "import subprocess",
    "import sys",
    "",
    "env_name = os.environ['TARGET_ENVIRONMENT']",
    "env_file = os.environ['TARGET_ENV_FILE']",
    "db_container = os.environ['DB_CONTAINER']",
    "prefix = re.compile(r'^(DOUYIN|WECHAT|OCR|TENCENT|COS|SMS|LBS)_')",
    `must_match = ${mustMatchKeys}`,
    `env_specific = ${envSpecificKeys}`,
    `runtime_state = ${runtimeStateKeys}`,
    "runtime_patterns = ('ACCESS_TOKEN', 'REFRESH_TOKEN', 'COMPONENT_TICKET', 'TOKEN_EXPIRES')",
    "specific_markers = ('_URL', '_URI', '_ORIGIN', '_HOST', '_PORT', '_DOMAIN', 'CALLBACK', 'REDIRECT')",
    "",
    "def classify(key):",
    "    if key in must_match:",
    "        return 'MUST_MATCH'",
    "    if key in env_specific:",
    "        return 'ENV_SPECIFIC'",
    "    if key in runtime_state:",
    "        return 'RUNTIME_STATE'",
    "    if any(marker in key for marker in runtime_patterns):",
    "        return 'RUNTIME_STATE'",
    "    if any(marker in key for marker in specific_markers) or key.startswith(('SUPABASE_', 'NEXT_PUBLIC_', 'GOOES_')):",
    "        return 'ENV_SPECIFIC'",
    "    return 'UNKNOWN'",
    "",
    "def redacted_record(key, value):",
    "    present = value is not None and value != ''",
    "    tail = value[-6:] if present and key in ('DOUYIN_COMPONENT_APP_ID', 'DOUYIN_TEMPLATE_APP_ID') else None",
    "    return {",
    "        'key': key,",
    "        'class': classify(key),",
    "        'present': present,",
    "        'byte_length': len(value.encode('utf-8')) if present else 0,",
    "        'sha256': hashlib.sha256(value.encode('utf-8')).hexdigest() if present else None,",
    "        'public_tail': tail,",
    "    }",
    "",
    "def read_env():",
    "    values = {}",
    "    with open(env_file, 'r', encoding='utf-8') as handle:",
    "        for raw_line in handle:",
    "            line = raw_line.rstrip('\\n')",
    "            if not line or line.lstrip().startswith('#') or '=' not in line:",
    "                continue",
    "            key, value = line.split('=', 1)",
    "            if prefix.match(key):",
    "                values[key] = value",
    "    return values",
    "",
    "def sql_literal(value):",
    "    return \"'\" + value.replace(\"'\", \"''\") + \"'\"",
    "",
    "def psql_json(sql):",
    "    result = subprocess.run(",
    "        ['docker', 'exec', '-i', db_container, 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres', '-Atq'],",
    "        input=sql,",
    "        text=True,",
    "        stdout=subprocess.PIPE,",
    "        stderr=subprocess.PIPE,",
    "        check=False,",
    "    )",
    "    if result.returncode != 0:",
    "        print(result.stderr, file=sys.stderr)",
    "        raise SystemExit(result.returncode)",
    "    output = result.stdout.strip()",
    "    if not output:",
    "        raise SystemExit('database query returned no JSON')",
    "    return json.loads(output)",
    "",
    "env_values = read_env()",
    "component_appid = env_values.get('DOUYIN_COMPONENT_APP_ID', '')",
    "template_appid = env_values.get('DOUYIN_TEMPLATE_APP_ID', '')",
    "env_records = [redacted_record(key, env_values[key]) for key in sorted(env_values)]",
    "runtime_sql = f\"\"\"",
    "SELECT json_build_object(",
    "  'douyin_component', COALESCE((",
    "    SELECT json_build_object(",
    "      'row_exists', true,",
    "      'status', status,",
    "      'has_ticket', component_ticket_ciphertext IS NOT NULL,",
    "      'has_access_token', access_token_ciphertext IS NOT NULL,",
    "      'access_token_valid', access_token_expires_at > clock_timestamp(),",
    "      'appid_tail', right(component_appid, 6)",
    "    )",
    "    FROM public.douyin_third_party_components",
    "    WHERE component_appid = {sql_literal(component_appid)}",
    "    LIMIT 1",
    "  ), json_build_object(",
    "    'row_exists', false,",
    "    'status', NULL,",
    "    'has_ticket', false,",
    "    'has_access_token', false,",
    "    'access_token_valid', false,",
    "    'appid_tail', NULL",
    "  )),",
    "  'douyin_template_installation', COALESCE((",
    "    SELECT json_build_object(",
    "      'row_exists', true,",
    "      'installation_kind', installation_kind,",
    "      'authorization_status', authorization_status,",
    "      'has_tenant', tenant_id IS NOT NULL,",
    "      'has_access_token', access_token_ciphertext IS NOT NULL,",
    "      'has_refresh_token', refresh_token_ciphertext IS NOT NULL,",
    "      'appid_tail', right(authorizer_appid, 6)",
    "    )",
    "    FROM public.douyin_miniapp_installations",
    "    WHERE authorizer_appid = {sql_literal(template_appid)}",
    "      AND component_appid = {sql_literal(component_appid)}",
    "      AND installation_kind = 'template_development'",
    "    LIMIT 1",
    "  ), json_build_object(",
    "    'row_exists', false,",
    "    'installation_kind', NULL,",
    "    'authorization_status', NULL,",
    "    'has_tenant', false,",
    "    'has_access_token', false,",
    "    'has_refresh_token', false,",
    "    'appid_tail', NULL",
    "  )),",
    "  'douyin_template', json_build_object(",
    "    'latest_template_version', (",
    "      SELECT template_version",
    "      FROM public.douyin_miniapp_deployable_templates",
    "      ORDER BY confirmed_at DESC, id DESC",
    "      LIMIT 1",
    "    ),",
    "    'has_current_template', EXISTS (",
    "      SELECT 1",
    "      FROM public.douyin_miniapp_deployable_templates",
    "      WHERE is_current = true",
    "    )",
    "  ),",
    "  'system_settings', COALESCE((",
    "    SELECT json_agg(json_build_object(",
    "      'key', key,",
    "      'class', CASE",
    `        WHEN key = ANY (ARRAY[${sqlLiteralList(PLATFORM_CONFIG_MUST_MATCH_KEYS)}]) THEN 'MUST_MATCH'`,
    `        WHEN key = ANY (ARRAY[${sqlLiteralList(PLATFORM_CONFIG_ENV_SPECIFIC_KEYS)}]) THEN 'ENV_SPECIFIC'`,
    `        WHEN key = ANY (ARRAY[${sqlLiteralList(PLATFORM_CONFIG_RUNTIME_STATE_KEYS)}]) THEN 'RUNTIME_STATE'`,
    "        WHEN key LIKE '%URL' OR key LIKE '%URI' OR key LIKE '%CALLBACK%' OR key LIKE '%REDIRECT%' THEN 'ENV_SPECIFIC'",
    "        ELSE 'UNKNOWN'",
    "      END,",
    "      'present', value_text IS NOT NULL AND value_text <> '',",
    "      'byte_length', COALESCE(octet_length(value_text), 0),",
    "      'md5', CASE WHEN value_text IS NULL OR value_text = '' THEN NULL ELSE md5(value_text) END",
    "    ) ORDER BY key)",
    "    FROM public.system_settings",
    "    WHERE key ~ '^(WECHAT|OCR|TENCENT|COS|SMS|LBS)_'",
    "  ), '[]'::json)",
    ");",
    "\"\"\"",
    "snapshot = {",
    "    'environment': env_name,",
    "    'env': env_records,",
    "    'runtime': psql_json(runtime_sql),",
    "}",
    "print(json.dumps(snapshot, ensure_ascii=False, separators=(',', ':')))",
    "PY",
  ].join("\n");
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\"'\"'")}'`;
}

function pythonSet(values: readonly string[]): string {
  return `{${values.map((value) => pythonString(value)).join(",")}}`;
}

function pythonString(value: string): string {
  return `'${value.replaceAll("\\", "\\\\").replaceAll("'", "\\'")}'`;
}

function sqlLiteralList(values: readonly string[]): string {
  return values.map((value) => `'${value.replaceAll("'", "''")}'`).join(",");
}
