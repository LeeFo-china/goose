import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

describe("expense department manager migration contract", () => {
  test("adds department manager and workflow task projection support", () => {
    const migrationSource = readFileSync(
      new URL(
        "../../../../supabase/migrations/20260625133000_expense_department_manager_assignee.sql",
        import.meta.url,
      ),
      "utf8",
    );

    expect(migrationSource).toContain("manager_employee_id");
    expect(migrationSource).toContain("applicant_department_manager");
    expect(migrationSource).toContain("expense_requests");
    expect(migrationSource).toContain("assignee_employee_id");
  });

  test("keeps department manager as preference only when it has approval permission", () => {
    const migrationSource = readFileSync(
      new URL(
        "../../../../supabase/migrations/20260626112000_expense_manager_review_permission_assignee.sql",
        import.meta.url,
      ),
      "utf8",
    );

    expect(migrationSource).toContain("applicant_department_manager");
    expect(migrationSource).toContain("role_permissions");
    expect(migrationSource).toContain("employee_permission_overrides");
    expect(migrationSource).toContain("role_permission.access_scope IN ('department', 'all')");
    expect(migrationSource).toContain("override_record.effect = 'deny'");
    expect(migrationSource).toContain("NEW.assignee_permission_code := v_permission_code");
  });
});
