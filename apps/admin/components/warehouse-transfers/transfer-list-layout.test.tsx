import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { INITIAL_TRANSFER_LIST_STATE, TransferList } from './transfer-list';

const access = {
  canRead: true,
  canManage: true,
  canApprove: false,
  canViewWarehouses: true,
};

test('调拨列表将两个仓库筛选收进组合框并在加载时保留表头', () => {
  const html = renderToStaticMarkup(
    <TransferList
      access={access}
      revision={0}
      onOpen={() => {}}
      state={INITIAL_TRANSFER_LIST_STATE}
      onChange={() => {}}
    />,
  );

  expect(html).toContain('data-slot="document-list-card"');
  expect(html).toContain('aria-label="筛选调拨单"');
  expect(html).toContain('aria-label="调出仓库"');
  expect(html).toContain('aria-label="调入仓库"');
  expect(html).toContain('aria-label="调拨单列表"');
  expect(html).toContain('aria-busy="true"');
  expect(html).toContain('总金额');
  expect(html).not.toContain('清除筛选');
  expect(html).not.toContain('搜索调出仓库');
  expect(html).not.toContain('搜索调入仓库');
});
