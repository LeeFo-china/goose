import { createHash } from "node:crypto";

export type PlatformConfigClass =
  | "MUST_MATCH"
  | "ENV_SPECIFIC"
  | "RUNTIME_STATE"
  | "UNKNOWN";

export type PlatformConfigComparisonStatus =
  | "match"
  | "mismatch"
  | "missing_in_dev"
  | "missing_in_production"
  | "expected_difference"
  | "unknown";

export interface RedactedPlatformConfigRecord {
  readonly key: string;
  readonly class: PlatformConfigClass;
  readonly present: boolean;
  readonly byte_length: number;
  readonly sha256: string | null;
  readonly public_tail: string | null;
}

export interface DouyinComponentRuntimeSnapshot {
  readonly row_exists: boolean;
  readonly status: string | null;
  readonly has_ticket: boolean;
  readonly has_access_token: boolean;
  readonly access_token_valid: boolean;
  readonly appid_tail: string | null;
}

export interface DouyinTemplateInstallationRuntimeSnapshot {
  readonly row_exists: boolean;
  readonly installation_kind: string | null;
  readonly authorization_status: string | null;
  readonly has_tenant: boolean;
  readonly has_access_token: boolean;
  readonly has_refresh_token: boolean;
  readonly appid_tail: string | null;
}

export interface DouyinTemplateRuntimeSnapshot {
  readonly latest_template_version: string | null;
  readonly has_current_template: boolean;
}

export interface RedactedSystemSettingRecord {
  readonly key: string;
  readonly class: PlatformConfigClass;
  readonly present: boolean;
  readonly byte_length: number;
  readonly md5: string | null;
}

export interface PlatformRuntimeSnapshot {
  readonly douyin_component: DouyinComponentRuntimeSnapshot;
  readonly douyin_template_installation: DouyinTemplateInstallationRuntimeSnapshot;
  readonly douyin_template: DouyinTemplateRuntimeSnapshot;
  readonly system_settings: readonly RedactedSystemSettingRecord[];
}

export interface EnvironmentPlatformSnapshot {
  readonly environment: "dev" | "production";
  readonly env: readonly RedactedPlatformConfigRecord[];
  readonly runtime: PlatformRuntimeSnapshot;
}

export interface PlatformEnvComparisonRow {
  readonly key: string;
  readonly class: PlatformConfigClass;
  readonly status: PlatformConfigComparisonStatus;
  readonly dev: RedactedPlatformConfigRecord | null;
  readonly production: RedactedPlatformConfigRecord | null;
}

export interface PlatformConfigComparison {
  readonly generated_at: string;
  readonly source: "dev";
  readonly target: "production";
  readonly env: readonly PlatformEnvComparisonRow[];
  readonly runtime: {
    readonly dev: PlatformRuntimeSnapshot;
    readonly production: PlatformRuntimeSnapshot;
  };
}

const DOUYIN_MUST_MATCH_KEYS = new Set<string>([
  "DOUYIN_COMPONENT_APP_ID",
  "DOUYIN_COMPONENT_APP_SECRET",
  "DOUYIN_COMPONENT_MESSAGE_TOKEN",
  "DOUYIN_COMPONENT_MESSAGE_AES_KEY",
  "DOUYIN_TEMPLATE_APP_ID",
  "DOUYIN_TEMPLATE_APP_SECRET",
  "DOUYIN_CREDENTIAL_KEYS_JSON",
  "DOUYIN_CREDENTIAL_ACTIVE_KEY_VERSION",
  "DOUYIN_SUBJECT_HASH_KEY",
]);

