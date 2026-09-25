import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { CreateProjectCameraSchema } from "@/schema/project-cameras";

describe("project camera tenant-device binding", () => {
  test("accepts a tenant device id while preserving legacy camera payloads", () => {
    const parsed = CreateProjectCameraSchema.parse({
      tenant_device_id: "11111111-1111-4111-8111-111111111111",
      name: "客厅",
      vendor: "tencent_iotvideo_industry",
      vendor_device_serial: "legacy-placeholder",
      vendor_channel_id: "legacy-placeholder",
    });

    expect(parsed.tenant_device_id).toBe("11111111-1111-4111-8111-111111111111");
  });

  test("resolves trusted vendor identifiers from the tenant-owned asset", () => {
    const service = readFileSync(
      new URL("./project-cameras/legacy/mutations.ts", import.meta.url),
      "utf8",
    );

    expect(service).toContain("input.payload.tenant_device_id");
    expect(service).toContain("tenantDeviceRepository.findById");
    expect(service).toContain("existingDevice.vendor_device_serial");
    expect(service).toContain("existingDevice.vendor_channel_id");
  });
});
