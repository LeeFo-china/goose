import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { Children, isValidElement, type ReactNode } from 'react';
import { InventoryTable } from './inventory-table';
import { initialInventoryState, inventoryReducer } from './inventory-rules';
import type { InventoryBalance, InventoryTransaction } from './inventory-types';

export const balance: InventoryBalance = {
  id: 'balance-private-id',
  warehouse_id: 'warehouse-private-id',
  warehouse_name: '中心仓',
  supplier_sku_id: 'sku-private-id',
  sku_code: 'LED-01',
  sku_name: '节能灯',
  specification: '暖白',
  model: 'A型',
  quantity_on_hand: '10.00000000',
  average_unit_cost: '8.12500000',
  inventory_value: '81.25000000',
  updated_at: '2026-09-07T01:00:00Z',
};
const transaction: InventoryTransaction = {
  ...balance,
  transaction_type: 'purchase_receipt',
  quantity_delta: '10',
  value_delta: '81.25',
  occurred_at: balance.updated_at,
  created_by_employee_name: '王师傅',
  source_document: {
    receipt_id: 'receipt-private-id',
    receipt_no: 'RK20260907001',
    purchase_order_id: 'order-private-id',
    order_no: 'CG20260907001',
  },
};
const common = {
  loading: false,
  error: '',
  onRetry() {},
  onReset() {},
  onWarehouse() {},
  onDrill() {},
  canViewPurchaseOrders: false,
};

test('领退料来源按项目成本查看权限链接，不借用采购权限', () => {
  const row: InventoryTransaction = {
    ...transaction,
    source_document: {
      return_order_id: 'return-id',
      return_order_no: 'TL001',
      issue_order_id: 'issue-id',
      issue_order_no: 'LL001',
    },
  };
  const render = (canViewMaterials: boolean) =>
    renderToStaticMarkup(
      <InventoryTable
        {...common}
        canViewMaterials={canViewMaterials}
        tab="transactions"
        balances={[]}
        transactions={[row]}
      />,
    );
  expect(render(true)).toContain('/warehouse-returns?order_id=return-id');
  expect(render(true)).toContain('/warehouse-issues?order_id=issue-id');
  expect(render(false)).toContain('TL001');
  expect(render(false)).not.toContain('href=');
});

test('balance rows display exact inventory facts and friendly drill actions without UUIDs', () => {
  const markup = renderToStaticMarkup(
    <InventoryTable
      {...common}
      tab="balances"
      balances={[balance]}
      transactions={[]}
    />,
  );
  for (const label of [
    '现存数量',
    '平均成本',
    '库存金额',
    '节能灯',
    'LED-01',
    '中心仓',
    '8.125',
    '查看流水',
  ])
    expect(markup).toContain(label);
  expect(markup).not.toContain('private-id');
});

test('source labels are readable but purchase-order links require their own permission', () => {
  const render = (allowed: boolean) =>
    renderToStaticMarkup(
      <InventoryTable
        {...common}
        tab="transactions"
        balances={[]}
        transactions={[transaction]}
        canViewPurchaseOrders={allowed}
      />,
    );
  for (const label of [
    '采购入库',
    '+10',
    '+81.25',
    'RK20260907001',
    'CG20260907001',
    '王师傅',
  ])
    expect(render(false)).toContain(label);
  expect(render(false)).not.toContain('private-id');
  expect(render(true)).toContain(
    '/supplier-purchase-orders?purchase_order_id=order-private-id',
  );
});

test('unavailable source and actor do not fall back to raw IDs', () => {
  const markup = renderToStaticMarkup(
    <InventoryTable
      {...common}
      tab="transactions"
      balances={[]}
      transactions={[
        {
          ...transaction,
          source_document: null,
          created_by_employee_name: null,
        },
      ]}
    />,
  );
  expect(markup).toContain('来源单据不可用');
  expect(markup).toContain('操作人不可用');
  expect(markup).not.toContain('private-id');
});

test('loading, error/retry and empty/reset preserve table headers', () => {
  const render = (patch: Partial<typeof common>) =>
    renderToStaticMarkup(
      <InventoryTable
        {...common}
        {...patch}
        tab="balances"
        balances={[]}
        transactions={[]}
      />,
    );
  expect(render({ loading: true })).toContain('正在加载库存');
  expect(render({ error: '读取失败' })).toContain('重试');
  expect(render({ error: '读取失败' })).toContain('读取失败');
  expect(render({})).toContain('暂无符合条件的库存余额');
  expect(render({})).toContain('清除筛选');
  expect(render({ loading: true })).toContain('库存金额');
});

function clickNamed(node: ReactNode, name: string): boolean {
  return Children.toArray(node).some((child) => {
    if (
      !isValidElement<{
        children?: ReactNode;
        'aria-label'?: string;
        onClick?: () => void;
      }>(child)
    )
      return false;
    if (child.props['aria-label'] === name || child.props.children === name) {
      if (child.props.onClick) {
        child.props.onClick();
        return true;
      }
    }
    return clickNamed(child.props.children, name);
  });
}

test('actual row actions wire warehouse and SKU identity into the next transaction query', () => {
  let state = { ...initialInventoryState, page: 4 };
  const element = InventoryTable({
    ...common,
    tab: 'balances',
    balances: [balance],
    transactions: [],
    onWarehouse: (warehouse) => {
      state = inventoryReducer(state, { type: 'warehouse', warehouse });
    },
    onDrill: (row) => {
      state = inventoryReducer(state, {
        type: 'drill',
        sku: { id: row.supplier_sku_id, name: row.sku_name },
        warehouse: { id: row.warehouse_id, name: row.warehouse_name },
      });
    },
  });
  expect(clickNamed(element, '中心仓')).toBe(true);
  expect(state.warehouse).toEqual({ id: balance.warehouse_id, name: '中心仓' });
  expect(state.page).toBe(1);
  expect(clickNamed(element, '查看 节能灯 在 中心仓 的流水')).toBe(true);
  expect(state.tab).toBe('transactions');
  expect(state.sku?.id).toBe(balance.supplier_sku_id);
});

test('actual error and empty actions call retry and clear filters', () => {
  let retries = 0;
  let resets = 0;
  const props = {
    ...common,
    tab: 'balances' as const,
    balances: [],
    transactions: [],
    onRetry: () => {
      retries++;
    },
    onReset: () => {
      resets++;
    },
  };
  expect(
    clickNamed(InventoryTable({ ...props, error: '读取失败' }), '重试'),
  ).toBe(true);
  expect(clickNamed(InventoryTable(props), '清除筛选')).toBe(true);
  expect([retries, resets]).toEqual([1, 1]);
});
