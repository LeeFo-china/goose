import { describe, expect, test } from "bun:test";
import { createClient } from "@supabase/supabase-js";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const IDs = {
  tenant: "00000000-0000-4000-8000-000000000101",
  user: "00000000-0000-4000-8000-000000000102",
  employee: "00000000-0000-4000-8000-000000000103",
  category: "00000000-0000-4000-8000-000000000104",
} as const;

describe("SupplierCatalogRepository command replay lookup", () => {
  test("selects and strictly parses one actor-scoped update request", async () => {
    const { repository, requests } = await setup({
      tenant_id: IDs.tenant,
      command: "update_tenant_catalog_category",
      resource_type: "catalog_category",
      resource_id: IDs.category,
      from_state: { _request: categoryRequest },
    });

    const replay = await repository.findCatalogUpdateReplay(
      IDs.user,
      "category-update-1",
    );

    expect(replay).toEqual({
      tenant_id: IDs.tenant,
      command: "update_tenant_catalog_category",
      resource_type: "catalog_category",
      resource_id: IDs.category,
      request: categoryRequest,
    });
    const requestUrl = new URL(requests[0]!.url);
    expect(requestUrl.searchParams.get("actor_user_id")).toBe(`eq.${IDs.user}`);
    expect(requestUrl.searchParams.get("idempotency_key"))
      .toBe("eq.category-update-1");
    expect(requestUrl.searchParams.get("select")).toBe(
      "tenant_id,command,resource_type,resource_id,from_state",
    );
  });

  test("fails closed when a known command has a malformed recorded request", async () => {
    const { repository } = await setup({
      tenant_id: IDs.tenant,
      command: "update_tenant_catalog_category",
      resource_type: "catalog_category",
      resource_id: IDs.category,
      from_state: { _request: { ...categoryRequest, expected_version: "1" } },
    });

    await expect(repository.findCatalogUpdateReplay(
      IDs.user,
      "category-update-1",
    )).rejects.toMatchObject({ code: "DB_ERROR" });
  });

  test("keeps unrelated command payloads opaque for conflict handling", async () => {
    const { repository } = await setup({
      tenant_id: IDs.tenant,
      command: "create_supplier",
      resource_type: "supplier",
      resource_id: IDs.category,
      from_state: null,
    });

    await expect(repository.findCatalogUpdateReplay(
      IDs.user,
      "category-update-1",
    )).resolves.toMatchObject({
      command: "create_supplier",
      resource_type: "supplier",
      request: null,
    });
  });
});

async function setup(response: unknown) {
  const requests: Request[] = [];
  const fetchStub = (async (input: string | URL | Request, init?: RequestInit) => {
    const request = input instanceof Request
      ? input
      : new Request(input.toString(), init);
    requests.push(request);
    return new Response(JSON.stringify(response), {
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  const client = createClient("http://127.0.0.1:54321", "test-key", {
    global: { fetch: fetchStub },
  });
  const { SupplierCatalogRepository } = await import("./supplier-catalog");
  return {
    repository: new SupplierCatalogRepository(() => client as never),
    requests,
  };
}

const categoryRequest = {
  category_id: IDs.category,
  parent_id: null,
  code: "CAT-1",
  name: "首次名称",
  status: "active",
  sort_order: 100,
  mapped_platform_category_id: null,
  expected_version: 1,
  tenant_id: IDs.tenant,
  actor_employee_id: IDs.employee,
};
