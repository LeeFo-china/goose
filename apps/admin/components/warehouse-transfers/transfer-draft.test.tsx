import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import type { WarehouseTransferSummary } from '@gooes/domain';

import { TransferDraft } from './transfer-draft';
import { TransferPager } from './transfer-parts';

const access = { canRead: true, canManage: true, canApprove: false, canViewWarehouses: true };
const order = {
  id: '88abcdef-0000-4000-8000-000000000101', source_warehouse_id: 'source',
  destination_warehouse_id: 'destination', source_warehouse_name: '一号仓',
  destination_warehouse_name: '二号仓', reason: '调拨', version: 1,
} as WarehouseTransferSummary;

test('已保存草稿锁定双仓并提示更换仓库需新建单据', () => {
  const html = renderToStaticMarkup(<TransferDraft seed={{ id: order.id, order, items: [] }} access={access} disabled={false} onSave={() => {}} onClose={() => {}} />);
  expect(html).toContain('一号仓');
  expect(html).toContain('二号仓');
  expect(html).toContain('如需更换仓库，请新建调拨单');
  expect(html).not.toContain('transfer-source-warehouse');
  expect(html).not.toContain('transfer-destination-warehouse');
});

test('新调拨提供两个独立仓库选择器', () => {
  const html = renderToStaticMarkup(<TransferDraft seed={{ id: order.id, items: [] }} access={access} disabled={false} onSave={() => {}} onClose={() => {}} />);
  expect(html).toContain('transfer-source-warehouse');
  expect(html).toContain('transfer-destination-warehouse');
});

test('调拨分页提供可区分的无障碍导航名称', () => {
  const html = renderToStaticMarkup(<TransferPager label="调拨明细分页" onPage={() => {}} />);
  expect(html).toContain('aria-label="调拨明细分页"');
  expect(html).toContain('role="navigation"');
});
