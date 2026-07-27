import { mock } from "bun:test";

import { AppError } from "../errors/app-error";
import type { BrandingPlatformFileObjectRecord } from "@/repositories/platform-file-objects";
import type { TenantEntitlementRecord } from "@/repositories/tenant-entitlements";
import type { AuthContext } from "@/services/authorization";
import type { BrandProfileRecord } from "@/services/branding-contracts";

export const NOW = new Date("2026-07-27T10:00:00.000Z");
export const TENANT_ID = "00000000-0000-4000-8000-000000000001";
export const OTHER_TENANT_ID = "00000000-0000-4000-8000-000000000009";
export const EMPLOYEE_ID = "00000000-0000-4000-8000-000000000002";
export const USER_ID = "00000000-0000-4000-8000-000000000003";
export const FILE_ID = "00000000-0000-4000-8000-000000000004";

export const platformAuthContext = {
  authUserId: USER_ID,
  employeeId: EMPLOYEE_ID,
  tenantId: null,
  tenantName: null,
  tenantSlug: null,
  tenantStatus: null,
  isPlatformAdmin: true,
  employeeName: "平台超管",
  employeeStatus: "active",
  departmentId: null,
  tenantDepartmentId: null,
  departmentCode: null,
  departmentName: null,
  postId: null,
  postName: null,
  avatar: null,
  roleCodes: ["platform_admin"],
  roles: [],
  permissions: [{ code: "platform.branding.manage", scope: "all" }],
} satisfies AuthContext;

export const tenantAuthContext = {
  ...platformAuthContext,
  tenantId: TENANT_ID,
  tenantName: "晴天装饰",
  tenantSlug: "sunny",
  tenantStatus: "active",
  isPlatformAdmin: false,
  roleCodes: ["tenant_admin"],
  permissions: [
    { code: "brand.settings.read", scope: "all" },
    { code: "brand.settings.update", scope: "all" },
  ],
} satisfies AuthContext;

export const platformProfile = {
  id: "00000000-0000-4000-8000-000000000010",
  scope: "platform",
  tenant_id: null,
  display_name: "平台品牌",
  logo_file_id: FILE_ID,
  published_display_name: "平台品牌",
  published_logo_file_id: FILE_ID,
  status: "published",
  version: 4,
  published_version: 3,
  published_at: "2026-07-27T09:00:00.000Z",
  updated_by_employee_id: EMPLOYEE_ID,
  created_at: "2026-07-27T08:00:00.000Z",
  updated_at: NOW.toISOString(),
} satisfies BrandProfileRecord;

export const tenantProfile = {
  ...platformProfile,
  id: "00000000-0000-4000-8000-000000000011",
  scope: "tenant",
  tenant_id: TENANT_ID,
  display_name: "晴天装饰",
  published_display_name: "旧晴天装饰",
} satisfies BrandProfileRecord;

export const platformFile = {
  id: FILE_ID,
  tenant_id: null,
  owner_type: "platform",
  owner_id: null,
  scene: "brand_logo",
  provider: "tencent_cos",
  bucket: "public-assets",
  region: "ap-shanghai",
  object_key: "public/brand-logo/logo.png",
  mime_type: "image/png",
  size_bytes: 1024,
  width: 256,
  height: 256,
  checksum: "etag",
  visibility: "public",
  public_url: "https://cdn.example.com/platform-logo.png",
  status: "active",
  deleted_at: null,
} satisfies BrandingPlatformFileObjectRecord;

export const tenantFile = {
  ...platformFile,
  tenant_id: TENANT_ID,
  owner_type: "tenant",
  object_key: `tenants/${TENANT_ID}/brand-logo/logo.png`,
  public_url: "https://cdn.example.com/tenant-logo.png",
} satisfies BrandingPlatformFileObjectRecord;

export const entitlement = {
  id: "00000000-0000-4000-8000-000000000020",
  tenant_id: TENANT_ID,
  entitlement_code: "custom_support_branding",
  status: "active",
  starts_at: NOW.toISOString(),
  expires_at: "2027-07-27T10:00:00.000Z",
  source_type: "manual_grant",
  source_id: null,
  suspended_at: null,
  suspend_reason: null,
  version: 1,
  updated_by_employee_id: EMPLOYEE_ID,
  created_at: NOW.toISOString(),
  updated_at: NOW.toISOString(),
} satisfies TenantEntitlementRecord;

export type FixtureOptions = {
  platformProfile?: BrandProfileRecord | null;
  tenantProfile?: BrandProfileRecord | null;
  platformFile?: BrandingPlatformFileObjectRecord | null;
  tenantFile?: BrandingPlatformFileObjectRecord | null;
  entitlementSummary?: {
    entitlement: {
      id: string;
      tenant_id: string;
      code: "custom_support_branding";
      status: "active" | "suspended" | "expired" | "revoked";
      starts_at: string;
      expires_at: string;
      source_type: "manual_grant" | "purchase";
      source_id: string | null;
      suspended_at: string | null;
      suspend_reason: string | null;
      version: number;
      updated_at: string;
    };
    isActive: boolean;
  } | null;
  findPlatformFailure?: unknown;
  findTenantFailure?: unknown;
  fileFailure?: unknown;
  saveFailure?: unknown;
  publishFailure?: unknown;
  saveResult?: BrandProfileRecord;
  publishResult?: BrandProfileRecord;
  customizeFailure?: unknown;
};

