import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  collectDestructiveMigrationContentIssues,
} from "./workflow-destructive-migration-content";

const migrationFile = "20260612143000_drop_legacy_state_machine_objects.sql";
const scheduleMigrationFile =
  "20260612133000_drop_schedule_project_construction_transition.sql";
const requiredLegacyCleanupDrops = [
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
] as const;

describe("collectDestructiveMigrationContentIssues", () => {
  test("accepts the current destructive migration files", async () => {
    const repoRoot = resolve(
      dirname(fileURLToPath(import.meta.url)),
      "..",
      "..",
      "..",
      "..",
    );

    expect(collectDestructiveMigrationContentIssues({
      [scheduleMigrationFile]: await readFile(
        join(repoRoot, "supabase/migrations", scheduleMigrationFile),
        "utf8",
      ),
      [migrationFile]: await readFile(
        join(repoRoot, "supabase/migrations", migrationFile),
        "utf8",
      ),
    })).toEqual([]);
  });

  test("reports missing destructive drop targets", () => {
    const issues = collectDestructiveMigrationContentIssues({
      [scheduleMigrationFile]: "",
      [migrationFile]: "DROP TABLE IF EXISTS public.customer_status_transition_logs;",
    });

    expect(issues).toContain(`${scheduleMigrationFile}: missing migration file`);
    expect(issues).toContain(
      `${migrationFile}: missing DROP FUNCTION IF EXISTS public.schedule_project_construction_transition`,
    );
  });

  test("does not treat current_step_role as the required current_step drop", () => {
    const issues = collectDestructiveMigrationContentIssues({
      [scheduleMigrationFile]:
        "DROP FUNCTION IF EXISTS public.schedule_project_construction_transition;",
      [migrationFile]: requiredLegacyCleanupDrops
        .filter((snippet) => snippet !== "DROP COLUMN IF EXISTS current_step")
        .join(";\n"),
    });

    expect(issues).toContain(
      `${migrationFile}: missing DROP COLUMN IF EXISTS current_step`,
    );
  });

  test("does not treat commented required drops as present", () => {
    const issues = collectDestructiveMigrationContentIssues({
      [scheduleMigrationFile]:
        "DROP FUNCTION IF EXISTS public.schedule_project_construction_transition;",
      [migrationFile]: [
        ...requiredLegacyCleanupDrops.filter((snippet) =>
          snippet !== "DROP TABLE IF EXISTS public.project_status_transition_logs"
        ),
        "-- DROP TABLE IF EXISTS public.project_status_transition_logs",
      ].join(";\n"),
    });

    expect(issues).toContain(
      `${migrationFile}: missing DROP TABLE IF EXISTS public.project_status_transition_logs`,
    );
  });

  test("rejects destructive drops for retained business status columns", () => {
    const issues = collectDestructiveMigrationContentIssues({
      [scheduleMigrationFile]:
        "DROP FUNCTION IF EXISTS public.schedule_project_construction_transition;",
      [migrationFile]: [
        ...requiredLegacyCleanupDrops,
        "ALTER TABLE public.customers DROP COLUMN IF EXISTS status",
      ].join(";\n"),
    });

    expect(issues).toContain(
      `${migrationFile}: forbidden ALTER TABLE public.customers DROP COLUMN IF EXISTS status`,
    );
  });

  test("ignores forbidden drops inside SQL comments", () => {
    const issues = collectDestructiveMigrationContentIssues({
      [scheduleMigrationFile]:
        "DROP FUNCTION IF EXISTS public.schedule_project_construction_transition;",
      [migrationFile]: [
        ...requiredLegacyCleanupDrops,
        "/* ALTER TABLE public.expense_requests DROP COLUMN IF EXISTS status */",
      ].join(";\n"),
    });

    expect(issues).not.toContain(
      `${migrationFile}: forbidden ALTER TABLE public.expense_requests DROP COLUMN IF EXISTS status`,
    );
  });

  test("rejects multiline destructive drops for retained business status columns", () => {
    const issues = collectDestructiveMigrationContentIssues({
      [scheduleMigrationFile]:
        "DROP FUNCTION IF EXISTS public.schedule_project_construction_transition;",
      [migrationFile]: [
        ...requiredLegacyCleanupDrops,
        "ALTER TABLE public.projects\n  DROP COLUMN IF EXISTS status",
      ].join(";\n"),
    });

    expect(issues).toContain(
      `${migrationFile}: forbidden ALTER TABLE public.projects DROP COLUMN IF EXISTS status`,
    );
  });
});
