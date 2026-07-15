import { existsSync, readFileSync } from "node:fs";

type Env = Record<string, string | undefined>;
type TextReader = (relativePath: string) => string | null;

export type ProjectOperationalRiskReleaseReadinessStatus =
  | "ready"
  | "missing_artifact"
  | "missing_env"
  | "api_smoke_skipped"
  | "admin_smoke_skipped"
  | "ui_audit_pending";

export type ProjectOperationalRiskReleaseReadinessCheck =
  | "local_artifacts_present"
  | "migration_list_configured"
  | "rpc_performance_smoke_configured"
  | "api_smoke_configured"
  | "admin_smoke_configured"
  | "ui_audit_recorded";

export type ProjectOperationalRiskReleaseReadinessBlocker = {
  check: ProjectOperationalRiskReleaseReadinessCheck;
  detail: string;
  next_action: string;
};

export type ProjectOperationalRiskReleaseReadinessReport = {
  ok: boolean;
  status: ProjectOperationalRiskReleaseReadinessStatus;
  generated_at: string;
  completed_checks: ProjectOperationalRiskReleaseReadinessCheck[];
  blockers: ProjectOperationalRiskReleaseReadinessBlocker[];
  read_only_commands: string[];
};

const MIGRATION_LIST_ENV = ["SUPABASE_DB_DIRECT_URL"] as const;
const RPC_PERFORMANCE_ENV = [
  "PROJECT_HEALTH_TENANT_ID",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const;
const API_SMOKE_URL_ENV = [
  "PROJECT_HEALTH_API_URL",
  "GOOES_API_BASE_URL",
] as const;
const API_SMOKE_TOKEN_ENV = [
  "PROJECT_HEALTH_ADMIN_TOKEN",
  "ADMIN_TOKEN",
] as const;
const ADMIN_SMOKE_ENV = [
  "PLAYWRIGHT_BASE_URL",
  "GOOES_E2E_TENANT_ADMIN_PHONE",
] as const;
const REQUIRED_LOCAL_ARTIFACTS = [
  "supabase/migrations/20260714180000_project_operational_risk_rpc.sql",
  "supabase/tests/project_operational_risk_rpc.sql",
  "supabase/tests/project_operational_risk_explain.sql",
] as const;
const UI_AUDIT_EVIDENCE_FILE =
  "docs/audit/2026-07-14-project-operational-risk-ui-audit.md";
const UI_AUDIT_EVIDENCE_MARKER = "project-health-ui-release-evidence";
const UI_AUDIT_NEXT_ACTION =
  "Record real dev screenshots, WCAG AA smoke and Impeccable score evidence before release.";

const READ_ONLY_COMMANDS = [
  'supabase migration list --db-url "$SUPABASE_DB_DIRECT_URL"',
  "cd apps/api && bun --env-file=.env --env-file=.env.local src/scripts/project-operational-risk-performance-smoke.ts",
];

function missingEnvNames(
  env: Env,
  names: readonly string[],
): string[] {
  return names.filter((name) => !env[name]?.trim());
}

function hasAnyEnv(env: Env, names: readonly string[]): boolean {
  return names.some((name) => Boolean(env[name]?.trim()));
}

function formatMissingEnv(names: readonly string[]): string {
  return `missing ${names.join(", ")}`;
}

function defaultArtifactExists(relativePath: string): boolean {
  return existsSync(new URL(`../../../../${relativePath}`, import.meta.url));
}

function defaultReadText(relativePath: string): string | null {
  try {
    return readFileSync(
      new URL(`../../../../${relativePath}`, import.meta.url),
      "utf8",
    );
  } catch {
    return null;
  }
}

export function buildProjectOperationalRiskReleaseReadinessReport(
  env: Env,
  generatedAt = new Date().toISOString(),
  artifactExists: (relativePath: string) => boolean = defaultArtifactExists,
  readText: TextReader = defaultReadText,
): ProjectOperationalRiskReleaseReadinessReport {
  const blockers: ProjectOperationalRiskReleaseReadinessBlocker[] = [];
  const completedChecks: ProjectOperationalRiskReleaseReadinessCheck[] = [];

  const missingArtifacts = REQUIRED_LOCAL_ARTIFACTS.filter(
    (artifact) => !artifactExists(artifact),
  );
  if (missingArtifacts.length > 0) {
    blockers.push({
      check: "local_artifacts_present",
      detail: `missing ${missingArtifacts.join(", ")}`,
      next_action:
        "Restore the project health RPC migration, SQL fixture and EXPLAIN template before release verification.",
    });
  } else {
    completedChecks.push("local_artifacts_present");
  }

  const missingMigrationEnv = missingEnvNames(env, MIGRATION_LIST_ENV);
  if (missingMigrationEnv.length > 0) {
    blockers.push({
      check: "migration_list_configured",
      detail: formatMissingEnv(missingMigrationEnv),
      next_action:
        "Configure SUPABASE_DB_DIRECT_URL, then run migration list before applying or deploying the risk RPC.",
    });
  } else {
    completedChecks.push("migration_list_configured");
  }

  const missingRpcEnv = missingEnvNames(env, RPC_PERFORMANCE_ENV);
  if (missingRpcEnv.length > 0) {
    blockers.push({
      check: "rpc_performance_smoke_configured",
      detail: formatMissingEnv(missingRpcEnv),
      next_action:
        "Configure PROJECT_HEALTH_TENANT_ID, SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, then run the read-only RPC performance smoke.",
    });
  } else {
    completedChecks.push("rpc_performance_smoke_configured");
  }

  const missingApiEnv = missingApiSmokeEnv(env);
  if (missingApiEnv.length > 0) {
    blockers.push({
      check: "api_smoke_configured",
      detail: formatMissingApiEnv(missingApiEnv),
      next_action:
        "Configure PROJECT_HEALTH_API_URL or GOOES_API_BASE_URL and PROJECT_HEALTH_ADMIN_TOKEN or ADMIN_TOKEN, then run the dev API smoke before release.",
    });
  } else {
    completedChecks.push("api_smoke_configured");
  }

  const missingAdminEnv = missingEnvNames(env, ADMIN_SMOKE_ENV);
  if (missingAdminEnv.length > 0) {
    blockers.push({
      check: "admin_smoke_configured",
      detail: formatMissingEnv(missingAdminEnv),
      next_action:
        "Configure PLAYWRIGHT_BASE_URL and GOOES_E2E_TENANT_ADMIN_PHONE, then run the dev Admin project health browser smoke before release.",
    });
  } else {
    completedChecks.push("admin_smoke_configured");
  }

  const uiAuditEvidence = validateUiAuditEvidence(
    readText(UI_AUDIT_EVIDENCE_FILE),
  );
  if (!uiAuditEvidence.ok) {
    blockers.push({
      check: "ui_audit_recorded",
      detail: uiAuditEvidence.detail,
      next_action: UI_AUDIT_NEXT_ACTION,
    });
  } else {
    completedChecks.push("ui_audit_recorded");
  }

  return {
    ok: blockers.length === 0,
    status: resolveStatus(blockers),
    generated_at: generatedAt,
    completed_checks: completedChecks,
    blockers,
    read_only_commands: READ_ONLY_COMMANDS,
  };
}

function missingApiSmokeEnv(env: Env): string[] {
  const missing: string[] = [];
  if (!hasAnyEnv(env, API_SMOKE_URL_ENV)) {
    missing.push("PROJECT_HEALTH_API_URL");
  }
  if (!hasAnyEnv(env, API_SMOKE_TOKEN_ENV)) {
    missing.push("PROJECT_HEALTH_ADMIN_TOKEN");
  }
  return missing;
}

function formatMissingApiEnv(names: readonly string[]): string {
  const labels = names.map((name) => {
    if (name === "PROJECT_HEALTH_API_URL") {
      return "PROJECT_HEALTH_API_URL or GOOES_API_BASE_URL";
    }
    if (name === "PROJECT_HEALTH_ADMIN_TOKEN") {
      return "PROJECT_HEALTH_ADMIN_TOKEN or ADMIN_TOKEN";
    }
    return name;
  });
  return formatMissingEnv(labels);
}

function validateUiAuditEvidence(
  content: string | null,
): { ok: true } | { ok: false; detail: string } {
  if (!content) {
    return { ok: false, detail: `missing ${UI_AUDIT_EVIDENCE_FILE}` };
  }

  const match = content.match(
    new RegExp(
      `<!--\\s*${UI_AUDIT_EVIDENCE_MARKER}\\s*([\\s\\S]*?)\\s*-->`,
    ),
  );
  if (!match?.[1]) {
    return {
      ok: false,
      detail:
        `missing ${UI_AUDIT_EVIDENCE_MARKER} block in ${UI_AUDIT_EVIDENCE_FILE}`,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(match[1]);
  } catch {
    return { ok: false, detail: `${UI_AUDIT_EVIDENCE_MARKER} is not valid JSON` };
  }

  if (!isRecord(parsed)) {
    return { ok: false, detail: `${UI_AUDIT_EVIDENCE_MARKER} must be an object` };
  }
  if (parsed.status !== "ready") {
    return {
      ok: false,
      detail: `${UI_AUDIT_EVIDENCE_MARKER} status must be ready`,
    };
  }
  if (typeof parsed.impeccable_score !== "number" || parsed.impeccable_score < 16) {
    return { ok: false, detail: "impeccable_score must be >= 16" };
  }
  if (parsed.p0_count !== 0 || parsed.p1_count !== 0) {
    return { ok: false, detail: "p0_count and p1_count must be 0" };
  }
  if (parsed.real_dev_screenshots !== true) {
    return { ok: false, detail: "real_dev_screenshots must be true" };
  }
  if (parsed.wcag_aa_smoke !== true) {
    return { ok: false, detail: "wcag_aa_smoke must be true" };
  }

  return { ok: true };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function resolveStatus(
  blockers: ProjectOperationalRiskReleaseReadinessBlocker[],
): ProjectOperationalRiskReleaseReadinessStatus {
  if (blockers.length === 0) return "ready";
  if (blockers.some((blocker) => blocker.check === "local_artifacts_present")) {
    return "missing_artifact";
  }

  const onlyApiSmokeMissing = blockers.every(
    (blocker) => blocker.check === "api_smoke_configured",
  );
  if (onlyApiSmokeMissing) return "api_smoke_skipped";

  const onlyAdminSmokeMissing = blockers.every(
    (blocker) => blocker.check === "admin_smoke_configured",
  );
  if (onlyAdminSmokeMissing) return "admin_smoke_skipped";

  const onlyUiAuditPending = blockers.every(
    (blocker) => blocker.check === "ui_audit_recorded",
  );
  return onlyUiAuditPending ? "ui_audit_pending" : "missing_env";
}

async function main(): Promise<void> {
  const report = buildProjectOperationalRiskReleaseReadinessReport(process.env);
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(1);
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(
      error instanceof Error ? error.message : "项目风险发布 readiness 检查失败",
    );
    process.exit(1);
  });
}
