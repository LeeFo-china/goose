import {
  PLATFORM_CONFIG_ENV_SPECIFIC_KEYS,
  PLATFORM_CONFIG_MUST_MATCH_KEYS,
  type PlatformConfigClass,
  type PlatformConfigComparison,
  type PlatformEnvComparisonRow,
  type RedactedPlatformConfigRecord,
} from "./platform-config-audit-core";

export type PlatformConfigSyncTarget = "ocr" | "wechat-mini" | "sms";

export type PlatformConfigSyncAction =
  | "would_sync"
  | "already_match"
  | "source_missing"
  | "target_only";

export type PlatformConfigSyncReason =
  | "target_mismatch"
  | "target_missing"
  | "target_matches_source"
  | "source_missing"
  | "not_in_target_allowlist"
  | "environment_specific_not_syncable";

export interface PlatformConfigSyncPlanRow {
  readonly key: string;
  readonly class: PlatformConfigClass;
  readonly action?: PlatformConfigSyncAction;
  readonly reason: PlatformConfigSyncReason;
  readonly dev: RedactedPlatformConfigRecord | null;
  readonly production: RedactedPlatformConfigRecord | null;
}

export interface PlatformConfigSyncPlan {
  readonly generated_at: string;
  readonly source: "dev";
  readonly target_environment: "production";
  readonly target: PlatformConfigSyncTarget;
  readonly mode: "dry_run";
  readonly allowlist: readonly string[];
  readonly actions: readonly PlatformConfigSyncPlanRow[];
  readonly denied: readonly PlatformConfigSyncPlanRow[];
  readonly review_required: readonly PlatformConfigSyncPlanRow[];
}

const TARGET_ALLOWLISTS: Readonly<Record<PlatformConfigSyncTarget, readonly string[]>> = {
  ocr: [
    "TENCENT_OCR_SECRET_ID",
    "TENCENT_OCR_SECRET_KEY",
    "TENCENT_OCR_REGION",
    "TENCENT_OCR_ENDPOINT",
    "TENCENT_OCR_REQUEST_TIMEOUT_MS",
    "TENCENT_OCR_ENABLED",
    "TENCENT_OCR_ID_CARD_ENCRYPTED_ENABLED",
    "TENCENT_OCR_ENCRYPTION_ALGORITHM",
    "TENCENT_OCR_ENCRYPTION_PUBLIC_KEY_PEM",
    "TENCENT_OCR_DEFAULT_TENANT_DAILY_LIMIT",
    "TENCENT_OCR_PLATFORM_DAILY_LIMIT",
    "TENCENT_OCR_RESULT_TTL_HOURS",
    "TENCENT_OCR_TENANT_ONBOARDING_ENABLED",
    "TENCENT_OCR_VISITOR_CONCURRENCY_LIMIT",
    "TENCENT_OCR_VISITOR_DAILY_LIMIT",
    "TENCENT_OCR_VISITOR_GLOBAL_CONCURRENCY_LIMIT",
    "TENCENT_OCR_VISITOR_IP_WINDOW_LIMIT",
    "TENCENT_OCR_VISITOR_IP_WINDOW_SECONDS",
    "TENCENT_OCR_VISITOR_PROCESSING_LEASE_SECONDS",
  ],
  "wechat-mini": [
    "WECHAT_MINI_SESSION_ENCRYPTION_KEY_V1",
    "WECHAT_APPID",
    "WECHAT_SECRET",
    "WECHAT_MINIPROGRAM_ORIGINAL_ID",
    "WECHAT_MINIPROGRAM_QRCODE_CHECK_PATH",
    "WECHAT_PARTNER_ONBOARDING_PAGE",
    "WECHAT_PROJECT_ACCEPTANCE_PAGE",
    "WECHAT_SHARE_CAMPAIGN_CLAIM_VOUCHER_PAGE",
    "WECHAT_SHARE_CAMPAIGN_PAGE",
  ],
  sms: [
    "TENCENT_SMS_SECRET_ID",
    "TENCENT_SMS_SECRET_KEY",
    "TENCENT_SMS_REGION",
    "TENCENT_SMS_ENDPOINT",
    "TENCENT_SMS_SDK_APP_ID",
    "TENCENT_SMS_SIGN_NAME",
    "TENCENT_SMS_TEMPLATE_ID_BIND_CUSTOMER",
    "TENCENT_SMS_TEMPLATE_ID_BIND_EMPLOYEE",
    "TENCENT_SMS_TEMPLATE_ID_ADMIN_LOGIN",
    "TENCENT_SMS_TEMPLATE_ID_PROJECT_ACCEPTANCE",
  ],
};

const TARGET_PREFIXES: Readonly<Record<PlatformConfigSyncTarget, readonly string[]>> = {
  ocr: ["OCR_", "TENCENT_OCR_"],
  "wechat-mini": ["WECHAT_"],
  sms: ["SMS_", "TENCENT_SMS_"],
};

