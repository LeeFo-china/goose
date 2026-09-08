import { describe, expect, mock, test } from "bun:test";

const TENANT_ID = "a1000000-0000-4000-8000-000000000001";
const CATEGORY_ID = "a1000000-0000-4000-8000-000000000002";
const AT = "2026-09-08T00:00:00.000Z";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

async function repositoryFor(result: { data: unknown; error: unknown }) {
  const rpc = mock(async (_name: string, _params: Record<string, unknown>) =>
    result);
  const { SupplierPurchaseBatchCatalogRepository } = await import(
    "@/repositories/supplier-purchase-batch-catalog"
  );
  return {
    repository: new SupplierPurchaseBatchCatalogRepository({ rpc }),
    rpc,
  };
}

describe("SupplierPurchaseBatchCatalogRepository category options", () => {
  test("uses the canonical bounded category RPC and maps its strict page", async () => {
    const { repository, rpc } = await repositoryFor({
      data: {
        items: [{
          id: CATEGORY_ID,
          code: "MAIN",
          name: "主材",
          full_name: "材料 / 主材",
          status: "active",
        }],
        total: 41,
        page: 2,
        page_size: 20,
      },
      error: null,
    });

    expect(await repository.listCategoryOptions({
      tenant_id: TENANT_ID,
      priced_at: AT,
      keyword: " 主材 ",
      page: 2,
      pageSize: 20,
    })).toEqual({
      list: [{
        id: CATEGORY_ID,
        code: "MAIN",
        name: "主材",
        full_name: "材料 / 主材",
        status: "active",
      }],
      pagination: { page: 2, pageSize: 20, total: 41, totalPages: 3 },
    });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith(
      "resolve_supplier_purchase_batch_category_options",
      {
        p_tenant_id: TENANT_ID,
        p_priced_at: AT,
        p_keyword: "主材",
        p_page: 2,
        p_page_size: 20,
      },
    );
  });

  test("caps repository pagination and preserves an empty keyword as null", async () => {
    const { repository, rpc } = await repositoryFor({
      data: { items: [], total: 0, page: 1, page_size: 100 },
      error: null,
    });

    await repository.listCategoryOptions({
      tenant_id: TENANT_ID,
      priced_at: AT,
      keyword: "  ",
      page: 0,
      pageSize: 999,
    });

    expect(rpc).toHaveBeenCalledWith(
      "resolve_supplier_purchase_batch_category_options",
      expect.objectContaining({
        p_keyword: null,
        p_page: 1,
        p_page_size: 100,
      }),
    );
  });

  test("rejects non-whitelisted RPC rows instead of leaking catalog internals", async () => {
    const { repository } = await repositoryFor({
      data: {
        items: [{
          id: CATEGORY_ID,
          code: "MAIN",
          name: "主材",
          full_name: "材料 / 主材",
          status: "active",
          supplier_id: "a1000000-0000-4000-8000-000000000003",
        }],
        total: 1,
        page: 1,
        page_size: 20,
      },
      error: null,
    });

    await expect(repository.listCategoryOptions({
      tenant_id: TENANT_ID,
      priced_at: AT,
      page: 1,
      pageSize: 20,
    })).rejects.toMatchObject({ statusCode: 500, code: "DB_ERROR" });
  });

  test("wraps database failures with the shared error factory", async () => {
    const { repository } = await repositoryFor({
      data: null,
      error: { message: "database unavailable" },
    });

    await expect(repository.listCategoryOptions({
      tenant_id: TENANT_ID,
      priced_at: AT,
      page: 1,
      pageSize: 20,
    })).rejects.toMatchObject({ statusCode: 500, code: "DB_ERROR" });
  });
});
