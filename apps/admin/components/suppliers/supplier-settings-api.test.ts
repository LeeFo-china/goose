import { afterEach, expect, test } from "bun:test";
import * as settingsApi from "./supplier-settings-api";
import type { TenantSupplierSettings } from "./supplier-types";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

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
