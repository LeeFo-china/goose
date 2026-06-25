import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

const migrationUrl = new URL(
  "../../../../supabase/migrations/20260625143000_fix_expense_workflow_v4.sql",
  import.meta.url,
);

describe("expense workflow v4 configuration contract", () => {
  test("publishes v4 with manager review assigned to applicant department manager", () => {
    expect(existsSync(migrationUrl)).toBe(true);

    const migrationSource = readFileSync(migrationUrl, "utf8");

    expect(migrationSource).toContain("version_number");
    expect(migrationSource).toContain("费用审批流程 v4");
    expect(migrationSource).toContain("manager_review");
    expect(migrationSource).toContain("经理审批");
    expect(migrationSource).toContain("applicant_department_manager");
    expect(migrationSource).toContain("finance_review");
    expect(migrationSource).toContain("财务审批");
    expect(migrationSource).toContain("payment");
    expect(migrationSource).toContain("出纳打款");
  });

  test("uses decision as approval edge condition and removes payment rejection edge", () => {
    expect(existsSync(migrationUrl)).toBe(true);

    const migrationSource = readFileSync(migrationUrl, "utf8");

    expect(migrationSource).toContain("'field', 'decision'");
    expect(migrationSource).not.toContain("approval_result");
    expect(migrationSource).not.toContain("payment_rejected");
  });
});
