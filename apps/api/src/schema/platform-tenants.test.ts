import { describe, expect, test } from "bun:test";

import { UpdatePlatformTenantSchema } from "./platform-tenants";

describe("UpdatePlatformTenantSchema address confirmation time", () => {
  test("normalizes legacy offset timestamps for old clients", () => {
    const result = UpdatePlatformTenantSchema.parse({
      name: "示例租户",
      address_confirmed_at: "2026-09-10T18:20:30+08:00",
    });

    expect(result.address_confirmed_at).toBe("2026-09-10T10:20:30.000Z");
  });

  test("preserves null, omits empty values, and rejects invalid timestamps", () => {
    expect(UpdatePlatformTenantSchema.parse({ name: "示例租户", address_confirmed_at: null }))
      .toHaveProperty("address_confirmed_at", null);
    expect(UpdatePlatformTenantSchema.parse({ name: "示例租户", address_confirmed_at: "" }))
      .not.toHaveProperty("address_confirmed_at");
    expect(UpdatePlatformTenantSchema.safeParse({
      name: "示例租户",
      address_confirmed_at: "legacy-invalid",
    }).success).toBe(false);
  });
});
