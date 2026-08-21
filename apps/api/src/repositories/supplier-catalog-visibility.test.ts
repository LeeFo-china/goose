import { describe, expect, test } from "bun:test";
import { createClient } from "@supabase/supabase-js";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const TENANT_ID = "00000000-0000-4000-8000-000000000101";
const CATEGORY_ID = "00000000-0000-4000-8000-000000000102";

async function setup() {
  const requests: Request[] = [];
  const fetchStub = (async (input: string | URL | Request, init?: RequestInit) => {
    const request = input instanceof Request
      ? input
      : new Request(input.toString(), init);
    requests.push(request);
    return new Response("[]", {
      headers: { "content-type": "application/json", "content-range": "0-0/0" },
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

describe("SupplierCatalogRepository ownership visibility", () => {
  test("tenant category pages merge platform and the authenticated tenant in one query", async () => {
    const { repository, requests } = await setup();

    await repository.listCategories(
      { page: 2, pageSize: 20 },
      { kind: "tenant", tenantId: TENANT_ID },
    );

    expect(requests).toHaveLength(1);
    const url = new URL(requests[0]!.url);
    expect(url.searchParams.get("or")).toBe(
      `(and(ownership_scope.eq.platform,owner_tenant_id.is.null),and(ownership_scope.eq.tenant,owner_tenant_id.eq.${TENANT_ID}))`,
    );
    expect(url.searchParams.get("offset")).toBe("20");
    expect(url.searchParams.get("limit")).toBe("20");
    expect(url.searchParams.get("select")).toContain("ownership_scope");
    expect(url.searchParams.get("select")).not.toContain("*");
    expect(url.searchParams.get("status")).toBe("eq.active");
  });

  test("tenant inactive category pages exclude every platform and other-tenant row", async () => {
    const { repository, requests } = await setup();

    await repository.listCategories(
      { status: "inactive", page: 2, pageSize: 10 },
      { kind: "tenant", tenantId: TENANT_ID },
    );

    expect(requests).toHaveLength(1);
    const url = new URL(requests[0]!.url);
    expect(url.searchParams.get("ownership_scope")).toBe("eq.tenant");
    expect(url.searchParams.get("owner_tenant_id")).toBe(`eq.${TENANT_ID}`);
    expect(url.searchParams.get("status")).toBe("eq.inactive");
    expect(url.searchParams.get("or")).toBeNull();
    expect(url.searchParams.get("offset")).toBe("10");
    expect(url.searchParams.get("limit")).toBe("10");
    expect(url.searchParams.get("select")).not.toContain("*");
  });

  test("tenant inactive brand pages are one bounded tenant-only query", async () => {
    const { repository, requests } = await setup();

    await repository.listBrands(
      { status: "inactive", page: 1, pageSize: 100 },
      { kind: "tenant", tenantId: TENANT_ID },
    );

    expect(requests).toHaveLength(1);
    const url = new URL(requests[0]!.url);
    expect(url.searchParams.get("ownership_scope")).toBe("eq.tenant");
    expect(url.searchParams.get("owner_tenant_id")).toBe(`eq.${TENANT_ID}`);
    expect(url.searchParams.get("status")).toBe("eq.inactive");
    expect(url.searchParams.get("or")).toBeNull();
    expect(url.searchParams.get("limit")).toBe("100");
    expect(url.searchParams.get("select")).not.toContain("*");
  });

  test("tenant inactive spec pages are one bounded tenant-only query", async () => {
    const { repository, requests } = await setup();

    await repository.listSpecDefinitions(
      CATEGORY_ID,
      { status: "inactive", page: 1, pageSize: 20 },
      { kind: "tenant", tenantId: TENANT_ID },
    );

    expect(requests).toHaveLength(1);
    const url = new URL(requests[0]!.url);
    expect(url.searchParams.get("category_id")).toBe(`eq.${CATEGORY_ID}`);
    expect(url.searchParams.get("ownership_scope")).toBe("eq.tenant");
    expect(url.searchParams.get("owner_tenant_id")).toBe(`eq.${TENANT_ID}`);
    expect(url.searchParams.get("status")).toBe("eq.inactive");
    expect(url.searchParams.get("or")).toBeNull();
    expect(url.searchParams.get("limit")).toBe("20");
    expect(url.searchParams.get("select")).not.toContain("*");
  });

  test("platform category and brand pages are platform-only", async () => {
    const { repository, requests } = await setup();

    await repository.listCategories(
      { page: 1, pageSize: 20 },
      { kind: "platform" },
    );
    await repository.listBrands(
      { page: 1, pageSize: 20 },
      { kind: "platform" },
    );

    expect(requests).toHaveLength(2);
    for (const request of requests) {
      const url = new URL(request.url);
      expect(url.searchParams.get("ownership_scope")).toBe("eq.platform");
      expect(url.searchParams.get("owner_tenant_id")).toBe("is.null");
      expect(url.searchParams.get("select")).not.toContain("*");
    }
  });

  test("platform mapping option pagination is filtered before range", async () => {
    const { repository, requests } = await setup();

    await repository.listCategories(
      { page: 2, pageSize: 20, keyword: "建材", status: "active" },
      { kind: "platform" },
    );

    const url = new URL(requests[0]!.url);
    expect(url.searchParams.get("ownership_scope")).toBe("eq.platform");
    expect(url.searchParams.get("owner_tenant_id")).toBe("is.null");
    expect(url.searchParams.get("offset")).toBe("20");
    expect(url.searchParams.get("limit")).toBe("20");
    expect(url.searchParams.get("or")).toContain("code.ilike");
  });

  test("tenant brand pages cannot include another tenant", async () => {
    const { repository, requests } = await setup();

    await repository.listBrands(
      { page: 1, pageSize: 100 },
      { kind: "tenant", tenantId: TENANT_ID },
    );

    const url = new URL(requests[0]!.url);
    expect(url.searchParams.get("or")).toContain(`owner_tenant_id.eq.${TENANT_ID}`);
    expect(url.searchParams.get("limit")).toBe("100");
    expect(requests).toHaveLength(1);
  });
});
