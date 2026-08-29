import { describe, expect, test } from "bun:test";
import { createClient } from "@supabase/supabase-js";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const TENANT_ID = "a0000000-0000-4000-8000-000000000001";
const PROJECT_ID = "a0000000-0000-4000-8000-000000000003";
const PROJECT_OPTION = {
  id: PROJECT_ID,
  name: "示范项目",
  status: "active",
};

type ResponseSpec = { body: unknown; count: number };

async function repositoryFor(response: ResponseSpec) {
  const requests: Request[] = [];
  const fetchStub = (async (
    input: string | URL | Request,
    init?: RequestInit,
  ) => {
    const request = input instanceof Request
      ? input
      : new Request(input.toString(), init);
    requests.push(request);
    return new Response(JSON.stringify(response.body), {
      status: 200,
      headers: {
        "content-type": "application/json",
        "content-range": `0-0/${response.count}`,
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

describe("SupplierPurchaseBatchesRepository project options", () => {
  test("filters the last seven days before exact-count pagination", async () => {
    const { repository, requests } = await repositoryFor({
      body: [PROJECT_OPTION],
      count: 21,
    });

    const result = await repository.listProjectOptions({
      tenant_id: TENANT_ID,
      visible_project_ids: [PROJECT_ID],
      keyword: ' (),"%_\\.:* ',
      updated_at_from: "2026-08-22T03:04:05.000Z",
      updated_at_to: "2026-08-29T03:04:05.000Z",
      page: 2,
      pageSize: 20,
    });

    expect(result.list).toEqual([PROJECT_OPTION]);
    expect(result.pagination).toEqual({
      page: 2,
      pageSize: 20,
      total: 21,
      totalPages: 2,
    });
    const request = requests[0]!;
    const url = new URL(request.url);
    expect(url.pathname).toEndWith("/projects");
    expect(url.searchParams.get("select")).toBe("id,name,status");
    expect(url.searchParams.get("tenant_id")).toBe(`eq.${TENANT_ID}`);
    expect(url.searchParams.get("id")).toBe(`in.(${PROJECT_ID})`);
    expect(url.searchParams.get("or")).toBe(
      '(name.ilike."%(),\\"\\\\%\\\\_\\\\\\\\.:*%")',
    );
    expect(url.searchParams.get("updated_at")).toBe(
      "gte.2026-08-22T03:04:05.000Z",
    );
    expect(url.searchParams.getAll("updated_at")).toEqual([
      "gte.2026-08-22T03:04:05.000Z",
      "lte.2026-08-29T03:04:05.000Z",
    ]);
    expect(url.searchParams.get("order")).toBe("updated_at.desc,id.desc");
    expect(url.searchParams.get("offset")).toBe("20");
    expect(url.searchParams.get("limit")).toBe("20");
    expect(request.headers.get("prefer")).toContain("count=exact");
  });

  test("uses a half-open current-month interval with newest projects first", async () => {
    const { repository, requests } = await repositoryFor({
      body: [PROJECT_OPTION],
      count: 1,
    });

    await repository.listProjectOptions({
      tenant_id: TENANT_ID,
      visible_project_ids: [PROJECT_ID],
      updated_at_from: "2026-07-31T16:00:00.000Z",
      updated_at_before: "2026-08-31T16:00:00.000Z",
      page: 1,
      pageSize: 20,
    });

    const url = new URL(requests[0]!.url);
    expect(url.searchParams.getAll("updated_at")).toEqual([
      "gte.2026-07-31T16:00:00.000Z",
      "lt.2026-08-31T16:00:00.000Z",
    ]);
    expect(url.searchParams.get("order")).toBe("updated_at.desc,id.desc");
  });

  test("keeps the existing alphabetical ordering without a time window", async () => {
    const { repository, requests } = await repositoryFor({
      body: [PROJECT_OPTION],
      count: 1,
    });

    await repository.listProjectOptions({
      tenant_id: TENANT_ID,
      visible_project_ids: [PROJECT_ID],
      page: 1,
      pageSize: 20,
    });

    const url = new URL(requests[0]!.url);
    expect(url.searchParams.has("updated_at")).toBeFalse();
    expect(url.searchParams.get("order")).toBe("name.asc,id.asc");
  });
});
