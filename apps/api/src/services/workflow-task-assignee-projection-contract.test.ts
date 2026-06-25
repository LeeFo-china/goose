import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

describe("workflow task assignee projection migration", () => {
  test("projects approval node employee and role assignees", () => {
    const migrationSource = readFileSync(
      new URL(
        "../../../../supabase/migrations/20260625122000_approval_node_assignee_projection.sql",
        import.meta.url,
      ),
      "utf8",
    );

    expect(migrationSource).toContain("v_assignee_rule = 'employee'");
    expect(migrationSource).toContain("NEW.assignee_employee_id");
    expect(migrationSource).toContain("v_assignee_rule = 'role'");
    expect(migrationSource).toContain("NEW.assignee_role_code");
    expect(migrationSource).toContain("finance_reviewer_employee_id");
  });
});