export const PLATFORM_CONFIG_MUST_MATCH_KEYS = [
  ...DOUYIN_MUST_MATCH_KEYS,
  "TENCENT_ASR_ENDPOINT",
  "TENCENT_ASR_ENGINE_MODEL_TYPE",
  "TENCENT_ASR_POLL_TIMEOUT_MS",
  "TENCENT_ASR_REGION",
  "TENCENT_ASR_RES_TEXT_FORMAT",
  "TENCENT_COS_SECRET_ID",
  "TENCENT_COS_SECRET_KEY",
  "TENCENT_IOT_VIDEO_DEFAULT_PROTOCOL",
  "TENCENT_IOT_VIDEO_ENDPOINT",
  "TENCENT_IOT_VIDEO_LIVE_STREAM_ACTION",
  "TENCENT_IOT_VIDEO_REGION",
  "TENCENT_LBS_MINIPROGRAM_KEY",
  "TENCENT_LBS_WEBSERVICE_KEY",
  "TENCENT_LBS_WEBSERVICE_SK",
  "TENCENT_LBS_WEB_JS_KEY",
  "TENCENT_OCR_DEFAULT_TENANT_DAILY_LIMIT",
  "TENCENT_OCR_ENABLED",
  "TENCENT_OCR_ENCRYPTION_ALGORITHM",
  "TENCENT_OCR_ENCRYPTION_PUBLIC_KEY_PEM",
  "TENCENT_OCR_ENDPOINT",
  "TENCENT_OCR_ID_CARD_ENCRYPTED_ENABLED",
  "TENCENT_OCR_PLATFORM_DAILY_LIMIT",
  "TENCENT_OCR_REGION",
  "TENCENT_OCR_REQUEST_TIMEOUT_MS",
  "TENCENT_OCR_RESULT_TTL_HOURS",
  "TENCENT_OCR_SECRET_ID",
  "TENCENT_OCR_SECRET_KEY",
  "TENCENT_OCR_TENANT_ONBOARDING_ENABLED",
  "TENCENT_OCR_VISITOR_CONCURRENCY_LIMIT",
  "TENCENT_OCR_VISITOR_DAILY_LIMIT",
  "TENCENT_OCR_VISITOR_GLOBAL_CONCURRENCY_LIMIT",
  "TENCENT_OCR_VISITOR_IP_WINDOW_LIMIT",
  "TENCENT_OCR_VISITOR_IP_WINDOW_SECONDS",
  "TENCENT_OCR_VISITOR_PROCESSING_LEASE_SECONDS",
  "TENCENT_SMS_ENDPOINT",
  "TENCENT_SMS_REGION",
  "TENCENT_SMS_SDK_APP_ID",
  "TENCENT_SMS_SECRET_ID",
  "TENCENT_SMS_SECRET_KEY",
  "TENCENT_SMS_SIGN_NAME",
  "TENCENT_SMS_TEMPLATE_ID_ADMIN_LOGIN",
  "TENCENT_SMS_TEMPLATE_ID_BIND_CUSTOMER",
  "TENCENT_SMS_TEMPLATE_ID_BIND_EMPLOYEE",
  "TENCENT_SMS_TEMPLATE_ID_PROJECT_ACCEPTANCE",
  "WECHAT_APPID",
  "WECHAT_MINI_SESSION_ENCRYPTION_KEY_V1",
  "WECHAT_MINIPROGRAM_ORIGINAL_ID",
  "WECHAT_MINIPROGRAM_QRCODE_CHECK_PATH",
  "WECHAT_PARTNER_ONBOARDING_PAGE",
  "WECHAT_PROJECT_ACCEPTANCE_PAGE",
  "WECHAT_SECRET",
  "WECHAT_SHARE_CAMPAIGN_CLAIM_VOUCHER_PAGE",
  "WECHAT_SHARE_CAMPAIGN_PAGE",
  "WECHAT_VIRTUAL_PAYMENT_MESSAGE_TOKEN",
  "WECHAT_VIRTUAL_PAYMENT_PRODUCTION_SECRET_BUNDLE",
  "WECHAT_VIRTUAL_PAYMENT_SANDBOX_SECRET_BUNDLE",
] as const;

