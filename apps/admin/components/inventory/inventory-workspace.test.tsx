import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { InventoryWorkspace } from './inventory-workspace';
import { InventoryWarehouseFilter } from './inventory-warehouse-filter';
import { tenantNavGroups } from '@/components/layout/menu-config';

test('inventory menu belongs to procurement and requires stock view', () => {
  expect(
    tenantNavGroups
      .find((group) => group.label === '采购供应')
      ?.items.find((item) => item.href === '/inventory'),
  ).toMatchObject({ label: '仓库库存', permission: 'inventory.stock.view' });
});

test('no stock permission renders a denied state rather than inventory controls', () => {
  const markup = renderToStaticMarkup(
    <InventoryWorkspace
      canView={false}
      canViewWarehouses
      canViewPurchaseOrders
    />,
  );
  expect(markup).toContain('暂无库存查看权限');
  expect(markup).not.toContain('role="tablist"');
});

test('stock-only workspace retains tabs, pagination, and loading without warehouse lookup', () => {
  const markup = renderToStaticMarkup(
    <InventoryWorkspace
      canView
      canViewWarehouses={false}
      canViewPurchaseOrders={false}
    />,
  );
  for (const text of [
    '库存余额',
    '库存流水',
    '正在加载库存',
    '每页条数',
    '下一页',
    '可点击库存行中的仓库名称筛选',
  ])
    expect(markup).toContain(text);
  expect(markup).not.toContain('搜索仓库选项');
});

test('stock-only warehouse drill selection shows a name without directory access or raw ID', () => {
  const markup = renderToStaticMarkup(
    <InventoryWarehouseFilter
      canViewWarehouses={false}
      value={{ id: 'warehouse-private-id', name: '中心仓' }}
      onChange={() => undefined}
    />,
  );
  expect(markup).toContain('中心仓');
  expect(markup).not.toContain('warehouse-private-id');
  expect(markup).not.toContain('role="combobox"');
});

test('inventory starts with tabs without redundant title or description', () => {
  const markup = renderToStaticMarkup(
    <InventoryWorkspace canView canViewWarehouses canViewPurchaseOrders />,
  );
  expect(markup).toContain('库存余额');
  expect(markup).not.toContain('<h1');
  expect(markup).not.toContain('查看仓库库存余额与出入库记录');
});

test('collapsed warehouse filter has no search or option pagination controls', () => {
  const markup = renderToStaticMarkup(
    <InventoryWarehouseFilter canViewWarehouses value={null} onChange={() => undefined} />,
  );
  expect(markup).toContain('全部仓库');
  expect(markup).not.toContain('搜索仓库');
  expect(markup).not.toContain('下一页仓库选项');
  expect(markup).not.toContain('正在加载仓库选项');
});
