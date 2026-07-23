import { createHash } from "node:crypto";
import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { FastifyRequest } from "fastify";
import type { AuthContext } from "@/services/authorization";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const projectId = "2d710a84-1045-4750-8dfd-51a0f463a4db";
const tenantId = "tenant-1";
const employeeId = "employee-1";
const authUserId = "auth-1";
const visitorId = "visitor-1";
const otherVisitorId = "visitor-2";

const createDirectUpload = mock(async () => ({
  provider: "tencent_cos",
  bucket: "bucket",
  region: "ap-guangzhou",
  object_key: `tenants/${tenantId}/project-payment/projects/${projectId}/2026/06/16/file.jpg`,
  storage_path: `tenants/${tenantId}/project-payment/projects/${projectId}/2026/06/16/file.jpg`,
  upload_url: "https://example.com/upload",
  method: "PUT",
  headers: {
    "content-type": "image/jpeg",
  },
  expires_in: 600,
  expires_at: "2026-06-16T10:10:00.000Z",
}));

type CompleteUploadResult = {
  provider: string;
  bucket: string;
  region: string;
  object_key: string;
  storage_path: string;
  url: string;
} | {
  file_id: string;
  status: string;
};

const completeDirectUpload = mock(async (): Promise<CompleteUploadResult> => ({
  provider: "tencent_cos",
  bucket: "bucket",
  region: "ap-guangzhou",
  object_key: `tenants/${tenantId}/project-payment/projects/${projectId}/2026/06/16/file.jpg`,
  storage_path: `tenants/${tenantId}/project-payment/projects/${projectId}/2026/06/16/file.jpg`,
  url: "https://example.com/file.jpg",
}));

const getRequiredAuthContext = mock(async (): Promise<AuthContext> => ({
  authUserId,
  employeeId,
  tenantId,
  tenantName: null,
  tenantSlug: null,
  tenantStatus: "active",
  isPlatformAdmin: false,
  employeeName: "财务",
  employeeStatus: "active",
  departmentId: null,
  tenantDepartmentId: null,
  departmentCode: "FINANCE",
  departmentName: "财务部",
  postId: null,
  postName: null,
  avatar: null,
  roleCodes: [],
  roles: [],
  permissions: [{ code: "finance.payment.confirm", scope: "all" }],
}));

const canAccessProject = mock(async () => true);
const logUploadTiming = mock(() => undefined);
const resolveStoredFileUrl = mock(() => "https://example.com/resolved.jpg");
const assertDirectUploadAccess = mock(() => undefined);

mock.module("@/services/files/platform-file-storage", () => ({
  platformFileStorageService: {
    createDirectUpload,
    completeDirectUpload,
  },
  buildTenantOnboardingLicenseVisitorPrefix: (value: string) => {
    const hash = createHash("sha256").update(value.trim()).digest("hex");
    return `private/tenant-onboarding-license/visitors/${hash}/`;
  },
}));

mock.module("@/services/authorization", () => ({
  authorizationService: {
    getRequiredAuthContext,
  },
}));

mock.module("@/services/access-policy", () => ({
  accessPolicyService: {
    canAccessProject,
    canWriteProjectLog: mock(async () => false),
    getScope: mock((
      authContext: { permissions?: Array<{ code: string; scope: string }> },
      permissionCode: string,
    ) =>
      authContext.permissions?.find((permission) =>
        permission.code === permissionCode
      )?.scope ?? null
    ),
  },
}));

mock.module("@/services/uploads", () => ({
  uploadService: {
    findDefaultActiveCustomerMembership: mock(async () => null),
    findLegacyCustomerBinding: mock(async () => null),
    assertDirectUploadAccess,
  },
}));

mock.module("@/utils/upload-timing-logger", () => ({
  logUploadTiming,
}));

