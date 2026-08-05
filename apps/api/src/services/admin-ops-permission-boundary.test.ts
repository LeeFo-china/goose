import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

describe("admin ops permission boundary", () => {
  test("admin ops controller uses the concrete ops execution permission", () => {
    const source = readFileSync(
      new URL("../controllers/admin-ops/index.ts", import.meta.url),
      "utf8",
    );

    expect(source).toContain("platform.ops.execute");
    expect(source).toContain("getRequiredPlatformPermissionContext");
    expect(source).not.toContain("getRequiredPlatformAdminContext(request)");
  });

  test("location governance metrics accept the ops execution permission", () => {
    const source = readFileSync(
      new URL("./location-governance.ts", import.meta.url),
      "utf8",
    );

    expect(source).toContain("platform.ops.execute");
    expect(source).not.toContain("assertPlatformAdmin");
    expect(source).not.toContain("!authContext.isPlatformAdmin");
  });
});
