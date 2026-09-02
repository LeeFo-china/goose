import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  spyOn,
  test,
} from "bun:test";
import type { AuthContext } from "@/services/authorization";
import { Errors } from "@/errors/error-factory";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const FILE_ID = "11111111-1111-4111-8111-111111111111";

async function installSpies() {
  const { platformFileObjectRepository } = await import(
    "@/repositories/platform-file-objects"
  );
  const attachmentRepository = await import(
    "@/repositories/wechat-pay-applyment-attachment-repository"
  );
  const { accessPolicyService } = await import("@/services/access-policy");
  const fileUrlResolver = await import("@/services/files/file-url-resolver");
  const findActiveById = spyOn(
    platformFileObjectRepository,
    "findActiveById",
  ).mockImplementation(async () => ({
    id: FILE_ID,
    tenant_id: "tenant-1",
    scene: "wechat_pay_applyment",
    provider: "tencent_cos",
    object_key: "tenants/tenant-1/wechat-pay-applyment/license.jpg",
    created_by_employee_id: "employee-1",
  }) as never);
  const findActiveByIdForPlatform = spyOn(
    platformFileObjectRepository,
    "findActiveByIdForPlatform",
  ).mockImplementation(
    async () => ({
      id: FILE_ID,
      tenant_id: "tenant-1",
      scene: "wechat_pay_applyment",
      provider: "tencent_cos",
      object_key: "tenants/tenant-1/wechat-pay-applyment/license.jpg",
      created_by_employee_id: "employee-1",
    }) as never,
  );
  const findAttachmentOwnerByFileObjectId = spyOn(
    attachmentRepository,
    "findWechatPayApplymentAttachmentOwner",
  ).mockImplementation(async () => ({
    id: "applyment-1",
    tenant_id: "tenant-1",
    status: "draft",
  }) as never);
  const resolveSignedStoredFileUrl = spyOn(
    fileUrlResolver,
    "resolveSignedStoredFileUrl",
  ).mockImplementation(
    async () => "https://example.com/signed-preview.jpg",
  );
  const resolveStoredFileUrl = spyOn(
    fileUrlResolver,
    "resolveStoredFileUrl",
  ).mockImplementation(
    () => "https://example.com/public-preview.jpg",
  );
  const hasPermission = spyOn(
    accessPolicyService,
    "hasPermission",
  ).mockImplementation((
    authContext: AuthContext,
    permissionCode: string,
  ) => authContext.permissions.some((item) => item.code === permissionCode));
  const assertTenantContext = spyOn(
    accessPolicyService,
    "assertTenantContext",
  ).mockImplementation((authContext: AuthContext) => {
    if (!authContext.tenantId) throw Errors.forbidden();
    return authContext.tenantId;
  });
  return {
    assertTenantContext,
    findActiveById,
    findActiveByIdForPlatform,
    findAttachmentOwnerByFileObjectId,
    hasPermission,
    resolveSignedStoredFileUrl,
    resolveStoredFileUrl,
  };
}

let spies: Awaited<ReturnType<typeof installSpies>>;

beforeAll(async () => {
  spies = await installSpies();
});

afterAll(() => {
  spies.assertTenantContext.mockRestore();
  spies.findActiveById.mockRestore();
  spies.findActiveByIdForPlatform.mockRestore();
  spies.findAttachmentOwnerByFileObjectId.mockRestore();
  spies.hasPermission.mockRestore();
  spies.resolveSignedStoredFileUrl.mockRestore();
  spies.resolveStoredFileUrl.mockRestore();
});

