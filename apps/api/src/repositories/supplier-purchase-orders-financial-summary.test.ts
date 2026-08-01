import { describe, expect, test } from "bun:test";
import { createClient } from "@supabase/supabase-js";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const TENANT_ID = "63100000-0000-4000-8000-000000000001";
const ORDER_ID = "63100000-0000-4000-8000-000000000002";

async function setup(body: unknown, status = 200) {
  const requests: Request[] = [];
  const fetchStub = (async (input: string | URL | Request, init?: RequestInit) => {
    const request = input instanceof Request
      ? input
      : new Request(input.toString(), init);
    requests.push(request);
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
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

describe("SupplierPurchaseOrdersRepository financial summary", () => {
  test("calls the purchase-order summary RPC with tenant scope", async () => {
    const { repository, requests } = await setup(summary);
    const result = await (
      repository as unknown as {
        getFinancialSummary(tenantId: string, orderId: string): Promise<unknown>;
      }
    ).getFinancialSummary(TENANT_ID, ORDER_ID);

    expect(result).toEqual(summary);
    expect(new URL(requests[0]!.url).pathname).toEndWith(
      "/rpc/get_supplier_purchase_order_financial_summary",
    );
    expect(await requests[0]!.clone().json()).toEqual({
      p_tenant_id: TENANT_ID,
      p_supplier_purchase_order_id: ORDER_ID,
    });
  });

  test("wraps database and malformed DTO failures", async () => {
    const databaseFailure = await setup(
      { message: "db down", code: "XX000" },
      500,
    );
    await expect(call(databaseFailure.repository)).rejects.toMatchObject({
      statusCode: 500,
      code: "DB_ERROR",
    });

    const malformed = await setup({ ...summary, paid_amount: 20 });
    await expect(call(malformed.repository)).rejects.toMatchObject({
      statusCode: 500,
      code: "DB_ERROR",
    });
  });
});

function call(repository: unknown): Promise<unknown> {
  return (
    repository as {
      getFinancialSummary(tenantId: string, orderId: string): Promise<unknown>;
    }
  ).getFinancialSummary(TENANT_ID, ORDER_ID);
}

const summary = {
  purchase_order_id: ORDER_ID,
  accepted_amount: "120.00",
  payable_amount: "120.00",
  reserved_request_amount: "30.00",
  paid_amount: "20.00",
  open_amount: "100.00",
  available_to_request_amount: "70.00",
};
