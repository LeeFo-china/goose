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
});
