import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

describe("billing legacy platform permission boundary", () => {
  test("platform billing legacy services use read and manage permissions", () => {
    const files = [
      "./billing/legacy/shared.ts",
      "./billing/legacy/tenant-platform.ts",
      "./billing/legacy/pricing.ts",
      "./billing/legacy/ai-usage.ts",
      "./billing/legacy/shadow.ts",
      "./billing/legacy-service.ts",
    ];
    const source = files.map((file) =>
      readFileSync(new URL(file, import.meta.url), "utf8")
    ).join("\n");

    expect(source).toContain("platform.billing.read");
    expect(source).toContain("platform.billing.manage");
    expect(source).not.toContain("assertPlatformAdmin");
    expect(source).not.toContain("!authContext.isPlatformAdmin");
  });
});