export const PLATFORM_CONFIG_ENV_SPECIFIC_KEYS = [
  "DOUYIN_TENANT_AUTHORIZATION_REDIRECT_URI",
  "OCR_RESULT_ENCRYPTION_KEY",
  "SMS_CHANNEL_MODE",
  "SMS_CHARGE_ENABLED",
  "SMS_PROVIDER",
  "WECHAT_MINIPROGRAM_ENV_VERSION",
] as const;

export const PLATFORM_CONFIG_RUNTIME_STATE_KEYS = [
  "DOUYIN_COMPONENT_ACCESS_TOKEN",
  "DOUYIN_COMPONENT_REFRESH_TOKEN",
  "DOUYIN_COMPONENT_TICKET",
] as const;

const MUST_MATCH_KEY_SET = new Set<string>(PLATFORM_CONFIG_MUST_MATCH_KEYS);
const ENV_SPECIFIC_KEY_SET = new Set<string>(PLATFORM_CONFIG_ENV_SPECIFIC_KEYS);
const RUNTIME_STATE_KEY_SET = new Set<string>(PLATFORM_CONFIG_RUNTIME_STATE_KEYS);

const ENV_SPECIFIC_KEY_PATTERNS: readonly RegExp[] = [
  /(_URL|_URI|_ORIGIN|_HOST|_PORT|_DOMAIN)$/u,
  /CALLBACK/u,
  /REDIRECT/u,
  /SUPABASE_/u,
  /^NEXT_PUBLIC_/u,
  /^GOOES_/u,
];

const RUNTIME_STATE_KEY_PATTERNS: readonly RegExp[] = [
  /ACCESS_TOKEN/u,
  /REFRESH_TOKEN/u,
  /COMPONENT_TICKET/u,
  /TOKEN_EXPIRES/u,
];

const PLATFORM_KEY_PATTERN = /^(DOUYIN|WECHAT|OCR|TENCENT|COS|SMS|LBS)_/u;
const PUBLIC_TAIL_KEYS = new Set<string>([
  "DOUYIN_COMPONENT_APP_ID",
  "DOUYIN_TEMPLATE_APP_ID",
]);
const PUBLIC_TAIL_LENGTH = 6;

export function classifyPlatformConfigKey(key: string): PlatformConfigClass {
  if (MUST_MATCH_KEY_SET.has(key)) {
    return "MUST_MATCH";
  }

  if (ENV_SPECIFIC_KEY_SET.has(key)) {
    return "ENV_SPECIFIC";
  }

  if (
    RUNTIME_STATE_KEY_SET.has(key) ||
    RUNTIME_STATE_KEY_PATTERNS.some((pattern) => pattern.test(key))
  ) {
    return "RUNTIME_STATE";
  }

  if (ENV_SPECIFIC_KEY_PATTERNS.some((pattern) => pattern.test(key))) {
    return "ENV_SPECIFIC";
  }

  if (PLATFORM_KEY_PATTERN.test(key)) {
    return "UNKNOWN";
  }

  return "UNKNOWN";
}

export function createRedactedEnvRecord(
  key: string,
  value: string | null | undefined,
): RedactedPlatformConfigRecord {
  const present = value !== null && value !== undefined && value.length > 0;
  return {
    key,
    class: classifyPlatformConfigKey(key),
    present,
    byte_length: present ? Buffer.byteLength(value, "utf8") : 0,
    sha256: present ? sha256(value) : null,
    public_tail: present && PUBLIC_TAIL_KEYS.has(key)
      ? value.slice(-PUBLIC_TAIL_LENGTH)
      : null,
  };
}

