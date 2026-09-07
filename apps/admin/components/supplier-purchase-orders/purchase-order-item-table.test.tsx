import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { PurchaseOrderItemTable } from "./purchase-order-item-table";

test("detail item page exposes the next bounded page and retry errors", () => {
  const props = {
    items: [],
    pagination: { page: 1, pageSize: 100, total: 101, totalPages: 2 },
    loading: false,
    error: null,
    onLoadMore() {},
  };
  const render = renderToStaticMarkup(<PurchaseOrderItemTable {...props} />);
  expect(render).toContain("共 101 条");
  expect(render).toContain("加载更多明细");
  expect(
    renderToStaticMarkup(
      <PurchaseOrderItemTable {...props} error="明细读取失败" />,
    ),
  ).toContain("明细读取失败");
  expect(
    renderToStaticMarkup(
      <PurchaseOrderItemTable
        {...props}
        pagination={{ ...props.pagination, page: 2 }}
      />,
    ),
  ).not.toContain("加载更多明细");
});
