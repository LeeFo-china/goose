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
const LOGO_UUID = "11111111-1111-4111-8111-111111111111";

describe("brand logo direct object ownership", () => {
  test("allows only the current tenant brand-logo prefix", () => {
    expect(() => assertDirectObjectKeyBelongsToActor({
      objectKey:
        `tenants/tenant-1/brand-logo/2026/07/27/${LOGO_UUID}.png`,
      scene: "brand_logo",
      actorContext: tenantActor,
      mimetype: "image/png",
    })).not.toThrow();

    expect(() => assertDirectObjectKeyBelongsToActor({
      objectKey:
        `tenants/tenant-2/brand-logo/2026/07/27/${LOGO_UUID}.png`,
      scene: "brand_logo",
      actorContext: tenantActor,
      mimetype: "image/png",
    })).toThrow(expect.objectContaining({
      statusCode: 403,
      code: "FORBIDDEN",
    }));
  });

  test("allows only the platform brand-logo prefix for platform actors", () => {
    expect(() => assertDirectObjectKeyBelongsToActor({
      objectKey: `public/brand-logo/2026/07/27/${LOGO_UUID}.png`,
      scene: "brand_logo",
      actorContext: platformActor,
      mimetype: "image/png",
    })).not.toThrow();

    expect(() => assertDirectObjectKeyBelongsToActor({
      objectKey:
        `tenants/tenant-1/brand-logo/2026/07/27/${LOGO_UUID}.png`,
      scene: "brand_logo",
      actorContext: platformActor,
      mimetype: "image/png",
    })).toThrow(expect.objectContaining({ code: "FORBIDDEN" }));
  });

  test("rejects legacy unassigned brand logo paths", () => {
    expect(() => assertDirectObjectKeyBelongsToActor({
      objectKey: "tenants/tenant-1/brand-logo/unassigned/logo.png",
      scene: "brand_logo",
      actorContext: tenantActor,
      mimetype: "image/png",
    })).toThrow(expect.objectContaining({ code: "FORBIDDEN" }));
  });

  test.each([
    ["JPEG", "image/jpeg", "jpg"],
    ["PNG", "image/png", "png"],
    ["WebP", "image/webp", "webp"],
  ])("accepts generated UUID.%s for %s", (_name, mimetype, extension) => {
    expect(() => assertDirectObjectKeyBelongsToActor({
      objectKey:
        `tenants/tenant-1/brand-logo/2026/07/27/${LOGO_UUID}.${extension}`,
      scene: "brand_logo",
      actorContext: tenantActor,
      mimetype,
    })).not.toThrow();
  });

  test.each([
    ["PNG declared as JPG", "image/png", `${LOGO_UUID}.jpg`],
    ["WebP declared as PNG", "image/webp", `${LOGO_UUID}.png`],
    ["missing extension", "image/png", LOGO_UUID],
    ["double extension", "image/png", `${LOGO_UUID}.jpg.png`],
    ["uppercase extension", "image/png", `${LOGO_UUID}.PNG`],
    [
      "uppercase UUID",
      "image/png",
      "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA.png",
    ],
  ])("rejects %s", (_name, mimetype, basename) => {
    expect(() => assertDirectObjectKeyBelongsToActor({
      objectKey: `tenants/tenant-1/brand-logo/2026/07/27/${basename}`,
      scene: "brand_logo",
      actorContext: tenantActor,
      mimetype,
    })).toThrow(expect.objectContaining({
      statusCode: 403,
      code: "FORBIDDEN",
    }));
  });
});

describe("virtual goods direct object ownership", () => {
  test.each([
    ["image/jpeg", "jpg"],
    ["image/png", "png"],
  ])("accepts a generated public %s object", (mimetype, extension) => {
    expect(() => assertDirectObjectKeyBelongsToActor({
      objectKey:
        `public/branding-virtual-goods/2026/08/02/${LOGO_UUID}.${extension}`,
      scene: "branding_virtual_goods",
      actorContext: platformActor,
      mimetype,
    })).not.toThrow();
  });

  test.each([
    ["wrong extension", "image/png", `${LOGO_UUID}.jpg`],
    ["unsupported extension", "image/png", `${LOGO_UUID}.webp`],
    ["unassigned segment", "image/png", `unassigned/${LOGO_UUID}.png`],
    ["tenant prefix", "image/png", `${LOGO_UUID}.png`, true],
  ])("rejects %s", (_name, mimetype, suffix, tenantPrefix = false) => {
    expect(() => assertDirectObjectKeyBelongsToActor({
      objectKey: tenantPrefix
        ? `tenants/tenant-1/branding-virtual-goods/2026/08/02/${suffix}`
        : `public/branding-virtual-goods/2026/08/02/${suffix}`,
      scene: "branding_virtual_goods",
      actorContext: platformActor,
      mimetype,
    })).toThrow(expect.objectContaining({
      statusCode: 403,
      code: "FORBIDDEN",
    }));
  });
});
