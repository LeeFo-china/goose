import { describe, expect, test } from "bun:test";

import { SUPPLIER_OWNERSHIP_SCOPE_VALUES } from "./index";
import type { SupplierOwnershipRef } from "./index";

const platformOwnership: SupplierOwnershipRef = {
  ownershipScope: "platform",
  ownerTenantId: null,
};

const tenantOwnership: SupplierOwnershipRef = {
  ownershipScope: "tenant",
  ownerTenantId: "tenant-1",
};

// @ts-expect-error Platform-owned records cannot have a tenant owner.
const invalidPlatformOwnership: SupplierOwnershipRef = {
  ownershipScope: "platform",
  ownerTenantId: "tenant-1",
};

// @ts-expect-error Tenant-owned records must have a tenant owner.
const invalidTenantOwnership: SupplierOwnershipRef = {
  ownershipScope: "tenant",
  ownerTenantId: null,
};

void invalidPlatformOwnership;
void invalidTenantOwnership;

describe("supplier ownership domain contract", () => {
  test("keeps ownership scope values stable", () => {
    expect(SUPPLIER_OWNERSHIP_SCOPE_VALUES).toEqual(["platform", "tenant"]);
  });

  test("represents valid platform and tenant ownership", () => {
    expect(platformOwnership).toEqual({
      ownershipScope: "platform",
      ownerTenantId: null,
    });
    expect(tenantOwnership).toEqual({
      ownershipScope: "tenant",
      ownerTenantId: "tenant-1",
    });
  });
});
