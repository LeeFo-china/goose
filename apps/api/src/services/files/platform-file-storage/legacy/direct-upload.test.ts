import { beforeEach, describe, expect, mock, test } from "bun:test";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const createOrFindByObjectKey = mock(async (input: Record<string, unknown>) => ({
  id: "file-1",
  provider: "tencent_cos",
  bucket: "bucket",
  region: "ap-guangzhou",
  object_key: input.object_key,
  public_url: input.public_url,
  status: "active",
}));

mock.module("@/repositories/platform-file-objects", () => ({
  platformFileObjectRepository: { createOrFindByObjectKey },
}));

beforeEach(() => createOrFindByObjectKey.mockClear());

describe("private direct upload completion", () => {
  test("persists visitor ownership and returns no permanent URL", async () => {
    const { registerExistingCosObject } = await import("./direct-upload");
    const response = await registerExistingCosObject.call({
      getCosConfig: async () => ({
        bucket: "bucket",
        region: "ap-guangzhou",
        publicBaseUrl: "https://cdn.example.com",
      }),
      getCosClient: () => ({}),
      setCosAccessCache: () => undefined,
      buildCosPublicUrl: () => "https://cdn.example.com/private-license.jpg",
      toUploadResponse: () => ({ url: "should-not-be-returned" }),
    }, {
      scene: "tenant_onboarding_license",
      objectKey: "private/tenant-onboarding-license/visitors/hash/file.jpg",
      filename: "license.jpg",
      mimetype: "image/jpeg",
      sizeBytes: 100,
      visibility: "private",
      visitorId: "  visitor-1  ",
      tenantId: null,
      authUserId: null,
      employeeId: null,
      customerId: null,
      verifyHead: false,
    });

    expect(createOrFindByObjectKey).toHaveBeenCalledWith(expect.objectContaining({
      owner_type: "visitor",
      owner_visitor_id: "visitor-1",
      scene: "tenant_onboarding_license",
      visibility: "private",
      public_url: null,
    }));
    expect(response).toEqual({ file_id: "file-1", status: "active" });
    expect(response).not.toHaveProperty("url");
    expect(response).not.toHaveProperty("public_url");
  });
});
