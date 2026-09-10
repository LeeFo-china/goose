import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { AdminSessionScopeProvider, ADMIN_SESSION_STORAGE_PREFIX, clearAdminSessionScopedStorage } from '@/components/layout/admin-session-scope';
import { StocktakeDraft } from './stocktake-draft';
import { StocktakeCounts } from './stocktake-counts';
import { StocktakeWorkspace } from './stocktake-workspace';
import { STOCKTAKE_TEST_ID as id, STOCKTAKE_TEST_ORDER as order, STOCKTAKE_TEST_ITEM as item } from './stocktake-test-fixtures';

test('退出保留未迁移盘点命令，其他业务仍清理', () => {
  const key = `${ADMIN_SESSION_STORAGE_PREFIX}tenant:t:user:u:employee:e:warehouse-stocktake-command`;
  const other = `${ADMIN_SESSION_STORAGE_PREFIX}tenant:t:user:u:other`;
  const values = new Map([[key, 'frozen'], [other, 'other']]);
  clearAdminSessionScopedStorage({ get length() { return values.size; }, key: (index) => [...values.keys()][index] ?? null, removeItem: (key) => { values.delete(key); } });
  expect(values.get(key)).toBe('frozen');
  expect(values.has(other)).toBe(false);
});

test('恢复草稿的仓库原因和材料，而非重新初始化空表单', () => {
  const props = { seed: { id, items: [], recovery: {
    kind: 'draft' as const, orderId: id, version: 0,
    warehouse: { id: order.warehouse_id, name: '恢复仓库' }, reason: '未保存的盘点原因',
    lines: [{ id: item.supplier_sku_id, name: '恢复材料' }],
  } }, access: { canRead: true, canManage: true, canApprove: false, canViewWarehouses: true }, disabled: false, onSave() {}, onClose() {} };
  const html = renderToStaticMarkup(<StocktakeDraft {...props} />);
  expect(html).toContain('未保存的盘点原因');
  expect(html).toContain('恢复材料');
  // Radix selected labels render after hydration; the saved-order branch renders the warehouse on the server.
  const saved = { ...props, seed: { ...props.seed, order: { ...order, status: 'draft' as const } } };
  expect(renderToStaticMarkup(<StocktakeDraft {...saved} />)).toContain('恢复仓库');
});

test('恢复实盘保留显式零和未完成小数输入', () => {
  for (const counted of ['0', '1.']) {
    const props = { order, items: [item], disabled: false, onSave() {}, onClose() {}, recovery: {
      kind: 'counts' as const, orderId: id, version: order.version,
      lines: [{ skuId: item.supplier_sku_id, counted, reason: '尚未保存的原因' }],
    } };
    const html = renderToStaticMarkup(<StocktakeCounts {...props} />);
    expect(html).toContain(`value="${counted}"`);
    expect(html).toContain('尚未保存的原因');
  }
});

test('详情模式保留隐藏的列表实例以保留筛选和页码', () => {
  const html = renderToStaticMarkup(<AdminSessionScopeProvider tenantId={order.tenant_id} userId="user">
    <StocktakeWorkspace employeeId={order.created_by_employee_id} permissions={['inventory.stock.view']} initialOrderId={id} />
  </AdminSessionScopeProvider>);
  expect(html).toContain('aria-label="盘点单列表"');
  expect(html).toContain('hidden=""');
});
