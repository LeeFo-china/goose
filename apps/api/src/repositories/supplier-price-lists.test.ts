import { describe, expect, test } from "bun:test";
import { createClient } from "@supabase/supabase-js";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const SUPPLIER_ID = "50000000-0000-4000-8000-000000000001";
const PRICE_LIST_ID = "50000000-0000-4000-8000-000000000002";
const TENANT_ID = "50000000-0000-4000-8000-000000000003";
const USER_ID = "50000000-0000-4000-8000-000000000004";
const EMPLOYEE_ID = "50000000-0000-4000-8000-000000000005";

async function repositoryFor(
  responder: (
    request: Request,
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
    requests.push(request);
    const response = responder(request);
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
  const { SupplierPriceListsRepository } = await import(
    "./supplier-price-lists"
  );
  return {
    repository: new SupplierPriceListsRepository(() => client as never),
    requests,
  };
}

describe("SupplierPriceListsRepository", () => {
  test("keeps price pages bounded and supplier scoped", async () => {
    const { repository, requests } = await repositoryFor(() => ({
      body: [priceList],
      count: 1,
    }));

    await repository.listPriceLists({
      supplier_id: SUPPLIER_ID,
      tenant_id: TENANT_ID,
      page: 1,
      pageSize: 20,
    });

    const url = new URL(requests[0]!.url);
    expect(url.searchParams.get("supplier_id")).toBe(`eq.${SUPPLIER_ID}`);
    expect(url.searchParams.get("tenant_id")).toBe(`eq.${TENANT_ID}`);
    expect(url.searchParams.get("limit")).toBe("20");
    expect(url.searchParams.get("select")).not.toContain("*");
  });

  test("tenant scopes price details, items, and direct draft updates", async () => {
    const { repository, requests } = await repositoryFor((request) => ({
      body: request.url.includes("supplier_price_list_items")
        ? []
        : priceList,
      count: 0,
    }));

    await repository.findPriceList(SUPPLIER_ID, PRICE_LIST_ID, TENANT_ID);
    await repository.listItems({
      supplier_id: SUPPLIER_ID,
      tenant_id: TENANT_ID,
      price_list_id: PRICE_LIST_ID,
      page: 1,
      pageSize: 20,
    });
    await repository.updateDraft({
      supplier_id: SUPPLIER_ID,
      tenant_id: TENANT_ID,
      price_list_id: PRICE_LIST_ID,
      expected_version: 1,
      name: "租户报价",
    });

    for (const request of requests) {
      const url = new URL(request.url);
      expect(url.searchParams.get("supplier_id")).toBe(`eq.${SUPPLIER_ID}`);
      expect(url.searchParams.get("tenant_id")).toBe(`eq.${TENANT_ID}`);
    }
    expect(new URL(requests[1]!.url).searchParams.get(
      "supplier_price_list_id",
    )).toBe(`eq.${PRICE_LIST_ID}`);
    expect(new URL(requests[2]!.url).searchParams.get("id")).toBe(
      `eq.${PRICE_LIST_ID}`,
    );
  });

  test("publishes through the guarded idempotent command", async () => {
    const { repository, requests } = await repositoryFor(() => ({
      body: {
        status: "published",
        idempotent: false,
        price_list: { ...priceList, lifecycle_status: "published" },
        version: 2,
      },
    }));

    await repository.publish({
      price_list_id: PRICE_LIST_ID,
      supplier_id: SUPPLIER_ID,
      tenant_id: TENANT_ID,
      expected_version: 1,
      actor_user_id: USER_ID,
      actor_employee_id: EMPLOYEE_ID,
      idempotency_key: "price:publish",
      proxy_reason: "供应商确认发布",
    });

    const request = requests[0]!;
    expect(new URL(request.url).pathname).toEndWith(
      "/rpc/publish_supplier_price_list",
    );
    expect(await request.clone().json()).toMatchObject({
      p_price_list_id: PRICE_LIST_ID,
      p_supplier_id: SUPPLIER_ID,
      p_expected_version: 1,
    });
  });

  test("maps a deterministic RPC conflict to a business response", async () => {
    const { repository } = await repositoryFor(() => ({
      status: 400,
      body: {
        code: "P0001",
        message: "SUPPLIER_IDEMPOTENCY_CONFLICT",
        details: null,
        hint: null,
      },
    }));

    await expect(repository.publish({
      price_list_id: PRICE_LIST_ID,
      supplier_id: SUPPLIER_ID,
      tenant_id: TENANT_ID,
      expected_version: 1,
      actor_user_id: USER_ID,
      actor_employee_id: EMPLOYEE_ID,
      idempotency_key: "price:publish",
      proxy_reason: "供应商确认发布",
    })).rejects.toMatchObject({
      statusCode: 409,
      code: "SUPPLIER_IDEMPOTENCY_CONFLICT",
    });
  });
});

const priceList = {
  id: PRICE_LIST_ID,
  supplier_id: SUPPLIER_ID,
  price_list_code: "DEFAULT",
  version_number: 1,
  scope_type: "default",
  name: "默认供货价",
  currency: "CNY",
  lifecycle_status: "draft",
  effective_from: "2026-08-01T00:00:00.000Z",
  effective_until: null,
  supersedes_price_list_id: null,
  published_at: null,
  row_version: 1,
  updated_at: "2026-07-29T00:00:00.000Z",
};
