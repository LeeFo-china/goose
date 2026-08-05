import type { AuthContext } from "@/services/authorization";
import type {
  SerializedBrandProfile,
  SerializedEntitlement,
} from "@/services/branding-contracts";

export const TENANT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const EMPLOYEE_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
export const AUTH_USER_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
export const LOGO_FILE_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

export const platformAuth = {
  authUserId: AUTH_USER_ID,
  tenantId: null,
  tenantName: null,
  tenantSlug: null,
  tenantStatus: null,
  employeeId: EMPLOYEE_ID,
  employeeName: "平台管理员",
  employeeStatus: "active",
  isPlatformAdmin: true,
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

export const tenantAuth = {
  ...platformAuth,
  tenantId: TENANT_ID,
  tenantName: "测试租户",
  tenantSlug: "test-tenant",
  tenantStatus: "active",
  isPlatformAdmin: false,
  roleCodes: ["system_admin"],
  permissions: [
    { code: "brand.settings.read", scope: "all" },
    { code: "brand.settings.update", scope: "all" },
  ],
} satisfies AuthContext;

export const platformProfile = {
  display_name: "平台品牌",
  logo_file_id: LOGO_FILE_ID,
  logo_url: "https://cdn.example.com/platform.png",
  status: "published",
  version: 2,
  published_version: 2,
  has_unpublished_changes: false,
  published_at: "2026-07-27T10:00:00.000Z",
  updated_at: "2026-07-27T10:00:00.000Z",
} satisfies SerializedBrandProfile;

export const serializedEntitlement = {
  id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
  tenant_id: TENANT_ID,
  code: "custom_support_branding",
  status: "active",
  starts_at: "2026-07-27T10:00:00.000Z",
  expires_at: "2027-07-27T10:00:00.000Z",
  source_type: "manual_grant",
  source_id: null,
  suspended_at: null,
  suspend_reason: null,
  version: 1,
  updated_at: "2026-07-27T10:00:00.000Z",
} satisfies SerializedEntitlement;

export const platformEffective = {
  source: "platform" as const,
  tenant_id: null,
  display_name: "平台品牌",
  logo_url: "https://cdn.example.com/platform.png",
  support_text: "平台品牌",
  version: 2,
  updated_at: "2026-07-27T10:00:00.000Z",
};

export const tenantEffective = {
  ...platformEffective,
  source: "tenant" as const,
  tenant_id: TENANT_ID,
  display_name: "租户品牌",
  support_text: "租户品牌",
};
