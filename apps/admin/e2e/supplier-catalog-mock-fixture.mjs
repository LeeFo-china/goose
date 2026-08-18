export const mockCatalogSession = {
  user_id: "catalog-admin-user",
  login_channel: "admin_web",
  employee: {
    id: "10000000-0000-4000-8000-000000000001",
    name: "目录测试管理员",
    phone: "18637605353",
    status: "active",
    tenant_department_id: null,
    department_name: "平台运营",
    post_id: null,
    post_name: "平台管理员",
    avatar: null,
  },
  tenant: null,
  roles: ["platform_admin"],
  permissions: [{ code: "platform.catalog.manage", scope: "all" }],
  token: "supplier-catalog-mock-token",
};

export const mockTenantCatalogSession = {
  user_id: "tenant-catalog-admin-user",
  login_channel: "admin_web",
  employee: {
    id: "10000000-0000-4000-8000-000000000002",
    name: "租户目录管理员",
    phone: "18637605354",
    status: "active",
    tenant_department_id: null,
    department_name: "采购部",
    post_id: null,
    post_name: "系统管理员",
    avatar: null,
  },
  tenant: {
    id: "20000000-0000-4000-8000-000000000001",
    name: "目录测试租户",
    slug: "catalog-tenant",
    status: "active",
  },
  roles: ["system_admin"],
  permissions: [{ code: "supplier.catalog.manage", scope: "all" }],
  token: "tenant-supplier-catalog-mock-token",
};

const now = "2026-07-29T10:00:00+08:00";

const initialCategory = {
  id: "11000000-0000-4000-8000-000000000001",
  code: "CAT-BASE",
  name: "基础建材",
  parent_id: null,
  level: 1,
  status: "active",
  sort_order: 10,
  version: 1,
  created_at: now,
  updated_at: now,
};

const initialBrand = {
  id: "12000000-0000-4000-8000-000000000001",
  code: "BRAND-BASE",
  name: "基准品牌",
  legal_name: "基准品牌有限公司",
  logo_file_id: null,
  status: "active",
  sort_order: 10,
  version: 1,
  created_at: now,
  updated_at: now,
};

const initialUnit = {
  id: "13000000-0000-4000-8000-000000000001",
  code: "UNIT-BASE",
  name: "个",
  symbol: "个",
  base_unit_id: null,
  base_unit: null,
  conversion_factor: "1",
  unit_dimension: "quantity",
  status: "active",
  sort_order: 10,
  version: 1,
  created_at: now,
  updated_at: now,
};

const initialTenantSharedCategory = {
  id: "11000000-0000-4000-8000-000000000010",
  code: "PLATFORM-MATERIAL",
  name: "平台标准建材",
  parent_id: null,
  level: 1,
  full_name: "平台标准建材",
  is_leaf: true,
  mapped_platform_category_id: null,
  ownership_scope: "platform",
  owner_tenant_id: null,
  status: "active",
  sort_order: 5,
  version: 1,
  created_at: now,
  updated_at: now,
};

const initialTenantPrivateCategory = {
  id: "21000000-0000-4000-8000-000000000001",
  code: "TENANT-SUPPLIES",
  name: "租户标准辅料",
  parent_id: null,
  level: 1,
  full_name: "租户标准辅料",
  is_leaf: true,
  mapped_platform_category_id: initialTenantSharedCategory.id,
  ownership_scope: "tenant",
  owner_tenant_id: mockTenantCatalogSession.tenant.id,
  status: "active",
  sort_order: 10,
  version: 1,
  created_at: now,
  updated_at: now,
};

const initialPlatformSpec = {
  id: "31000000-0000-4000-8000-000000000001",
  category_id: initialTenantSharedCategory.id,
  code: "MATERIAL",
  name: "材质",
  value_type: "text",
  enum_options: [],
  unit_dimension: null,
  is_required: true,
  participates_in_sku_name: true,
  is_filterable: true,
  sort_order: 10,
  status: "active",
  version: 1,
  ownership_scope: "platform",
  owner_tenant_id: null,
  source_platform_spec_id: null,
  created_at: now,
  updated_at: now,
};

const initialUnitSuggestion = {
  id: "32000000-0000-4000-8000-000000000001",
  tenant_id: mockTenantCatalogSession.tenant.id,
  suggested_code: "BAG",
  suggested_name: "袋",
  suggested_symbol: "袋",
  unit_dimension: "quantity",
  reason: "行业常用包装单位",
  status: "submitted",
  version: 1,
  reviewed_at: null,
  review_remark: null,
  approved_catalog_unit_id: null,
  created_at: now,
  updated_at: now,
};

export function createInitialCatalogState() {
  return {
    categories: [structuredClone(initialCategory)],
    tenantCategories: [
      structuredClone(initialTenantSharedCategory),
      structuredClone(initialTenantPrivateCategory),
    ],
    brands: [structuredClone(initialBrand)],
    units: [structuredClone(initialUnit)],
    specs: {
      [initialCategory.id]: [],
      [initialTenantSharedCategory.id]: [structuredClone(initialPlatformSpec)],
      [initialTenantPrivateCategory.id]: [],
    },
    unitSuggestions: [structuredClone(initialUnitSuggestion)],
  };
}
