import { describe, expect, test } from "bun:test";
import {
  batchAccess,
  changeDestination,
  draftPayload,
  revisionDetails,
  warehouseCreationBlocker,
} from "./batch-rules";
import { findInitialWarehouse } from "./batch-warehouse-default";

const permissions = [
  "supplier.purchase-requisition.view",
  "supplier.purchase-requisition.manage",
  "supplier.view",
  "inventory.warehouse.view",
  "inventory.warehouse.manage",
];
const settings = {
  module_enabled: true,
  purchase_batch_workflow_enabled: true,
  warehouse_procurement_enabled: true,
};

describe("batch creation permissions", () => {
  test("settings permission is independent, and its absence does not disable project creation", () => {
    const access = batchAccess(
      permissions.filter((p) => p !== "supplier.view"),
    );
    expect(access.canManage).toBe(true);
    expect(access.canReadSettings).toBe(false);
    expect(warehouseCreationBlocker(access, settings)).toContain(
      "供应商查看权限",
    );
  });
  test("every warehouse permission and both operational flags are required", () => {
    expect(warehouseCreationBlocker(batchAccess(permissions), settings))
      .toBeNull();
    for (
      const permission of permissions.filter((p) =>
        p !== "supplier.purchase-requisition.view"
      )
    ) {
      expect(
        warehouseCreationBlocker(
          batchAccess(permissions.filter((p) => p !== permission)),
          settings,
        ),
      ).not.toBeNull();
    }
    expect(
      warehouseCreationBlocker(batchAccess(permissions), {
        ...settings,
        warehouse_procurement_enabled: false,
      }),
    ).toContain("尚未开放");
    expect(
      warehouseCreationBlocker(batchAccess(permissions), {
        ...settings,
        purchase_batch_workflow_enabled: false,
      }),
    ).toContain("审批流程");
  });
});

test("changing destination clears SKU quantities, category and stale server pricing", () => {
  const changed = changeDestination({
    destination_type: "project",
    project_id: "project-a",
    warehouse_id: null,
    reason: "装修采购",
    expected_delivery_date: "",
    remark: "",
    lines: [{
      supplier_sku_id: "sku",
      quantity: "2",
      cost_category_id: "category",
      supplier_id: "supplier",
      name: "瓷砖",
    }],
  }, "warehouse");
  expect(changed.project_id).toBeNull();
  expect(changed.warehouse_id).toBeNull();
  expect(changed.lines).toEqual([]);
  expect(changed.reason).toBe("装修采购");
});

test("save payload contains identity and quantities, never client commercial values", () => {
  expect(draftPayload({
    destination_type: "warehouse",
    project_id: null,
    warehouse_id: "warehouse",
    reason: " 补货 ",
    expected_delivery_date: "",
    remark: "",
    lines: [{
      supplier_sku_id: "sku",
      quantity: "2.5",
      cost_category_id: "category",
      supplier_id: "supplier",
      name: "瓷砖",
    }],
  }, 3)).toEqual({
    destination_type: "warehouse",
    project_id: null,
    warehouse_id: "warehouse",
    expected_version: 3,
    reason: "补货",
    expected_delivery_date: null,
    remark: null,
    items: [{
      supplier_sku_id: "sku",
      quantity: "2.5",
      cost_category_id: "category",
    }],
  });
});

test("revision recovery reads actual HTTP 409 payload.details rather than a made-up top-level field", () => {
  const details = {
    batch: { id: "batch", status: "draft" },
    version: 4,
    error_code: "price_changed",
    details: [{ reason: "price_changed" }],
  };
  expect(revisionDetails({ status: 409, payload: { details } })).toEqual(
    details,
  );
  expect(revisionDetails({ status: 500, payload: { details } })).toBeNull();
});

describe("bounded active warehouse default resolution", () => {
  test("finds a tenant default on a later page", async () => {
    const calls: number[] = [];
    const result = await findInitialWarehouse(async (page) => {
      calls.push(page);
      return {
        list: [{
          id: String(page),
          name: `仓库${page}`,
          is_default: page === 2,
          status: "active",
        }],
        pagination: { page, pageSize: 20, total: 21, totalPages: 2 },
      };
    }, () => true);
    expect(result?.id).toBe("2");
    expect(calls).toEqual([1, 2]);
  });
  test("one active warehouse is selected even if not default; zero is not", async () => {
    expect(
      (await findInitialWarehouse(
        async () => ({
          list: [{
            id: "one",
            name: "唯一仓库",
            is_default: false,
            status: "active",
          }],
          pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
        }),
        () => true,
      ))?.id,
    ).toBe("one");
    expect(
      await findInitialWarehouse(
        async () => ({
          list: [],
          pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
        }),
        () => true,
      ),
    ).toBeNull();
  });
  test("manual choice / session change cancels automatic selection", async () => {
    expect(
      await findInitialWarehouse(
        async () => ({
          list: [{
            id: "one",
            name: "唯一仓库",
            is_default: false,
            status: "active",
          }],
          pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
        }),
        () => false,
      ),
    ).toBeNull();
  });
});
