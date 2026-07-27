import { describe, expect, test } from "bun:test";

import { assertDirectObjectKeyBelongsToActor } from "./direct-object-key-access";

const tenantActor = {
  tenantId: "tenant-1",
  employeeId: "employee-1",
  customerId: null,
  visitorId: null,
  isPlatformAdmin: false,
};
const platformActor = {
  ...tenantActor,
  tenantId: null,
  employeeId: "platform-employee-1",
  isPlatformAdmin: true,
};

describe("brand logo direct object ownership", () => {
  test("allows only the current tenant brand-logo prefix", () => {
    expect(() => assertDirectObjectKeyBelongsToActor({
      objectKey: "tenants/tenant-1/brand-logo/2026/07/27/logo.png",
      scene: "brand_logo",
      actorContext: tenantActor,
    })).not.toThrow();

    expect(() => assertDirectObjectKeyBelongsToActor({
      objectKey: "tenants/tenant-2/brand-logo/2026/07/27/logo.png",
      scene: "brand_logo",
      actorContext: tenantActor,
    })).toThrow(expect.objectContaining({
      statusCode: 403,
      code: "FORBIDDEN",
    }));
  });

  test("allows only the platform brand-logo prefix for platform actors", () => {
    expect(() => assertDirectObjectKeyBelongsToActor({
      objectKey: "public/brand-logo/2026/07/27/logo.png",
      scene: "brand_logo",
      actorContext: platformActor,
    })).not.toThrow();

    expect(() => assertDirectObjectKeyBelongsToActor({
      objectKey: "tenants/tenant-1/brand-logo/2026/07/27/logo.png",
      scene: "brand_logo",
      actorContext: platformActor,
    })).toThrow(expect.objectContaining({ code: "FORBIDDEN" }));
  });

  test("rejects legacy unassigned brand logo paths", () => {
    expect(() => assertDirectObjectKeyBelongsToActor({
      objectKey: "tenants/tenant-1/brand-logo/unassigned/logo.png",
      scene: "brand_logo",
      actorContext: tenantActor,
    })).toThrow(expect.objectContaining({ code: "FORBIDDEN" }));
  });
});
