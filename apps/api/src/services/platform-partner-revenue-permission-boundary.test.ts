import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

describe("platform partner revenue permission boundary", () => {
  test("uses platform identity guard naming with concrete revenue permissions", () => {
    const source = readFileSync(
      new URL("./platform-partner-revenue.ts", import.meta.url),
      "utf8",
    );

    expect(source).toContain("platform.partner.revenue.read");
    expect(source).toContain("platform.partner.revenue.manage");
    expect(source).toContain("platform.partner.commission.read");
    expect(source).toContain("platform.partner.settlement.manage");
    expect(source).not.toContain("assertPlatformAdmin");
    expect(source).not.toContain("!authContext.isPlatformAdmin");
  });
});
