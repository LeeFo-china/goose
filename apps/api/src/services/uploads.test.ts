import { beforeEach, describe, expect, mock, test } from "bun:test";

const FILE_ID = "11111111-1111-4111-8111-111111111111";
const findActiveById = mock(async () => ({
  id: FILE_ID,
  tenant_id: "tenant-1",
  scene: "wechat_pay_applyment",
  provider: "tencent_cos",
  object_key: "tenants/tenant-1/wechat-pay-applyment/license.jpg",
}));
const findActiveByIdForPlatform = mock(async () => ({
  id: FILE_ID,
  tenant_id: "tenant-1",
  scene: "wechat_pay_applyment",
  provider: "tencent_cos",
  object_key: "tenants/tenant-1/wechat-pay-applyment/license.jpg",
}));
const resolveSignedStoredFileUrl = mock(
  async () => "https://example.com/signed-preview.jpg",
);

mock.module("@/repositories/platform-file-objects", () => ({
  platformFileObjectRepository: {
    findActiveById,
    findActiveByIdForPlatform,
  },
}));
mock.module("@/services/files/file-url-resolver", () => ({
  resolveSignedStoredFileUrl,
  resolveStoredFileUrl: mock((value: string) => value),
  resolveStoredFileUrlList: mock((value: unknown) => value),
  refreshPlatformCosPublicBaseUrlCache: mock(async () => undefined),
  setPlatformCosAccessConfigCache: mock(() => undefined),
  setPlatformCosPublicBaseUrlCache: mock(() => undefined),
}));
mock.module("@/repositories/uploads", () => ({
  uploadRepository: {
    findDefaultActiveCustomerMembership: mock(async () => null),
    findLegacyCustomerBinding: mock(async () => null),
  },
}));

describe("UploadService wechat pay applyment previews", () => {
  beforeEach(() => {
    findActiveById.mockClear();
    findActiveByIdForPlatform.mockClear();
    resolveSignedStoredFileUrl.mockClear();
  });

  test("lets a platform preview resolve by id without a tenant filter", async () => {
    const { uploadService } = await import("./uploads");

    await uploadService.resolveWechatPayApplymentPreviewUrl({
      fileObjectId: FILE_ID,
      tenantId: null,
    });

    expect(findActiveById).not.toHaveBeenCalled();
    expect(findActiveByIdForPlatform).toHaveBeenCalledWith(FILE_ID);
  });

  test("signs the verified tenant file object for a short preview", async () => {
    const { uploadService } = await import("./uploads");

    const url = await uploadService.resolveWechatPayApplymentPreviewUrl({
      fileObjectId: FILE_ID,
      tenantId: "tenant-1",
    });

    expect(findActiveById).toHaveBeenCalledWith({
      id: FILE_ID,
      tenantId: "tenant-1",
    });
    expect(resolveSignedStoredFileUrl).toHaveBeenCalledWith(
      "tenants/tenant-1/wechat-pay-applyment/license.jpg",
      { ttlSeconds: 600 },
    );
    expect(url).toBe("https://example.com/signed-preview.jpg");
  });

  test("rejects a file object from another upload scene", async () => {
    findActiveById.mockImplementationOnce(async () => ({
      id: FILE_ID,
      tenant_id: "tenant-1",
      scene: "employee_avatar",
      provider: "tencent_cos",
      object_key: "tenants/tenant-1/employee-avatar/avatar.jpg",
    }));
    const { uploadService } = await import("./uploads");

    await expect(uploadService.resolveWechatPayApplymentPreviewUrl({
      fileObjectId: FILE_ID,
      tenantId: "tenant-1",
    })).rejects.toMatchObject({ statusCode: 403 });
    expect(resolveSignedStoredFileUrl).not.toHaveBeenCalled();
  });
});
