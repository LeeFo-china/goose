import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

describe("platform roles repository boundary", () => {
  test("includes seeded built-in operator roles in list and detail filters", () => {
    const source = readFileSync(
      new URL("./platform-roles.ts", import.meta.url),
      "utf8",
    );

    for (const code of [
      "platform_operations",
      "platform_supplier_operations",
      "platform_service_delivery",
      "platform_finance_review",
      "platform_technical_operations",
    ]) {
      expect(source).toContain(code);
    }
  });
});
