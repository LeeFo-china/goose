export const mockTenantId = "91000000-0000-4000-8000-000000000001";

export const mockSupplierRolloutSession = {
  user_id: "supplier-rollout-platform-user",
  login_channel: "admin_web",
  employee: {
    id: "91000000-0000-4000-8000-000000000002",
    name: "供应商灰度测试管理员",
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
  permissions: [
    { code: "platform.supplier.view", scope: "all" },
    { code: "platform.supplier.manage", scope: "all" },
  ],
  token: "supplier-rollout-mock-token",
};

export function createSupplierRolloutSettings(level = 0, version = 0) {
  const now = "2026-08-13T10:00:00.000Z";
  return {
    tenant_id: mockTenantId,
    module_enabled: level >= 1,
    require_active_contract_for_new_order: false,
    ownership_reads_enabled: level >= 2,
    private_supplier_writes_enabled: level >= 3,
    private_catalog_writes_enabled: level >= 4,
    procurement_snapshot_v1_enabled: level >= 5,
    enabled_by_employee_id: level >= 1
      ? mockSupplierRolloutSession.employee.id
      : null,
    enabled_at: level >= 1 ? now : null,
    version,
    created_at: now,
    updated_at: now,
  };
}
