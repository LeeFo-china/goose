import { existsSync } from "node:fs";

type Env = Record<string, string | undefined>;

export type ProjectOperationalRiskReleaseReadinessStatus =
  | "ready"
  | "missing_artifact"
  | "missing_env"
  | "api_smoke_skipped"
  | "admin_smoke_skipped";

export type ProjectOperationalRiskReleaseReadinessCheck =
  | "local_artifacts_present"
  | "migration_list_configured"
  | "rpc_performance_smoke_configured"
  | "api_smoke_configured"
  | "admin_smoke_configured";

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

export function buildProjectOperationalRiskReleaseReadinessReport(
  env: Env,
  generatedAt = new Date().toISOString(),
  artifactExists: (relativePath: string) => boolean = defaultArtifactExists,
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
  return onlyAdminSmokeMissing ? "admin_smoke_skipped" : "missing_env";
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
