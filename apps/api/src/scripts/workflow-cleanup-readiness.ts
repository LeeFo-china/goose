import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";

export type CleanupReference = {
  path: string;
  line: number;
  pattern: string;
  text: string;
};

export type ClassifiedCleanupReference = CleanupReference & {
  kind: "blocker" | "allowed";
  reason: string;
};

export type CleanupReadinessReport = {
  ready: boolean;
  blockers: ClassifiedCleanupReference[];
  allowedReferences: ClassifiedCleanupReference[];
  countsByPattern: Record<string, number>;
};

type FileEntry = {
  path: string;
  content: string;
};

const LEGACY_PATTERNS = [
  "customer_status_transition_logs",
  "project_status_transition_logs",
  "expense_request_approval_chains",
  "schedule_project_construction_transition",
  "status-actions",
  "status-transition",
  "status-transitions",
  "expense-requests/todo",
  "current_step",
  "current_step_role",
  "approval_chain",
] as const;

const DEFAULT_SCAN_ROOTS = [
  "apps/api/src",
  "apps/admin",
  "packages/domain/src",
  "supabase/migrations",
  "docs/state_machine_migrate",
] as const;

const TEXT_FILE_EXTENSIONS = new Set([
  ".json",
  ".md",
  ".sql",
  ".ts",
  ".tsx",
]);

export function scanCleanupReferences(
  files: FileEntry[],
): CleanupReference[] {
  const references: CleanupReference[] = [];
  for (const file of files) {
    const lines = file.content.split(/\r?\n/);
    lines.forEach((lineText, index) => {
      for (const pattern of LEGACY_PATTERNS) {
        if (lineText.includes(pattern)) {
          references.push({
            path: file.path,
            line: index + 1,
            pattern,
            text: lineText.trim(),
          });
        }
      }
    });
  }
  return references;
}

export function classifyCleanupReference(
  reference: CleanupReference,
): Pick<ClassifiedCleanupReference, "kind" | "reason"> {
  if (isAllowedReferencePath(reference.path)) {
    return {
      kind: "allowed",
      reason: "historical documentation, migration, generated type, or test reference",
    };
  }

  return {
    kind: "blocker",
    reason: "production source still references legacy state machine",
  };
}

export function buildCleanupReadinessReport(
  references: CleanupReference[],
): CleanupReadinessReport {
  const classified = references.map((reference) => ({
    ...reference,
    ...classifyCleanupReference(reference),
  }));
  const blockers = classified.filter((item) => item.kind === "blocker");
  const allowedReferences = classified.filter((item) => item.kind === "allowed");
  const countsByPattern: Record<string, number> = {};
  for (const reference of references) {
    countsByPattern[reference.pattern] =
      (countsByPattern[reference.pattern] ?? 0) + 1;
  }

  return {
    ready: blockers.length === 0,
    blockers,
    allowedReferences,
    countsByPattern,
  };
}

export async function runCleanupReadinessScan(
  roots: readonly string[] = DEFAULT_SCAN_ROOTS,
): Promise<CleanupReadinessReport> {
  const files = await collectFiles(roots);
  return buildCleanupReadinessReport(scanCleanupReferences(files));
}

function isAllowedReferencePath(path: string): boolean {
  if (path.startsWith("docs/")) return true;
  if (path.startsWith("supabase/migrations/")) return true;
  if (path.endsWith(".test.ts") || path.endsWith(".test.tsx")) return true;
  if (path === "apps/api/src/types/database.ts") return true;
  if (path === "apps/api/src/scripts/workflow-cleanup-readiness.ts") return true;
  if (path === "apps/api/src/scripts/workflow-destructive-cleanup-preflight.ts") return true;
  if (path === "apps/api/src/scripts/workflow-destructive-migration-content.ts") return true;
  if (path === "apps/api/src/scripts/workflow-destructive-cleanup-verify.ts") return true;
  if (path === "apps/api/src/scripts/workflow-final-completion-audit.ts") return true;
  return false;
}

async function collectFiles(roots: readonly string[]): Promise<FileEntry[]> {
  const files: FileEntry[] = [];
  const repoRoot = findRepoRoot();
  for (const root of roots) {
    for (const path of await listTextFiles(join(repoRoot, root))) {
      files.push({
        path: relative(repoRoot, path),
        content: await readFile(path, "utf8"),
      });
    }
  }
  return files;
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

async function listTextFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === ".next" || entry.name === "node_modules") continue;
      files.push(...await listTextFiles(path));
      continue;
    }
    if (entry.isFile() && isTextFile(path)) {
      files.push(path);
    }
  }
  return files;
}

function isTextFile(path: string): boolean {
  for (const extension of TEXT_FILE_EXTENSIONS) {
    if (path.endsWith(extension)) return true;
  }
  return false;
}

async function main() {
  const report = await runCleanupReadinessScan();
  console.log(JSON.stringify(report, null, 2));
  if (!report.ready) process.exit(1);
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