const MUST_MATCH_KEYS = new Set<string>(PLATFORM_CONFIG_MUST_MATCH_KEYS);
const ENV_SPECIFIC_KEYS = new Set<string>(PLATFORM_CONFIG_ENV_SPECIFIC_KEYS);

export function isPlatformConfigSyncTarget(
  input: string,
): input is PlatformConfigSyncTarget {
  return input === "ocr" || input === "wechat-mini" || input === "sms";
}

export function createPlatformConfigSyncPlan(
  comparison: PlatformConfigComparison,
  target: PlatformConfigSyncTarget,
): PlatformConfigSyncPlan {
  const allowlist = TARGET_ALLOWLISTS[target];
  const allowlistSet = new Set(allowlist);
  const rowsByKey = new Map(comparison.env.map((row) => [row.key, row]));
  const deniedKeys = new Set(PLATFORM_CONFIG_ENV_SPECIFIC_KEYS);

  return {
    generated_at: comparison.generated_at,
    source: "dev",
    target_environment: "production",
    target,
    mode: "dry_run",
    allowlist,
    actions: allowlist.map((key) => planAllowedKey(key, rowsByKey.get(key))),
    denied: Array.from(deniedKeys)
      .filter((key) => rowsByKey.has(key) && matchesTarget(target, key))
      .sort((left, right) => left.localeCompare(right))
      .map((key) => planDeniedKey(rowsByKey.get(key))),
    review_required: comparison.env
      .filter((row) =>
        matchesTarget(target, row.key) &&
        !allowlistSet.has(row.key) &&
        !ENV_SPECIFIC_KEYS.has(row.key) &&
        MUST_MATCH_KEYS.has(row.key)
      )
      .sort((left, right) => left.key.localeCompare(right.key))
      .map((row) => ({
        key: row.key,
        class: row.class,
        reason: "not_in_target_allowlist",
        dev: row.dev,
        production: row.production,
      })),
  };
}

export function renderPlatformConfigSyncMarkdown(
  plan: PlatformConfigSyncPlan,
): string {
  return [
    "# PLATFORM CONFIG SYNC DRY-RUN",
    "",
    `Generated at: ${plan.generated_at}`,
    `Target: ${plan.target}`,
    "",
    "## Would sync",
    "",
    renderRows(plan.actions.filter((row) => row.action === "would_sync")),
    "",
    "## Already matching",
    "",
    renderRows(plan.actions.filter((row) => row.action === "already_match")),
    "",
    "## Denied",
    "",
    renderRows(plan.denied),
    "",
    "## Review required",
    "",
    renderRows(plan.review_required),
    "",
    "No remote writes are performed by this dry-run.",
    "",
  ].join("\n");
}

function planAllowedKey(
  key: string,
  row: PlatformEnvComparisonRow | undefined,
): PlatformConfigSyncPlanRow {
  if (!row?.dev?.present) {
    return {
      key,
      class: row?.class ?? "MUST_MATCH",
      action: row?.production?.present ? "target_only" : "source_missing",
      reason: "source_missing",
      dev: row?.dev ?? null,
      production: row?.production ?? null,
    };
  }

  if (!row.production?.present) {
    return {
      key,
      class: row.class,
      action: "would_sync",
      reason: "target_missing",
      dev: row.dev,
      production: row.production,
    };
  }

  if (row.dev.sha256 !== row.production.sha256) {
    return {
      key,
      class: row.class,
      action: "would_sync",
      reason: "target_mismatch",
      dev: row.dev,
      production: row.production,
    };
  }

  return {
    key,
    class: row.class,
    action: "already_match",
    reason: "target_matches_source",
    dev: row.dev,
    production: row.production,
  };
}

function planDeniedKey(
  row: PlatformEnvComparisonRow | undefined,
): PlatformConfigSyncPlanRow {
  if (!row) {
    throw new Error("denied row missing");
  }

  return {
    key: row.key,
    class: row.class,
    reason: "environment_specific_not_syncable",
    dev: row.dev,
    production: row.production,
  };
}

function matchesTarget(target: PlatformConfigSyncTarget, key: string): boolean {
  return TARGET_PREFIXES[target].some((prefix) => key.startsWith(prefix));
}

function renderRows(rows: readonly PlatformConfigSyncPlanRow[]): string {
  if (rows.length === 0) {
    return "_None_";
  }

  return [
    "| Key | Class | Reason | Dev | Production |",
    "| --- | --- | --- | --- | --- |",
    ...rows.map((row) =>
      `| ${row.key} | ${row.class} | ${row.reason} | ${formatRecord(row.dev)} | ${formatRecord(row.production)} |`
    ),
  ].join("\n");
}

function formatRecord(record: RedactedPlatformConfigRecord | null): string {
  if (!record?.present) {
    return "missing";
  }

  const tail = record.public_tail ? `, tail=${record.public_tail}` : "";
  return `present, bytes=${record.byte_length}, sha256=${record.sha256}${tail}`;
}
