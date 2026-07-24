import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { FastifyRequest } from "fastify";

const FILE_ID = "11111111-1111-4111-8111-111111111111";
const signedUrl = "https://example.com/private-supplier-license.jpg?sign=1";
type SupplierLicensePreviewFixture = {
  id: string;
  tenant_id: string | null;
  owner_type: string;
  owner_id: string | null;
  scene: string;
  provider: string;
  object_key: string;
  mime_type: string;
  size_bytes: number;
  checksum: string | null;
  visibility: string;
  status: string;
  deleted_at: string | null;
  created_by_employee_id: string | null;
};

const supplierLicenseFile: SupplierLicensePreviewFixture = {
  id: FILE_ID,
  tenant_id: null,
  owner_type: "supplier_business_license",
  owner_id: null,
  scene: "supplier_business_license",
  provider: "tencent_cos",
  object_key: "private/supplier-business-license/employees/hash/file.jpg",
  mime_type: "image/jpeg",
  size_bytes: 100,
  checksum: "checksum-1",
  visibility: "private",
  status: "active",
  deleted_at: null,
  created_by_employee_id: "platform-employee-1",
};

const findSupplierBusinessLicensePreviewById = mock(
  async (): Promise<SupplierLicensePreviewFixture | null> => supplierLicenseFile,
);
const resolveSignedStoredFileUrl = mock(async () => signedUrl);
const getRequiredAuthContext = mock(async () => ({
  authUserId: "platform-auth-1",
  employeeId: "platform-employee-1",
  tenantId: null,
  isPlatformAdmin: true,
  permissions: [{ code: "platform.supplier.manage", scope: "all" }],
}));

mock.module("@/repositories/platform-file-objects", () => ({
  platformFileObjectRepository: { findSupplierBusinessLicensePreviewById },
}));
mock.module("@/services/files/file-url-resolver", () => ({
  resolveSignedStoredFileUrl,
  resolveOcrStoredFileUrl: mock(async () => signedUrl),
}));
mock.module("@/services/authorization", () => ({
  authorizationService: { getRequiredAuthContext },
}));
mock.module("@/services/access-policy", () => ({
  accessPolicyService: {
    assertPermission: mock((
      authContext: { permissions?: Array<{ code: string; scope: string }> },
      permissionCode: string,
    ) => {
      const scope = authContext.permissions?.find((item) =>
        item.code === permissionCode
      )?.scope;
      if (!scope) {
        throw Object.assign(new Error("forbidden"), {
          statusCode: 403,
          code: "FORBIDDEN",
        });
      }
      return scope;
    }),
  },
}));

beforeEach(() => {
  findSupplierBusinessLicensePreviewById.mockClear();
  findSupplierBusinessLicensePreviewById.mockImplementation(
    async () => supplierLicenseFile,
  );
  resolveSignedStoredFileUrl.mockClear();
  resolveSignedStoredFileUrl.mockImplementation(async () => signedUrl);
  getRequiredAuthContext.mockClear();
  getRequiredAuthContext.mockImplementation(async () => ({
    authUserId: "platform-auth-1",
    employeeId: "platform-employee-1",
    tenantId: null,
    isPlatformAdmin: true,
    permissions: [{ code: "platform.supplier.manage", scope: "all" }],
  }));
});

function request(id = FILE_ID): FastifyRequest {
  return {
    params: { id },
    user: { sub: "platform-auth-1" },
  } as FastifyRequest;
}

function reply() {
  return {
    header: mock(() => undefined),
    redirect: mock(() => undefined),
  };
}

describe("PlatformUploadPreviewController", () => {
  test("redirects the creating platform employee to a short signed supplier license preview", async () => {
    const { default: controller } = await import("./index");
    const response = reply();

    await controller.getSupplierBusinessLicensePreview(request(), response as never);

    expect(findSupplierBusinessLicensePreviewById).toHaveBeenCalledWith(FILE_ID);
    expect(resolveSignedStoredFileUrl).toHaveBeenCalledWith(
      supplierLicenseFile.object_key,
      { ttlSeconds: 600 },
    );
    expect(response.redirect).toHaveBeenCalledWith(signedUrl);
    expect(response.header).toHaveBeenCalledWith(
      "Cache-Control",
      "private, no-store",
    );
    expect(response.header).toHaveBeenCalledWith("Pragma", "no-cache");
    expect(response.header).toHaveBeenCalledWith(
      "Referrer-Policy",
      "no-referrer",
    );
  });

  test("rejects another employee guessing an unbound supplier license id", async () => {
    getRequiredAuthContext.mockImplementationOnce(async () => ({
      authUserId: "platform-auth-2",
      employeeId: "platform-employee-2",
      tenantId: null,
      isPlatformAdmin: true,
      permissions: [{ code: "platform.supplier.manage", scope: "all" }],
    }));
    const { default: controller } = await import("./index");

    await expect(controller.getSupplierBusinessLicensePreview(
      request(),
      reply() as never,
    )).rejects.toMatchObject({ statusCode: 403 });
    expect(resolveSignedStoredFileUrl).not.toHaveBeenCalled();
  });

  test("allows supplier viewers to preview a license already bound to a supplier", async () => {
    findSupplierBusinessLicensePreviewById.mockImplementationOnce(async () => ({
      ...supplierLicenseFile,
      owner_type: "supplier",
      owner_id: "22222222-2222-4222-8222-222222222222",
      created_by_employee_id: "platform-employee-2",
    }));
    getRequiredAuthContext.mockImplementationOnce(async () => ({
      authUserId: "platform-auth-viewer",
      employeeId: "platform-employee-viewer",
      tenantId: null,
      isPlatformAdmin: true,
      permissions: [{ code: "platform.supplier.view", scope: "all" }],
    }));
    const { default: controller } = await import("./index");
    const response = reply();

    await controller.getSupplierBusinessLicensePreview(request(), response as never);

    expect(response.redirect).toHaveBeenCalledWith(signedUrl);
  });

  test.each([
    ["public", { visibility: "public" }],
    ["wrong scene", { scene: "wechat_pay_applyment" }],
    ["failed", { status: "failed" }],
    ["deleted", { deleted_at: "2026-07-24T00:00:00Z" }],
  ])("rejects %s file rows", async (_name, patch) => {
    findSupplierBusinessLicensePreviewById.mockImplementationOnce(async () => ({
      ...supplierLicenseFile,
      ...patch,
    }));
    const { default: controller } = await import("./index");

    await expect(controller.getSupplierBusinessLicensePreview(
      request(),
      reply() as never,
    )).rejects.toMatchObject({ statusCode: 403 });
    expect(resolveSignedStoredFileUrl).not.toHaveBeenCalled();
  });
});
