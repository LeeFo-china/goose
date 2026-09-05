import { describe, expect, test } from "bun:test";
import { createClient } from "@supabase/supabase-js";

import {
  SUPPLIER_PURCHASE_BATCH_ITEM_SELECT,
  SUPPLIER_PURCHASE_BATCH_SELECT,
} from "./supplier-purchase-batch-records";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const TENANT_ID = "a0000000-0000-4000-8000-000000000001";
const BATCH_ID = "a0000000-0000-4000-8000-000000000002";
const PROJECT_ID = "a0000000-0000-4000-8000-000000000003";
const RELATIONSHIP_ID = "a0000000-0000-4000-8000-000000000004";
const SUPPLIER_ID = "a0000000-0000-4000-8000-000000000005";
const PRODUCT_ID = "a0000000-0000-4000-8000-000000000006";
const SKU_ID = "a0000000-0000-4000-8000-000000000007";
const EMPLOYEE_ID = "a0000000-0000-4000-8000-000000000008";
const CATEGORY_ID = "a0000000-0000-4000-8000-000000000009";
const PRICE_LIST_ID = "a0000000-0000-4000-8000-000000000010";
const PRICE_ITEM_ID = "a0000000-0000-4000-8000-000000000011";
const PURCHASE_UNIT_ID = "a0000000-0000-4000-8000-000000000012";
const BASE_UNIT_ID = "a0000000-0000-4000-8000-000000000013";
const BRAND_ID = "a0000000-0000-4000-8000-000000000014";
const REQUISITION_ID = "a0000000-0000-4000-8000-000000000015";
const ORDER_ID = "a0000000-0000-4000-8000-000000000016";
const AT = "2026-08-27T08:00:00.000Z";

type ResponseSpec = { body: unknown; count?: number; status?: number };

async function repositoryFor(
  responder: (request: Request, index: number) => ResponseSpec,
) {
  const requests: Request[] = [];
  const fetchStub = (async (
    input: string | URL | Request,
    init?: RequestInit,
  ) => {
    const request = input instanceof Request
      ? input
      : new Request(input.toString(), init);
    const response = responder(request, requests.push(request) - 1);
    return new Response(JSON.stringify(response.body), {
      status: response.status ?? 200,
      headers: {
        "content-type": "application/json",
        ...(response.count === undefined
          ? {}
          : { "content-range": `0-0/${response.count}` }),
      },
    });
  }) as typeof fetch;
  const client = createClient("http://127.0.0.1:54321", "test-key", {
    global: { fetch: fetchStub },
  });
  const { SupplierPurchaseBatchesRepository } = await import(
    "./supplier-purchase-batches"
  );
  return {
    repository: new SupplierPurchaseBatchesRepository(() => client as never),
    requests,
  };
}

