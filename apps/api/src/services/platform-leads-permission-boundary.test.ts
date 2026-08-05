import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

describe("platform leads permission boundary", () => {
  test("platform lead controller uses concrete read and assign permissions", () => {
    const source = readFileSync(
      new URL("../controllers/platform-leads/index.ts", import.meta.url),
      "utf8",
    );

    expect(source).toContain("platform.lead.read");
    expect(source).toContain("platform.lead.assign");
    expect(source).toContain("getRequiredPlatformPermissionContext");
    expect(source).not.toContain("authorizationService.getRequiredAuthContext");
  });

  test("platform lead service checks concrete lead permissions", () => {
    const source = readFileSync(
      new URL("./platform-leads.ts", import.meta.url),
      "utf8",
    );

    expect(source).toContain("platform.lead.read");
    expect(source).toContain("platform.lead.assign");
    expect(source).not.toContain("assertPlatformAdmin");
    expect(source).not.toContain("!authContext.isPlatformAdmin");
  });
});
