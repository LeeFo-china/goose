import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { formatCommandFailure } from "./workflow-command-failure";
import { runCleanupReadinessScan } from "./workflow-cleanup-readiness";
import { loadMigrationHistoryReport } from "./workflow-migration-history";
import { runWorkflowRuntimeConsistencyCheck } from "./workflow-runtime-consistency-check";

type PreflightOptions = {
  evidenceFile: string | null;
};

type ManualGateEvidence = {
  phase_acceptance?: {
    phase4_backfill_confirmed?: unknown;
    phase4_reconciliation_evidence?: unknown;
    phase5_api_smoke_confirmed?: unknown;
    phase5_api_smoke_evidence?: unknown;
  };
  api_contract?: {
    workflow_state_actions_confirmed?: unknown;
    workflow_task_complete_confirmed?: unknown;
    legacy_fields_not_required_confirmed?: unknown;
    evidence?: unknown;
  };
  mini_program?: {
    confirmed?: unknown;
    confirmed_by?: unknown;
    confirmed_at?: unknown;
    minimum_version?: unknown;
    evidence?: unknown;
  };
  admin_smoke?: {
    confirmed?: unknown;
    smoke_at?: unknown;
    actor?: unknown;
    evidence?: unknown;
  };
  backup_window?: {
    confirmed?: unknown;
    backup_id?: unknown;
    restore_window?: unknown;
    evidence?: unknown;
  };
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

const EXPECTED_DESTRUCTIVE_MIGRATIONS = [
  "20260612133000_drop_schedule_project_construction_transition.sql",
  "20260612143000_drop_legacy_state_machine_objects.sql",
] as const;
const LEGACY_SCHEDULE_RPC_SIGNATURE =
  "schedule_project_construction_transition(uuid,uuid,text,text,text,uuid,uuid,uuid,text,jsonb)";

export function parsePreflightArgs(argv: string[]): PreflightOptions {
  let evidenceFile: string | null = null;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--evidence-file") {
      evidenceFile = argv[index + 1] || null;
      index += 1;
      continue;
    }
    if (arg === "--") continue;
    throw new Error(`未知参数: ${arg}`);
  }

  return { evidenceFile };
}

export function arePendingMigrationsExpected(
  migrations: readonly string[],
): boolean {
  return migrations.length === EXPECTED_DESTRUCTIVE_MIGRATIONS.length &&
    EXPECTED_DESTRUCTIVE_MIGRATIONS.every((migration, index) =>
      migrations[index] === migration
    );
}

export function validateManualGateEvidence(
  evidence: ManualGateEvidence,
): { ok: boolean; missing: string[]; invalid: string[] } {
  const missing: string[] = [];
  const invalid = collectManualGateEvidenceReferenceIssues(evidence);
  if (evidence.phase_acceptance?.phase4_backfill_confirmed !== true) {
    missing.push("phase_acceptance.phase4_backfill_confirmed");
  }
  if (!isNonEmptyString(evidence.phase_acceptance?.phase4_reconciliation_evidence)) {
    missing.push("phase_acceptance.phase4_reconciliation_evidence");
  }
  if (evidence.phase_acceptance?.phase5_api_smoke_confirmed !== true) {
    missing.push("phase_acceptance.phase5_api_smoke_confirmed");
  }
  if (!isNonEmptyString(evidence.phase_acceptance?.phase5_api_smoke_evidence)) {
    missing.push("phase_acceptance.phase5_api_smoke_evidence");
  }

  if (evidence.api_contract?.workflow_state_actions_confirmed !== true) {
    missing.push("api_contract.workflow_state_actions_confirmed");
  }
  if (evidence.api_contract?.workflow_task_complete_confirmed !== true) {
    missing.push("api_contract.workflow_task_complete_confirmed");
  }
  if (evidence.api_contract?.legacy_fields_not_required_confirmed !== true) {
    missing.push("api_contract.legacy_fields_not_required_confirmed");
  }
  if (!isNonEmptyString(evidence.api_contract?.evidence)) {
    missing.push("api_contract.evidence");
  }

  if (evidence.mini_program?.confirmed !== true) {
    missing.push("mini_program.confirmed");
  }
  if (!isNonEmptyString(evidence.mini_program?.confirmed_by)) {
    missing.push("mini_program.confirmed_by");
  }
  if (!isNonEmptyString(evidence.mini_program?.confirmed_at)) {
    missing.push("mini_program.confirmed_at");
  }
  if (!isNonEmptyString(evidence.mini_program?.minimum_version)) {
    missing.push("mini_program.minimum_version");
  }
  if (!isNonEmptyString(evidence.mini_program?.evidence)) {
    missing.push("mini_program.evidence");
  }

  if (evidence.admin_smoke?.confirmed !== true) {
    missing.push("admin_smoke.confirmed");
  }
  if (!isNonEmptyString(evidence.admin_smoke?.smoke_at)) {
    missing.push("admin_smoke.smoke_at");
  }
  if (!isNonEmptyString(evidence.admin_smoke?.actor)) {
    missing.push("admin_smoke.actor");
  }
  if (!isNonEmptyString(evidence.admin_smoke?.evidence)) {
    missing.push("admin_smoke.evidence");
  }

  if (evidence.backup_window?.confirmed !== true) {
    missing.push("backup_window.confirmed");
  }
  if (!isNonEmptyString(evidence.backup_window?.backup_id)) {
    missing.push("backup_window.backup_id");
  }
  if (!isNonEmptyString(evidence.backup_window?.restore_window)) {
    missing.push("backup_window.restore_window");
  }
  if (!isNonEmptyString(evidence.backup_window?.evidence)) {
    missing.push("backup_window.evidence");
  }

  return { ok: missing.length === 0 && invalid.length === 0, missing, invalid };
}