describe("SupplierPurchaseBatchesRepository", () => {
  test("returns empty pages without touching DB for an empty project scope", async () => {
    const { repository, requests } = await repositoryFor(() => {
      throw new Error("database must not be called");
    });

    const batches = await repository.listBatches({
      tenant_id: TENANT_ID,
      visible_project_ids: [],
      page: 1,
      pageSize: 20,
    });
    const projects = await repository.listProjectOptions({
      tenant_id: TENANT_ID,
      visible_project_ids: [],
      page: 1,
      pageSize: 20,
    });

    expect(batches.pagination).toEqual(page(1, 20, 0));
    expect(projects.pagination).toEqual(page(1, 20, 0));
    expect(requests).toHaveLength(0);
  });
  test("quotes literal search punctuation and applies visible scope with exact count", async () => {
    const { repository, requests } = await repositoryFor(() => ({
      body: [batch],
      count: 21,
    }));

    const result = await repository.listBatches({
      tenant_id: TENANT_ID,
      visible_project_ids: [PROJECT_ID],
      status: "draft",
      keyword: ' (),"%_\\.:* ',
      page: 2,
      pageSize: 20,
    });

    expect(result.list).toEqual([batch]);
    expect(result.pagination).toEqual(page(2, 20, 21));
    const url = new URL(requests[0]!.url);
    expect(url.pathname).toEndWith("/supplier_purchase_batches");
    expect(url.searchParams.get("select")).toBe(SUPPLIER_PURCHASE_BATCH_SELECT);
    expect(url.searchParams.get("select")).not.toContain("*");
    expect(url.searchParams.get("tenant_id")).toBe(`eq.${TENANT_ID}`);
    expect(url.searchParams.get("project_id")).toBe(`in.(${PROJECT_ID})`);
    expect(url.searchParams.get("status")).toBe("eq.draft");
    expect(url.searchParams.get("or")).toBe(
      '(batch_no.ilike."%(),\\"\\\\%\\\\_\\\\\\\\.:*%",' +
        'reason.ilike."%(),\\"\\\\%\\\\_\\\\\\\\.:*%")',
    );
    expect(url.searchParams.get("order")).toBe("updated_at.desc,id.desc");
    expect(url.searchParams.get("offset")).toBe("20");
    expect(url.searchParams.get("limit")).toBe("20");
    expect(requests[0]!.headers.get("prefer")).toContain("count=exact");
  });
  test("treats null project scope as all visible and loads one tenant batch", async () => {
    const { repository, requests } = await repositoryFor((_request, index) =>
      index === 0 ? { body: [batch], count: 1 } : { body: batch }
    );

    await repository.listBatches({
      tenant_id: TENANT_ID,
      visible_project_ids: null,
      page: 1,
      pageSize: 20,
    });
    expect(await repository.findBatch(TENANT_ID, BATCH_ID)).toEqual(batch);

    expect(new URL(requests[0]!.url).searchParams.has("project_id")).toBeFalse();
    const detailUrl = new URL(requests[1]!.url);
    expect(detailUrl.searchParams.get("tenant_id")).toBe(`eq.${TENANT_ID}`);
    expect(detailUrl.searchParams.get("id")).toBe(`eq.${BATCH_ID}`);
    expect(detailUrl.searchParams.get("select")).toBe(
      SUPPLIER_PURCHASE_BATCH_SELECT,
    );
  });

  test("paginates every child with tenant and batch filters", async () => {
    const { repository, requests } = await repositoryFor((_request, index) => ({
      body: [
        [{ ...batchItem, _batch_scope: { project_id: PROJECT_ID } }],
        [{ ...requisition, _batch_scope: { project_id: PROJECT_ID } }],
        [{ ...order, _batch_scope: { project_id: PROJECT_ID } }],
      ][index],
      count: 1,
    }));
    const input = {
      tenant_id: TENANT_ID,
      batch_id: BATCH_ID,
      visible_project_ids: [PROJECT_ID],
      page: 2,
      pageSize: 10,
    };

    expect((await repository.listItems(input)).list).toEqual([batchItem]);
    expect((await repository.listRequisitions(input)).list).toEqual([
      requisition,
    ]);
    expect((await repository.listOrders(input)).list).toEqual([order]);

    for (const request of requests) {
      const url = new URL(request.url);
      expect(url.searchParams.get("tenant_id")).toBe(`eq.${TENANT_ID}`);
      expect(url.searchParams.get("purchase_batch_id")).toBe(`eq.${BATCH_ID}`);
      expect(url.searchParams.get("_batch_scope.project_id")).toBe(
        `in.(${PROJECT_ID})`,
      );
      expect(url.searchParams.get("offset")).toBe("10");
      expect(url.searchParams.get("limit")).toBe("10");
    }
    expect(new URL(requests[0]!.url).searchParams.get("select")).toContain(
      "_batch_scope:supplier_purchase_batches!" +
        "supplier_purchase_batch_items_parent_tenant_fkey!inner(project_id)",
    );
    expect(new URL(requests[0]!.url).searchParams.get("order")).toBe(
      "line_no.asc,id.asc",
    );
    for (const request of requests.slice(1)) {
      expect(new URL(request.url).searchParams.get("order")).toBe(
        "updated_at.desc,id.desc",
      );
    }
  });

  test("uses bounded catalog and cost category resolver RPC parameters", async () => {
    const { repository, requests } = await repositoryFor((_request, index) => ({
      body: index === 0
        ? { items: [catalogItem], total: 21, page: 2, page_size: 20 }
        : [{
          supplier_sku_id: SKU_ID,
          cost_category_id: CATEGORY_ID,
          cost_category_name: "主材",
          source: "category",
        }],
    }));

    const result = await repository.listCatalog({
      tenant_id: TENANT_ID,
      project_id: PROJECT_ID,
      priced_at: AT,
      page: 2,
      pageSize: 20,
    });

    expect(result.list).toEqual([{
      ...catalogItem,
      default_cost_category_id: CATEGORY_ID,
      default_cost_category_name: "主材",
      cost_category_source: "category",
    }]);
    expect(result.pagination).toEqual(page(2, 20, 21));
    expect(requests).toHaveLength(2);
    expect(requests.map((request) => new URL(request.url).pathname)).toEqual([
      "/rest/v1/rpc/resolve_supplier_purchase_batch_catalog",
      "/rest/v1/rpc/resolve_tenant_supplier_sku_cost_categories",
    ]);
  });

  test("lists bounded visible projects and active cost categories", async () => {
    const { repository, requests } = await repositoryFor((_request, index) => ({
      body: index === 0 ? [projectOption] : [costCategory],
      count: 101,
    }));

    await repository.listProjectOptions({
      tenant_id: TENANT_ID,
      visible_project_ids: [PROJECT_ID],
      keyword: "示范",
      page: 2,
      pageSize: 100,
    });
    await repository.listCostCategories({
      tenant_id: TENANT_ID,
      keyword: "材料",
      page: 2,
      pageSize: 100,
    });

    const projectUrl = new URL(requests[0]!.url);
    expect(projectUrl.pathname).toEndWith("/projects");
    expect(projectUrl.searchParams.get("select")).toBe("id,name,status");
    expect(projectUrl.searchParams.get("id")).toContain(PROJECT_ID);
    expect(projectUrl.searchParams.get("order")).toBe("name.asc,id.asc");
    const categoryUrl = new URL(requests[1]!.url);
    expect(categoryUrl.pathname).toEndWith("/finance_cost_categories");
    expect(categoryUrl.searchParams.get("select")).toBe(
      "id,code,name,status,sort_order",
    );
    expect(categoryUrl.searchParams.get("status")).toBe("eq.active");
    expect(categoryUrl.searchParams.get("order")).toBe("sort_order.asc,id.asc");
    for (const request of requests) {
      const url = new URL(request.url);
      expect(url.searchParams.get("tenant_id")).toBe(`eq.${TENANT_ID}`);
      expect(url.searchParams.get("offset")).toBe("100");
      expect(url.searchParams.get("limit")).toBe("100");
    }
  });

  test("rejects malformed numeric records through the database error boundary", async () => {
    const { repository } = await repositoryFor(() => ({
      body: [{ ...batch, total_amount: 113 }],
      count: 1,
    }));

    await expect(repository.listBatches({
      tenant_id: TENANT_ID,
      visible_project_ids: null,
      page: 1,
      pageSize: 20,
    })).rejects.toMatchObject({ statusCode: 500, code: "DB_ERROR" });
  });
});