mock.module("@/services/files/file-url-resolver", () => ({
  resolveStoredFileUrl,
  resolveStoredFileUrlList: mock((value: unknown) => value),
  refreshPlatformCosPublicBaseUrlCache: mock(async () => undefined),
  setPlatformCosAccessConfigCache: mock(() => undefined),
  setPlatformCosPublicBaseUrlCache: mock(() => undefined),
}));

beforeEach(() => {
  createDirectUpload.mockClear();
  completeDirectUpload.mockClear();
  getRequiredAuthContext.mockClear();
  canAccessProject.mockClear();
  canAccessProject.mockImplementation(async () => true);
  logUploadTiming.mockClear();
  resolveStoredFileUrl.mockClear();
  assertDirectUploadAccess.mockClear();
});

const buildRequest = (body: Record<string, unknown>): FastifyRequest =>
  ({
    body,
    user: {
      sub: authUserId,
      tenant_id: tenantId,
      employee_id: employeeId,
    },
    id: "req-test",
  }) as FastifyRequest;

const applymentUploadBody = {
  scene: "wechat_pay_applyment", filename: "license.jpg",
  mimetype: "image/jpeg", size_bytes: 120000,
};
const denyApplymentUpload = () => {
  assertDirectUploadAccess.mockImplementationOnce(() => {
    throw Object.assign(new Error("forbidden"), {
      statusCode: 403, code: "FORBIDDEN",
    });
  });
};
const buildVisitorRequest = (
  body: Record<string, unknown>,
  currentVisitorId = visitorId,
): FastifyRequest =>
  ({
    body,
    query: {},
    user: {
      token_type: "visitor_session",
      visitor_id: currentVisitorId,
    },
    id: "req-visitor-test",
  }) as FastifyRequest;
describe("UploadController project payment direct upload", () => {
  test("rejects read-only applyment upload init before creating an upload", async () => {
    denyApplymentUpload();
    const { default: controller } = await import("./index");
    await expect(controller.initDirectCosUpload(
      buildRequest(applymentUploadBody),
      {} as never,
    )).rejects.toMatchObject({ statusCode: 403 });
    expect(createDirectUpload).not.toHaveBeenCalled();
  });
  test("rejects read-only applyment upload completion before creating a file object", async () => {
    denyApplymentUpload();
    const { default: controller } = await import("./index");
    await expect(controller.completeDirectCosUpload(
      buildRequest({
        ...applymentUploadBody,
        object_key: `tenants/${tenantId}/wechat-pay-applyment/license.jpg`,
      }),
      {} as never,
    )).rejects.toMatchObject({ statusCode: 403 });
    expect(completeDirectUpload).not.toHaveBeenCalled();
  });
  test("allows tenant wechat pay applyment material upload without project id", async () => {
    const { default: controller } = await import("./index");

    await controller.initDirectCosUpload(
      buildRequest(applymentUploadBody),
      {} as never,
    );

    expect(canAccessProject).not.toHaveBeenCalled();
    expect(assertDirectUploadAccess).toHaveBeenCalledWith(expect.objectContaining({
      scene: "wechat_pay_applyment",
    }));
    expect(createDirectUpload).toHaveBeenCalledWith(
      expect.objectContaining({
        scene: "wechat_pay_applyment",
        projectId: undefined,
        tenantId,
        employeeId,
        visibility: "private",
      }),
    );
  });
  test("allows finance project payment direct upload init", async () => {
    const { default: controller } = await import("./index");

    const response = await controller.initDirectCosUpload(
      buildRequest({
        scene: "project_payment",
        project_id: projectId,
        filename: "payment.jpg",
        mimetype: "image/jpeg",
        size_bytes: 120000,
      }),
      {} as never,
    );

    expect(canAccessProject).toHaveBeenCalledWith(
      expect.objectContaining({
        employeeId,
        permissions: [{ code: "finance.payment.confirm", scope: "all" }],
      }),
      projectId,
      "finance.payment.confirm",
    );
    expect(createDirectUpload).toHaveBeenCalledWith(
      expect.objectContaining({
        scene: "project_payment",
        projectId,
        tenantId,
        employeeId,
      }),
    );
    expect(response.data).toMatchObject({
      object_key: expect.stringContaining(`/project-payment/projects/${projectId}/`),
      upload_url: "https://example.com/upload",
    });
  });

  test("allows finance project payment direct upload complete", async () => {
    const objectKey =
      `tenants/${tenantId}/project-payment/projects/${projectId}/2026/06/16/file.jpg`;
    const { default: controller } = await import("./index");

    const response = await controller.completeDirectCosUpload(
      buildRequest({
        scene: "project_payment",
        project_id: projectId,
        filename: "payment.jpg",
        mimetype: "image/jpeg",
        size_bytes: 120000,
        object_key: objectKey,
        etag: "etag-1",
      }),
      {} as never,
    );

    expect(completeDirectUpload).toHaveBeenCalledWith(
      expect.objectContaining({
        scene: "project_payment",
        projectId,
        objectKey,
        tenantId,
        employeeId,
      }),
    );
    expect(response.data).toMatchObject({
      object_key: objectKey,
    });
  });

  test("requires project id for project payment direct upload", async () => {
    const { default: controller } = await import("./index");

    await expect(
      controller.initDirectCosUpload(
        buildRequest({
          scene: "project_payment",
          filename: "payment.jpg",
          mimetype: "image/jpeg",
          size_bytes: 120000,
        }),
        {} as never,
      ),
    ).rejects.toMatchObject({
      statusCode: 400,
      code: "VALIDATION_ERROR",
      message: "缺少项目ID",
    });
  });

  test("rejects project payment upload without finance confirm access", async () => {
    canAccessProject.mockImplementationOnce(async () => false);
    const { default: controller } = await import("./index");

    await expect(
      controller.initDirectCosUpload(
        buildRequest({
          scene: "project_payment",
          project_id: projectId,
          filename: "payment.jpg",
          mimetype: "image/jpeg",
          size_bytes: 120000,
        }),
        {} as never,
      ),
    ).rejects.toMatchObject({
      statusCode: 403,
      code: "FORBIDDEN",
    });
  });
});