export function collectManualGateEvidenceReferenceIssues(
  evidence: ManualGateEvidence,
  repoRoot = findRepoRoot(),
): string[] {
  const issues: string[] = [];
  for (const [field, value] of manualGateEvidenceReferences(evidence)) {
    if (!isNonEmptyString(value)) continue;
    const path = normalizeLocalEvidencePath(value);
    if (!path && !isRemoteEvidenceUrl(value)) {
      issues.push(
        `${field}: evidence must be an http(s) URL or docs/state_machine_migrate/ path`,
      );
      continue;
    }
    if (path && !existsSync(resolve(repoRoot, path))) {
      issues.push(`${field}: missing local evidence path ${path}`);
    }
  }
  return issues;
}

function databaseUrl(env: EnvLike = process.env): string | null {
  return env.SUPABASE_DB_DIRECT_URL || env.SUPABASE_DB_URL || null;
}

export async function loadManualGateEvidence(
  evidenceFile: string,
): Promise<{ ok: boolean; detail: string }> {
  const path = resolve(findRepoRoot(), evidenceFile);
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch {
    return {
      ok: false,
      detail: `evidence_file=${evidenceFile}; missing evidence file`,
    };
  }

  let parsed: ManualGateEvidence;
  try {
    parsed = JSON.parse(raw) as ManualGateEvidence;
  } catch {
    return {
      ok: false,
      detail: `evidence_file=${evidenceFile}; invalid JSON`,
    };
  }

  const validation = validateManualGateEvidence(parsed);
  const problems = [
    ...validation.missing.map((field) => `missing=${field}`),
    ...validation.invalid.map((issue) => `invalid=${issue}`),
  ];
  return {
    ok: validation.ok,
    detail: validation.ok
      ? `evidence_file=${evidenceFile}`
      : `evidence_file=${evidenceFile}; ${problems.join(", ")}`,
  };
}

async function loadPendingMigrationFiles(): Promise<string[]> {
  const url = databaseUrl();
  if (!url) {
    return ["missing SUPABASE_DB_URL or SUPABASE_DB_DIRECT_URL"];
  }

  try {
    return (await loadMigrationHistoryReport(url)).pendingMigrationFiles;
  } catch (error) {
    return [
      `database migration history check failed: ${formatCommandFailure(error)}`,
    ];
  }
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
          select replace(format($$%s(%s)$$, proname, oidvectortypes(proargtypes)), $$ $$, $$$$)
          from pg_proc
          where pronamespace = $$public$$::regnamespace
            and proname = $$schedule_project_construction_transition$$
            and replace(format($$%s(%s)$$, proname, oidvectortypes(proargtypes)), $$ $$, $$$$)
              = ${LEGACY_SCHEDULE_RPC_SIGNATURE}
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
  const pendingMigrations = await loadPendingMigrationFiles();
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

  const url = databaseUrl();
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

  if (options.evidenceFile) {
    checks.push({
      name: "manual_gates",
      ...await loadManualGateEvidence(options.evidenceFile),
    });
  } else {
    checks.push({
      name: "manual_gates",
      ok: false,
      detail: "missing --evidence-file",
    });
  }

  return {
    ok: checks.every((check) => check.ok),
    generated_at: new Date().toISOString(),
    pending_migrations: pendingMigrations,
    checks,
  };
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function manualGateEvidenceReferences(
  evidence: ManualGateEvidence,
): Array<[string, unknown]> {
  return [
    [
      "phase_acceptance.phase4_reconciliation_evidence",
      evidence.phase_acceptance?.phase4_reconciliation_evidence,
    ],
    [
      "phase_acceptance.phase5_api_smoke_evidence",
      evidence.phase_acceptance?.phase5_api_smoke_evidence,
    ],
    ["api_contract.evidence", evidence.api_contract?.evidence],
    ["mini_program.evidence", evidence.mini_program?.evidence],
    ["admin_smoke.evidence", evidence.admin_smoke?.evidence],
    ["backup_window.evidence", evidence.backup_window?.evidence],
  ];
}

function normalizeLocalEvidencePath(value: string): string | null {
  const trimmed = value.trim();
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) return null;
  const [path] = trimmed.split("#");
  if (!path?.startsWith("docs/state_machine_migrate/")) return null;
  return path;
}

function isRemoteEvidenceUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
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
