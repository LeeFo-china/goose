import { afterEach, expect, test } from "bun:test";
import * as settingsApi from "./supplier-settings-api";
import type { TenantSupplierSettings } from "./supplier-types";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

test("transfer flag merges independently and old frozen bodies remain byte-identical", async () => {
  const current: TenantSupplierSettings = {
    tenant_id: "test", module_enabled: true, require_active_contract_for_new_order: false,
    ownership_reads_enabled: false, private_supplier_writes_enabled: false,
    private_catalog_writes_enabled: false, procurement_snapshot_v1_enabled: false,
    purchase_batch_workflow_enabled: false, warehouse_procurement_enabled: false,
    version: 1, enabled_at: null, enabled_by_employee_id: null, created_at: "", updated_at: "",
  };
  const build = (intent: settingsApi.PlatformModuleIntent, settings = current) =>
    settingsApi.createPlatformSupplierSettingsRequest({ tenantId: "test", current: settings, intent, idempotencyKey: "transfer-key" });
  const enabled = build({ moduleEnabled: true, warehouseTransfersEnabled: true });
  expect(JSON.parse(enabled.body)).toMatchObject({ warehouse_transfers_enabled: true, warehouse_materials_enabled: false, warehouse_procurement_enabled: false });
  expect(JSON.parse(build({ moduleEnabled: true }, { ...current, warehouse_transfers_enabled: true }).body).warehouse_transfers_enabled).toBe(true);
  expect(JSON.parse(build({ moduleEnabled: true, warehouseTransfersEnabled: false }, { ...current, warehouse_transfers_enabled: true }).body).warehouse_transfers_enabled).toBe(false);
  expect(JSON.parse(build({ moduleEnabled: true }).body).warehouse_transfers_enabled).toBe(false);
  const legacyBody = '{"module_enabled":true,"expected_version":1}';
  let actual: RequestInit | undefined;
  globalThis.fetch = (async (_url, init) => { actual = init; return Response.json({ success: true, data: current }); }) as typeof fetch;
  await settingsApi.updatePlatformTenantSupplierModule({ tenantId: "test", idempotencyKey: "old-key", body: legacyBody });
  expect(actual?.body).toBe(legacyBody);
  expect(actual?.headers).toMatchObject({ 'Idempotency-Key': 'old-key' });
});

test("warehouse command freezes serialized payload and version for uncertain retries", async () => {
  const current: TenantSupplierSettings = {
    tenant_id: "test", module_enabled: true, require_active_contract_for_new_order: false,
    ownership_reads_enabled: true, private_supplier_writes_enabled: true,
    private_catalog_writes_enabled: true, procurement_snapshot_v1_enabled: true,
    purchase_batch_workflow_enabled: true, warehouse_procurement_enabled: false,
    version: 6, enabled_at: null, enabled_by_employee_id: null, created_at: "", updated_at: "",
  };
  expect(typeof settingsApi.createPlatformSupplierSettingsRequest).toBe("function");
  const request = settingsApi.createPlatformSupplierSettingsRequest({ tenantId: "test", current,
    intent: { moduleEnabled: true, warehouseProcurementEnabled: true }, idempotencyKey: "frozen-key" });
  current.version = 99;
  current.require_active_contract_for_new_order = true;
  const calls: RequestInit[] = [];
  globalThis.fetch = (async (_url, init) => {
    calls.push(init!);
    if (calls.length === 1) throw new TypeError("network outcome unknown");
    return Response.json({ success: true, data: current });
  }) as typeof fetch;
  await expect(settingsApi.updatePlatformTenantSupplierModule(request)).rejects.toThrow("network");
  await settingsApi.updatePlatformTenantSupplierModule(request);
  expect(calls[0]?.body).toBe(calls[1]?.body);
  expect(calls[0]?.headers).toEqual(calls[1]?.headers);
  expect(JSON.parse(String(calls[1]?.body))).toMatchObject({
    warehouse_procurement_enabled: true, expected_version: 6, require_active_contract_for_new_order: false,
  });
});

test("materials command freezes its independent flag and preserves it during other changes", () => {
  const current: TenantSupplierSettings = {
    tenant_id: "test", module_enabled: true, require_active_contract_for_new_order: false,
    ownership_reads_enabled: false, private_supplier_writes_enabled: false,
    private_catalog_writes_enabled: false, procurement_snapshot_v1_enabled: false,
    purchase_batch_workflow_enabled: false, warehouse_procurement_enabled: false,
    version: 1, enabled_at: null, enabled_by_employee_id: null, created_at: "", updated_at: "",
  };
  const request = settingsApi.createPlatformSupplierSettingsRequest({ tenantId: "test", current,
    intent: { moduleEnabled: true, warehouseMaterialsEnabled: true }, idempotencyKey: "material-key" });
  expect(JSON.parse(request.body)).toMatchObject({ warehouse_materials_enabled: true, warehouse_procurement_enabled: false });
  const next = settingsApi.createPlatformSupplierSettingsRequest({ tenantId: "test", current: { ...current, warehouse_materials_enabled: true },
    intent: { moduleEnabled: true, ownershipReadsEnabled: true }, idempotencyKey: "other-key" });
  expect(JSON.parse(next.body)).toMatchObject({ warehouse_materials_enabled: true });
});
