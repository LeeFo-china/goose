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
  expires_at: "2026-12-31T23:59:59+08:00",
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
  status: "active",
  sort_order: 10,
  version: 1,
  created_at: now,
  updated_at: now,
};

export function createInitialCatalogState() {
  return {
    categories: [structuredClone(initialCategory)],
    brands: [structuredClone(initialBrand)],
    units: [structuredClone(initialUnit)],
  };
}
