import { describe, expect, test } from "bun:test";
import { createClient } from "@supabase/supabase-js";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const TENANT_ID = "50000000-0000-4000-8000-000000000001";
const ORDER_ID = "50000000-0000-4000-8000-000000000002";
const PROJECT_ID = "50000000-0000-4000-8000-000000000003";
const RELATIONSHIP_ID = "50000000-0000-4000-8000-000000000004";
const SUPPLIER_ID = "50000000-0000-4000-8000-000000000005";
const SKU_ID = "50000000-0000-4000-8000-000000000006";
const USER_ID = "50000000-0000-4000-8000-000000000007";
const EMPLOYEE_ID = "50000000-0000-4000-8000-000000000008";

async function repositoryFor(
  responder: (
    request: Request,
    index: number,
  ) => { body: unknown; count?: number; status?: number },
) {
  const requests: Request[] = [];
  const fetchStub = (async (
    input: string | URL | Request,
    init?: RequestInit,
  ) => {
    const request = input instanceof Request
      ? input
      : new Request(input.toString(), init);
    const index = requests.push(request) - 1;
    const response = responder(request, index);
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
  const { SupplierPurchaseOrdersRepository } = await import(
    "./supplier-purchase-orders"
  );
  return {
    repository: new SupplierPurchaseOrdersRepository(() => client as never),
    requests,
  };
}

describe("SupplierPurchaseOrdersRepository", () => {
  test("lists tenant orders in the visible project scope with bounded pagination", async () => {
    const { repository, requests } = await repositoryFor(() => ({
      body: [order],
      count: 21,
    }));

    const result = await repository.listOrders({
      tenant_id: TENANT_ID,
      visible_project_ids: [PROJECT_ID],
      page: 2,
      pageSize: 20,
      status: "draft",
      project_id: PROJECT_ID,
      tenant_supplier_id: RELATIONSHIP_ID,
      keyword: " PO-1,() ",
    });

    expect(result.pagination).toEqual({
      page: 2,
      pageSize: 20,
      total: 21,
      totalPages: 2,
    });
    const request = requests[0]!;
    const url = new URL(request.url);
    expect(url.searchParams.get("tenant_id")).toBe(`eq.${TENANT_ID}`);
    expect(url.searchParams.get("project_id")).toContain(PROJECT_ID);
    expect(url.searchParams.get("status")).toBe("eq.draft");
    expect(url.searchParams.get("tenant_supplier_id")).toBe(
      `eq.${RELATIONSHIP_ID}`,
    );
    expect(url.searchParams.get("offset")).toBe("20");
    expect(url.searchParams.get("limit")).toBe("20");
    expect(url.searchParams.get("order")).toBe(
      "updated_at.desc,id.desc",
    );
    expect(url.searchParams.get("select")).toContain(
      "project:projects!project_id",
    );
    expect(url.searchParams.get("select")).toContain(
      "supplier:suppliers!supplier_id",
    );
    expect(url.searchParams.get("select")).not.toContain("*");
    expect(url.searchParams.get("or")).not.toContain(",");
    expect(request.headers.get("prefer")).toContain("count=exact");
  });

  test("does not query when project visibility is empty", async () => {
    const { repository, requests } = await repositoryFor(() => {
      throw new Error("不应访问数据库");
    });

    const result = await repository.listOrders({
      tenant_id: TENANT_ID,
      visible_project_ids: [],
      page: 1,
      pageSize: 20,
    });

    expect(result.list).toEqual([]);
    expect(result.pagination.total).toBe(0);
    expect(requests).toHaveLength(0);
  });

  test("loads one tenant order and paginates its snapshot items", async () => {
    const { repository, requests } = await repositoryFor((_request, index) =>
      index === 0
        ? { body: order }
        : { body: [item], count: 1 }
    );

    expect(await repository.findOrder(TENANT_ID, ORDER_ID)).toEqual(order);
    const items = await repository.listItems({
      tenant_id: TENANT_ID,
      order_id: ORDER_ID,
      page: 1,
      pageSize: 20,
    });

    const detailUrl = new URL(requests[0]!.url);
    expect(detailUrl.searchParams.get("tenant_id")).toBe(`eq.${TENANT_ID}`);
    expect(detailUrl.searchParams.get("id")).toBe(`eq.${ORDER_ID}`);
    const itemUrl = new URL(requests[1]!.url);
    expect(itemUrl.searchParams.get("tenant_id")).toBe(`eq.${TENANT_ID}`);
    expect(itemUrl.searchParams.get("supplier_purchase_order_id")).toBe(
      `eq.${ORDER_ID}`,
    );
    expect(itemUrl.searchParams.get("select")).toContain(
      "subtotal_amount::text",
    );
    expect(itemUrl.searchParams.get("order")).toBe("line_no.asc,id.asc");
    expect(items.list).toEqual([item]);
  });

  test("resolves the catalog through one paginated RPC call", async () => {
    const { repository, requests } = await repositoryFor(() => ({
      body: {
        items: [catalogItem],
        total: 1,
        page: 2,
        page_size: 10,
      },
    }));

    const result = await repository.listCatalog({
      tenant_id: TENANT_ID,
      tenant_supplier_id: RELATIONSHIP_ID,
      priced_at: "2026-07-29T08:00:00.000Z",
      keyword: "瓷砖",
      page: 2,
      pageSize: 10,
    });

    expect(result.list).toEqual([catalogItem]);
    expect(result.pagination).toEqual({
      page: 2,
      pageSize: 10,
      total: 1,
      totalPages: 1,
    });
    expect(new URL(requests[0]!.url).pathname).toEndWith(
      "/rpc/resolve_supplier_purchase_order_catalog",
    );
    expect(await requests[0]!.clone().json()).toEqual({
      p_tenant_id: TENANT_ID,
      p_tenant_supplier_id: RELATIONSHIP_ID,
      p_priced_at: "2026-07-29T08:00:00.000Z",
      p_keyword: "瓷砖",
      p_page: 2,
      p_page_size: 10,
    });
  });

  test("uses p-prefixed parameters for all purchase order commands", async () => {
    const statuses = ["saved", "submitted", "cancelled"] as const;
    const { repository, requests } = await repositoryFor((_request, index) => ({
      body: {
        status: statuses[index],
        idempotent: false,
        purchase_order: {
          ...orderSnapshot,
          status: statuses[index] === "saved" ? "draft" : statuses[index],
        },
        version: index + 1,
      },
    }));
    const context = {
      tenant_id: TENANT_ID,
      order_id: ORDER_ID,
      expected_version: 1,
      actor_user_id: USER_ID,
      actor_employee_id: EMPLOYEE_ID,
      idempotency_key: "purchase-order:command",
    };

    await repository.saveDraft({
      ...context,
      project_id: PROJECT_ID,
      tenant_supplier_id: RELATIONSHIP_ID,
      expected_delivery_date: null,
      remark: null,
      items: [{ supplier_sku_id: SKU_ID, quantity: 2 }],
    });
    await repository.submit(context);
    await repository.cancel({ ...context, reason: "项目需求已取消" });

    expect(requests.map((request) => new URL(request.url).pathname)).toEqual([
      "/rest/v1/rpc/save_supplier_purchase_order_draft",
      "/rest/v1/rpc/submit_supplier_purchase_order",
      "/rest/v1/rpc/cancel_supplier_purchase_order",
    ]);
    for (const request of requests) {
      const body = await request.clone().json() as Record<string, unknown>;
      expect(body.p_order_id).toBe(ORDER_ID);
      expect(body.p_tenant_id).toBe(TENANT_ID);
      expect(body.p_idempotency_key).toBe("purchase-order:command");
      expect(Object.keys(body).every((key) => key.startsWith("p_"))).toBeTrue();
    }
  });

  test("rejects malformed database responses instead of leaking them", async () => {
    const { repository } = await repositoryFor(() => ({
      body: [{ ...order, total_amount: 10 }],
      count: 1,
    }));

    await expect(repository.listOrders({
      tenant_id: TENANT_ID,
      visible_project_ids: null,
      page: 1,
      pageSize: 20,
    })).rejects.toMatchObject({
      statusCode: 500,
      code: "DB_ERROR",
    });
  });

  test("maps command envelope conflicts to stable business errors", async () => {
    const { repository } = await repositoryFor(() => ({
      body: {
        status: "price_changed",
        error_code: "SUPPLIER_PURCHASE_ORDER_PRICE_CHANGED",
      },
    }));

    await expect(repository.submit({
      tenant_id: TENANT_ID,
      order_id: ORDER_ID,
      expected_version: 1,
      actor_user_id: USER_ID,
      actor_employee_id: EMPLOYEE_ID,
      idempotency_key: "purchase-order:submit",
    })).rejects.toMatchObject({
      statusCode: 409,
      code: "SUPPLIER_PURCHASE_ORDER_PRICE_CHANGED",
    });
  });

  test("maps RPC database business tokens before using the DB fallback", async () => {
    const { repository } = await repositoryFor(() => ({
      body: {
        code: "P0001",
        message: "SUPPLIER_PURCHASE_ORDER_PROJECT_INVALID",
      },
      status: 400,
    }));

    await expect(repository.cancel({
      tenant_id: TENANT_ID,
      order_id: ORDER_ID,
      expected_version: 1,
      reason: "项目需求已取消",
      actor_user_id: USER_ID,
      actor_employee_id: EMPLOYEE_ID,
      idempotency_key: "purchase-order:cancel",
    })).rejects.toMatchObject({
      statusCode: 409,
      code: "SUPPLIER_PURCHASE_ORDER_PROJECT_INVALID",
    });
  });
});

const order = {
  id: ORDER_ID,
  tenant_id: TENANT_ID,
  project_id: PROJECT_ID,
  tenant_supplier_id: RELATIONSHIP_ID,
  supplier_id: SUPPLIER_ID,
  order_no: "PO-20260729-00000001",
  status: "draft",
  currency: "CNY",
  expected_delivery_date: null,
  remark: null,
  priced_at: "2026-07-29T08:00:00.000Z",
  subtotal_amount: "20.00",
  tax_amount: "2.60",
  total_amount: "22.60",
  version: 1,
  created_by_employee_id: EMPLOYEE_ID,
  updated_by_employee_id: EMPLOYEE_ID,
  submitted_by_employee_id: null,
  submitted_at: null,
  cancelled_by_employee_id: null,
  cancelled_at: null,
  cancel_reason: null,
  created_at: "2026-07-29T08:00:00.000Z",
  updated_at: "2026-07-29T08:00:00.000Z",
  project: {
    id: PROJECT_ID,
    name: "示范项目",
    status: "active",
  },
  supplier: {
    id: SUPPLIER_ID,
    code: "SUP-001",
    name: "示范供应商",
    legal_name: "示范供应商有限公司",
    onboarding_status: "approved",
    operational_status: "active",
  },
} as const;

const { project: _project, supplier: _supplier, ...orderSnapshot } = order;

const item = {
  id: "50000000-0000-4000-8000-000000000009",
  tenant_id: TENANT_ID,
  supplier_id: SUPPLIER_ID,
  supplier_purchase_order_id: ORDER_ID,
  line_no: 1,
  supplier_product_id: "50000000-0000-4000-8000-000000000010",
  supplier_sku_id: SKU_ID,
  supplier_price_list_id: "50000000-0000-4000-8000-000000000011",
  supplier_price_list_item_id: "50000000-0000-4000-8000-000000000012",
  product_code_snapshot: "P-001",
  product_name_snapshot: "瓷砖",
  sku_code_snapshot: "SKU-001",
  sku_name_snapshot: "灰色 600x600",
  specification_snapshot: "600x600",
  model_snapshot: null,
  purchase_unit_id: "50000000-0000-4000-8000-000000000013",
  purchase_unit_code_snapshot: "BOX",
  purchase_unit_name_snapshot: "箱",
  purchase_unit_symbol_snapshot: "箱",
  base_unit_id: "50000000-0000-4000-8000-000000000014",
  base_unit_code_snapshot: "PIECE",
  base_unit_name_snapshot: "片",
  base_unit_symbol_snapshot: "片",
  base_unit_conversion: "4.00000000",
  price_list_code_snapshot: "PL-001",
  price_list_version_snapshot: 1,
  price_effective_from_snapshot: "2026-07-01T00:00:00.000Z",
  price_effective_until_snapshot: null,
  quantity: "2.0000",
  unit_price: "10.00",
  tax_rate: "0.130000",
  tax_inclusive: false,
  subtotal_amount: "20.00",
  tax_amount: "2.60",
  total_amount: "22.60",
  created_at: "2026-07-29T08:00:00.000Z",
  updated_at: "2026-07-29T08:00:00.000Z",
};

const catalogItem = {
  supplier_product_id: item.supplier_product_id,
  product_code: "P-001",
  product_name: "瓷砖",
  supplier_sku_id: SKU_ID,
  sku_code: "SKU-001",
  sku_name: "灰色 600x600",
  specification: "600x600",
  model: null,
  supplier_price_list_id: item.supplier_price_list_id,
  price_list_code: "PL-001",
  price_list_version: 1,
  effective_from: "2026-07-01T00:00:00.000Z",
  effective_until: null,
  supplier_price_list_item_id: item.supplier_price_list_item_id,
  purchase_unit_id: item.purchase_unit_id,
  purchase_unit_code: "BOX",
  purchase_unit_name: "箱",
  purchase_unit_symbol: "箱",
  base_unit_id: item.base_unit_id,
  base_unit_code: "PIECE",
  base_unit_name: "片",
  base_unit_symbol: "片",
  base_unit_conversion: "4.00000000",
  unit_price: "10.00",
  tax_rate: "0.130000",
  tax_inclusive: false,
};
