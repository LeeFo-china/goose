import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

const migrationUrl = new URL(
  "../../../../supabase/migrations/20260625150000_expense_rejected_terminal_hint.sql",
  import.meta.url,
);

describe("expense workflow rejected terminal contract", () => {
  test("keeps rejected as terminal while documenting resubmit behavior", () => {
    expect(existsSync(migrationUrl)).toBe(true);

    const migrationSource = readFileSync(migrationUrl, "utf8");

    expect(migrationSource).toContain("费用审批流程 v5");
    expect(migrationSource).toContain("已驳回");
    expect(migrationSource).toContain("申请人可修改后重新提交");
    expect(migrationSource).not.toContain("'rejected', 'start'");
    expect(migrationSource).not.toContain("source_node.node_key = 'rejected'");
  });
});
