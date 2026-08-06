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

  test("limits platform operator listing to active global platform roles before pagination", () => {
    const source = readFileSync(
      new URL("./platform-operators.ts", import.meta.url),
      "utf8",
    );

    expect(source).toContain("role:roles!employee_roles_role_id_fkey!inner");
    expect(source).toContain(".is(\"employee_roles.role.tenant_id\", null)");
    expect(source).toContain(".eq(\"employee_roles.role.status\", \"active\")");
    expect(source).toContain(".like(\"employee_roles.role.code\", PLATFORM_OPERATOR_ROLE_CODE_PATTERN)");
  });

  test("does not select non-existent employee updated_at column", () => {
    const source = readFileSync(
      new URL("./platform-operators.ts", import.meta.url),
      "utf8",
    );

    const employeeSelectStart = source.indexOf("const EMPLOYEE_SELECT = [");
    const employeeSelectEnd = source.indexOf("].join(\",\");", employeeSelectStart);
    const employeeSelect = source.slice(employeeSelectStart, employeeSelectEnd);

    expect(employeeSelect).toContain("\"created_at\"");
    expect(employeeSelect).not.toContain("\"updated_at\"");
  });
});
