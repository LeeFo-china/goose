import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { TenantSupplierSettingsCard } from './tenant-supplier-settings-card';
import type { TenantSupplierSettings } from '../suppliers/supplier-types';

const settings: TenantSupplierSettings = {
  tenant_id: 'test', module_enabled: true, require_active_contract_for_new_order: false,
  ownership_reads_enabled: false, private_supplier_writes_enabled: false,
  private_catalog_writes_enabled: false, procurement_snapshot_v1_enabled: false,
  purchase_batch_workflow_enabled: false, version: 1,
  enabled_at: null, enabled_by_employee_id: null, created_at: '', updated_at: '',
};
test('盘点独立开关仅模块前置，查看账号禁用，开启后阻止模块停用', () => {
  const render = (canManage: boolean, value = settings) => renderToStaticMarkup(
    <TenantSupplierSettingsCard tenantId="test" initialSettings={value} canManage={canManage} />,
  );
  const switchTag = (markup: string) => markup.match(/<button[^>]*aria-label="仓库盘点"[^>]*>/)?.[0] ?? '';
  expect(switchTag(render(true))).toContain('role="switch"');
  expect(switchTag(render(true))).not.toMatch(/\sdisabled=""/);
  expect(switchTag(render(false))).toMatch(/\sdisabled=""/);
  expect(switchTag(render(true, { ...settings, module_enabled: false }))).toMatch(/\sdisabled=""/);
  const enabled = render(true, { ...settings, warehouse_stocktakes_enabled: true });
  expect(switchTag(enabled)).toContain('aria-checked="true"');
  expect(enabled).toMatch(/<button[^>]*disabled=""[^>]*>停用供应商模块/);
  expect(enabled).toContain('请关闭仓库盘点');
});
test('调拨开关独立可用，仅查看账号不可操作', () => {
  const render = (canManage: boolean, value = settings) => renderToStaticMarkup(
    <TenantSupplierSettingsCard tenantId="test" initialSettings={value} canManage={canManage} />,
  );
  const switchTag = (markup: string) => markup.match(/<button[^>]*aria-label="仓库调拨"[^>]*>/)?.[0] ?? '';
  expect(switchTag(render(true))).toContain('role="switch"');
  expect(switchTag(render(true))).not.toMatch(/\sdisabled=""/);
  expect(switchTag(render(false))).toMatch(/\sdisabled=""/);
  expect(switchTag(render(true, { ...settings, module_enabled: false }))).toMatch(/\sdisabled=""/);
  expect(switchTag(render(true, { ...settings, warehouse_transfers_enabled: true }))).toContain('aria-checked="true"');
});
