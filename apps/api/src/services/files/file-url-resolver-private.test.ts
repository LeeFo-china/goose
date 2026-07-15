import { beforeEach, describe, expect, mock, test } from "bun:test";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

describe("private stored file URL resolver", () => {
  beforeEach(() => {
    mock.restore();
  });

  test("always signs a private COS key and clamps TTL to 600 seconds", async () => {
    const module = await import("./file-url-resolver");
    module.setPlatformCosAccessConfigCache({
      secretId: "secret-id",
      secretKey: "secret-key",
      bucket: "private-bucket-1250000000",
      region: "ap-guangzhou",
      publicBaseUrl: "https://cdn.example.com",
    });

    const url = await module.resolveSignedStoredFileUrl(
      "private/tenant-onboarding-license/visitors/hash/license.jpg",
      { ttlSeconds: 3_600 },
    );

    expect(url).toContain("license.jpg");
    expect(url).not.toBe(
      "https://cdn.example.com/private/tenant-onboarding-license/visitors/hash/license.jpg",
    );
    const query = new URL(url).searchParams;
    const start = Number(query.get("q-sign-time")?.split(";")[0]);
    const end = Number(query.get("q-sign-time")?.split(";")[1]);
    expect(end - start).toBeLessThanOrEqual(600);
  });

  test("rejects public URLs and non-platform object keys", async () => {
    const { resolveSignedStoredFileUrl } = await import("./file-url-resolver");
    await expect(resolveSignedStoredFileUrl("https://cdn.example.com/license.jpg"))
      .rejects.toMatchObject({ code: "TENANT_ONBOARDING_DOCUMENT_FORBIDDEN" });
    await expect(resolveSignedStoredFileUrl("legacy/license.jpg"))
      .rejects.toMatchObject({ code: "TENANT_ONBOARDING_DOCUMENT_FORBIDDEN" });
  });
});
