import { describe, expect, test } from "bun:test";

import {
  PlatformSupplierUpdateSchema,
  PlatformTenantSupplierSettingsCommandSchema,
  SupplierCommandSchema,
} from "./platform-suppliers";

const initialSettings = {
  module_enabled: true,
  require_active_contract_for_new_order: false,
  expected_version: 0,
};

describe("platform tenant supplier settings command", () => {
  test("accepts version zero only for the initial settings command", () => {
    expect(PlatformTenantSupplierSettingsCommandSchema.parse(initialSettings))
      .toEqual(initialSettings);

    for (const expectedVersion of [-1, 0.5]) {
      expect(PlatformTenantSupplierSettingsCommandSchema.safeParse({
        ...initialSettings,
        expected_version: expectedVersion,
      }).success).toBe(false);
    }
    expect(SupplierCommandSchema.safeParse({ expected_version: 0 }).success)
      .toBe(false);
    expect(PlatformSupplierUpdateSchema.safeParse({
      expected_version: 0,
      name: "晴天建材",
    }).success).toBe(false);
  });

  test("requires a trimmed reason of at most 500 characters when disabling", () => {
    expect(PlatformTenantSupplierSettingsCommandSchema.parse({
      ...initialSettings,
      module_enabled: false,
      reason: "  合作策略调整  ",
    })).toEqual({
      ...initialSettings,
      module_enabled: false,
      reason: "合作策略调整",
    });

    for (const reason of [undefined, "   ", "原".repeat(501)]) {
      expect(PlatformTenantSupplierSettingsCommandSchema.safeParse({
        ...initialSettings,
        module_enabled: false,
        reason,
      }).success).toBe(false);
    }
  });
});
