import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { formatCommandFailure } from "./workflow-command-failure";
import {
  buildSupabaseDryRunArgs,
  loadManualGateEvidence as loadManualGateEvidenceFile,
  parseSupabaseDryRunMigrations,
} from "./workflow-destructive-cleanup-preflight";
import { loadMigrationHistoryReport } from "./workflow-migration-history";
import {
  runWorkflowDestructiveCleanupVerify,
  type WorkflowDestructiveCleanupVerifyReport,
} from "./workflow-destructive-cleanup-verify";
import { runCleanupReadinessScan } from "./workflow-cleanup-readiness";

export type FinalAuditInput = {
  pendingMigrations: readonly string[];
  migrationListAligned: boolean;
  migrationListDetail: string;
  cleanupReady: boolean;
  cleanupBlockerCount: number;
  destructiveCleanupOk: boolean;
  destructiveCleanupDetail: string;
  generatedTypesClean: boolean;
  generatedTypesDetail: string;
  manualGateEvidenceOk: boolean;
  manualGateEvidenceDetail: string;
  finalCommitDocumented: boolean;
  finalCommitDetail: string;
};

export type FinalAuditCheck = {
  name: string;
  ok: boolean;
  detail: string;
};

export type FinalAuditReport = {
  ok: boolean;
  generated_at: string;
  checks: FinalAuditCheck[];
};

type EnvLike = Record<string, string | undefined>;

const execFileAsync = promisify(execFile);
const LEGACY_GENERATED_TYPE_PATTERNS = [
  "customer_status_transition_logs",
  "project_status_transition_logs",
  "expense_request_approval_chains",
  "schedule_project_construction_transition",
  "current_step:",
  "current_step?:",
  "current_step_role:",
  "current_step_role?:",
] as const;

export function resolveFinalAuditDatabaseUrl(
  env: EnvLike = process.env,
): string | null {
  return env.SUPABASE_DB_DIRECT_URL || env.SUPABASE_DB_URL || null;
}

export function parseFinalAuditArgs(argv: string[]): { evidenceFile: string | null } {
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

export function buildFinalAuditReport(
  input: FinalAuditInput,
  generatedAt = new Date().toISOString(),
): FinalAuditReport {
  const checks: FinalAuditCheck[] = [
    {
      name: "no_pending_migrations",
      ok: input.pendingMigrations.length === 0,
      detail: input.pendingMigrations.join(", ") || "none",
    },
    {
      name: "migration_list_aligned",
      ok: input.migrationListAligned,
      detail: input.migrationListDetail,
    },
    {
      name: "cleanup_readiness",
      ok: input.cleanupReady,
      detail: `blockers=${input.cleanupBlockerCount}`,
    },
    {
      name: "destructive_cleanup_verify",
      ok: input.destructiveCleanupOk,
      detail: input.destructiveCleanupDetail,
    },
    {
      name: "generated_database_types_clean",
      ok: input.generatedTypesClean,
      detail: input.generatedTypesDetail,
    },
    {
      name: "manual_gate_evidence",
      ok: input.manualGateEvidenceOk,
      detail: input.manualGateEvidenceDetail,
    },
    {
      name: "final_breaking_commit_documented",
      ok: input.finalCommitDocumented,
      detail: input.finalCommitDetail,
    },
  ];

  return {
    ok: checks.every((check) => check.ok),
    generated_at: generatedAt,
    checks,
  };
}

export function findLegacyGeneratedTypePatterns(content: string): string[] {
  return LEGACY_GENERATED_TYPE_PATTERNS.filter((pattern) =>
    content.includes(pattern)
  );
}

export function isBreakingCleanupCommitMessage(message: string): boolean {
  const subject = message.split(/\r?\n/)[0]?.trim() ?? "";
  const hasBreakingMarker = /^[a-z]+(?:\([^)]+\))?!:/.test(subject) ||
    /\bBREAKING CHANGE:/.test(message);
  const hasWorkflowScope = /workflow|流程|状态机/.test(message);
  const hasCleanupTarget =
    /旧状态机数据库|旧状态机|删表|删列|删除旧|drop|cleanup/i.test(message);
  return hasBreakingMarker && hasWorkflowScope && hasCleanupTarget;
}

export function summarizeDestructiveCleanupVerifyReport(
  report: WorkflowDestructiveCleanupVerifyReport | null,
): string {
  if (!report) {
    return "missing SUPABASE_DB_DIRECT_URL or SUPABASE_DB_URL";
  }

  const relevantChecks = report.checks.filter((check) => !check.ok);
  const checks = relevantChecks.length > 0 ? relevantChecks : report.checks;
  return checks
    .map((check) => `${check.name}: ${check.detail}`)
    .join("; ");
}

