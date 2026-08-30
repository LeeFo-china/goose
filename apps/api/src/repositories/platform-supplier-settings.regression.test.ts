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
  enabled_by_employee_id: null,
  enabled_at: null,
  version: 2,
  created_at: NOW,
  updated_at: NOW,
};

describe("PlatformSuppliersRepository settings command", () => {
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
      p_actor_user_id: ACTOR_USER_ID,
      p_actor_employee_id: ACTOR_EMPLOYEE_ID,
      p_idempotency_key: "settings-enable-1",
      p_reason: null,
    });
  });
});
