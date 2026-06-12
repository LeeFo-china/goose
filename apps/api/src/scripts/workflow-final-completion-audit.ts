import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import {
  buildSupabaseDryRunArgs,
  parseSupabaseDryRunMigrations,
  validateManualGateEvidence,
} from "./workflow-destructive-cleanup-preflight";
import { runWorkflowDestructiveCleanupVerify } from "./workflow-destructive-cleanup-verify";
import { runCleanupReadinessScan } from "./workflow-cleanup-readiness";

export type FinalAuditInput = {
  pendingMigrations: readonly string[];
  cleanupReady: boolean;
  cleanupBlockerCount: number;
  destructiveCleanupOk: boolean;
  generatedTypesClean: boolean;
  generatedTypesDetail: string;
  manualGateEvidenceOk: boolean;
  manualGateEvidenceDetail: string;
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
      name: "cleanup_readiness",
      ok: input.cleanupReady,
      detail: `blockers=${input.cleanupBlockerCount}`,
    },
    {
      name: "destructive_cleanup_verify",
      ok: input.destructiveCleanupOk,
      detail: input.destructiveCleanupOk
        ? "legacy objects absent and workflow runtime consistent"
        : "legacy objects remain or workflow runtime is inconsistent",
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

async function runSupabaseDryRun(): Promise<string[]> {
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
}

async function loadManualGateEvidence(
  evidenceFile: string | null,
): Promise<{ ok: boolean; detail: string }> {
  if (!evidenceFile) {
    return { ok: false, detail: "missing --evidence-file" };
  }

  const path = resolve(findRepoRoot(), evidenceFile);
  const raw = await readFile(path, "utf8");
  const validation = validateManualGateEvidence(JSON.parse(raw));
  return {
    ok: validation.ok,
    detail: validation.ok
      ? `evidence_file=${evidenceFile}`
      : `evidence_file=${evidenceFile}; missing=${validation.missing.join(", ")}`,
  };
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

async function buildReport(evidenceFile: string | null): Promise<FinalAuditReport> {
  const [
    pendingMigrations,
    cleanupReadiness,
    manualGateEvidence,
    generatedTypes,
  ] =
    await Promise.all([
      runSupabaseDryRun(),
      runCleanupReadinessScan(),
      loadManualGateEvidence(evidenceFile),
      checkGeneratedDatabaseTypes(),
    ]);

  const databaseUrl = resolveFinalAuditDatabaseUrl();
  const destructiveCleanup = databaseUrl
    ? await runWorkflowDestructiveCleanupVerify(databaseUrl)
    : null;

  return buildFinalAuditReport({
    pendingMigrations,
    cleanupReady: cleanupReadiness.ready,
    cleanupBlockerCount: cleanupReadiness.blockers.length,
    destructiveCleanupOk: destructiveCleanup?.ok ?? false,
    generatedTypesClean: generatedTypes.ok,
    generatedTypesDetail: generatedTypes.detail,
    manualGateEvidenceOk: manualGateEvidence.ok,
    manualGateEvidenceDetail: databaseUrl
      ? manualGateEvidence.detail
      : `${manualGateEvidence.detail}; missing SUPABASE_DB_DIRECT_URL or SUPABASE_DB_URL`,
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
  const report = await buildReport(
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