async function runSupabaseDryRun(): Promise<string[]> {
  const databaseUrl = resolveFinalAuditDatabaseUrl();
  if (databaseUrl) {
    try {
      return (await loadMigrationHistoryReport(databaseUrl))
        .pendingMigrationFiles;
    } catch (error) {
      return [
        `database migration history check failed: ${
          formatCommandFailure(error)
        }`,
      ];
    }
  }

  try {
    const { stdout, stderr } = await execFileAsync(
      "supabase",
      buildSupabaseDryRunArgs(),
      {
        cwd: findRepoRoot(),
        env: process.env,
        timeout: 60_000,
        maxBuffer: 1024 * 1024,
      },
    );

    return parseSupabaseDryRunMigrations(`${stdout}\n${stderr}`);
  } catch (error) {
    return [`supabase db push --dry-run failed: ${formatCommandFailure(error)}`];
  }
}

async function checkSupabaseMigrationListAlignment(): Promise<
  { ok: boolean; detail: string }
> {
  const databaseUrl = resolveFinalAuditDatabaseUrl();
  if (!databaseUrl) {
    return {
      ok: false,
      detail: "missing SUPABASE_DB_DIRECT_URL or SUPABASE_DB_URL",
    };
  }

  try {
    return (await loadMigrationHistoryReport(databaseUrl)).alignment;
  } catch (error) {
    return {
      ok: false,
      detail: `database migration history check failed: ${
        formatCommandFailure(error)
      }`,
    };
  }
}

async function loadManualGateEvidence(
  evidenceFile: string | null,
): Promise<{ ok: boolean; detail: string }> {
  if (!evidenceFile) {
    return { ok: false, detail: "missing --evidence-file" };
  }

  return loadManualGateEvidenceFile(evidenceFile);
}

async function checkGeneratedDatabaseTypes(): Promise<
  { ok: boolean; detail: string }
> {
  const path = join(findRepoRoot(), "apps/api/src/types/database.ts");
  const content = await readFile(path, "utf8");
  const legacyPatterns = findLegacyGeneratedTypePatterns(content);
  return {
    ok: legacyPatterns.length === 0,
    detail: legacyPatterns.length === 0
      ? "legacy generated types absent"
      : `legacy generated type patterns=${legacyPatterns.join(", ")}`,
  };
}

async function checkFinalBreakingCommit(): Promise<
  { ok: boolean; detail: string }
> {
  const { stdout } = await execFileAsync(
    "git",
    ["log", "-1", "--pretty=%B"],
    {
      cwd: findRepoRoot(),
      env: process.env,
      timeout: 30_000,
      maxBuffer: 1024 * 1024,
    },
  );
  const subject = stdout.split(/\r?\n/)[0]?.trim() || "unknown";
  const ok = isBreakingCleanupCommitMessage(stdout);
  return {
    ok,
    detail: ok
      ? `latest_commit=${subject}`
      : `latest commit does not document breaking workflow DB cleanup: ${subject}`,
  };
}

export async function buildFinalCompletionAuditReport(
  evidenceFile: string | null,
): Promise<FinalAuditReport> {
  const [
    pendingMigrations,
    migrationList,
    cleanupReadiness,
    manualGateEvidence,
    generatedTypes,
    finalCommit,
  ] =
    await Promise.all([
      runSupabaseDryRun(),
      checkSupabaseMigrationListAlignment(),
      runCleanupReadinessScan(),
      loadManualGateEvidence(evidenceFile),
      checkGeneratedDatabaseTypes(),
      checkFinalBreakingCommit(),
    ]);

  const databaseUrl = resolveFinalAuditDatabaseUrl();
  const destructiveCleanup = databaseUrl
    ? await runWorkflowDestructiveCleanupVerify(databaseUrl)
    : null;

  return buildFinalAuditReport({
    pendingMigrations,
    migrationListAligned: migrationList.ok,
    migrationListDetail: migrationList.detail,
    cleanupReady: cleanupReadiness.ready,
    cleanupBlockerCount: cleanupReadiness.blockers.length,
    destructiveCleanupOk: destructiveCleanup?.ok ?? false,
    destructiveCleanupDetail:
      summarizeDestructiveCleanupVerifyReport(destructiveCleanup),
    generatedTypesClean: generatedTypes.ok,
    generatedTypesDetail: generatedTypes.detail,
    manualGateEvidenceOk: manualGateEvidence.ok,
    manualGateEvidenceDetail: databaseUrl
      ? manualGateEvidence.detail
      : `${manualGateEvidence.detail}; missing SUPABASE_DB_DIRECT_URL or SUPABASE_DB_URL`,
    finalCommitDocumented: finalCommit.ok,
    finalCommitDetail: finalCommit.detail,
  });
}

function findRepoRoot(start = process.cwd()): string {
  let current = resolve(start);
  while (true) {
    if (existsSync(join(current, "pnpm-workspace.yaml"))) return current;
    const parent = dirname(current);
    if (parent === current) return resolve(start);
    current = parent;
  }
}

async function main() {
  const report = await buildFinalCompletionAuditReport(
    parseFinalAuditArgs(process.argv.slice(2)).evidenceFile,
  );
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(1);
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(
      error instanceof Error ? error.message : "流程迁移最终完成审计失败",
    );
    process.exit(1);
  });
}
