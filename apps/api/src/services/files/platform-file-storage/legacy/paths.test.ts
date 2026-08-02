import { createHash } from "node:crypto";
import { describe, expect, test } from "bun:test";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

describe("tenant onboarding license object paths", () => {
  test("uses different hashed visitor prefixes without exposing raw IDs", async () => {
    const { buildCosObjectKey } = await import("./paths");
    const firstVisitorId = "visitor-sensitive-one";
    const secondVisitorId = "visitor-sensitive-two";
    const input = {
      filename: "license.jpg",
      mimetype: "image/jpeg",
      scene: "tenant_onboarding_license" as const,
      tenantId: null,
    };

    const first = buildCosObjectKey.call({}, { ...input, visitorId: firstVisitorId });
    const second = buildCosObjectKey.call({}, { ...input, visitorId: secondVisitorId });
    const firstHash = createHash("sha256").update(firstVisitorId).digest("hex");
    const secondHash = createHash("sha256").update(secondVisitorId).digest("hex");

    expect(first).toStartWith(
      `private/tenant-onboarding-license/visitors/${firstHash}/`,
    );
    expect(second).toStartWith(
      `private/tenant-onboarding-license/visitors/${secondHash}/`,
    );
    expect(first).not.toBe(second);
    expect(first).not.toContain(firstVisitorId);
    expect(second).not.toContain(secondVisitorId);
  });

  test("derives a private license extension from MIME instead of filename", async () => {
    const { buildCosObjectKey } = await import("./paths");
    const objectKey = buildCosObjectKey.call({}, {
      filename: "deceptive.exe",
      mimetype: "image/png",
      scene: "tenant_onboarding_license",
      tenantId: null,
      visitorId: "visitor-1",
    });

    expect(objectKey).toEndWith(".png");
    expect(objectKey).not.toContain(".exe");
  });
});

describe("brand logo object paths", () => {
  test.each([
    [null, "public/brand-logo/"],
    ["tenant-1", "tenants/tenant-1/brand-logo/"],
  ] as const)("uses a scoped path without an unassigned segment", async (
    tenantId,
    prefix,
  ) => {
    const { buildCosObjectKey } = await import("./paths");
    const objectKey = buildCosObjectKey.call({}, {
      filename: "logo.png",
      mimetype: "image/png",
      scene: "brand_logo",
      tenantId,
      employeeId: "employee-1",
    });

    expect(objectKey).toStartWith(prefix);
    expect(objectKey).not.toContain("/unassigned/");
    expect(objectKey).toEndWith(".png");
  });

  test("derives the extension from MIME instead of an untrusted filename", async () => {
    const { buildCosObjectKey } = await import("./paths");
    const objectKey = buildCosObjectKey.call({}, {
      filename: "logo.exe",
      mimetype: "image/webp",
      scene: "brand_logo",
      tenantId: "tenant-1",
      employeeId: "employee-1",
    });

    expect(objectKey).toEndWith(".webp");
    expect(objectKey).not.toContain(".exe");
  });
});

describe("virtual goods image object paths", () => {
  test("uses the dedicated public prefix without an unassigned segment", async () => {
    const { buildCosObjectKey } = await import("./paths");
    const objectKey = buildCosObjectKey.call({}, {
      filename: "goods.exe",
      mimetype: "image/png",
      scene: "branding_virtual_goods",
      tenantId: null,
      employeeId: "employee-1",
    });

    expect(objectKey).toStartWith("public/branding-virtual-goods/");
    expect(objectKey).not.toContain("/unassigned/");
    expect(objectKey).toEndWith(".png");
    expect(objectKey).not.toContain(".exe");
  });
});
