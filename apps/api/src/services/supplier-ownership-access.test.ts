import { describe, expect, test } from "bun:test";

import {
  resolveSupplierRelationshipAccess,
  resolveSupplierOwnershipAccess,
  type SupplierRelationshipAccessInput,
  type SupplierOwnershipAccessInput,
} from "./supplier-ownership-access";

const TENANT_ID = "40000000-0000-4000-8000-000000000001";
const OTHER_TENANT_ID = "40000000-0000-4000-8000-000000000002";

const tenantActor = {
  kind: "tenant",
  tenantId: TENANT_ID,
} as const;
const platformActor = {
  kind: "platform",
  tenantId: null,
} as const;
const platformOwnership = {
  ownershipScope: "platform",
  ownerTenantId: null,
} as const;
const tenantOwnership = {
  ownershipScope: "tenant",
  ownerTenantId: TENANT_ID,
} as const;

function decide(
  overrides: Partial<SupplierOwnershipAccessInput> = {},
) {
  return resolveSupplierOwnershipAccess({
    actor: tenantActor,
    resourceKind: "supplier",
    ownership: platformOwnership,
    relationshipStatus: null,
    operation: "read",
    permissionGranted: true,
    ...overrides,
  });
}

describe("resolveSupplierOwnershipAccess", () => {
  test("allows tenants to browse the platform supplier directory without a relationship", () => {
    expect(decide()).toEqual({
      visible: true,
      writable: false,
      historicalOnly: false,
      reason: "allowed",
    });
  });

  test("allows platform operators to read platform-owned supplier data", () => {
    expect(decide({ actor: platformActor })).toEqual({
      visible: true,
      writable: false,
      historicalOnly: false,
      reason: "allowed",
    });
  });

  test("allows the owning tenant to read and write private resources", () => {
    expect(decide({
      ownership: tenantOwnership,
      operation: "read",
    })).toEqual({
      visible: true,
      writable: false,
      historicalOnly: false,
      reason: "allowed",
    });
    expect(decide({
      ownership: tenantOwnership,
      operation: "write",
    })).toEqual({
      visible: true,
      writable: true,
      historicalOnly: false,
      reason: "allowed",
    });
  });

  test("hides private resources from other tenants", () => {
    expect(decide({
      ownership: {
        ownershipScope: "tenant",
        ownerTenantId: OTHER_TENANT_ID,
      },
    })).toEqual({
      visible: false,
      writable: false,
      historicalOnly: false,
      reason: "foreign_tenant",
    });
  });

  test("hides tenant-private resources from platform operators by default", () => {
    expect(decide({
      actor: platformActor,
      ownership: tenantOwnership,
    })).toEqual({
      visible: false,
      writable: false,
      historicalOnly: false,
      reason: "foreign_tenant",
    });
  });

  test("requires a tenant relationship before products become visible", () => {
    expect(decide({
      resourceKind: "product",
      relationshipStatus: null,
    })).toEqual({
      visible: false,
      writable: false,
      historicalOnly: false,
      reason: "inactive_relationship",
    });
  });

  test.each([
    "evaluating",
    "suspended",
    "terminated",
    "blacklisted",
  ] as const)(
    "keeps products historically readable for a %s relationship",
    (relationshipStatus) => {
      expect(decide({
        resourceKind: "product",
        relationshipStatus,
      })).toEqual({
        visible: true,
        writable: false,
        historicalOnly: true,
        reason: "inactive_relationship",
      });
    },
  );

  test.each([
    "evaluating",
    "suspended",
    "terminated",
    "blacklisted",
  ] as const)(
    "rejects product writes for a %s relationship",
    (relationshipStatus) => {
      expect(decide({
        resourceKind: "product",
        ownership: tenantOwnership,
        relationshipStatus,
        operation: "write",
      })).toEqual({
        visible: true,
        writable: false,
        historicalOnly: true,
        reason: "inactive_relationship",
      });
    },
  );

  test("allows active relationships to write tenant-private products", () => {
    expect(decide({
      resourceKind: "product",
      ownership: tenantOwnership,
      relationshipStatus: "active",
      operation: "write",
    })).toEqual({
      visible: true,
      writable: true,
      historicalOnly: false,
      reason: "allowed",
    });
  });

  test("allows active relationships to read platform products", () => {
    expect(decide({
      resourceKind: "product",
      relationshipStatus: "active",
    })).toEqual({
      visible: true,
      writable: false,
      historicalOnly: false,
      reason: "allowed",
    });
  });

  test("keeps platform products read-only for tenant actors", () => {
    expect(decide({
      resourceKind: "product",
      relationshipStatus: "active",
      operation: "write",
    })).toEqual({
      visible: true,
      writable: false,
      historicalOnly: false,
      reason: "platform_read_only",
    });
  });

  test("keeps platform catalog entries visible but read-only for tenants", () => {
    expect(decide({ resourceKind: "catalog" })).toEqual({
      visible: true,
      writable: false,
      historicalOnly: false,
      reason: "allowed",
    });
    expect(decide({
      resourceKind: "catalog",
      operation: "write",
    })).toEqual({
      visible: true,
      writable: false,
      historicalOnly: false,
      reason: "platform_read_only",
    });
  });

  test("rejects access when the required permission is missing", () => {
    expect(decide({ permissionGranted: false })).toEqual({
      visible: false,
      writable: false,
      historicalOnly: false,
      reason: "permission_denied",
    });
  });
});

function decideRelationship(
  overrides: Partial<SupplierRelationshipAccessInput> = {},
) {
  return resolveSupplierRelationshipAccess({
    relationshipStatus: "active",
    operation: "read",
    permissionGranted: true,
    ...overrides,
  });
}

describe("resolveSupplierRelationshipAccess", () => {
  test("allows active relationship reads and writes", () => {
    expect(decideRelationship()).toEqual({
      visible: true,
      writable: false,
      historicalOnly: false,
      reason: "allowed",
    });
    expect(decideRelationship({ operation: "write" })).toEqual({
      visible: true,
      writable: true,
      historicalOnly: false,
      reason: "allowed",
    });
  });

  test.each([
    "evaluating",
    "suspended",
    "terminated",
    "blacklisted",
  ] as const)(
    "keeps a %s relationship historically readable but not writable",
    (relationshipStatus) => {
      expect(decideRelationship({ relationshipStatus })).toEqual({
        visible: true,
        writable: false,
        historicalOnly: true,
        reason: "inactive_relationship",
      });
      expect(decideRelationship({
        relationshipStatus,
        operation: "write",
      })).toEqual({
        visible: true,
        writable: false,
        historicalOnly: true,
        reason: "inactive_relationship",
      });
    },
  );

  test("hides resources when no relationship exists", () => {
    expect(decideRelationship({ relationshipStatus: null })).toEqual({
      visible: false,
      writable: false,
      historicalOnly: false,
      reason: "inactive_relationship",
    });
  });

  test("rejects access when the required permission is missing", () => {
    expect(decideRelationship({ permissionGranted: false })).toEqual({
      visible: false,
      writable: false,
      historicalOnly: false,
      reason: "permission_denied",
    });
  });
});