function page(pageNumber: number, pageSize: number, total: number) {
  return {
    page: pageNumber,
    pageSize,
    total,
    totalPages: total ? Math.ceil(total / pageSize) : 0,
  };
}

const projectOption = { id: PROJECT_ID, name: "示范项目", status: "active" };
const costCategory = {
  id: CATEGORY_ID,
  code: "MATERIAL",
  name: "材料费",
  status: "active",
  sort_order: 10,
};
const project = { id: PROJECT_ID, name: "示范项目", status: "active" };
const batch = {
  id: BATCH_ID, tenant_id: TENANT_ID, project_id: PROJECT_ID,
  destination_type: "project", warehouse_id: null,
  batch_no: "PB-20260827-00000001",
  status: "draft",
  reason: "项目主材采购",
  expected_delivery_date: "2026-09-10",
  remark: null,
  priced_at: AT,
  currency: "CNY",
  subtotal_amount: "100.00",
  tax_amount: "13.00",
  total_amount: "113.00",
  budget_checked_at: null,
  budget_status: "unchecked",
  budget_snapshot: {},
  split_generation: 0,
  supplier_count: 1,
  item_count: 1,
  version: 1,
  created_by_employee_id: EMPLOYEE_ID,
  updated_by_employee_id: EMPLOYEE_ID,
  submitted_by_employee_id: null,
  submitted_at: null,
  reviewed_by_employee_id: null,
  reviewed_at: null,
  review_remark: null,
  cancelled_by_employee_id: null,
  cancelled_at: null,
  cancel_reason: null,
  created_at: AT,
  updated_at: AT,
  project, warehouse: null,
} as const;
const batchItem = {
  id: "a0000000-0000-4000-8000-000000000020",
  tenant_id: TENANT_ID,
  purchase_batch_id: BATCH_ID,
  line_no: 1,
  supplier_sku_id: SKU_ID,
  quantity: "2.5000",
  cost_category_id: CATEGORY_ID,
  supplier_id: SUPPLIER_ID,
  tenant_supplier_id: RELATIONSHIP_ID,
  supplier_product_id: PRODUCT_ID,
  supplier_price_list_id: PRICE_LIST_ID,
  supplier_price_list_item_id: PRICE_ITEM_ID,
  catalog_category_id: CATEGORY_ID,
  category_name_snapshot: "瓷砖",
  brand_id: BRAND_ID,
  brand_name_snapshot: "示范品牌",
  product_code_snapshot: "P-001",
  product_name_snapshot: "瓷砖",
  sku_code_snapshot: "SKU-001",
  sku_name_snapshot: "灰色 600x600",
  specification_snapshot: "600x600",
  model_snapshot: null,
  purchase_unit_id: PURCHASE_UNIT_ID,
  purchase_unit_code_snapshot: "BOX",
  purchase_unit_name_snapshot: "箱",
  purchase_unit_symbol_snapshot: "箱",
  base_unit_id: BASE_UNIT_ID,
  base_unit_code_snapshot: "PIECE",
  base_unit_name_snapshot: "片",
  base_unit_symbol_snapshot: "片",
  base_unit_conversion: "4.00000000",
  supplier_name_snapshot: "示范供应商",
  price_list_code_snapshot: "DEFAULT",
  price_list_version_snapshot: 1,
  price_effective_from_snapshot: AT,
  price_effective_until_snapshot: null,
  priced_at: AT,
  unit_price: "40.00",
  tax_rate: "0.130000",
  tax_inclusive: false,
  line_subtotal_amount: "100.00",
  line_tax_amount: "13.00",
  line_total_amount: "113.00",
  created_at: AT,
  updated_at: AT,
} as const;

