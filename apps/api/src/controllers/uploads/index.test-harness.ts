import { createHash } from "node:crypto";
import { mock } from "bun:test";
import type { FastifyRequest } from "fastify";
import type { AuthContext } from "@/services/authorization";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

export const projectId = "2d710a84-1045-4750-8dfd-51a0f463a4db";
export const tenantId = "tenant-1";
export const employeeId = "employee-1";
const authUserId = "auth-1";
export const platformAuthUserId = "platform-auth-1";
export const platformEmployeeId = "platform-employee-1";
export const visitorId = "visitor-1";
export const otherVisitorId = "visitor-2";

export const createDirectUpload = mock(async () => ({
  provider: "tencent_cos",
  bucket: "bucket",
  region: "ap-guangzhou",
  object_key:
    `tenants/${tenantId}/project-payment/projects/${projectId}/2026/06/16/file.jpg`,
  storage_path:
    `tenants/${tenantId}/project-payment/projects/${projectId}/2026/06/16/file.jpg`,
  upload_url: "https://example.com/upload",
  method: "PUT",
  headers: { "content-type": "image/jpeg" },
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

export const completeDirectUpload = mock(
  async (): Promise<CompleteUploadResult> => ({
    provider: "tencent_cos",
    bucket: "bucket",
    region: "ap-guangzhou",
    object_key:
      `tenants/${tenantId}/project-payment/projects/${projectId}/2026/06/16/file.jpg`,
    storage_path:
      `tenants/${tenantId}/project-payment/projects/${projectId}/2026/06/16/file.jpg`,
    url: "https://example.com/file.jpg",
  }),
);

const defaultAuthContext = async (): Promise<AuthContext> => ({
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
});

export const getRequiredAuthContext = mock(defaultAuthContext);

export const canAccessProject = mock(async () => true);
const logUploadTiming = mock(() => undefined);
export const resolveStoredFileUrl = mock(
  () => "https://example.com/resolved.jpg",
);
export const assertDirectUploadAccess = mock(() => undefined);
export const assertCanCustomize = mock(async () => ({
  tenantId,
  entitlement: { code: "custom_support_branding" },
}));

mock.module("@/services/files/platform-file-storage", () => ({
  platformFileStorageService: { createDirectUpload, completeDirectUpload },
  getWechatPayApplymentUploadPolicy: (scene: string) =>
    scene === "wechat_pay_applyment"
      ? {
        maxSizeBytes: 2 * 1024 * 1024,
        mimeTypes: new Set(["image/jpeg", "image/png"]),
        sizeError: "微信支付进件附件大小校验失败",
        typeError: "微信支付进件附件类型校验失败",
        checksumError: "进件附件文件校验值不一致",
      }
      : null,
  getSupplierBusinessLicenseUploadPolicy: (scene: string) =>
    scene === "supplier_business_license"
      ? {
        maxSizeBytes: 5 * 1024 * 1024,
        mimeTypes: new Set(["image/jpeg", "image/png"]),
        sizeError: "供应商营业执照文件大小校验失败",
        typeError: "供应商营业执照仅支持 JPEG 或 PNG",
        checksumError: "供应商营业执照文件校验值不一致",
      }
      : null,
  buildTenantOnboardingLicenseVisitorPrefix: (value: string) => {
    const hash = createHash("sha256").update(value.trim()).digest("hex");
    return `private/tenant-onboarding-license/visitors/${hash}/`;
  },
  buildSupplierBusinessLicenseEmployeePrefix: (value: string) => {
    const hash = createHash("sha256").update(value.trim()).digest("hex");
    return `private/supplier-business-license/employees/${hash}/`;
  },
}));
mock.module("@/services/authorization", () => ({
  authorizationService: { getRequiredAuthContext },
}));
mock.module("@/services/access-policy", () => ({
  accessPolicyService: {
    canAccessProject,
    canWriteProjectLog: mock(async () => false),
    getScope: mock((
      authContext: { permissions?: Array<{ code: string; scope: string }> },
      permissionCode: string,
    ) =>
      authContext.permissions?.find((item) => item.code === permissionCode)
        ?.scope ?? null
    ),
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
mock.module("@/services/uploads", () => ({
  uploadService: {
    findDefaultActiveCustomerMembership: mock(async () => null),
    findLegacyCustomerBinding: mock(async () => null),
    assertDirectUploadAccess,
  },
}));
mock.module("@/services/tenant-entitlements", () => ({
  tenantEntitlementsService: { assertCanCustomize },
}));
mock.module("@/utils/upload-timing-logger", () => ({ logUploadTiming }));
mock.module("@/services/files/file-url-resolver", () => ({
  resolveStoredFileUrl,
  resolveStoredFileUrlList: mock((value: unknown) => value),
  refreshPlatformCosPublicBaseUrlCache: mock(async () => undefined),
  setPlatformCosAccessConfigCache: mock(() => undefined),
  setPlatformCosPublicBaseUrlCache: mock(() => undefined),
}));

export function resetUploadControllerMocks() {
  createDirectUpload.mockClear();
  completeDirectUpload.mockClear();
  getRequiredAuthContext.mockClear();
  getRequiredAuthContext.mockImplementation(defaultAuthContext);
  canAccessProject.mockClear();
  canAccessProject.mockImplementation(async () => true);
  logUploadTiming.mockClear();
  resolveStoredFileUrl.mockClear();
  assertDirectUploadAccess.mockClear();
  assertCanCustomize.mockClear();
  assertCanCustomize.mockImplementation(async () => ({
    tenantId,
    entitlement: { code: "custom_support_branding" },
  }));
}

export const buildRequest = (
  body: Record<string, unknown>,
): FastifyRequest => ({
  body,
  user: { sub: authUserId, tenant_id: tenantId, employee_id: employeeId },
  id: "req-test",
}) as FastifyRequest;

export const buildPlatformRequest = (
  body: Record<string, unknown>,
): FastifyRequest => ({
  body,
  user: { sub: platformAuthUserId },
  id: "req-platform-test",
}) as FastifyRequest;

export function allowPlatformSupplierUpload() {
  getRequiredAuthContext.mockImplementation(async (): Promise<AuthContext> => ({
    authUserId: platformAuthUserId,
    employeeId: platformEmployeeId,
    tenantId: null,
    tenantName: null,
    tenantSlug: null,
    tenantStatus: null,
    isPlatformAdmin: true,
    employeeName: "平台运营",
    employeeStatus: "active",
    departmentId: null,
    tenantDepartmentId: null,
    departmentCode: "OPS",
    departmentName: "运营部",
    postId: null,
    postName: null,
    avatar: null,
    roleCodes: ["platform_admin"],
    roles: [],
    permissions: [{ code: "platform.supplier.manage", scope: "all" }],
  }));
}

export function denyPlatformSupplierPermission() {
  getRequiredAuthContext.mockImplementation(async (): Promise<AuthContext> => ({
    authUserId: platformAuthUserId,
    employeeId: platformEmployeeId,
    tenantId: null,
    tenantName: null,
    tenantSlug: null,
    tenantStatus: null,
    isPlatformAdmin: true,
    employeeName: "平台运营",
    employeeStatus: "active",
    departmentId: null,
    tenantDepartmentId: null,
    departmentCode: "OPS",
    departmentName: "运营部",
    postId: null,
    postName: null,
    avatar: null,
    roleCodes: ["platform_admin"],
    roles: [],
    permissions: [],
  }));
}

export function denyPlatformEmployeeIdentity() {
  getRequiredAuthContext.mockImplementation(async (): Promise<AuthContext> => ({
    authUserId: platformAuthUserId,
    employeeId: null,
    tenantId: null,
    tenantName: null,
    tenantSlug: null,
    tenantStatus: null,
    isPlatformAdmin: true,
    employeeName: null,
    employeeStatus: null,
    departmentId: null,
    tenantDepartmentId: null,
    departmentCode: null,
    departmentName: null,
    postId: null,
    postName: null,
    avatar: null,
    roleCodes: ["platform_admin"],
    roles: [],
    permissions: [{ code: "platform.supplier.manage", scope: "all" }],
  }));
}

export function allowPlatformBrandLogoUpload() {
  getRequiredAuthContext.mockImplementation(async (): Promise<AuthContext> => ({
    authUserId: platformAuthUserId,
    employeeId: platformEmployeeId,
    tenantId: null,
    tenantName: null,
    tenantSlug: null,
    tenantStatus: null,
    isPlatformAdmin: true,
    employeeName: "平台品牌管理员",
    employeeStatus: "active",
    departmentId: null,
    tenantDepartmentId: null,
    departmentCode: "OPS",
    departmentName: "运营部",
    postId: null,
    postName: null,
    avatar: null,
    roleCodes: ["platform_admin"],
    roles: [],
    permissions: [{ code: "platform.branding.manage", scope: "all" }],
  }));
}

export const applymentUploadBody = {
  scene: "wechat_pay_applyment",
  filename: "license.jpg",
  mimetype: "image/jpeg",
  size_bytes: 120000,
};

export function denyApplymentUpload() {
  assertDirectUploadAccess.mockImplementationOnce(() => {
    throw Object.assign(new Error("forbidden"), {
      statusCode: 403,
      code: "FORBIDDEN",
    });
  });
}

export const buildVisitorRequest = (
  body: Record<string, unknown>,
  currentVisitorId = visitorId,
): FastifyRequest => ({
  body,
  query: {},
  user: {
    token_type: "visitor_session",
    visitor_id: currentVisitorId,
  },
  id: "req-visitor-test",
}) as FastifyRequest;
