import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

describe("platform devices permission boundary", () => {
  test("tenant device controller uses concrete platform device permissions", () => {
    const source = readFileSync(
      new URL("../controllers/tenant-devices/index.ts", import.meta.url),
      "utf8",
    );

    expect(source).toContain("platform.device.read");
    expect(source).toContain("platform.device.manage");
    expect(source).toContain("getRequiredPlatformPermissionContext");
  });

  test("tenant device platform services check concrete device permissions", () => {
    const access = readFileSync(
      new URL("./tenant-devices/legacy/access.ts", import.meta.url),
      "utf8",
    );
    const lists = readFileSync(
      new URL("./tenant-devices/legacy/lists.ts", import.meta.url),
      "utf8",
    );
    const tencent = readFileSync(
      new URL("./tenant-devices/legacy/platform-tencent.ts", import.meta.url),
      "utf8",
    );

    expect(access).toContain("platform.device.read");
    expect(access).toContain("platform.device.manage");
    expect(lists).toContain("PLATFORM_DEVICE_READ_PERMISSION");
    expect(tencent).toContain("PLATFORM_DEVICE_MANAGE_PERMISSION");
    expect(access).not.toContain("assertPlatformAdmin");
    expect(lists).not.toContain("assertPlatformAdmin");
    expect(tencent).not.toContain("assertPlatformAdmin");
  });
});
