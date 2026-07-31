import { afterEach, describe, expect, test } from "bun:test";

import {
  listSupplierPayableFilterOptions,
  listSupplierPayables,
} from "./payable-api";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("供应商应付 API 契约", () => {
  test("列表使用受限分页和后端 snake_case 筛选", async () => {
    const calls = installSuccessFetch();

    await listSupplierPayables({
      page: 1,
      pageSize: 20,
      project_id: "project/id",
      tenant_supplier_id: "supplier relationship",
      purchase_order_id: "order/id",
      status: "open",
      due_from: "2026-07-01T00:00:00.000Z",
      due_to: "2026-07-31T23:59:59.999Z",
    });

    const url = new URL(String(calls[0]?.input), "http://admin.local");
    expect(url.pathname).toBe("/api/backend/supplier-payables");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      page: "1",
      pageSize: "20",
      project_id: "project/id",
      tenant_supplier_id: "supplier relationship",
      purchase_order_id: "order/id",
      status: "open",
      due_from: "2026-07-01T00:00:00.000Z",
      due_to: "2026-07-31T23:59:59.999Z",
    });
  });

  test("无效分页在发请求前收敛到安全边界", async () => {
    const calls = installSuccessFetch();

    await listSupplierPayables({ page: 0, pageSize: 500 });

    expect(String(calls[0]?.input)).toBe(
      "/api/backend/supplier-payables?page=1&pageSize=100",
    );
  });

  test("专用筛选项使用应付权限下的受限分页接口", async () => {
    const calls = installSuccessFetch();

    await listSupplierPayableFilterOptions({
      type: "purchase_order",
      keyword: " PO ",
      page: 2,
      pageSize: 20,
    });

    expect(String(calls[0]?.input)).toBe(
      "/api/backend/supplier-payable-filter-options?" +
        "type=purchase_order&page=2&pageSize=20&keyword=PO",
    );
  });
});

type FetchCall = { input: RequestInfo | URL; init?: RequestInit };

function installSuccessFetch() {
  const calls: FetchCall[] = [];
  globalThis.fetch = (async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ) => {
    calls.push({ input, init });
    return new Response(JSON.stringify({
      success: true,
      data: {
        list: [],
        pagination: {
          page: 1,
          pageSize: 20,
          total: 0,
          totalPages: 0,
        },
      },
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  return calls;
}
