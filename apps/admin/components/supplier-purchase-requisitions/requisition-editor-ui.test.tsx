import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import type { FinanceCostCategoryRecord } from "@/components/finance/finance-cost-budget-requests";
import {
  catalogItem,
  category,
} from "../../e2e/supplier-purchase-requisition-mock-fixture.mjs";
import {
  RequisitionCatalogBrowser,
  RequisitionHeaderFields,
} from "./requisition-editor-fields";
import { SelectedRequisitionLines } from "./requisition-editor-lines";
import {
  RequisitionEditorAlerts,
  RequisitionEditorFooter,
} from "./requisition-editor-parts";

const activeCategory: FinanceCostCategoryRecord = {
  ...category,
  status: "active",
};

test("已选商品以行内工作区展示上下文成本类目和 BigInt 参考货值", () => {
  const html = renderToStaticMarkup(
    <SelectedRequisitionLines
      lines={[{
        supplierSkuId: catalogItem.supplier_sku_id,
        costCategoryId: "",
        quantity: "2.5000",
      }]}
      facts={{ [catalogItem.supplier_sku_id]: catalogItem }}
      categories={[activeCategory]}
      disabled={false}
      recentlyAddedSkuId={catalogItem.supplier_sku_id}
      onChange={() => {}}
      onRemove={() => {}}
    />,
  );

  expect(html).toContain("已选商品");
  expect(html).toContain("单一供应商采购申请");
  expect(html).toContain("E2E 临采瓷砖 800x800的成本类目");
  expect(html).toContain("¥250.00");
  expect(html).toContain("刚刚加入");
  expect(html).toContain("size-11");
  expect(html).not.toContain("<table");
});

test("空选择区直接提示从目录加入商品且不渲染空表", () => {
  const html = renderToStaticMarkup(
    <SelectedRequisitionLines
      lines={[]}
      facts={{}}
      categories={[]}
      disabled={false}
      onChange={() => {}}
      onRemove={() => {}}
    />,
  );

  expect(html).toContain("从左侧商品目录加入商品");
  expect(html).not.toContain("<table");
});

test("申请上下文使用项目用途预设和折叠备注，页脚汇总待补类目", () => {
  const context = renderToStaticMarkup(
    <RequisitionHeaderFields
      projectId=""
      tenantSupplierId=""
      reason=""
      expectedDeliveryDate=""
      remark=""
      projects={[]}
      relationships={[]}
      validation={{}}
      fieldsLocked={false}
      isExisting={false}
      canLoadMoreProjects={false}
      canLoadMoreSuppliers={false}
      loadingMoreOptions={false}
      onProjectChange={() => {}}
      onSupplierChange={() => {}}
      onReasonChange={() => {}}
      onDeliveryDateChange={() => {}}
      onRemarkChange={() => {}}
      onLoadMoreProjects={() => {}}
      onLoadMoreSuppliers={() => {}}
    />,
  );
  const footer = renderToStaticMarkup(
    <RequisitionEditorFooter
      summary={{
        itemCount: 1,
        supplierCount: 1,
        missingCategoryCount: 1,
        referenceAmount: "250.00",
      }}
      loading={false}
      saving={false}
      refreshing={false}
      refreshRequired={false}
      draftReady
      hasAttempt={false}
      onClose={() => {}}
      onSave={() => {}}
    />,
  );

  expect(context).toContain("项目备料");
  expect(context).toContain("现场补料");
  expect(context).toContain("补充信息");
  expect(context).toContain("max-h-[min(14rem,40dvh)]");
  expect(footer.replace(/<[^>]+>/g, "")).toContain("1 个 SKU");
  expect(footer).toContain("¥250.00");
  expect(footer).toContain("待选成本类目");
  expect(footer).toContain("min-h-11");
});

test("目录错误在紧凑粘性搜索区下方独立展示并提供重试和关闭", () => {
  const html = renderToStaticMarkup(
    <RequisitionCatalogBrowser
      catalog={{
        list: [catalogItem],
        pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
      }}
      catalogPage={1}
      catalogKeyword=""
      catalogError="目录暂不可用"
      loadingCatalog={false}
      tenantSupplierId="relationship-1"
      fieldsLocked={false}
      lines={[]}
      onKeywordChange={() => {}}
      onSearch={() => {}}
      onPageChange={() => {}}
      onRetry={() => {}}
      onDismissError={() => {}}
      onAdd={() => {}}
    />,
  );

  expect(html).toContain("目录暂不可用");
  expect(html).not.toContain(catalogItem.product_name);
  expect(html).toContain("重新加载目录");
  expect(html).toContain("关闭提示");
  expect(html).toContain("sticky top-0");
  expect(html).not.toContain("lg:sticky");
  expect(html.match(/role=\"search\"/g)).toHaveLength(1);
});

test("记录加载失败提供重试且未水合状态锁住保存", () => {
  const alert = renderToStaticMarkup(
    <RequisitionEditorAlerts
      error="采购申请 B 加载失败"
      conflict={null}
      hasAttempt={false}
      saving={false}
      loadingDraft={false}
      draftLoadFailed
      refreshRequired={false}
      editingId={null}
      refreshing={false}
      onAbandonAttempt={() => {}}
      onRetryLoad={() => {}}
      onRefresh={() => {}}
    />,
  );
  const footer = renderToStaticMarkup(
    <RequisitionEditorFooter
      summary={{
        itemCount: 0,
        supplierCount: 0,
        missingCategoryCount: 0,
        referenceAmount: "0.00",
      }}
      loading={false}
      saving={false}
      refreshing={false}
      refreshRequired={false}
      draftReady={false}
      hasAttempt={false}
      onClose={() => {}}
      onSave={() => {}}
    />,
  );

  expect(alert).toContain("重新加载采购申请");
  expect(footer).toMatch(/<button[^>]+disabled[^>]*>保存草稿<\/button>/);
});
