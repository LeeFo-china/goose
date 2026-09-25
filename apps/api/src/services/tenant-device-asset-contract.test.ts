import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  CreateTenantTencentDeviceSchema,
  UpdateTenantDeviceSchema,
} from "@/schema/tenant-devices";

const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url));

describe("tenant device asset contract", () => {
  test("stores a normalized hardware serial with a tenant-scoped unique index", () => {
    const migration = readFileSync(
      `${repoRoot}supabase/migrations/20260925090000_add_tenant_device_hardware_serial.sql`,
      "utf8",
    );

    expect(migration).toContain("ADD COLUMN IF NOT EXISTS hardware_serial text");
    expect(migration).toContain("lower(hardware_serial)");
    expect(migration).toContain("hardware_serial IS NOT NULL");
    expect(migration).toContain("vendor_channel_id IS NULL");
    expect(migration).toContain("tenant_id");
    expect(migration).toContain("vendor");
  });

  test("requires a trimmed hardware serial when registering a Tencent device", () => {
    expect(CreateTenantTencentDeviceSchema.parse({
      hardware_serial: "  DS-ABC123  ",
    })).toEqual({
      hardware_serial: "DS-ABC123",
      device_type: 2,
      password: null,
    });

    expect(() => CreateTenantTencentDeviceSchema.parse({ hardware_serial: "  " })).toThrow();
  });

  test("allows legacy assets to receive a hardware serial later", () => {
    expect(UpdateTenantDeviceSchema.parse({
      hardware_serial: " DS-LEGACY-1 ",
    })).toEqual({ hardware_serial: "DS-LEGACY-1" });
  });

  test("registers Tencent devices at tenant scope and hydrates binding names", () => {
    const controller = readFileSync(
      `${repoRoot}apps/api/src/controllers/tenant-devices/index.ts`,
      "utf8",
    );
    const service = readFileSync(
      `${repoRoot}apps/api/src/services/tenant-devices/legacy-service.ts`,
      "utf8",
    );
    const queries = readFileSync(
      `${repoRoot}apps/api/src/repositories/tenant-devices/legacy/queries.ts`,
      "utf8",
    );

    expect(controller).toContain('@Post("/tenant-devices/tencent")');
    expect(controller).toContain("CreateTenantTencentDeviceSchema");
    expect(service).toContain("createTenantTencentDevice");
    expect(queries).toContain("hydrateTenantRows.call(this, rows)");
  });

  test("inherits the physical serial when cloud channels are synchronized", () => {
    const sync = readFileSync(
      `${repoRoot}apps/api/src/services/tenant-devices/legacy/sync.ts`,
      "utf8",
    );
    const mutations = readFileSync(
      `${repoRoot}apps/api/src/repositories/tenant-devices/legacy/mutations.ts`,
      "utf8",
    );

    expect(sync).toContain("hardwareSerialByDevice");
    expect(sync).toContain("hardware_serial:");
    expect(mutations.match(/hardware_serial: input\.hardware_serial \|\| null/g)).toHaveLength(2);
  });

  test("updates the physical serial across every channel of the same device", () => {
    const service = readFileSync(
      `${repoRoot}apps/api/src/services/tenant-devices/legacy/crud.ts`,
      "utf8",
    );

    expect(service).toContain("updateHardwareSerialByDevice");
    expect(service).toContain("findByHardwareSerial");
  });
});
