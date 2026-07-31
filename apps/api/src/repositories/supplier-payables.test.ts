import { describe, expect, test } from "bun:test";
import { createClient } from "@supabase/supabase-js";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const TENANT_ID = "80000000-0000-4000-8000-000000000001";
const PROJECT_ID = "80000000-0000-4000-8000-000000000002";
const RELATIONSHIP_ID = "80000000-0000-4000-8000-000000000003";
const ORDER_ID = "80000000-0000-4000-8000-000000000004";
const PAYABLE_ID = "80000000-0000-4000-8000-000000000005";
const SUPPLIER_ID = "80000000-0000-4000-8000-000000000006";

async function repositoryFor(responder: (
  request: Request,
  index: number,
) => { body: unknown; status?: number }) {
  const requests: Request[] = [];
  const fetchStub = (async (input: string | URL | Request, init?: RequestInit) => {
    const request = input instanceof Request
      ? input
      : new Request(input.toString(), init);
    const response = responder(request, requests.push(request) - 1);
    return new Response(JSON.stringify(response.body), {
      status: response.status ?? 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  const client = createClient("http://127.0.0.1:54321", "test-key", {
    global: { fetch: fetchStub },
  });
  const { SupplierPayablesRepository } = await import("./supplier-payables");
  return {
    repository: new SupplierPayablesRepository(() => client as never),
    requests,
  };
}

const payable = {
  id: PAYABLE_ID,
  project_id: PROJECT_ID,
  tenant_supplier_id: RELATIONSHIP_ID,
  supplier_id: SUPPLIER_ID,
  supplier_purchase_order_id: ORDER_ID,
  amount: "100.00",
  paid_amount: "20.00",
  reserved_amount: "30.00",
  open_amount: "80.00",
  currency: "CNY",
  occurred_at: "2026-07-30T08:00:00.000Z",
  due_at: "2026-08-30T08:00:00.000Z",
  status: "partially_paid",
} as const;

describe("SupplierPayablesRepository", () => {
  test("maps every payable filter to the exact paginated RPC parameters", async () => {
    const { repository, requests } = await repositoryFor(() => ({
      body: { items: [payable], total: 101, page: 2, page_size: 100 },
    }));

    const result = await repository.list({
      tenant_id: TENANT_ID,
      visible_project_ids: [PROJECT_ID],
      project_id: PROJECT_ID,
      tenant_supplier_id: RELATIONSHIP_ID,
      purchase_order_id: ORDER_ID,
      status: "partially_paid",
      due_from: "2026-08-01T00:00:00.000Z",
      due_to: "2026-08-31T23:59:59.000Z",
      page: 2,
      pageSize: 100,
    });

    expect(result.list).toEqual([payable]);
    expect(result.pagination).toEqual({
      page: 2,
      pageSize: 100,
      total: 101,
      totalPages: 2,
    });
    expect(new URL(requests[0]!.url).pathname).toEndWith(
      "/rpc/list_supplier_payables",
    );
    expect(await requests[0]!.clone().json()).toEqual({
      p_tenant_id: TENANT_ID,
      p_visible_project_ids: [PROJECT_ID],
      p_project_id: PROJECT_ID,
      p_tenant_supplier_id: RELATIONSHIP_ID,
      p_purchase_order_id: ORDER_ID,
      p_status: "partially_paid",
      p_due_from: "2026-08-01T00:00:00.000Z",
      p_due_to: "2026-08-31T23:59:59.000Z",
      p_page: 2,
      p_page_size: 100,
    });
  });

  test("sends null for omitted filters and maps the purchase-order summary RPC", async () => {
    const summary = {
      purchase_order_id: ORDER_ID,
      accepted_amount: "120.00",
      payable_amount: "100.00",
      reserved_request_amount: "30.00",
      paid_amount: "20.00",
      open_amount: "80.00",
      available_to_request_amount: "50.00",
    };
    const { repository, requests } = await repositoryFor((_request, index) => ({
      body: index === 0
        ? { items: [], total: 0, page: 1, page_size: 20 }
        : summary,
    }));

    await repository.list({
      tenant_id: TENANT_ID,
      visible_project_ids: null,
      page: 1,
      pageSize: 20,
    });
    expect(await repository.getPurchaseOrderSummary(TENANT_ID, ORDER_ID))
      .toEqual(summary);
    expect(await requests[0]!.clone().json()).toEqual({
      p_tenant_id: TENANT_ID,
      p_visible_project_ids: null,
      p_project_id: null,
      p_tenant_supplier_id: null,
      p_purchase_order_id: null,
      p_status: null,
      p_due_from: null,
      p_due_to: null,
      p_page: 1,
      p_page_size: 20,
    });
    expect(new URL(requests[1]!.url).pathname).toEndWith(
      "/rpc/get_supplier_purchase_order_financial_summary",
    );
    expect(await requests[1]!.clone().json()).toEqual({
      p_tenant_id: TENANT_ID,
      p_supplier_purchase_order_id: ORDER_ID,
    });
  });

  test("passes an empty visible project scope to the database", async () => {
    const { repository, requests } = await repositoryFor(() => ({
      body: { items: [], total: 0, page: 1, page_size: 20 },
    }));
    const result = await repository.list({
      tenant_id: TENANT_ID,
      visible_project_ids: [],
      project_id: PROJECT_ID,
      page: 1,
      pageSize: 20,
    });

    expect(result.list).toEqual([]);
    expect(result.pagination.total).toBe(0);
    expect(await requests[0]!.clone().json()).toEqual({
      p_tenant_id: TENANT_ID,
      p_visible_project_ids: [],
      p_project_id: PROJECT_ID,
      p_tenant_supplier_id: null,
      p_purchase_order_id: null,
      p_status: null,
      p_due_from: null,
      p_due_to: null,
      p_page: 1,
      p_page_size: 20,
    });
  });

  test("rejects malformed RPC data and wraps database failures", async () => {
    const malformed = await repositoryFor(() => ({
      body: {
        items: [{ ...payable, amount: 100 }],
        total: 1,
        page: 1,
        page_size: 20,
      },
    }));
    await expect(malformed.repository.list({
      tenant_id: TENANT_ID,
      visible_project_ids: null,
      page: 1,
      pageSize: 20,
    })).rejects.toMatchObject({ statusCode: 500, code: "DB_ERROR" });

    const failed = await repositoryFor(() => ({
      body: { message: "db unavailable" },
      status: 500,
    }));
    await expect(failed.repository.getPurchaseOrderSummary(
      TENANT_ID,
      ORDER_ID,
    )).rejects.toMatchObject({ statusCode: 500, code: "DB_ERROR" });
  });
});
