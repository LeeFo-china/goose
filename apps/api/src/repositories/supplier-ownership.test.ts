import { describe, expect, test } from "bun:test";
import { createClient } from "@supabase/supabase-js";

import type { SupplierOwnershipRow } from "./supplier-ownership";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const SUPPLIER_ID = "00000000-0000-4000-8000-000000000101";
const SECOND_SUPPLIER_ID = "00000000-0000-4000-8000-000000000102";
const THIRD_SUPPLIER_ID = "00000000-0000-4000-8000-000000000103";
const PRODUCT_ID = "00000000-0000-4000-8000-000000000201";
const CATEGORY_ID = "00000000-0000-4000-8000-000000000301";
const BRAND_ID = "00000000-0000-4000-8000-000000000401";
const UNREQUESTED_ID = "00000000-0000-4000-8000-000000000999";
const TENANT_ID = "00000000-0000-4000-8000-000000001001";
const OTHER_TENANT_ID = "00000000-0000-4000-8000-000000001002";

type StubResponse = {
  body: unknown;
  status?: number;
};

async function createRepository(
  responder: (request: Request) => StubResponse,
) {
  const requests: Request[] = [];
  const fetchStub = (async (input: string | URL | Request, init?: RequestInit) => {
    const request = input instanceof Request
      ? input
      : new Request(input.toString(), init);
    requests.push(request);
    const response = responder(request);
    return new Response(JSON.stringify(response.body), {
      status: response.status ?? 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  const client = createClient("http://127.0.0.1:54321", "test-key", {
    global: { fetch: fetchStub },
  });
  const { SupplierOwnershipRepository } = await import("./supplier-ownership");

  return {
    repository: new SupplierOwnershipRepository(() => client as never),
    requests,
  };
}

function requestUrl(requests: readonly Request[]): URL {
  expect(requests).toHaveLength(1);
  return new URL(requests[0]!.url);
}

describe("SupplierOwnershipRepository", () => {
  test("returns empty maps without accessing Supabase for empty id lists", async () => {
    const { repository, requests } = await createRepository(() => {
      throw new Error("不应访问 Supabase");
    });

    expect(await repository.findSupplierOwnerships([])).toEqual(new Map());
    expect(await repository.findProductOwnerships([])).toEqual(new Map());
    expect(await repository.findCatalogOwnerships({
      kind: "category",
      ids: [],
    })).toEqual(new Map());
    expect(await repository.findCatalogOwnerships({
      kind: "brand",
      ids: [],
    })).toEqual(new Map());
    expect(requests).toHaveLength(0);
  });

  test("deduplicates supplier ids into one set query and maps operational status", async () => {
    const { repository, requests } = await createRepository(() => ({
      body: [
        {
          id: SUPPLIER_ID,
          ownership_scope: "platform",
          owner_tenant_id: null,
          operational_status: "active",
        },
        {
          id: SECOND_SUPPLIER_ID,
          ownership_scope: "tenant",
          owner_tenant_id: TENANT_ID,
          operational_status: "suspended",
        },
      ],
    }));

    const result = await repository.findSupplierOwnerships([
      SUPPLIER_ID,
      SUPPLIER_ID,
      SECOND_SUPPLIER_ID,
    ]);

    expect(result).toEqual(new Map([
      [SUPPLIER_ID, {
        id: SUPPLIER_ID,
        ownership_scope: "platform",
        owner_tenant_id: null,
        status: "active",
      }],
      [SECOND_SUPPLIER_ID, {
        id: SECOND_SUPPLIER_ID,
        ownership_scope: "tenant",
        owner_tenant_id: TENANT_ID,
        status: "suspended",
      }],
    ]));
    const url = requestUrl(requests);
    expect(url.pathname).toEndWith("/rest/v1/suppliers");
    expect(url.searchParams.get("select")).toBe(
      "id,ownership_scope,owner_tenant_id,operational_status",
    );
    expect(url.searchParams.get("id")).toBe(
      `in.(${SUPPLIER_ID},${SECOND_SUPPLIER_ID})`,
    );
    expect(url.searchParams.get("limit")).toBe("2");
  });

  test("returns platform, same-tenant, and other-tenant facts unchanged", async () => {
    const rows = [
      {
        id: SUPPLIER_ID,
        ownership_scope: "platform",
        owner_tenant_id: null,
        operational_status: "active",
      },
      {
        id: SECOND_SUPPLIER_ID,
        ownership_scope: "tenant",
        owner_tenant_id: TENANT_ID,
        operational_status: "active",
      },
      {
        id: THIRD_SUPPLIER_ID,
        ownership_scope: "tenant",
        owner_tenant_id: OTHER_TENANT_ID,
        operational_status: "blacklisted",
      },
    ];
    const { repository } = await createRepository(() => ({ body: rows }));

    const result = await repository.findSupplierOwnerships(
      rows.map((row) => row.id),
    );

    expect([...result.values()]).toEqual([
      {
        id: SUPPLIER_ID,
        ownership_scope: "platform",
        owner_tenant_id: null,
        status: "active",
      },
      {
        id: SECOND_SUPPLIER_ID,
        ownership_scope: "tenant",
        owner_tenant_id: TENANT_ID,
        status: "active",
      },
      {
        id: THIRD_SUPPLIER_ID,
        ownership_scope: "tenant",
        owner_tenant_id: OTHER_TENANT_ID,
        status: "blacklisted",
      },
    ]);
  });

  test.each([
    {
      name: "product",
      id: PRODUCT_ID,
      table: "supplier_products",
      find: async (repository: Awaited<ReturnType<typeof createRepository>>["repository"]) =>
        repository.findProductOwnerships([PRODUCT_ID]),
    },
    {
      name: "category",
      id: CATEGORY_ID,
      table: "catalog_categories",
      find: async (repository: Awaited<ReturnType<typeof createRepository>>["repository"]) =>
        repository.findCatalogOwnerships({ kind: "category", ids: [CATEGORY_ID] }),
    },
    {
      name: "brand",
      id: BRAND_ID,
      table: "catalog_brands",
      find: async (repository: Awaited<ReturnType<typeof createRepository>>["repository"]) =>
        repository.findCatalogOwnerships({ kind: "brand", ids: [BRAND_ID] }),
    },
  ])("queries the $name ownership table with only unified fields", async ({
    id,
    table,
    find,
  }) => {
    const row = {
      id,
      ownership_scope: "tenant",
      owner_tenant_id: OTHER_TENANT_ID,
      status: "inactive",
    } satisfies SupplierOwnershipRow;
    const setup = await createRepository(() => ({ body: [row] }));

    expect(await find(setup.repository)).toEqual(new Map([[id, row]]));
    const url = requestUrl(setup.requests);
    expect(url.pathname).toEndWith(`/rest/v1/${table}`);
    expect(url.searchParams.get("select")).toBe(
      "id,ownership_scope,owner_tenant_id,status",
    );
    expect(url.searchParams.get("id")).toBe(`in.(${id})`);
    expect(url.searchParams.get("limit")).toBe("1");
  });

  test("keeps legacy product null ownership compatible", async () => {
    const row = {
      id: PRODUCT_ID,
      ownership_scope: null,
      owner_tenant_id: null,
      status: "draft",
    };
    const { repository } = await createRepository(() => ({ body: [row] }));

    expect(await repository.findProductOwnerships([PRODUCT_ID]))
      .toEqual(new Map([[PRODUCT_ID, row]]));
  });

  test.each([
    {
      name: "platform ownership with a tenant owner",
      ownershipScope: "platform",
      ownerTenantId: TENANT_ID,
    },
    {
      name: "tenant ownership without a tenant owner",
      ownershipScope: "tenant",
      ownerTenantId: null,
    },
    {
      name: "null ownership scope with a tenant owner",
      ownershipScope: null,
      ownerTenantId: TENANT_ID,
    },
  ])("rejects $name", async ({ ownershipScope, ownerTenantId }) => {
    const { repository } = await createRepository(() => ({
      body: [{
        id: PRODUCT_ID,
        ownership_scope: ownershipScope,
        owner_tenant_id: ownerTenantId,
        status: "active",
      }],
    }));

    await expect(repository.findProductOwnerships([PRODUCT_ID]))
      .rejects.toMatchObject({
        statusCode: 500,
        code: "DB_ERROR",
        message: "查询供应商商品归属失败",
      });
  });

  test.each([
    {
      name: "supplier",
      id: SUPPLIER_ID,
      find: async (repository: Awaited<ReturnType<typeof createRepository>>["repository"]) =>
        repository.findSupplierOwnerships([SUPPLIER_ID]),
      row: {
        id: SUPPLIER_ID,
        ownership_scope: null,
        owner_tenant_id: null,
        operational_status: "active",
      },
    },
    {
      name: "catalog",
      id: CATEGORY_ID,
      find: async (repository: Awaited<ReturnType<typeof createRepository>>["repository"]) =>
        repository.findCatalogOwnerships({
          kind: "category",
          ids: [CATEGORY_ID],
        }),
      row: {
        id: CATEGORY_ID,
        ownership_scope: null,
        owner_tenant_id: null,
        status: "active",
      },
    },
  ])("rejects legacy null ownership for strict $name rows", async ({
    find,
    row,
  }) => {
    const setup = await createRepository(() => ({ body: [row] }));

    await expect(find(setup.repository)).rejects.toMatchObject({
      statusCode: 500,
      code: "DB_ERROR",
    });
  });

  test("rejects more than one hundred unique ids before accessing Supabase", async () => {
    const ids = Array.from(
      { length: 101 },
      (_, index) => `00000000-0000-4000-8000-${index.toString().padStart(12, "0")}`,
    );
    const { repository, requests } = await createRepository(() => {
      throw new Error("不应访问 Supabase");
    });

    await expect(repository.findProductOwnerships(ids)).rejects.toMatchObject({
      statusCode: 400,
      code: "VALIDATION_ERROR",
      message: "归属查询 ID 数量不能超过 100 个",
    });
    expect(requests).toHaveLength(0);
  });

  test("rejects more than one hundred repeated ids before accessing Supabase", async () => {
    const ids = Array.from({ length: 101 }, () => PRODUCT_ID);
    const { repository, requests } = await createRepository(() => {
      throw new Error("不应访问 Supabase");
    });

    await expect(repository.findProductOwnerships(ids)).rejects.toMatchObject({
      statusCode: 400,
      code: "VALIDATION_ERROR",
      message: "归属查询 ID 数量不能超过 100 个",
    });
    expect(requests).toHaveLength(0);
  });

  test("wraps database failures with a Chinese query context", async () => {
    const databaseError = {
      code: "XX000",
      details: "database details",
      hint: null,
      message: "database failure",
    };
    const { repository } = await createRepository(() => ({
      body: databaseError,
      status: 500,
    }));

    await expect(repository.findCatalogOwnerships({
      kind: "category",
      ids: [CATEGORY_ID],
    })).rejects.toMatchObject({
      statusCode: 500,
      code: "DB_ERROR",
      message: "查询供应商目录归属失败",
      details: databaseError,
    });
  });

  test("fails with a database error when ownership scope is invalid", async () => {
    const { repository } = await createRepository(() => ({
      body: [{
        id: BRAND_ID,
        ownership_scope: "global",
        owner_tenant_id: null,
        status: "active",
      }],
    }));

    await expect(repository.findCatalogOwnerships({
      kind: "brand",
      ids: [BRAND_ID],
    })).rejects.toMatchObject({
      statusCode: 500,
      code: "DB_ERROR",
      message: "查询供应商目录归属失败",
    });
  });

  test("fails closed by excluding rows that were not requested", async () => {
    const requested = {
      id: PRODUCT_ID,
      ownership_scope: "platform",
      owner_tenant_id: null,
      status: "active",
    } satisfies SupplierOwnershipRow;
    const unrequested = {
      ...requested,
      id: UNREQUESTED_ID,
      ownership_scope: "tenant",
      owner_tenant_id: OTHER_TENANT_ID,
    } satisfies SupplierOwnershipRow;
    const { repository } = await createRepository(() => ({
      body: [requested, unrequested],
    }));

    expect(await repository.findProductOwnerships([PRODUCT_ID]))
      .toEqual(new Map([[PRODUCT_ID, requested]]));
  });
});