function authContext(input: {
  employeeId?: string | null;
  platform?: boolean;
  tenantId?: string | null;
  permissions?: AuthContext["permissions"];
} = {}): AuthContext {
  return {
    authUserId: "auth-1",
    employeeId: input.platform ? null : input.employeeId ?? "employee-1",
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
    spies.findActiveById.mockClear();
    spies.findActiveByIdForPlatform.mockClear();
    spies.findAttachmentOwnerByFileObjectId.mockClear();
    spies.resolveSignedStoredFileUrl.mockClear();
    spies.resolveStoredFileUrl.mockClear();
    spies.hasPermission.mockClear();
    spies.assertTenantContext.mockClear();
  });

  test("rejects a platform admin without applyment read permission", async () => {
    const { uploadService } = await import("./uploads");

    await expect(uploadService.resolveWechatPayApplymentPreviewUrl({
      authContext: authContext({ platform: true }),
      fileObjectId: FILE_ID,
    })).rejects.toMatchObject({ statusCode: 403 });

    expect(spies.findActiveByIdForPlatform).not.toHaveBeenCalled();
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

    expect(spies.findActiveById).not.toHaveBeenCalled();
    expect(spies.findActiveByIdForPlatform).toHaveBeenCalledWith(FILE_ID);
  });

  test("lets a tenant read-only user preview its file", async () => {
    const { uploadService } = await import("./uploads");

    const url = await uploadService.resolveWechatPayApplymentPreviewUrl({
      authContext: authContext({
        permissions: [{ code: "wechat_pay.applyment.read", scope: "all" }],
      }),
      fileObjectId: FILE_ID,
    });

    expect(spies.findActiveById).toHaveBeenCalledWith({
      id: FILE_ID,
      tenantId: "tenant-1",
    });
    expect(spies.resolveSignedStoredFileUrl).toHaveBeenCalledWith(
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

    expect(spies.findActiveById).toHaveBeenCalledWith({
      id: FILE_ID,
      tenantId: "tenant-1",
    });
  });

  test("rejects an unbound file for a platform reviewer", async () => {
    spies.findAttachmentOwnerByFileObjectId.mockImplementationOnce(
      async () => null,
    );
    const { uploadService } = await import("./uploads");

    await expect(uploadService.resolveWechatPayApplymentPreviewUrl({
      authContext: authContext({
        platform: true,
        permissions: [{
          code: "platform.wechat_pay.applyment.read",
          scope: "all",
        }],
      }),
      fileObjectId: FILE_ID,
    })).rejects.toMatchObject({ statusCode: 403 });
  });

  test("lets only the uploader with submit permission preview an unbound file", async () => {
    spies.findAttachmentOwnerByFileObjectId.mockImplementationOnce(
      async () => null,
    );
    const { uploadService } = await import("./uploads");

    await uploadService.resolveWechatPayApplymentPreviewUrl({
      authContext: authContext({
        permissions: [{ code: "wechat_pay.applyment.submit", scope: "all" }],
      }),
      fileObjectId: FILE_ID,
    });

    spies.findAttachmentOwnerByFileObjectId.mockImplementationOnce(
      async () => null,
    );
    await expect(uploadService.resolveWechatPayApplymentPreviewUrl({
      authContext: authContext({
        employeeId: "employee-2",
        permissions: [{ code: "wechat_pay.applyment.submit", scope: "all" }],
      }),
      fileObjectId: FILE_ID,
    })).rejects.toMatchObject({ statusCode: 403 });
  });

  test("rejects an unbound file for a tenant read-only user", async () => {
    spies.findAttachmentOwnerByFileObjectId.mockImplementationOnce(
      async () => null,
    );
    const { uploadService } = await import("./uploads");

    await expect(uploadService.resolveWechatPayApplymentPreviewUrl({
      authContext: authContext({
        permissions: [{ code: "wechat_pay.applyment.read", scope: "all" }],
      }),
      fileObjectId: FILE_ID,
    })).rejects.toMatchObject({ statusCode: 403 });
  });

  test("rejects a tenant without read or submit permission", async () => {
    const { uploadService } = await import("./uploads");

    await expect(uploadService.resolveWechatPayApplymentPreviewUrl({
      authContext: authContext(),
      fileObjectId: FILE_ID,
    })).rejects.toMatchObject({ statusCode: 403 });
    expect(spies.findActiveById).not.toHaveBeenCalled();
  });

  test("rejects a file object outside the current tenant", async () => {
    spies.findActiveById.mockImplementationOnce(async () => null);
    const { uploadService } = await import("./uploads");

    await expect(uploadService.resolveWechatPayApplymentPreviewUrl({
      authContext: authContext({
        tenantId: "other-tenant",
        permissions: [{ code: "wechat_pay.applyment.read", scope: "all" }],
      }),
      fileObjectId: FILE_ID,
    })).rejects.toMatchObject({ statusCode: 403 });
    expect(spies.findActiveById).toHaveBeenCalledWith({
      id: FILE_ID,
      tenantId: "other-tenant",
    });
  });

  test("rejects a file object from another upload scene", async () => {
    spies.findActiveById.mockImplementationOnce(async () => ({
      id: FILE_ID,
      tenant_id: "tenant-1",
      scene: "employee_avatar",
      provider: "tencent_cos",
      object_key: "tenants/tenant-1/employee-avatar/avatar.jpg",
    }) as never);
    const { uploadService } = await import("./uploads");

    await expect(uploadService.resolveWechatPayApplymentPreviewUrl({
      authContext: authContext({
        permissions: [{ code: "wechat_pay.applyment.read", scope: "all" }],
      }),
      fileObjectId: FILE_ID,
    })).rejects.toMatchObject({ statusCode: 403 });
    expect(spies.resolveSignedStoredFileUrl).not.toHaveBeenCalled();
  });

  test("rejects a non-COS file object", async () => {
    spies.findActiveById.mockImplementationOnce(async () => ({
      id: FILE_ID,
      tenant_id: "tenant-1",
      scene: "wechat_pay_applyment",
      provider: "supabase_storage",
      object_key: "legacy/license.jpg",
    }) as never);
    const { uploadService } = await import("./uploads");

    await expect(uploadService.resolveWechatPayApplymentPreviewUrl({
      authContext: authContext({
        permissions: [{ code: "wechat_pay.applyment.read", scope: "all" }],
      }),
      fileObjectId: FILE_ID,
    })).rejects.toMatchObject({ statusCode: 403 });
    expect(spies.resolveSignedStoredFileUrl).not.toHaveBeenCalled();
  });
});