export function createFixture(
  Service: new (dependencies: never) => {
    getPlatform(authContext: AuthContext): Promise<unknown>;
    savePlatformDraft(authContext: AuthContext, input: unknown): Promise<unknown>;
    publishPlatform(authContext: AuthContext, input: unknown): Promise<unknown>;
    getTenant(authContext: AuthContext): Promise<unknown>;
    saveTenantDraft(authContext: AuthContext, input: unknown): Promise<unknown>;
    publishTenant(authContext: AuthContext, input: unknown): Promise<unknown>;
  },
  options: FixtureOptions = {},
) {
  const resolvedPlatformProfile = options.platformProfile === undefined
    ? platformProfile
    : options.platformProfile;
  const resolvedTenantProfile = options.tenantProfile === undefined
    ? tenantProfile
    : options.tenantProfile;
  const resolvedPlatformFile = options.platformFile === undefined
    ? platformFile
    : options.platformFile;
  const resolvedTenantFile = options.tenantFile === undefined
    ? tenantFile
    : options.tenantFile;
  const defaultSummary = {
    entitlement: {
      id: entitlement.id,
      tenant_id: entitlement.tenant_id,
      code: entitlement.entitlement_code,
      status: entitlement.status,
      starts_at: entitlement.starts_at,
      expires_at: entitlement.expires_at,
      source_type: entitlement.source_type,
      source_id: entitlement.source_id,
      suspended_at: entitlement.suspended_at,
      suspend_reason: entitlement.suspend_reason,
      version: entitlement.version,
      updated_at: entitlement.updated_at,
    },
    isActive: true,
  } as const;
  const summary = options.entitlementSummary === undefined
    ? defaultSummary
    : options.entitlementSummary;
  const findPlatformProfile = mock(async () => {
    if (options.findPlatformFailure) throw options.findPlatformFailure;
    return resolvedPlatformProfile;
  });
  const findTenantProfile = mock(async () => {
    if (options.findTenantFailure) throw options.findTenantFailure;
    return resolvedTenantProfile;
  });
  const findPlatformBrandLogoForBinding = mock(async () => {
    if (options.fileFailure) throw options.fileFailure;
    return resolvedPlatformFile;
  });
  const findTenantBrandLogoForBinding = mock(async () => {
    if (options.fileFailure) throw options.fileFailure;
    return resolvedTenantFile;
  });
  const saveDraft = mock(async () => {
    if (options.saveFailure) throw options.saveFailure;
    return options.saveResult ?? resolvedTenantProfile ?? tenantProfile;
  });
  const publish = mock(async () => {
    if (options.publishFailure) throw options.publishFailure;
    return options.publishResult ?? {
      ...(resolvedTenantProfile ?? tenantProfile),
      published_display_name:
        (resolvedTenantProfile ?? tenantProfile).display_name,
      published_logo_file_id:
        (resolvedTenantProfile ?? tenantProfile).logo_file_id,
      published_version: (resolvedTenantProfile ?? tenantProfile).version,
      status: "published" as const,
    };
  });
  const getTenantSummary = mock(async () => summary);
  const assertCanCustomize = mock(async () => {
    if (options.customizeFailure) throw options.customizeFailure;
    return { tenantId: TENANT_ID, entitlement: defaultSummary.entitlement };
  });
  const assertTenantContext = mock((authContext: AuthContext) => {
    if (!authContext.tenantId) {
      throw new AppError(
        403,
        "当前操作必须在租户上下文中执行",
        "TENANT_CONTEXT_REQUIRED",
      );
    }
    return authContext.tenantId;
  });
  const hasPermission = mock((
    authContext: AuthContext,
    permissionCode: string,
  ) => authContext.permissions.some(({ code }) => code === permissionCode));

  const service = new Service({
    brandingRepository: {
      findPlatformProfile,
      findTenantProfile,
      findPlatformBrandLogoForBinding,
      findTenantBrandLogoForBinding,
      saveDraft,
      publish,
    },
    tenantEntitlementsService: {
      getTenantSummary,
      assertCanCustomize,
    },
    accessPolicyService: { assertTenantContext, hasPermission },
    nowFactory: () => NOW,
  } as never);

  return {
    service,
    assertCanCustomize,
    assertTenantContext,
    findPlatformBrandLogoForBinding,
    findTenantBrandLogoForBinding,
    findPlatformProfile,
    findTenantProfile,
    getTenantSummary,
    hasPermission,
    publish,
    saveDraft,
  };
}

export function databaseError(details: unknown) {
  return new AppError(500, "底层数据库异常", "DB_ERROR", details);
}
