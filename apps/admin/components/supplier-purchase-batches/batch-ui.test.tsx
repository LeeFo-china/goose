import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
  batchDetail,
  batchRecord,
  warehouses,
} from "../../e2e/supplier-purchase-batch-fixture.mjs";
import { BatchList } from "./batch-list";
import { BatchSummary } from "./batch-detail";
import { batchActionChoices } from "./batch-actions";
import { BatchLines } from "./batch-lines";
import { batchMoney } from "./batch-page-parts";
import { draftError, newBatchDraft } from "./batch-rules";
import type { BatchDetail as Detail } from "./batch-types";
import { BatchRevisionNotice } from "./batch-revision-notice";
import { BatchCatalogFilters } from "./batch-catalog-filters";
import { BatchCatalogAddAction } from "./batch-catalog";
import { BatchCostCategoryPicker } from "./batch-cost-category-picker";

test("revision notice identifies the frozen revision version, not the latest batch version", () => {
  const html = renderToStaticMarkup(
    <BatchRevisionNotice
      revision={{
        batch: { id: "batch", status: "draft" },
        version: 7,
        error_code: "SUPPLIER_PURCHASE_BATCH_PRICE_CHANGED",
        details: [],
      }}
    />,
  );
  expect(html).toContain("本次修订已保存为版本 7");
  expect(html).toContain("不代表当前最新版本");
});

test("frozen decimal amounts retain cents above the JavaScript safe integer range", () => {
  expect(batchMoney("9999999999999999.99")).toBe("¥9,999,999,999,999,999.99");
});

const warehouse = batchDetail(
  batchRecord({
    destination_type: "warehouse",
    warehouse_id: warehouses[22].id,
    project_id: null,
    budget_status: "not_applicable",
  }),
) as Detail;
test("null-project warehouse rows and summary render friendly ownership even when inactive", () => {
  const html = renderToStaticMarkup(
    <>
      <BatchList rows={[warehouse]} onOpen={() => {}} />
      <BatchSummary batch={warehouse} />
    </>,
  );
  expect(html).toContain("补货仓23");
  expect(html).toContain("仓库补货");
  expect(html).toContain("不适用项目预算");
  expect(html).not.toContain(warehouses[22].id);
});
test("a reviewer without procurement manage receives only actual backend task actions", () => {
  const reviewer = batchDetail(
    batchRecord({ status: "pending_approval" }),
    "reviewer",
  ) as Detail;
  expect(batchActionChoices(reviewer).map((action) => action.action)).toEqual([
    "approve",
    "reject",
  ]);
  expect(batchActionChoices({ ...reviewer, actions: undefined })).toEqual([]);
  expect(
    batchActionChoices({
      ...reviewer,
      workflow_state: { ...reviewer.workflow_state!, actions: [] },
    }),
  ).toEqual([]);
});
test("disabled backend actions preserve their disabled reason", () => {
  const reviewer = batchDetail(
    batchRecord({ status: "pending_approval" }),
    "reviewer",
  ) as Detail;
  const choice = batchActionChoices({
    ...reviewer,
    workflow_state: {
      ...reviewer.workflow_state!,
      actions: [{
        key: "approve",
        label: "批准",
        business_action: "approve",
        requires_reason: false,
        disabled: true,
        disabled_reason: "当前步骤未开放",
      }],
    },
  });
  expect(choice[0]).toMatchObject({
    disabled: true,
    disabledReason: "当前步骤未开放",
  });
});
test("missing default cost category is actionable and blocks save", () => {
  const lines = [{
    supplier_sku_id: "sku",
    supplier_id: "supplier",
    name: "瓷砖",
    cost_category_id: "",
    quantity: "1",
  }];
  expect(
    draftError({
      ...newBatchDraft(),
      project_id: "project",
      reason: "采购",
      lines,
    }),
  ).toContain("成本类目");
  expect(
    renderToStaticMarkup(
      <BatchLines lines={lines} disabled={false} onChange={() => {}} />,
    ),
  ).toContain("选择成本类目");
});

test("selected products stay visible in the workbench with unit and compact category action", () => {
  const line = {
    supplier_sku_id: "sku",
    supplier_id: "supplier",
    supplier_name: "建材供应商",
    name: "瓷砖 · 米白 600×600",
    sku_code: "SKU-001",
    cost_category_id: "",
    quantity: "2",
    purchase_unit_name: "箱",
  };
  const html = renderToStaticMarkup(
    <BatchLines lines={[line]} disabled={false} onChange={() => {}} />,
  );
  expect(html).toContain("已选商品");
  expect(html).toContain("1 / 100");
  expect(html).toContain("建材供应商");
  expect(html).toContain("SKU-001");
  expect(html).toContain("箱");
  expect(html).toContain("选择成本类目");

  const empty = renderToStaticMarkup(
    <BatchLines lines={[]} disabled={false} onChange={() => {}} />,
  );
  expect(empty).toContain("从左侧商品目录加入商品");
});

test("cost category picker exposes a warning-labelled popover trigger", () => {
  const line = {
    supplier_sku_id: "sku",
    supplier_id: "supplier",
    name: "瓷砖",
    cost_category_id: "",
    quantity: "1",
  };
  const html = renderToStaticMarkup(
    <BatchCostCategoryPicker
      line={line}
      disabled={false}
      onChange={() => {}}
    />,
  );
  expect(html).toContain("选择成本类目");
  expect(html).toContain("尚未选择成本类目");
  expect(html).toContain("aria-haspopup=\"dialog\"");
});

test("catalog filters expose controlled category and supplier reset actions", () => {
  const html = renderToStaticMarkup(
    <BatchCatalogFilters
      value={{
        category: { id: "category", name: "主材" },
        supplier: { id: "supplier", name: "建材供应商" },
      }}
      disabled={false}
      onChange={() => {}}
    />,
  );

  expect(html).toContain("商品分类");
  expect(html).toContain("供应商");
  expect(html).toContain("全部分类");
  expect(html).toContain("全部供应商");
});

test("catalog limit reasons remain visible beside an unfocusable disabled action", () => {
  const html = renderToStaticMarkup(
    <BatchCatalogAddAction
      productName="瓷砖"
      selected={false}
      disabled={true}
      disabledReason="每个批次最多选择 100 个 SKU"
      onAdd={() => {}}
    />,
  );

  expect(html).toContain("每个批次最多选择 100 个 SKU");
  expect(html).toContain("aria-describedby=");
  expect(html).toContain("disabled=\"\"");
  expect(html).not.toContain("title=");
});
