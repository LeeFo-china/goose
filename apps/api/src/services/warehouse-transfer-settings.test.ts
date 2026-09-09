import { expect, test } from 'bun:test';
import { assertSupplierRolloutDependencies, assertSupplierRolloutTransition, effectiveSupplierRolloutSettings } from './supplier-rollout-settings';
import { PlatformTenantSupplierSettingsCommandSchema } from '@/schema/platform-suppliers';
import { supplierSettingsCommandArgs } from '@/repositories/platform-supplier-settings-command';
import { SETTINGS_SELECT } from '@/repositories/tenant-suppliers-mappers';
import { settingsState } from './platform-supplier-service-utils';

const id = '10000000-0000-4000-8000-000000000001';
const enabled = { module_enabled: true, require_active_contract_for_new_order: false,
  ownership_reads_enabled: false, private_supplier_writes_enabled: false, private_catalog_writes_enabled: false,
  procurement_snapshot_v1_enabled: false, purchase_batch_workflow_enabled: false, warehouse_transfers_enabled: true };

test('transfers are independent of procurement and material flags but depend on module', () => {
  expect(() => assertSupplierRolloutDependencies(enabled)).not.toThrow();
  expect(() => assertSupplierRolloutTransition({ ...enabled, warehouse_transfers_enabled: false }, enabled)).not.toThrow();
  expect(() => assertSupplierRolloutDependencies({ ...enabled, module_enabled: false })).toThrow();
  expect(effectiveSupplierRolloutSettings({ ...enabled, module_enabled: false })).toHaveProperty('warehouse_transfers_enabled', false);
  expect(settingsState({ ...enabled, version: 1 })).toHaveProperty('warehouse_transfers_enabled', true);
  expect(SETTINGS_SELECT.split(',')).toContain('warehouse_transfers_enabled');
  expect(SETTINGS_SELECT.split(',')).toContain('warehouse_stocktakes_enabled');
});

test('settings input accepts only an optional boolean transfer flag', () => {
  const body = { ...enabled, expected_version: 1 };
  expect(PlatformTenantSupplierSettingsCommandSchema.safeParse(body).success).toBe(true);
  for (const value of ['true', null, 1]) expect(PlatformTenantSupplierSettingsCommandSchema.safeParse({ ...body, warehouse_transfers_enabled: value }).success).toBe(false);
  const { warehouse_transfers_enabled: omitted, ...legacy } = body;
  expect(PlatformTenantSupplierSettingsCommandSchema.parse(legacy)).not.toHaveProperty('warehouse_transfers_enabled');
  expect(PlatformTenantSupplierSettingsCommandSchema.safeParse({ ...body, warehouse_stocktakes_enabled: true }).success).toBe(true);
});

test('explicit false and true use existing JSON overload; omission retains historical typed fingerprint', () => {
  for (const value of [true, false]) {
    const input = { ...enabled, warehouse_transfers_enabled: value, tenant_id: id, actor_employee_id: id,
      actor_user_id: id, expected_version: 1, idempotency_key: 'key' };
    const { actor_user_id, idempotency_key, ...request } = input;
    expect(supplierSettingsCommandArgs(input)).toEqual({ p_request: { ...request, reason: null }, p_actor_user_id: id, p_idempotency_key: 'key' });
    const { warehouse_transfers_enabled: omitted, ...legacy } = input;
    expect(supplierSettingsCommandArgs(legacy)).not.toHaveProperty('p_request');
    expect(supplierSettingsCommandArgs(legacy)).not.toHaveProperty('p_warehouse_transfers_enabled');
  }
});
