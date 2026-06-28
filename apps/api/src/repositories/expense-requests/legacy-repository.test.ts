import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

describe("ExpenseRequestRepository select fields", () => {
  test("loads compact project summary relations for expense request lists", () => {
    const source = readFileSync(
      new URL("./legacy-repository.ts", import.meta.url),
      "utf8",
    );

    expect(source).toContain("project:projects(");
    expect(source).toContain("signed_amount");
    expect(source).toContain("customer:customers!projects_customer_id_fkey(name, phone)");
    expect(source).toContain(
      "property:properties!projects_property_id_fkey(community, building_info)",
    );
  });
});