describe("UploadController tenant onboarding license direct upload", () => {
  test("allows visitor license init as a private upload", async () => {
    const { default: controller } = await import("./index");

    await controller.initDirectCosUpload(
      buildVisitorRequest({
        scene: "tenant_onboarding_license",
        filename: "license.jpg",
        mimetype: "image/jpeg",
        size_bytes: 5 * 1024 * 1024,
      }),
      {} as never,
    );

    expect(createDirectUpload).toHaveBeenCalledWith(expect.objectContaining({
      scene: "tenant_onboarding_license",
      tenantId: null,
      visitorId,
      visibility: "private",
    }));
  });

  test("normalizes visitor ownership before creating a private upload", async () => {
    const { default: controller } = await import("./index");

    await controller.initDirectCosUpload(
      buildVisitorRequest({
        scene: "tenant_onboarding_license",
        filename: "license.jpg",
        mimetype: "image/jpeg",
        size_bytes: 100,
      }, `  ${visitorId}  `),
      {} as never,
    );

    expect(createDirectUpload).toHaveBeenCalledWith(expect.objectContaining({
      visitorId,
    }));
  });

  test("rejects another upload scene for a visitor", async () => {
    const { default: controller } = await import("./index");

    await expect(controller.initDirectCosUpload(
      buildVisitorRequest({
        scene: "project_payment",
        project_id: projectId,
        filename: "payment.jpg",
        mimetype: "image/jpeg",
        size_bytes: 100,
      }),
      {} as never,
    )).rejects.toMatchObject({ statusCode: 403 });
  });

  test("rejects the private license scene for tenant identities", async () => {
    const { default: controller } = await import("./index");

    await expect(controller.initDirectCosUpload(
      buildRequest({
        scene: "tenant_onboarding_license",
        filename: "license.jpg",
        mimetype: "image/jpeg",
        size_bytes: 100,
      }),
      {} as never,
    )).rejects.toMatchObject({ statusCode: 403, code: "FORBIDDEN" });
  });

  test("rejects a license larger than 5 MB", async () => {
    const { default: controller } = await import("./index");

    await expect(controller.initDirectCosUpload(
      buildVisitorRequest({
        scene: "tenant_onboarding_license",
        filename: "license.jpg",
        mimetype: "image/jpeg",
        size_bytes: 5 * 1024 * 1024 + 1,
      }),
      {} as never,
    )).rejects.toMatchObject({ statusCode: 400 });
  });

  test("completes only the current visitor private object", async () => {
    const ownerHash = createHash("sha256").update(visitorId).digest("hex");
    const objectKey = `private/tenant-onboarding-license/visitors/${ownerHash}/2026/07/14/file.jpg`;
    completeDirectUpload.mockImplementationOnce(async () => ({
      file_id: "00000000-0000-4000-8000-000000000003",
      status: "active",
    }));
    const { default: controller } = await import("./index");

    const response = await controller.completeDirectCosUpload(
      buildVisitorRequest({
        scene: "tenant_onboarding_license",
        filename: "license.jpg",
        mimetype: "image/jpeg",
        size_bytes: 100,
        object_key: objectKey,
        upload_intent: "v1.private-upload-intent.signature",
      }),
      {} as never,
    );

    expect(completeDirectUpload).toHaveBeenCalledWith(expect.objectContaining({
      scene: "tenant_onboarding_license",
      objectKey,
      visitorId,
      visibility: "private",
      uploadIntent: "v1.private-upload-intent.signature",
    }));
    expect(response.data).toEqual({
      file_id: "00000000-0000-4000-8000-000000000003",
      status: "active",
    });
    expect(response.data).not.toHaveProperty("public_url");
    expect(response.data).not.toHaveProperty("url");
  });

  test("requires an upload intent to complete a private license", async () => {
    const ownerHash = createHash("sha256").update(visitorId).digest("hex");
    const objectKey = `private/tenant-onboarding-license/visitors/${ownerHash}/file.jpg`;
    const { default: controller } = await import("./index");

    await expect(controller.completeDirectCosUpload(
      buildVisitorRequest({
        scene: "tenant_onboarding_license",
        filename: "license.jpg",
        mimetype: "image/jpeg",
        size_bytes: 100,
        object_key: objectKey,
      }),
      {} as never,
    )).rejects.toMatchObject({ statusCode: 400, code: "VALIDATION_ERROR" });
    expect(completeDirectUpload).not.toHaveBeenCalled();
  });

  test("prevents another visitor from completing the owner's object key", async () => {
    const ownerHash = createHash("sha256").update(visitorId).digest("hex");
    const objectKey = `private/tenant-onboarding-license/visitors/${ownerHash}/2026/07/14/file.jpg`;
    const { default: controller } = await import("./index");

    await expect(controller.completeDirectCosUpload(
      buildVisitorRequest({
        scene: "tenant_onboarding_license",
        filename: "license.jpg",
        mimetype: "image/jpeg",
        size_bytes: 100,
        object_key: objectKey,
        upload_intent: "v1.private-upload-intent.signature",
      }, otherVisitorId),
      {} as never,
    )).rejects.toMatchObject({ statusCode: 403, code: "FORBIDDEN" });
    expect(completeDirectUpload).not.toHaveBeenCalled();
  });

  test("rejects private license objects before resolving a public URL", async () => {
    const ownerHash = createHash("sha256").update(visitorId).digest("hex");
    const path = `private/tenant-onboarding-license/visitors/${ownerHash}/file.jpg`;
    const { default: controller } = await import("./index");

    await expect(controller.getPublicUrl({
      ...buildVisitorRequest({}, visitorId),
      query: { path },
    } as FastifyRequest, {} as never)).rejects.toMatchObject({ statusCode: 403 });
    expect(resolveStoredFileUrl).not.toHaveBeenCalled();
  });
});
