import { afterEach, expect, test } from "bun:test";
import {
  loadBatchCatalog,
  loadBatchCategories,
  loadBatches,
  loadBatchItems,
  loadBatchOrders,
  loadBatchProjects,
  loadBatchRequisitions,
  pageQuery,
  sendBatchCommand,
} from "./batch-api";

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("real API paths and exclusive camelCase catalog destination, bounded pagination", async () => {
  const paths: string[] = [];
  globalThis.fetch = (async (input) => {
    paths.push(String(input));
    return Response.json({
      success: true,
      data: {
        list: [],
        pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
      },
    });
  }) as typeof fetch;
  await loadBatchProjects(2, "项目");
  await loadBatchCategories(2, "材料");
  await loadBatchCatalog(
    {
      destination_type: "warehouse",
      project_id: null,
      warehouse_id: "warehouse",
    },
    2,
    "瓷砖",
  );
  await loadBatchItems("batch", 1, 1000);
  await loadBatchRequisitions("batch", 2);
  await loadBatchOrders("batch", 2);
  await loadBatches(2, {
    destinationType: "warehouse",
    warehouseId: "warehouse",
  });
  expect(paths[0]).toContain(
    "/supplier-purchase-batch-project-options?page=2&pageSize=20",
  );
  expect(paths[1]).toContain("/supplier-purchase-batch-cost-categories?");
  expect(paths[2]).toContain("destinationType=warehouse&warehouseId=warehouse");
  expect(paths[2]).not.toContain("projectId");
  expect(paths[3]).toContain("/batch/items?page=1&pageSize=100");
  expect(paths[4]).toContain("/batch/requisitions?page=2&pageSize=20");
  expect(paths[5]).toContain("/batch/orders?page=2&pageSize=20");
  expect(paths[6]).not.toContain("include");
  expect(pageQuery(0, "", 200).get("pageSize")).toBe("100");
});

test("review preserves HTTP 409 details, version and caller idempotency key", async () => {
  const details = {
    batch: { id: "batch", status: "draft" },
    version: 5,
    error_code: "price_changed",
    details: [],
  };
  let observed: RequestInit | undefined;
  globalThis.fetch = (async (_input, init) => {
    observed = init;
    return Response.json({
      success: false,
      code: "SUPPLIER_PURCHASE_BATCH_PRICE_CHANGED",
      message: "采购价格已变化",
      details,
    }, { status: 409 });
  }) as typeof fetch;
  await expect(
    sendBatchCommand("batch", "review", {
      expected_version: 4,
      action: "approve",
      remark: null,
    }, "original-key"),
  ).rejects.toMatchObject({ status: 409, payload: { details } });
  expect(observed?.headers).toMatchObject({
    "Idempotency-Key": "original-key",
  });
  expect(JSON.parse(String(observed?.body))).toEqual({
    expected_version: 4,
    action: "approve",
    remark: null,
  });
});
