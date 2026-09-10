import { describe, expect, test } from "bun:test";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const TENANT_ID = "00000000-0000-4000-8000-000000000301";
const EMPLOYEE_ID = "00000000-0000-4000-8000-000000000402";
const NOW = "2026-09-09T00:00:00.000Z";
const legacySetting = {
  tenant_id: TENANT_ID,
  module_enabled: true,
  require_active_contract_for_new_order: false,
  ownership_reads_enabled: false,
  private_supplier_writes_enabled: false,
  private_catalog_writes_enabled: false,
  procurement_snapshot_v1_enabled: false,
  purchase_batch_workflow_enabled: false,
  warehouse_procurement_enabled: false,
  warehouse_materials_enabled: false,
  warehouse_transfers_enabled: false,
  warehouse_stocktakes_enabled: false,
  enabled_by_employee_id: EMPLOYEE_ID,
  enabled_at: NOW,
  version: 2,
  created_at: NOW,
  updated_at: NOW,
};
const request = {
  tenant_id: TENANT_ID,
  module_enabled: true,
  require_active_contract_for_new_order: false,
  ownership_reads_enabled: false,
  private_supplier_writes_enabled: false,
  private_catalog_writes_enabled: false,
  procurement_snapshot_v1_enabled: false,
  purchase_batch_workflow_enabled: false,
  expected_version: 1,
  actor_user_id: "00000000-0000-4000-8000-000000000401",
  actor_employee_id: EMPLOYEE_ID,
  idempotency_key: "adjustment-settings-receipt",
};

// RPC returns whole settings rows; only the transport is replaced here.
async function parseReceipt(setting: Record<string, unknown>, previousSetting: Record<string, unknown>, idempotent = false) {
  const { PlatformSuppliersRepository } = await import("./platform-suppliers");
  const repository = new PlatformSuppliersRepository(() => ({
    rpc: async () => ({ data: {
      status: "updated", idempotent, setting, previous_setting: previousSetting, version: setting.version,
    }, error: null }),
  } as never));
  return repository.setTenantSupplierSettings({ ...request, expected_version: Number(setting.version) - 1 });
}

describe("platform settings receipts after the adjustment migration", () => {
  test("first save accepts the default false flag and an empty previous setting", async () => {
    const setting = { ...legacySetting, version: 1, warehouse_adjustments_enabled: false };
    const result = await parseReceipt(setting, {});
    expect(result).toEqual({
      status: "updated", idempotent: false, setting, previous_setting: null, version: 1,
    });
  });

  for (const enabled of [false, true]) {
    test(`save preserves adjustment=${enabled} and the distinct previous setting`, async () => {
      const setting = { ...legacySetting, warehouse_adjustments_enabled: enabled };
      const previous = { ...legacySetting, version: 1, warehouse_adjustments_enabled: !enabled };
      expect(await parseReceipt(setting, previous)).toEqual({
        status: "updated", idempotent: false, setting, previous_setting: previous, version: 2,
      });
    });
  }

  test("successful replay preserves both frozen snapshots and the receipt version", async () => {
    const setting = { ...legacySetting, warehouse_adjustments_enabled: false };
    const previous = { ...legacySetting, version: 1, warehouse_adjustments_enabled: true };
    const saved = await parseReceipt(setting, previous);
    const replayed = await parseReceipt(setting, previous, true);
    expect(replayed).toEqual({ ...saved, idempotent: true });
    expect(replayed).toEqual({
      status: "updated", idempotent: true, setting, previous_setting: previous, version: 2,
    });
  });

  test("historical replay does not manufacture an adjustment flag in either snapshot", async () => {
    const previous = { ...legacySetting, version: 1 };
    const result = await parseReceipt(legacySetting, previous, true);
    expect(result).toEqual({
      status: "updated", idempotent: true, setting: legacySetting, previous_setting: previous, version: 2,
    });
    expect(result.setting).not.toHaveProperty("warehouse_adjustments_enabled");
    expect(result.previous_setting).not.toHaveProperty("warehouse_adjustments_enabled");
  });

  test("new receipts can retain a historical previous setting without the flag", async () => {
    const setting = { ...legacySetting, warehouse_adjustments_enabled: false };
    const previous = { ...legacySetting, version: 1 };
    const result = await parseReceipt(setting, previous, true);
    expect(result.setting).toEqual(setting);
    expect(result.previous_setting).toEqual(previous);
    expect(result.previous_setting).not.toHaveProperty("warehouse_adjustments_enabled");
  });

  for (const field of ["setting", "previous_setting"] as const) {
    test(`${field} still rejects invalid flag types and unrelated fields`, async () => {
      for (const invalid of [
        { warehouse_adjustments_enabled: "false" },
        { warehouse_adjustments_enabled: 0 },
        { warehouse_adjustments_enabled: null },
        { unrelated_flag: false },
      ]) {
        const setting = field === "setting" ? { ...legacySetting, ...invalid } : legacySetting;
        const previous = { ...legacySetting, version: 1, ...(field === "previous_setting" ? invalid : {}) };
        await expect(parseReceipt(setting, previous)).rejects.toMatchObject({ code: "DB_ERROR", statusCode: 500 });
      }
    });
  }
});
