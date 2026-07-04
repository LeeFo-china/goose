import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

const migrationUrl = new URL(
  "../../../../supabase/migrations/20260704103000_expense_payment_permission_assignee.sql",
  import.meta.url,
);

describe("expense payment assignee contract", () => {
  test("moves expense payment tasks from finance role intersection to pay permission pool", () => {
    expect(existsSync(migrationUrl)).toBe(true);

    const migrationSource = readFileSync(migrationUrl, "utf8");

    expect(migrationSource).toContain("workflow_key = 'expense_approval'");
    expect(migrationSource).toContain("node_key = 'payment'");
    expect(migrationSource).toContain("expense_request.pay");
    expect(migrationSource).toContain("assignee_role_code = NULL");
    expect(migrationSource).toContain("assignee_permission_code = 'expense_request.pay'");
    expect(migrationSource).not.toContain("assignee_role_code = 'finance_base'");
  });
});