describe("UploadService public stored file previews", () => {
  beforeEach(() => {
    spies.findActiveById.mockClear();
    spies.findActiveByIdForPlatform.mockClear();
    spies.resolveStoredFileUrl.mockClear();
  });

  test("resolves tenant-scoped public file IDs through the stored object URL resolver", async () => {
    spies.findActiveById.mockImplementationOnce(async () => ({
      id: FILE_ID,
      tenant_id: "tenant-1",
      scene: "picture_library",
      provider: "tencent_cos",
      object_key: "tenants/tenant-1/picture-library/body.jpg",
      visibility: "public",
      status: "active",
      deleted_at: null,
    }) as never);
    const { uploadService } = await import("./uploads");

    const url = await uploadService.resolvePublicStoredFileUrlById({
      fileObjectId: FILE_ID,
      tenantId: "tenant-1",
      isPlatformIdentity: false,
    });

    expect(spies.findActiveById).toHaveBeenCalledWith({
      id: FILE_ID,
      tenantId: "tenant-1",
    });
    expect(spies.findActiveByIdForPlatform).not.toHaveBeenCalled();
    expect(spies.resolveStoredFileUrl).toHaveBeenCalledWith(
      "tenants/tenant-1/picture-library/body.jpg",
    );
    expect(url).toBe("https://example.com/public-preview.jpg");
  });

  test("rejects missing tenant context or private files before resolving a URL", async () => {
    const { uploadService } = await import("./uploads");

    await expect(uploadService.resolvePublicStoredFileUrlById({
      fileObjectId: FILE_ID,
      tenantId: null,
      isPlatformIdentity: false,
    })).rejects.toMatchObject({ statusCode: 403 });
    expect(spies.findActiveById).not.toHaveBeenCalled();

    spies.findActiveById.mockImplementationOnce(async () => ({
      id: FILE_ID,
      tenant_id: "tenant-1",
      scene: "wechat_pay_applyment",
      provider: "tencent_cos",
      object_key: "tenants/tenant-1/wechat-pay-applyment/license.jpg",
      visibility: "private",
      status: "active",
      deleted_at: null,
    }) as never);

    await expect(uploadService.resolvePublicStoredFileUrlById({
      fileObjectId: FILE_ID,
      tenantId: "tenant-1",
      isPlatformIdentity: false,
    })).rejects.toMatchObject({ statusCode: 403 });
    expect(spies.resolveStoredFileUrl).not.toHaveBeenCalled();
  });
});

describe("UploadService direct upload access", () => {
  test("rejects a read-only tenant for wechat pay applyment uploads", async () => {
    const { uploadService } = await import("./uploads");

    expect(() => uploadService.assertDirectUploadAccess({
      authContext: authContext({
        permissions: [{ code: "wechat_pay.applyment.read", scope: "all" }],
      }),
      scene: "wechat_pay_applyment",
    })).toThrow(expect.objectContaining({ statusCode: 403 }));
  });

  test("allows a submit-capable tenant for wechat pay applyment uploads", async () => {
    const { uploadService } = await import("./uploads");

    expect(() => uploadService.assertDirectUploadAccess({
      authContext: authContext({
        permissions: [{ code: "wechat_pay.applyment.submit", scope: "all" }],
      }),
      scene: "wechat_pay_applyment",
    })).not.toThrow();
  });

  test("does not change access semantics for other upload scenes", async () => {
    const { uploadService } = await import("./uploads");

    expect(() => uploadService.assertDirectUploadAccess({
      authContext: authContext(),
      scene: "project_payment",
    })).not.toThrow();
  });
});
