import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { StocktakeList } from './stocktake-list';

const access = {
  canRead: true,
  canManage: true,
  canApprove: false,
  canViewWarehouses: true,
};

test('盘点列表使用紧凑筛选工作区并在加载时保留表头', () => {
  const html = renderToStaticMarkup(
    <StocktakeList access={access} revision={0} active onOpen={() => {}} />,
  );

  expect(html).toContain('data-slot="document-list-card"');
  expect(html).toContain('aria-label="筛选盘点单"');
  expect(html).toContain('aria-label="盘点仓库"');
  expect(html).toContain('aria-label="盘点单列表"');
  expect(html).toContain('aria-busy="true"');
  expect(html).toContain('盘盈 / 盘亏金额');
  expect(html).not.toContain('清除筛选');
  expect(html).not.toContain('搜索盘点仓库');
});
