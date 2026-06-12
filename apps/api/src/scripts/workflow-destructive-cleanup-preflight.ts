import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { promisify } from "node:util";
import { runCleanupReadinessScan } from "./workflow-cleanup-readiness";
import {
  resolveWorkflowRuntimeConsistencyDatabaseUrl,
  runWorkflowRuntimeConsistencyCheck,
} from "./workflow-runtime-consistency-check";

type ManualGate =
  | "mini_program_confirmed"
  | "admin_smoke_attached"
  | "backup_window_confirmed";

type PreflightOptions = {
  manualGates: Set<ManualGate>;
};

type PreflightCheck = {
  name: string;
  ok: boolean;
  detail: string;
};

type LegacyInventoryRow = {
  customer_logs: string | null;
  project_logs: string | null;
  expense_chains: string | null;
  schedule_rpc: string | null;
  current_step_exists: boolean;
  current_step_role_exists: boolean;
};

type PreflightReport = {
  ok: boolean;
  generated_at: string;
  pending_migrations: string[];
  checks: PreflightCheck[];
};

type EnvLike = Record<string, string | undefined>;

const execFileAsync = promisify(execFile);
const EXPECTED_DESTRUCTIVE_MIGRATIONS = [
  "20260612133000_drop_schedule_project_construction_transition.sql",
  "20260612143000_drop_legacy_state_machine_objects.sql",
] as const;

export function parsePreflightArgs(argv: string[]): PreflightOptions {
  const manualGates = new Set<ManualGate>();
  for (const arg of argv) {
    if (arg === "--confirm-mini-program") {
      manualGates.add("mini_program_confirmed");
      continue;
    }
    if (arg === "--confirm-admin-smoke") {
      manualGates.add("admin_smoke_attached");
      continue;
    }
    if (arg === "--confirm-backup-window") {
      manualGates.add("backup_window_confirmed");
      continue;
    }
    if (arg === "--") continue;
    throw new Error(`未知参数: ${arg}`);
  }

  return { manualGates };
}

export function parseSupabaseDryRunMigrations(output: string): string[] {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .map((line) => line.match(/^[•-]\s+(.+\.sql)$/)?.[1] ?? null)
    .filter((migration): migration is string => Boolean(migration));
}

export function arePendingMigrationsExpected(
  migrations: readonly string[],
): boolean {
  return migrations.length === EXPECTED_DESTRUCTIVE_MIGRATIONS.length &&
    EXPECTED_DESTRUCTIVE_MIGRATIONS.every((migration, index) =>
      migrations[index] === migration
    );
}

export function hasAllManualGates(options: PreflightOptions): boolean {
  return (
    options.manualGates.has("mini_program_confirmed") &&
    options.manualGates.has("admin_smoke_attached") &&
    options.manualGates.has("backup_window_confirmed")
  );
}

function databaseUrl(env: EnvLike = process.env): string | null {
  return env.SUPABASE_DB_URL || env.SUPABASE_DB_DIRECT_URL || null;
}

async function runSupabaseDryRun(): Promise<string[]> {
  const { stdout, stderr } = await execFileAsync(
    "supabase",
    ["db", "push", "--dry-run"],
    {
      cwd: findRepoRoot(),
      env: process.env,
      timeout: 60_000,
      maxBuffer: 1024 * 1024,
    },
  );

  return parseSupabaseDryRunMigrations(`${stdout}\n${stderr}`);
}

async function loadLegacyInventory(url: string): Promise<LegacyInventoryRow> {
  const db = new Bun.SQL(url);
  try {
    const rows = await db<LegacyInventoryRow[]>`
      select
        to_regclass($$public.customer_status_transition_logs$$)::text as customer_logs,
        to_regclass($$public.project_status_transition_logs$$)::text as project_logs,
        to_regclass($$public.expense_request_approval_chains$$)::text as expense_chains,
        (
          select proname
          from pg_proc
          where pronamespace = $$public$$::regnamespace
            and proname = $$schedule_project_construction_transition$$
          limit 1
        ) as schedule_rpc,
        exists (
          select 1
          from information_schema.columns
          where table_schema = $$public$$
            and table_name = $$expense_requests$$
            and column_name = $$current_step$$
        ) as current_step_exists,
        exists (
          select 1
          from information_schema.columns
          where table_schema = $$public$$
            and table_name = $$expense_requests$$
            and column_name = $$current_step_role$$
        ) as current_step_role_exists;
    `;

    return rows[0] ?? {
      customer_logs: null,
      project_logs: null,
      expense_chains: null,
      schedule_rpc: null,
      current_step_exists: false,
      current_step_role_exists: false,
    };
  } finally {
    await db.close();
  }
}

async function buildPreflightReport(
  options: PreflightOptions,
): Promise<PreflightReport> {
  const checks: PreflightCheck[] = [];
  const pendingMigrations = await runSupabaseDryRun();
  checks.push({
    name: "pending_migrations_are_destructive_pair",
    ok: arePendingMigrationsExpected(pendingMigrations),
    detail: pendingMigrations.join(", ") || "none",
  });

  const cleanupReadiness = await runCleanupReadinessScan();
  checks.push({
    name: "cleanup_readiness",
    ok: cleanupReadiness.ready,
    detail: `blockers=${cleanupReadiness.blockers.length}`,
  });

  const url = resolveWorkflowRuntimeConsistencyDatabaseUrl() ?? databaseUrl();
  if (!url) {
    checks.push({
      name: "database_url",
      ok: false,
      detail: "missing SUPABASE_DB_URL or SUPABASE_DB_DIRECT_URL",
    });
  } else {
    const runtimeConsistency = await runWorkflowRuntimeConsistencyCheck(url);
    checks.push({
      name: "workflow_runtime_consistency",
      ok: runtimeConsistency.ok,
      detail: `total_issues=${runtimeConsistency.total_issues}`,
    });

    const inventory = await loadLegacyInventory(url);
    checks.push({
      name: "legacy_objects_still_targeted",
      ok: Boolean(
        inventory.customer_logs &&
          inventory.project_logs &&
          inventory.expense_chains &&
          inventory.schedule_rpc &&
          inventory.current_step_exists &&
          inventory.current_step_role_exists,
      ),
      detail: JSON.stringify(inventory),
    });
  }

  checks.push({
    name: "manual_gates",
    ok: hasAllManualGates(options),
    detail: [
      `mini_program_confirmed=${options.manualGates.has("mini_program_confirmed")}`,
      `admin_smoke_attached=${options.manualGates.has("admin_smoke_attached")}`,
      `backup_window_confirmed=${options.manualGates.has("backup_window_confirmed")}`,
    ].join(", "),
  });

  return {
    ok: checks.every((check) => check.ok),
    generated_at: new Date().toISOString(),
    pending_migrations: pendingMigrations,
    checks,
  };
}

function findRepoRoot(start = process.cwd()): string {
  let current = start;
  while (true) {
    if (existsSync(`${current}/pnpm-workspace.yaml`)) return current;
    const parent = current.replace(/\/[^/]+$/, "");
    if (!parent || parent === current) return start;
    current = parent;
  }
}

async function main() {
  const report = await buildPreflightReport(
    parsePreflightArgs(process.argv.slice(2)),
  );
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(1);
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(
      error instanceof Error ? error.message : "破坏性清理 preflight 失败",
    );
    process.exit(1);
  });
}