export function comparePlatformSnapshots(
  dev: EnvironmentPlatformSnapshot,
  production: EnvironmentPlatformSnapshot,
  generatedAt = new Date().toISOString(),
): PlatformConfigComparison {
  const devByKey = new Map(dev.env.map((record) => [record.key, record]));
  const productionByKey = new Map(
    production.env.map((record) => [record.key, record]),
  );
  const keys = Array.from(
    new Set([...devByKey.keys(), ...productionByKey.keys()]),
  ).sort((left, right) => left.localeCompare(right));

  return {
    generated_at: generatedAt,
    source: "dev",
    target: "production",
    env: keys.map((key) => {
      const devRecord = devByKey.get(key) ?? null;
      const productionRecord = productionByKey.get(key) ?? null;
      const configClass = devRecord?.class ?? productionRecord?.class ?? "UNKNOWN";
      return {
        key,
        class: configClass,
        status: compareEnvRecord(configClass, devRecord, productionRecord),
        dev: devRecord,
        production: productionRecord,
      };
    }),
    runtime: {
      dev: dev.runtime,
      production: production.runtime,
    },
  };
}

export function renderPlatformConfigMarkdown(
  comparison: PlatformConfigComparison,
): string {
  const lines = [
    "# Platform configuration audit",
    "",
    `Generated at: ${comparison.generated_at}`,
    "",
    "## Environment comparison",
    "",
    "| Key | Class | Status | Dev | Production |",
    "| --- | --- | --- | --- | --- |",
    ...comparison.env.map((row) => (
      `| ${row.key} | ${row.class} | ${row.status} | ${formatRecord(row.dev)} | ${formatRecord(row.production)} |`
    )),
    "",
    "## Douyin runtime",
    "",
    "### Development",
    "",
    renderRuntime(comparison.runtime.dev),
    "",
    "### Production",
    "",
    renderRuntime(comparison.runtime.production),
    "",
    "## Notes",
    "",
    "- Values are redacted. Reports contain presence, length, hashes, and safe appid tails only.",
    "- Drift is informational. This audit does not modify environments, databases, or containers.",
    "",
  ];

  return `${lines.join("\n")}`;
}

function compareEnvRecord(
  configClass: PlatformConfigClass,
  dev: RedactedPlatformConfigRecord | null,
  production: RedactedPlatformConfigRecord | null,
): PlatformConfigComparisonStatus {
  if (!dev?.present && !production?.present) {
    return "match";
  }
  if (!dev?.present) {
    return "missing_in_dev";
  }
  if (!production?.present) {
    return "missing_in_production";
  }
  if (configClass === "ENV_SPECIFIC") {
    return dev.sha256 === production.sha256 ? "match" : "expected_difference";
  }
  if (configClass === "UNKNOWN") {
    return dev.sha256 === production.sha256 ? "match" : "unknown";
  }

  return dev.sha256 === production.sha256 ? "match" : "mismatch";
}

function formatRecord(record: RedactedPlatformConfigRecord | null): string {
  if (!record?.present) {
    return "missing";
  }

  const tail = record.public_tail ? `, tail=${record.public_tail}` : "";
  return `present, bytes=${record.byte_length}, sha256=${record.sha256}${tail}`;
}

function renderRuntime(runtime: PlatformRuntimeSnapshot): string {
  return [
    `- Douyin component: row=${runtime.douyin_component.row_exists}, status=${runtime.douyin_component.status ?? "n/a"}, ticket=${runtime.douyin_component.has_ticket}, token=${runtime.douyin_component.has_access_token}, token_valid=${runtime.douyin_component.access_token_valid}, tail=${runtime.douyin_component.appid_tail ?? "n/a"}`,
    `- Template installation: row=${runtime.douyin_template_installation.row_exists}, kind=${runtime.douyin_template_installation.installation_kind ?? "n/a"}, status=${runtime.douyin_template_installation.authorization_status ?? "n/a"}, tenant=${runtime.douyin_template_installation.has_tenant}, token=${runtime.douyin_template_installation.has_access_token}, refresh=${runtime.douyin_template_installation.has_refresh_token}, tail=${runtime.douyin_template_installation.appid_tail ?? "n/a"}`,
    `- Deployable template: latest=${runtime.douyin_template.latest_template_version ?? "n/a"}, current=${runtime.douyin_template.has_current_template}`,
    `- Platform system settings discovered: ${runtime.system_settings.length}`,
  ].join("\n");
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
