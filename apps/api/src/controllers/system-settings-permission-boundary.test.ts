import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

describe("system settings permission boundary", () => {
  test("platform system settings endpoints use platform RBAC permissions", () => {
    const source = readFileSync(
      new URL("./system-settings/index.ts", import.meta.url),
      "utf8",
    );

    expect(source).toContain("platform.system_setting.read");
    expect(source).toContain("platform.system_setting.manage");
    expect(source).toContain("platformPermissionCode");
    expect(source).not.toContain("getRequiredPlatformSettingsContext(\n      request,\n      \"system.settings.read\"");
    expect(source).not.toContain("getRequiredPlatformSettingsContext(\n      request,\n      \"system.settings.update\"");
    expect(source).not.toContain("getRequiredPlatformSettingsContext(\n      request,\n      \"system.settings.test\"");
    expect(source).not.toContain("!authContext.isPlatformAdmin");
  });
});
