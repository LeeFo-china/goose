import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

describe("platform operators pagination boundary", () => {
  test("pushes roleId filtering into the query before pagination", () => {
    const source = readFileSync(
      new URL("./platform-operators.ts", import.meta.url),
      "utf8",
    );

    expect(source).toContain("employee_roles!inner");
    expect(source).toContain(".eq(\"employee_roles.role_id\", query.roleId)");
    expect(source).not.toContain("matchesRole");
    expect(source).not.toContain("row.roles.some((role) => role.id === query.roleId)");
  });
});
