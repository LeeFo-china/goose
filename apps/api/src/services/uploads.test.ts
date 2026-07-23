import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { AuthContext } from "@/services/authorization";
import { Errors } from "@/errors/error-factory";

const FILE_ID = "11111111-1111-4111-8111-111111111111";
type PreviewFile = {
  id: string;
  tenant_id: string;
  scene: string;
  provider: "tencent_cos" | "supabase_storage";
  object_key: string;
};
const findActiveById = mock(async (): Promise<PreviewFile | null> => ({
  id: FILE_ID,
  tenant_id: "tenant-1",
  scene: "wechat_pay_applyment",
  provider: "tencent_cos",
  object_key: "tenants/tenant-1/wechat-pay-applyment/license.jpg",
}));
const findActiveByIdForPlatform = mock(
  async (): Promise<PreviewFile | null> => ({
    id: FILE_ID,
    tenant_id: "tenant-1",
    scene: "wechat_pay_applyment",
    provider: "tencent_cos",
    object_key: "tenants/tenant-1/wechat-pay-applyment/license.jpg",
  }),
);
const resolveSignedStoredFileUrl = mock(
  async () => "https://example.com/signed-preview.jpg",
);
const hasPermission = mock((
  authContext: AuthContext,
  permissionCode: string,
) => authContext.permissions.some((item) => item.code === permissionCode));
const assertTenantContext = mock((authContext: AuthContext) => {
  if (!authContext.tenantId) throw Errors.forbidden();
  return authContext.tenantId;
});

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
mock.module("@/services/access-policy", () => ({
  accessPolicyService: { hasPermission, assertTenantContext },
}));

function authContext(input: {
  platform?: boolean;
  tenantId?: string | null;
  permissions?: AuthContext["permissions"];
} = {}): AuthContext {
  return {
    authUserId: "auth-1",
    employeeId: input.platform ? null : "employee-1",
    tenantId: input.platform ? null : input.tenantId ?? "tenant-1",
    tenantName: null,
    tenantSlug: null,
    tenantStatus: "active",
    isPlatformAdmin: input.platform ?? false,
    employeeName: null,
    employeeStatus: "active",
    departmentId: null,
    tenantDepartmentId: null,
    departmentCode: null,
    departmentName: null,
    postId: null,
    postName: null,
    avatar: null,
    roleCodes: input.platform ? ["platform_admin"] : [],
    roles: [],
    permissions: input.permissions ?? [],
  };
}

describe("UploadService wechat pay applyment previews", () => {
  beforeEach(() => {
    findActiveById.mockClear();
    findActiveByIdForPlatform.mockClear();
    resolveSignedStoredFileUrl.mockClear();
    hasPermission.mockClear();
    assertTenantContext.mockClear();
  });

  test("rejects a platform admin without applyment read permission", async () => {
    const { uploadService } = await import("./uploads");

    await expect(uploadService.resolveWechatPayApplymentPreviewUrl({
      authContext: authContext({ platform: true }),
      fileObjectId: FILE_ID,
    })).rejects.toMatchObject({ statusCode: 403 });

    expect(findActiveByIdForPlatform).not.toHaveBeenCalled();
  });

  test("lets a platform admin with applyment read permission preview", async () => {
    const { uploadService } = await import("./uploads");

    await uploadService.resolveWechatPayApplymentPreviewUrl({
      authContext: authContext({
        platform: true,
        permissions: [{
          code: "platform.wechat_pay.applyment.read",
          scope: "all",
        }],
      }),
      fileObjectId: FILE_ID,
    });

    expect(findActiveById).not.toHaveBeenCalled();
    expect(findActiveByIdForPlatform).toHaveBeenCalledWith(FILE_ID);
  });

  test("lets a tenant read-only user preview its file", async () => {
    const { uploadService } = await import("./uploads");

    const url = await uploadService.resolveWechatPayApplymentPreviewUrl({
      authContext: authContext({
        permissions: [{ code: "wechat_pay.applyment.read", scope: "all" }],
      }),
      fileObjectId: FILE_ID,
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

  test("lets a tenant submit user preview its file", async () => {
    const { uploadService } = await import("./uploads");

    await uploadService.resolveWechatPayApplymentPreviewUrl({
      authContext: authContext({
        permissions: [{ code: "wechat_pay.applyment.submit", scope: "all" }],
      }),
      fileObjectId: FILE_ID,
    });

    expect(findActiveById).toHaveBeenCalledWith({
      id: FILE_ID,
      tenantId: "tenant-1",
    });
  });

  test("rejects a tenant without read or submit permission", async () => {
    const { uploadService } = await import("./uploads");

    await expect(uploadService.resolveWechatPayApplymentPreviewUrl({
      authContext: authContext(),
      fileObjectId: FILE_ID,
    })).rejects.toMatchObject({ statusCode: 403 });
    expect(findActiveById).not.toHaveBeenCalled();
  });

  test("rejects a file object outside the current tenant", async () => {
    findActiveById.mockImplementationOnce(async () => null);
    const { uploadService } = await import("./uploads");

    await expect(uploadService.resolveWechatPayApplymentPreviewUrl({
      authContext: authContext({
        tenantId: "other-tenant",
        permissions: [{ code: "wechat_pay.applyment.read", scope: "all" }],
      }),
      fileObjectId: FILE_ID,
    })).rejects.toMatchObject({ statusCode: 403 });
    expect(findActiveById).toHaveBeenCalledWith({
      id: FILE_ID,
      tenantId: "other-tenant",
    });
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
      authContext: authContext({
        permissions: [{ code: "wechat_pay.applyment.read", scope: "all" }],
      }),
      fileObjectId: FILE_ID,
    })).rejects.toMatchObject({ statusCode: 403 });
    expect(resolveSignedStoredFileUrl).not.toHaveBeenCalled();
  });

  test("rejects a non-COS file object", async () => {
    findActiveById.mockImplementationOnce(async () => ({
      id: FILE_ID,
      tenant_id: "tenant-1",
      scene: "wechat_pay_applyment",
      provider: "supabase_storage",
      object_key: "legacy/license.jpg",
    }));
    const { uploadService } = await import("./uploads");

    await expect(uploadService.resolveWechatPayApplymentPreviewUrl({
      authContext: authContext({
        permissions: [{ code: "wechat_pay.applyment.read", scope: "all" }],
      }),
      fileObjectId: FILE_ID,
    })).rejects.toMatchObject({ statusCode: 403 });
    expect(resolveSignedStoredFileUrl).not.toHaveBeenCalled();
  });
});
