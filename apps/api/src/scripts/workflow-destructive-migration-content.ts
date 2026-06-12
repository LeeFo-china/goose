import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

type DestructiveMigrationContentCheck = {
  name: "destructive_migration_content";
  ok: boolean;
  detail: string;
};

export const EXPECTED_DESTRUCTIVE_MIGRATIONS = [
  "20260612133000_drop_schedule_project_construction_transition.sql",
  "20260612143000_drop_legacy_state_machine_objects.sql",
] as const;

const EXPECTED_DESTRUCTIVE_MIGRATION_CONTENT = {
  "20260612133000_drop_schedule_project_construction_transition.sql": [
    "DROP FUNCTION IF EXISTS public.schedule_project_construction_transition",
  ],
  "20260612143000_drop_legacy_state_machine_objects.sql": [
    "DROP FUNCTION IF EXISTS public.schedule_project_construction_transition",
    "DROP INDEX IF EXISTS public.idx_expense_requests_current_step",
    "DROP INDEX IF EXISTS public.customer_status_transition_logs_customer_created_idx",
    "DROP INDEX IF EXISTS public.customer_status_transition_logs_tenant_created_idx",
    "DROP INDEX IF EXISTS public.customer_status_transition_logs_action_idx",
    "DROP INDEX IF EXISTS public.project_status_transition_logs_project_created_idx",
    "DROP INDEX IF EXISTS public.project_status_transition_logs_tenant_created_idx",
    "DROP INDEX IF EXISTS public.project_status_transition_logs_action_idx",
    "DROP INDEX IF EXISTS public.idx_expense_request_approval_chains_request_id",
    "DROP INDEX IF EXISTS public.idx_expense_request_approval_chains_assignee_status",
    "DROP INDEX IF EXISTS public.idx_expense_request_approval_chains_step_status",
    "DROP INDEX IF EXISTS public.expense_request_approval_chains_tenant_assignee_status_idx",
    "DROP TABLE IF EXISTS public.customer_status_transition_logs",
    "DROP TABLE IF EXISTS public.project_status_transition_logs",
    "DROP TABLE IF EXISTS public.expense_request_approval_chains",
    'DROP POLICY IF EXISTS "Approvers view pending" ON public.expense_requests',
    "DROP CONSTRAINT IF EXISTS expense_requests_current_step_check",
    "DROP COLUMN IF EXISTS current_step",
    "DROP COLUMN IF EXISTS current_step_role",
  ],
} satisfies Record<string, readonly string[]>;

const FORBIDDEN_DESTRUCTIVE_MIGRATION_CONTENT = [
  "ALTER TABLE public.customers DROP COLUMN IF EXISTS status",
  "ALTER TABLE public.projects DROP COLUMN IF EXISTS status",
  "ALTER TABLE public.expense_requests DROP COLUMN IF EXISTS status",
] as const;

export function collectDestructiveMigrationContentIssues(
  files: Record<string, string | null | undefined>,
): string[] {
  const issues: string[] = [];
  for (
    const [fileName, requiredSnippets] of Object.entries(
      EXPECTED_DESTRUCTIVE_MIGRATION_CONTENT,
    )
  ) {
    const content = files[fileName];
    if (!content) {
      issues.push(`${fileName}: missing migration file`);
      continue;
    }

    for (const snippet of requiredSnippets) {
      if (!hasSqlSnippet(content, snippet)) {
        issues.push(`${fileName}: missing ${snippet}`);
      }
    }
  }

  for (const [fileName, content] of Object.entries(files)) {
    if (!content) continue;
    const normalizedContent = normalizeSqlSnippet(content);
    for (const snippet of FORBIDDEN_DESTRUCTIVE_MIGRATION_CONTENT) {
      if (normalizedContent.includes(normalizeSqlSnippet(snippet))) {
        issues.push(`${fileName}: forbidden ${snippet}`);
      }
    }
  }

  return issues;
}

function normalizeSqlSnippet(value: string): string {
  return stripSqlComments(value).replace(/\s+/g, " ").trim().toLowerCase();
}

function stripSqlComments(value: string): string {
  return value
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--.*$/gm, " ");
}

function hasSqlSnippet(content: string, snippet: string): boolean {
  const normalizedContent = normalizeSqlSnippet(content);
  const normalizedSnippet = normalizeSqlSnippet(snippet);
  let index = normalizedContent.indexOf(normalizedSnippet);
  while (index >= 0) {
    const previousChar = normalizedContent.charAt(index - 1);
    const nextChar = normalizedContent.charAt(index + normalizedSnippet.length);
    if (!isSqlIdentifierChar(previousChar) && !isSqlIdentifierChar(nextChar)) {
      return true;
    }
    index = normalizedContent.indexOf(normalizedSnippet, index + 1);
  }
  return false;
}

function isSqlIdentifierChar(value: string): boolean {
  return /[a-z0-9_]/.test(value);
}

export async function checkDestructiveMigrationContent(
  repoRoot: string,
): Promise<DestructiveMigrationContentCheck> {
  const files: Record<string, string | null> = {};
  for (const fileName of EXPECTED_DESTRUCTIVE_MIGRATIONS) {
    try {
      files[fileName] = await readFile(
        resolve(repoRoot, "supabase/migrations", fileName),
        "utf8",
      );
    } catch {
      files[fileName] = null;
    }
  }

  const issues = collectDestructiveMigrationContentIssues(files);
  return {
    name: "destructive_migration_content",
    ok: issues.length === 0,
    detail: issues.length === 0
      ? "expected destructive drop targets present"
      : issues.join("; "),
  };
}
