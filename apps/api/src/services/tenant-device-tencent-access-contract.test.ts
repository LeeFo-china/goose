import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

describe("tenant Tencent device access contract", () => {
  test("limits resumable GB28181 secrets to the current tenant and project editors", () => {
    const service = readFileSync(
      new URL("./tenant-devices/legacy/tenant-tencent.ts", import.meta.url),
      "utf8",
    );
    const controller = readFileSync(
      new URL("../controllers/tenant-devices/index.ts", import.meta.url),
      "utf8",
    );

    expect(service).toContain('assertTenantDeviceAccess(input.authContext, "project.update")');
    expect(service).toContain("tenantDeviceRepository.findById(input.id, tenantId)");
    expect(service).toContain('device.vendor !== "tencent_iotvideo_industry"');
    expect(service).toContain("getDevicePassword(device.vendor_device_serial)");
    expect(controller).toContain('@Get("/tenant-devices/:id/tencent-access")');
  });
});