const requisition = {
  id: REQUISITION_ID, tenant_id: TENANT_ID,
  request_no: "PR-20260827-00000001", project_id: PROJECT_ID,
  destination_type: "project", warehouse_id: null,
  tenant_supplier_id: RELATIONSHIP_ID,
  supplier_id: SUPPLIER_ID,
  status: "draft",
  budget_status: "unchecked",
  currency: "CNY",
  reason: "项目主材采购",
  expected_delivery_date: "2026-09-10",
  remark: null,
  priced_at: AT,
  subtotal_amount: "100.00",
  tax_amount: "13.00",
  total_amount: "113.00",
  purchase_order_id: null,
  purchase_batch_id: BATCH_ID,
  split_generation: 1,
  version: 1,
  created_by_employee_id: EMPLOYEE_ID,
  updated_by_employee_id: EMPLOYEE_ID,
  submitted_by_employee_id: null,
  submitted_at: null,
  reviewed_by_employee_id: null,
  reviewed_at: null,
  review_remark: null,
  cancelled_by_employee_id: null,
  cancelled_at: null,
  cancel_reason: null,
  created_at: AT,
  updated_at: AT,
  project, warehouse: null,
} as const;

const order = {
  id: ORDER_ID, tenant_id: TENANT_ID, project_id: PROJECT_ID,
  destination_type: "project", warehouse_id: null,
  tenant_supplier_id: RELATIONSHIP_ID,
  supplier_id: SUPPLIER_ID,
  order_no: "PO-20260827-00000001",
  status: "draft",
  currency: "CNY",
  expected_delivery_date: "2026-09-10",
  remark: null,
  priced_at: AT,
  subtotal_amount: "100.00",
  tax_amount: "13.00",
  total_amount: "113.00",
  purchase_requisition_id: REQUISITION_ID,
  purchase_batch_id: BATCH_ID,
  version: 1,
  created_by_employee_id: EMPLOYEE_ID,
  updated_by_employee_id: EMPLOYEE_ID,
  submitted_by_employee_id: null,
  submitted_at: null,
  cancelled_by_employee_id: null,
  cancelled_at: null,
  cancel_reason: null,
  created_at: AT,
  updated_at: AT,
  project, warehouse: null,
  supplier: {
    id: SUPPLIER_ID,
    code: "SUP-001",
    name: "示范供应商",
    legal_name: "示范供应商有限公司",
    onboarding_status: "approved",
    operational_status: "active",
  },
  purchase_requisition: {
    id: REQUISITION_ID,
    request_no: requisition.request_no,
    status: "draft",
    budget_status: "unchecked",
  },
} as const;

const catalogItem = {
  supplier_product_id: PRODUCT_ID,
  product_code: "P-001",
  product_name: "瓷砖",
  supplier_sku_id: SKU_ID,
  sku_code: "SKU-001",
  sku_name: "灰色 600x600",
  specification: "600x600",
  model: null,
  category_id: CATEGORY_ID,
  category_name: "瓷砖",
  brand_id: BRAND_ID,
  brand_name: "示范品牌",
  tenant_supplier_id: RELATIONSHIP_ID,
  supplier_id: SUPPLIER_ID,
  supplier_name: "示范供应商",
  supplier_price_list_id: PRICE_LIST_ID,
  supplier_price_list_item_id: PRICE_ITEM_ID,
  price_list_code: "DEFAULT",
  price_list_version: 1,
  effective_from: AT,
  effective_until: null,
  purchase_unit_id: PURCHASE_UNIT_ID,
  purchase_unit_code: "BOX",
  purchase_unit_name: "箱",
  purchase_unit_symbol: "箱",
  base_unit_id: BASE_UNIT_ID,
  base_unit_code: "PIECE",
  base_unit_name: "片",
  base_unit_symbol: "片",
  base_unit_conversion: "4.00000000",
  unit_price: "40.00",
  tax_rate: "0.130000",
  tax_inclusive: false,
  currency: "CNY",
  purchasable_status: "purchasable",
} as const;
