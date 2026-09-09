import { STOCKTAKE_TEST_ORDER, STOCKTAKE_TEST_ITEM, STOCKTAKE_TEST_ID } from './stocktake-test-fixtures';
import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import type { WarehouseStocktakeOrderSummary, WarehouseStocktakeItem } from '@gooes/domain';
import { StocktakeDraft } from './stocktake-draft';
import { StocktakeCounts, buildStocktakeCounts } from './stocktake-counts';
import { StocktakeItemTable, StocktakePager } from './stocktake-parts';
import { StocktakeDetailContent } from './stocktake-detail';
const access = { canRead: true, canManage: true, canApprove: false, canViewWarehouses: true };
const id = STOCKTAKE_TEST_ID;
const order: WarehouseStocktakeOrderSummary = STOCKTAKE_TEST_ORDER;
const item: WarehouseStocktakeItem = STOCKTAKE_TEST_ITEM;
test('新建草稿只选仓库与SKU，已保存草稿锁仓', () => {
  const render = (saved: boolean) =>
    renderToStaticMarkup(
      <StocktakeDraft
        seed={{ id, order: saved ? { ...order, status: 'draft' } : undefined, items: [] }}
        access={access}
        disabled={false}
        onSave={() => {}}
        onClose={() => {}}
      />,
    );
  expect(render(false)).toContain('stocktake-warehouse');
  expect(render(true)).toContain('已保存草稿不可更换仓库');
  expect(render(true)).not.toContain('stocktake-warehouse');
  expect(render(false)).not.toContain('成本单价');
});
test('实盘编辑无分页、不把未录入当零、没有成本输入', () => {
  const html = renderToStaticMarkup(
    <StocktakeCounts order={order} items={[item]} disabled={false} onSave={() => {}} onClose={() => {}} />,
  );
  expect(html).toContain('实盘数量');
  expect(html).toContain('value=""');
  expect(html).toContain('99,999,999,999,999.9999');
  expect(html).not.toContain('下一页');
  expect(html).not.toContain('type="number"');
});
test('部分实盘跳过空串、保留零，非零差异必须原因，发送白名单', () => {
  expect(buildStocktakeCounts(2, [{ item, counted: '', reason: '' }]).error).toBeTruthy();
  expect(buildStocktakeCounts(2, [{ item, counted: '0', reason: '' }]).error).toContain('差异原因');
  const result = buildStocktakeCounts(2, [{ item, counted: '0', reason: ' 清点短缺 ' }]);
  expect(result.payload).toEqual({
    expected_version: 2,
    items: [{ supplier_sku_id: id, counted_quantity: '0', difference_reason: '清点短缺' }],
  });
});
test('详情明确显示原账面与实盘及过账金额，空值有意义', () => {
  const html = renderToStaticMarkup(<StocktakeItemTable items={[item]} />);
  for (const label of [
    '账面数量',
    '账面金额',
    '账面单价',
    '实盘数量',
    '差异数量',
    '差异原因',
    '过账金额',
    '未录入',
    '待确认',
  ])
    expect(html).toContain(label);
  expect(renderToStaticMarkup(<StocktakePager label="盘点明细分页" onPage={() => {}} />)).toContain(
    'aria-label="盘点明细分页"',
  );
});
test('未全部保存实盘不提供提交，终态不提供命令', () => {
  const render = (value: WarehouseStocktakeOrderSummary) =>
    renderToStaticMarkup(
      <StocktakeDetailContent
        order={value}
        items={{ list: [item], pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 } }}
        access={access}
        disabled={false}
        onEdit={() => {}}
        onCommand={() => {}}
        onPage={() => {}}
      />,
    );
  expect(render(order)).toContain('录入实盘');
  expect(render(order)).not.toContain('提交盘点</button>');
  expect(render({ ...order, counted_count: 1 })).toContain('提交盘点');
  const terminal = render({ ...order, status: 'completed', counted_count: 1 });
  expect(terminal).not.toContain('录入实盘</button>');
  expect(terminal).not.toContain('取消盘点</button>');
});
