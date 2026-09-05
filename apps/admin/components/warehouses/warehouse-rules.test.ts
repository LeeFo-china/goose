import { afterEach, describe, expect, test } from "bun:test";

import {
  buildWarehouseListPath,
  normalizeWarehouseDraft,
  validateWarehouseDraft,
} from "./warehouse-rules";
import {
  createWarehouse,
  updateWarehouse,
} from "./warehouse-api";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("warehouse admin rules", () => {
  test("builds explicit paginated list path", () => {
    expect(buildWarehouseListPath({
      page: 1,
      pageSize: 20,
      keyword: "主仓",
    })).toBe("/warehouses?page=1&pageSize=20&keyword=%E4%B8%BB%E4%BB%93");
    expect(buildWarehouseListPath({
      page: 2,
      pageSize: 50,
      status: "active",
    })).toBe("/warehouses?page=2&pageSize=50&status=active");
  });

  test("validates and normalizes warehouse drafts", () => {
    expect(validateWarehouseDraft({ name: " " })).toEqual({
      name: "请输入仓库名称",
    });
    expect(normalizeWarehouseDraft({
      name: " 主仓 ",
      address: " ",
      contactName: " 张三 ",
      contactPhone: " 13800000000 ",
      managerEmployeeId: "",
      isDefault: true,
    })).toEqual({
      name: "主仓",
      address: null,
      contact_name: "张三",
      contact_phone: "13800000000",
      manager_employee_id: null,
      is_default: true,
    });
  });

  test("uses generated ids and idempotency keys for warehouse commands", async () => {
    const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ input, init });
      return Response.json({ success: true, data: { id: "warehouse-1" } });
    }) as typeof fetch;

    await createWarehouse({
      name: "主仓",
      address: null,
      contact_name: null,
      contact_phone: null,
      manager_employee_id: null,
      is_default: false,
    }, () => "warehouse-id", () => "create-key");
    await updateWarehouse("warehouse-id", {
      expected_version: 2,
      name: "主仓",
      address: null,
    }, () => "update-key");

    expect(calls.map(({ input }) => String(input))).toEqual([
      "/api/backend/warehouses",
      "/api/backend/warehouses/warehouse-id",
    ]);
    expect(calls.map(({ init }) => init?.method)).toEqual(["POST", "PATCH"]);
    expect(calls.map(({ init }) =>
      new Headers(init?.headers).get("Idempotency-Key")
    )).toEqual(["create-key", "update-key"]);
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
      id: "warehouse-id",
      name: "主仓",
      address: null,
      contact_name: null,
      contact_phone: null,
      manager_employee_id: null,
      is_default: false,
    });
  });
});
