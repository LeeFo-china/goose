import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { FastifyRequest } from "fastify";
import type { AuthContext } from "@/services/authorization";

const projectId = "2d710a84-1045-4750-8dfd-51a0f463a4db";
const tenantId = "tenant-1";
const employeeId = "employee-1";
const authUserId = "auth-1";

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

const completeDirectUpload = mock(async () => ({
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

mock.module("@/services/files/platform-file-storage", () => ({
  platformFileStorageService: {
    createDirectUpload,
    completeDirectUpload,
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
  },
}));

mock.module("@/utils/upload-timing-logger", () => ({
  logUploadTiming,
}));

beforeEach(() => {
  createDirectUpload.mockClear();
  completeDirectUpload.mockClear();
  getRequiredAuthContext.mockClear();
  canAccessProject.mockClear();
  canAccessProject.mockImplementation(async () => true);
  logUploadTiming.mockClear();
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

describe("UploadController project payment direct upload", () => {
  test("allows tenant wechat pay applyment material upload without project id", async () => {
    const { default: controller } = await import("./index");

    await controller.initDirectCosUpload(
      buildRequest({
        scene: "wechat_pay_applyment",
        filename: "license.jpg",
        mimetype: "image/jpeg",
        size_bytes: 120000,
      }),
      {} as never,
    );

    expect(canAccessProject).not.toHaveBeenCalled();
    expect(createDirectUpload).toHaveBeenCalledWith(
      expect.objectContaining({
        scene: "wechat_pay_applyment",
        projectId: undefined,
        tenantId,
        employeeId,
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
