import { mock } from "bun:test";

import type { AuthContext } from "@/services/authorization";

export const TENANT_ID = "00000000-0000-4000-8000-000000000101";
export const CATEGORY_ID = "00000000-0000-4000-8000-000000000201";
export const BRAND_ID = "00000000-0000-4000-8000-000000000301";
export const UNIT_ID = "00000000-0000-4000-8000-000000000401";
export const USER_ID = "00000000-0000-4000-8000-000000000501";
export const EMPLOYEE_ID = "00000000-0000-4000-8000-000000000601";
export const NOW = "2026-07-24T00:00:00.000Z";

export function auth(
  permissions: string[],
  tenantId: string | null,
  isPlatformAdmin: boolean,
): AuthContext {
  return {
    authUserId: USER_ID,
    employeeId: EMPLOYEE_ID,
    tenantId,
    tenantName: null,
    tenantSlug: null,
    tenantStatus: null,
    isPlatformAdmin,
    employeeName: "目录管理员",
    employeeStatus: "active",
    departmentId: null,
    tenantDepartmentId: null,
    departmentCode: null,
    departmentName: null,
    postId: null,
    postName: null,
    avatar: null,
    roleCodes: [],
    roles: [],
    permissions: permissions.map((code) => ({ code, scope: "all" })),
  };
}

export function createDependencies(overrides: Record<string, unknown>) {
  const repository = {
    listCategories: mock(async ({ page, pageSize }) =>
      pageOf([category], page, pageSize)),
    listBrands: mock(async ({ page, pageSize }) =>
      pageOf([brand], page, pageSize)),
    listUnits: mock(async ({ page, pageSize }) =>
      pageOf([unit], page, pageSize)),
    createCategory: mock(async (input) => ({ ...category, ...input })),
    updateCategory: mock(async (input) => ({
      ...category,
      ...input,
      version: 2,
    })),
    createBrand: mock(async (input) => ({ ...brand, ...input })),
    updateBrand: mock(async (input) => ({ ...brand, ...input, version: 2 })),
    createUnit: mock(async (input) => ({ ...unit, ...input })),
    updateUnit: mock(async (input) => ({ ...unit, ...input, version: 2 })),
    getTenantSupplierSettings: mock(async () => ({
      private_catalog_writes_enabled: true,
    })),
    findCategoryOwnership: mock(async () => ({
      ownershipScope: "platform",
      ownerTenantId: null,
    })),
    findBrandOwnership: mock(async () => ({
      ownershipScope: "platform",
      ownerTenantId: null,
    })),
    createTenantCategory: mock(async (input) => ({ ...category, ...input })),
    updateTenantCategory: mock(async (input) => ({
      ...category,
      ...input,
      version: 2,
    })),
    createTenantBrand: mock(async (input) => ({ ...brand, ...input })),
    updateTenantBrand: mock(async (input) => ({
      ...brand,
      ...input,
      version: 2,
    })),
    ...overrides,
  };
  return {
    repository,
    accessPolicy: {
      assertTenantContext: mock((context: AuthContext) => {
        if (!context.tenantId) {
          throw Object.assign(new Error("tenant required"), {
            statusCode: 403,
            code: "TENANT_CONTEXT_REQUIRED",
          });
        }
        return context.tenantId;
      }),
      assertPermission: mock((context: AuthContext, permission: string) => {
        if (!context.permissions.some((item) => item.code === permission)) {
          throw Object.assign(new Error("forbidden"), {
            statusCode: 403,
            code: "FORBIDDEN",
          });
        }
        return "all";
      }),
    },
  };
}

export function pageOf<T>(list: T[], page: number, pageSize: number) {
  return {
    list,
    pagination: {
      page,
      pageSize,
      total: list.length,
      totalPages: list.length ? 1 : 0,
    },
  };
}

const base = {
  status: "active",
  sort_order: 100,
  version: 1,
  created_at: NOW,
  updated_at: NOW,
};

export const category = {
  ...base,
  id: CATEGORY_ID,
  parent_id: null,
  code: "CAT-001",
  name: "主材",
  level: 1,
};

export const brand = {
  ...base,
  id: BRAND_ID,
  code: "BR-001",
  name: "雨虹",
  legal_name: null,
  logo_file_id: null,
};

export const unit = {
  ...base,
  id: UNIT_ID,
  code: "UNIT-BOX",
  name: "箱",
  symbol: "箱",
  base_unit_id: null,
  conversion_factor: "1.000000",
};
