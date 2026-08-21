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
const TENANT_SUPPLIER_ID = "50000000-0000-4000-8000-000000000006";
const ITEM_ID = "50000000-0000-4000-8000-000000000007";
const SKU_ID = "50000000-0000-4000-8000-000000000008";

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
  test("filters price pages by tenant then relationship and supplier", async () => {
    const { repository, requests } = await repositoryFor(() => ({
      body: [priceList],
      count: 1,
    }));

    await repository.listPriceLists({
      supplier_id: SUPPLIER_ID,
      tenant_id: TENANT_ID,
      tenant_supplier_id: TENANT_SUPPLIER_ID,
      page: 1,
      pageSize: 20,
    });

    const url = new URL(requests[0]!.url);
    expect(url.searchParams.get("tenant_id")).toBe(`eq.${TENANT_ID}`);
    expect(url.searchParams.get("tenant_supplier_id")).toBe(
      `eq.${TENANT_SUPPLIER_ID}`,
    );
    expect(url.searchParams.get("supplier_id")).toBe(`eq.${SUPPLIER_ID}`);
    const query = decodeURIComponent(url.search);
    expect(query.indexOf("tenant_id=eq.")).toBeLessThan(
      query.indexOf("tenant_supplier_id=eq."),
    );
    expect(query.indexOf("tenant_supplier_id=eq.")).toBeLessThan(
      query.indexOf("supplier_id=eq."),
    );
    expect(url.searchParams.get("limit")).toBe("20");
    expect(url.searchParams.get("select")).not.toContain("*");
  });

  test("tenant scopes price details and items through the relationship", async () => {
    const { repository, requests } = await repositoryFor((request) => ({
      body: request.url.includes("supplier_price_list_items")
        ? []
        : priceList,
      count: 0,
    }));

    await repository.findPriceList({
      tenant_id: TENANT_ID,
      tenant_supplier_id: TENANT_SUPPLIER_ID,
      supplier_id: SUPPLIER_ID,
      price_list_id: PRICE_LIST_ID,
    });
    await repository.listItems({
      supplier_id: SUPPLIER_ID,
      tenant_id: TENANT_ID,
      tenant_supplier_id: TENANT_SUPPLIER_ID,
      price_list_id: PRICE_LIST_ID,
      page: 1,
      pageSize: 20,
    });

    for (const request of requests) {
      const url = new URL(request.url);
      expect(url.searchParams.get("tenant_id")).toBe(`eq.${TENANT_ID}`);
      expect(url.searchParams.get("supplier_id")).toBe(`eq.${SUPPLIER_ID}`);
    }
    expect(new URL(requests[0]!.url).searchParams.get(
      "tenant_supplier_id",
    )).toBe(`eq.${TENANT_SUPPLIER_ID}`);
    expect(new URL(requests[1]!.url).searchParams.get(
      "price_list.tenant_supplier_id",
    )).toBe(`eq.${TENANT_SUPPLIER_ID}`);
    expect(new URL(requests[1]!.url).searchParams.get(
      "supplier_price_list_id",
    )).toBe(`eq.${PRICE_LIST_ID}`);
  });

  test("embeds item relations through their composite FK names", async () => {
    const { repository, requests } = await repositoryFor(() => ({
      body: [],
      count: 0,
    }));

    await repository.listItems({
      supplier_id: SUPPLIER_ID,
      tenant_id: TENANT_ID,
      tenant_supplier_id: TENANT_SUPPLIER_ID,
      price_list_id: PRICE_LIST_ID,
      page: 1,
      pageSize: 20,
    });

    const select = new URL(requests[0]!.url).searchParams.get("select");
    expect(select).toContain(
      "price_list:supplier_price_lists!" +
        "supplier_price_items_list_tenant_supplier_fkey!inner(id)",
    );
    expect(select).toContain(
      "sku:supplier_skus!supplier_price_items_sku_supplier_fkey(" +
        "id,sku_code,name,status)",
    );
    expect(select).not.toContain(
      "price_list:supplier_price_lists!supplier_price_list_id",
    );
    expect(select).not.toContain("sku:supplier_skus!supplier_sku_id");
  });

  test("routes every price mutation through the two v2 commands", async () => {
    const { repository, requests } = await repositoryFor(() => ({
      body: {
        status: "published",
        idempotent: false,
        price_list: { ...priceList, lifecycle_status: "published" },
        version: 2,
      },
    }));

    const context = {
      tenant_id: TENANT_ID,
      tenant_supplier_id: TENANT_SUPPLIER_ID,
      supplier_id: SUPPLIER_ID,
      actor_user_id: USER_ID,
      actor_employee_id: EMPLOYEE_ID,
      idempotency_key: "price:command",
    };
    await repository.create({
      ...context,
      price_list_id: PRICE_LIST_ID,
      price_list_code: "DEFAULT",
      name: "租户采购价",
      currency: "CNY",
      effective_from: "2026-08-01T00:00:00.000Z",
      effective_until: null,
    });
    await repository.updateDraft({
      ...context,
      price_list_id: PRICE_LIST_ID,
      expected_version: 1,
      name: "租户采购价 v2",
    });
    await repository.publish({
      ...context,
      price_list_id: PRICE_LIST_ID,
      expected_version: 1,
    });
    await repository.createVersion({
      ...context,
      source_price_list_id: PRICE_LIST_ID,
      new_price_list_id: TENANT_ID,
      expected_version: 2,
    });
    await repository.retire({
      ...context,
      price_list_id: PRICE_LIST_ID,
      expected_version: 2,
    });
    await repository.upsertItem({
      ...context,
      item_id: ITEM_ID,
      price_list_id: PRICE_LIST_ID,
      sku_id: SKU_ID,
      unit_price: 88,
      tax_rate: 0.13,
      tax_inclusive: true,
      expected_version: 1,
    });
    await repository.deleteItem({
      ...context,
      item_id: ITEM_ID,
      price_list_id: PRICE_LIST_ID,
      expected_version: 2,
    });

    expect(requests.map((request) => new URL(request.url).pathname)).toEqual([
      "/rest/v1/rpc/command_supplier_price_list_v2",
      "/rest/v1/rpc/command_supplier_price_list_v2",
      "/rest/v1/rpc/command_supplier_price_list_v2",
      "/rest/v1/rpc/command_supplier_price_list_v2",
      "/rest/v1/rpc/command_supplier_price_list_v2",
      "/rest/v1/rpc/command_supplier_price_item_v2",
      "/rest/v1/rpc/command_supplier_price_item_v2",
    ]);
    const bodies = await Promise.all(
      requests.map((request) => request.clone().json()),
    ) as Array<Record<string, unknown>>;
    expect(bodies.map((body) => body.p_action)).toEqual([
      "create",
      "update",
      "publish",
      "new_version",
      "retire",
      "upsert",
      "delete",
    ]);
    for (const body of bodies) {
      expect(body).toMatchObject({
        p_tenant_id: TENANT_ID,
        p_tenant_supplier_id: TENANT_SUPPLIER_ID,
        p_supplier_id: SUPPLIER_ID,
      });
      expect(body).not.toHaveProperty("p_proxy_reason");
    }
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
      tenant_supplier_id: TENANT_SUPPLIER_ID,
    })).rejects.toMatchObject({
      statusCode: 409,
      code: "SUPPLIER_IDEMPOTENCY_CONFLICT",
    });
  });

  test("contains no direct price update or legacy writer call", async () => {
    const source = await Bun.file(
      new URL("./supplier-price-lists.ts", import.meta.url),
    ).text();

    expect(source).not.toContain('.from("supplier_price_lists")\n      .update(');
    for (const legacy of [
      '"create_supplier_price_list"',
      '"publish_supplier_price_list"',
      '"create_supplier_price_list_version"',
      '"retire_supplier_price_list"',
      '"upsert_supplier_price_list_item"',
      '"delete_supplier_price_list_item"',
    ]) {
      expect(source).not.toContain(legacy);
    }
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
