import { describe, expect, mock, test } from "bun:test";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const TENANT_ID = "00000000-0000-4000-8000-000000000301";
const ACTOR_USER_ID = "00000000-0000-4000-8000-000000000401";
const ACTOR_EMPLOYEE_ID = "00000000-0000-4000-8000-000000000402";
const NOW = "2026-07-24T00:00:00.000Z";
const setting = {
  tenant_id: TENANT_ID,
  module_enabled: false,
  require_active_contract_for_new_order: false,
  ownership_reads_enabled: false,
  private_supplier_writes_enabled: false,
  private_catalog_writes_enabled: false,
  procurement_snapshot_v1_enabled: false,
  purchase_batch_workflow_enabled: false,
  warehouse_procurement_enabled: false,
  enabled_by_employee_id: null,
  enabled_at: null,
  version: 2,
  created_at: NOW,
  updated_at: NOW,
};

describe("PlatformSuppliersRepository settings command", () => {
  test("warehouse column expansion accepts only known booleans and keeps legacy rows valid", async () => {
    const { SettingsSchema: platformSchema } = await import("./platform-supplier-records");
    const { SettingsSchema: tenantSchema } = await import("./tenant-suppliers-mappers");
    for (const schema of [platformSchema, tenantSchema]) {
      const legacy = schema.parse(setting);
      expect(legacy).toEqual({ ...setting, warehouse_materials_enabled: false });
      expect(legacy).not.toHaveProperty('warehouse_stocktakes_enabled');
      for (const enabled of [false, true]) {
        expect(schema.safeParse({ ...setting, warehouse_transfers_enabled: enabled }).success).toBe(true);
        expect(schema.safeParse({ ...setting, warehouse_stocktakes_enabled: enabled }).success).toBe(true);
      }
      expect(schema.safeParse({ ...setting, warehouse_transfers_enabled: "false" }).success).toBe(false);
      expect(schema.safeParse({ ...setting, warehouse_stocktakes_enabled: "false" }).success).toBe(false);
      expect(schema.safeParse({ ...setting, unrelated_flag: false }).success).toBe(false);
    }
  });

  test("stocktake explicit flag uses JSON while omission preserves typed arguments", async () => {
    const { supplierSettingsCommandArgs } = await import('./platform-supplier-settings-command');
    const base = { tenant_id: TENANT_ID, module_enabled: false, require_active_contract_for_new_order: false,
      ownership_reads_enabled: false, private_supplier_writes_enabled: false, private_catalog_writes_enabled: false,
      procurement_snapshot_v1_enabled: false, purchase_batch_workflow_enabled: false, expected_version: 2,
      actor_employee_id: ACTOR_EMPLOYEE_ID, actor_user_id: ACTOR_USER_ID, idempotency_key: 'stocktake-command' };
    for (const warehouse_stocktakes_enabled of [false, true]) {
      expect(supplierSettingsCommandArgs({ ...base, warehouse_stocktakes_enabled })).toEqual({
        p_request: { tenant_id: TENANT_ID, module_enabled: false, require_active_contract_for_new_order: false,
          ownership_reads_enabled: false, private_supplier_writes_enabled: false, private_catalog_writes_enabled: false,
          procurement_snapshot_v1_enabled: false, purchase_batch_workflow_enabled: false, expected_version: 2,
          actor_employee_id: ACTOR_EMPLOYEE_ID, warehouse_stocktakes_enabled, reason: null },
        p_actor_user_id: ACTOR_USER_ID, p_idempotency_key: 'stocktake-command',
      });
    }
    expect(supplierSettingsCommandArgs(base)).toEqual({
      p_tenant_id: TENANT_ID, p_module_enabled: false, p_require_active_contract_for_new_order: false,
      p_ownership_reads_enabled: false, p_private_supplier_writes_enabled: false,
      p_private_catalog_writes_enabled: false, p_procurement_snapshot_v1_enabled: false,
      p_purchase_batch_workflow_enabled: false, p_expected_version: 2, p_actor_user_id: ACTOR_USER_ID,
      p_actor_employee_id: ACTOR_EMPLOYEE_ID, p_idempotency_key: 'stocktake-command', p_reason: null,
    });
  });

  test("rollout RPC expanded current and historical snapshots parse after transfer migration", async () => {
    const { PlatformSuppliersRepository } = await import("./platform-suppliers");
    const expanded = { ...setting, warehouse_transfers_enabled: false };
    const rpc = mock(async () => ({ data: {
      status: "updated", idempotent: true, setting: expanded,
      previous_setting: expanded, version: 2,
    }, error: null }));
    const repository = new PlatformSuppliersRepository(() => ({ rpc } as never));
    const result = await repository.setTenantSupplierSettings({
      tenant_id: TENANT_ID, module_enabled: false, require_active_contract_for_new_order: false,
      ownership_reads_enabled: false, private_supplier_writes_enabled: false, private_catalog_writes_enabled: false,
      procurement_snapshot_v1_enabled: false, purchase_batch_workflow_enabled: false,
      expected_version: 1, actor_employee_id: ACTOR_EMPLOYEE_ID, actor_user_id: ACTOR_USER_ID,
      idempotency_key: "transfer-schema-expansion",
    });
    expect(result.setting).toMatchObject({ warehouse_transfers_enabled: false });
    expect(result.previous_setting).toMatchObject({ warehouse_transfers_enabled: false });
  });

  test("materials JSON overload preserves absent procurement and original request identity", async () => {
    const { PlatformSuppliersRepository } = await import("./platform-suppliers");
    const rpc = mock(async () => ({ data: {
      status: "updated", idempotent: false,
      setting: { ...setting, module_enabled: true, warehouse_materials_enabled: true },
      previous_setting: setting, version: 2,
    }, error: null }));
    const repository = new PlatformSuppliersRepository(() => ({ rpc } as never));
    const request = {
      tenant_id: TENANT_ID, module_enabled: true, require_active_contract_for_new_order: false,
      ownership_reads_enabled: false, private_supplier_writes_enabled: false,
      private_catalog_writes_enabled: false, procurement_snapshot_v1_enabled: false,
      purchase_batch_workflow_enabled: false, warehouse_materials_enabled: true,
      expected_version: 1, actor_employee_id: ACTOR_EMPLOYEE_ID, reason: undefined,
    };
    const result = await repository.setTenantSupplierSettings({ ...request,
      actor_user_id: ACTOR_USER_ID, idempotency_key: "materials-enable-1",
    });
    expect(result.setting).toMatchObject({ warehouse_materials_enabled: true });
    expect(rpc).toHaveBeenCalledWith("set_tenant_supplier_rollout_settings", {
      p_request: { ...request, reason: null }, p_actor_user_id: ACTOR_USER_ID,
      p_idempotency_key: "materials-enable-1",
    });
  });
  test("returns all raw rollout flags from platform settings reads", async () => {
    const { PlatformSuppliersRepository } = await import("./platform-suppliers");
    const maybeSingle = mock(async () => ({ data: setting, error: null }));
    const eq = mock(() => ({ maybeSingle }));
    const select = mock((_columns: string) => ({ eq }));
    const repository = new PlatformSuppliersRepository(
      () => ({ from: () => ({ select }) } as never),
    );

    const result = await repository.getTenantSupplierSettings(TENANT_ID);

    expect(result).toMatchObject({
      ownership_reads_enabled: false,
      private_supplier_writes_enabled: false,
      private_catalog_writes_enabled: false,
      procurement_snapshot_v1_enabled: false,
      purchase_batch_workflow_enabled: false,
    });
    const selectedColumns = String(select.mock.calls[0]?.[0]);
    for (const flag of [
      "ownership_reads_enabled",
      "private_supplier_writes_enabled",
      "private_catalog_writes_enabled",
      "procurement_snapshot_v1_enabled",
      "purchase_batch_workflow_enabled",
      "warehouse_procurement_enabled",
      "warehouse_transfers_enabled",
      "warehouse_stocktakes_enabled",
    ]) {
      expect(selectedColumns).toContain(flag);
    }
    expect(eq).toHaveBeenCalledWith("tenant_id", TENANT_ID);
  });

  test("passes the disable reason to the settings RPC", async () => {
    const { PlatformSuppliersRepository } = await import("./platform-suppliers");
    const rpc = mock(async () => ({
      data: {
        status: "updated",
        idempotent: false,
        setting,
        previous_setting: { ...setting, module_enabled: true, version: 1 },
        version: 2,
      },
      error: null,
    }));
    const repository = new PlatformSuppliersRepository(
      () => ({ rpc } as never),
    );

    await repository.setTenantSupplierSettings({
      tenant_id: TENANT_ID,
      module_enabled: false,
      require_active_contract_for_new_order: false,
      ownership_reads_enabled: false,
      private_supplier_writes_enabled: false,
      private_catalog_writes_enabled: false,
      procurement_snapshot_v1_enabled: false,
      purchase_batch_workflow_enabled: false,
      expected_version: 1,
      reason: "合作策略调整",
      actor_user_id: ACTOR_USER_ID,
      actor_employee_id: ACTOR_EMPLOYEE_ID,
      idempotency_key: "settings-disable-1",
    });

    expect(rpc).toHaveBeenCalledWith("set_tenant_supplier_rollout_settings", {
      p_tenant_id: TENANT_ID,
      p_module_enabled: false,
      p_require_active_contract_for_new_order: false,
      p_ownership_reads_enabled: false,
      p_private_supplier_writes_enabled: false,
      p_private_catalog_writes_enabled: false,
      p_procurement_snapshot_v1_enabled: false,
      p_purchase_batch_workflow_enabled: false,
      p_expected_version: 1,
      p_actor_user_id: ACTOR_USER_ID,
      p_actor_employee_id: ACTOR_EMPLOYEE_ID,
      p_idempotency_key: "settings-disable-1",
      p_reason: "合作策略调整",
    });

    await repository.setTenantSupplierSettings({
      tenant_id: TENANT_ID,
      module_enabled: true,
      require_active_contract_for_new_order: false,
      ownership_reads_enabled: false,
      private_supplier_writes_enabled: false,
      private_catalog_writes_enabled: false,
      procurement_snapshot_v1_enabled: false,
      purchase_batch_workflow_enabled: false,
      warehouse_procurement_enabled: false,
      expected_version: 2,
      actor_user_id: ACTOR_USER_ID,
      actor_employee_id: ACTOR_EMPLOYEE_ID,
      idempotency_key: "settings-enable-1",
    });

    expect(rpc).toHaveBeenLastCalledWith("set_tenant_supplier_rollout_settings", {
      p_tenant_id: TENANT_ID,
      p_module_enabled: true,
      p_require_active_contract_for_new_order: false,
      p_ownership_reads_enabled: false,
      p_private_supplier_writes_enabled: false,
      p_private_catalog_writes_enabled: false,
      p_procurement_snapshot_v1_enabled: false,
      p_purchase_batch_workflow_enabled: false,
      p_expected_version: 2,
      p_warehouse_procurement_enabled: false,
      p_actor_user_id: ACTOR_USER_ID,
      p_actor_employee_id: ACTOR_EMPLOYEE_ID,
      p_idempotency_key: "settings-enable-1",
      p_reason: null,
    });
  });
});
