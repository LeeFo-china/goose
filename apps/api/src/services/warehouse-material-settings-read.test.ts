import { expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';

test('independent material settings migration protects actor/permissions and exposes only the effective C flag', () => {
  const directory = new URL('../../../../supabase/migrations/', import.meta.url);
  const files = readdirSync(directory).filter((file) => file.endsWith('_read_warehouse_material_settings.sql'));
  expect(files).toHaveLength(1);
  const sql = readFileSync(new URL(files[0]!, directory), 'utf8');
  expect(sql).toContain('public.get_warehouse_material_settings(');
  expect(sql).toContain('public.__gooes_material_assert_actor(p_tenant_id,p_actor_user_id,p_actor_employee_id)');
  for (const permission of ['project.read', 'inventory.stock.view', 'inventory.issue.manage', 'inventory.issue.approve']) {
    expect(sql).toContain(`'${permission}'`);
  }
  expect(sql).toContain('module_enabled AND warehouse_materials_enabled');
  expect(sql).toContain('FROM PUBLIC,anon,authenticated');
  expect(sql).toContain('TO service_role');
  expect(sql).not.toContain('supplier.view');
  expect(sql).not.toContain('warehouse_procurement_enabled');
  expect(sql).not.toMatch(/\b(?:INSERT|UPDATE|DELETE)\s/i);
});
