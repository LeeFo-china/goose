import type { AuthContext } from "@/services/authorization";

export const TENANT_ID = "4a000000-0000-4000-8000-000000000001";
export const TENANT_SUPPLIER_ID = "4a000000-0000-4000-8000-000000000002";
export const SUPPLIER_ID = "4a000000-0000-4000-8000-000000000003";
export const PRODUCT_ID = "4a000000-0000-4000-8000-000000000004";
export const SKU_ID = "4a000000-0000-4000-8000-000000000005";
export const USER_ID = "4a000000-0000-4000-8000-000000000006";
export const EMPLOYEE_ID = "4a000000-0000-4000-8000-000000000007";
export const CATEGORY_ID = "4a000000-0000-4000-8000-000000000008";
export const UNIT_ID = "4a000000-0000-4000-8000-000000000009";
export const PRICE_LIST_ID = "4a000000-0000-4000-8000-00000000000a";

export const auth: AuthContext = {
  authUserId: USER_ID,
  employeeId: EMPLOYEE_ID,
  tenantId: TENANT_ID,
  tenantName: "测试租户",
  tenantSlug: "test",
  tenantStatus: "active",
  isPlatformAdmin: false,
  employeeName: "采购员",
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
  permissions: [
    { code: "supplier.product.manage", scope: "all" },
    { code: "supplier.cost-price.view", scope: "all" },
  ],
};

export const scope = {
  tenantId: TENANT_ID,
  tenantSupplierId: TENANT_SUPPLIER_ID,
  supplierId: SUPPLIER_ID,
  authUserId: USER_ID,
  employeeId: EMPLOYEE_ID,
};

export const product = {
  id: PRODUCT_ID,
  supplier_id: SUPPLIER_ID,
  ownership_scope: "tenant",
  owner_tenant_id: TENANT_ID,
  category: { id: CATEGORY_ID },
};

export const sku = {
  id: SKU_ID,
  supplier_id: SUPPLIER_ID,
  supplier_product_id: PRODUCT_ID,
  ownership_scope: "tenant",
  owner_tenant_id: TENANT_ID,
  status: "active",
  version: 4,
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function uppercaseUuidValues(value: unknown): unknown {
  if (typeof value === "string") {
    return UUID_PATTERN.test(value) ? value.toUpperCase() : value;
  }
  if (Array.isArray(value)) return value.map(uppercaseUuidValues);
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [
    key,
    uppercaseUuidValues(item),
  ]));
}
