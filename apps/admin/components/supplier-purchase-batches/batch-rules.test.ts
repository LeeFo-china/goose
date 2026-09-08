import { describe, expect, test } from "bun:test";
import {
  batchAccess,
  batchContextChangeRequiresConfirmation,
  batchLineReferenceMoney,
  batchSelectionValidation,
  changeDestination,
  draftPayload,
  newBatchDraft,
  revisionDetails,
  validateBatchDraft,
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
const validLines = [{
  supplier_sku_id: "sku",
  quantity: "2.5",
  cost_category_id: "category",
  supplier_id: "supplier",
  name: "瓷砖",
  unit_price: "88.00",
  purchase_unit_name: "箱",
}];

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

test("labels required reason as purchase purpose without changing payload", () => {
  const draft = { ...newBatchDraft(), project_id: "project" };
  expect(validateBatchDraft(draft)).toEqual({
    message: "请选择或填写采购用途",
    field: "reason",
  });
  const payload = draftPayload({
    ...draft,
    reason: " 项目备料 ",
    lines: validLines,
  }, 0);
  expect(payload.reason).toBe("项目备料");
  expect(payload.items).toEqual([{
    supplier_sku_id: "sku",
    quantity: "2.5",
    cost_category_id: "category",
  }]);
  expect(payload).not.toHaveProperty("purpose");
});

test("requires confirmation only before changing a context with selected products", () => {
  expect(batchContextChangeRequiresConfirmation(newBatchDraft())).toBe(false);
  expect(batchContextChangeRequiresConfirmation({
    ...newBatchDraft(),
    lines: validLines,
  })).toBe(true);
});

test("calculates line reference money with BigInt precision and preserves unknown prices", () => {
  expect(batchLineReferenceMoney({
    ...validLines[0],
    quantity: "90071992547409.91",
    unit_price: "1.00",
  })).toEqual({
    unitPrice: "1.00",
    subtotal: "90071992547409.91",
  });
  expect(batchLineReferenceMoney({
    ...validLines[0],
    unit_price: undefined,
  })).toEqual({ unitPrice: null, subtotal: null });
});

test("marks every duplicated SKU and keeps line and collection errors separate", () => {
  const duplicated = batchSelectionValidation([
    { ...validLines[0], quantity: "0" },
    { ...validLines[0], supplier_sku_id: "SKU" },
  ]);
  expect(duplicated.lines).toEqual([
    {
      duplicateSku: "同一 SKU 不能重复添加",
      quantity: "采购数量必须大于 0，最多 4 位小数",
    },
    { duplicateSku: "同一 SKU 不能重复添加" },
  ]);
  expect(duplicated.list).toEqual([]);

  const overSupplierLimit = batchSelectionValidation(
    Array.from({ length: 21 }, (_, index) => ({
      ...validLines[0],
      supplier_sku_id: `sku-${index}`,
      supplier_id: `supplier-${index}`,
    })),
  );
  expect(overSupplierLimit.list).toEqual([
    "每批最多选择 20 家供应商",
  ]);
});

test("returns field-aware validation for every batch draft boundary", () => {
  const validDraft = {
    ...newBatchDraft(),
    project_id: "project",
    reason: "项目备料",
    lines: validLines,
  };
  expect(validateBatchDraft(validDraft)).toBeNull();
  expect(validateBatchDraft({ ...validDraft, project_id: null })).toEqual({
    message: "请先选择采购项目或仓库",
    field: "destination",
  });
  expect(validateBatchDraft({
    ...validDraft,
    reason: ` ${"用".repeat(501)} `,
  })).toEqual({
    message: "采购用途不能超过 500 字",
    field: "reason",
  });
  expect(validateBatchDraft({
    ...validDraft,
    remark: "注".repeat(501),
  })).toEqual({ message: "备注不能超过 500 字", field: "remark" });
  expect(validateBatchDraft({ ...validDraft, lines: [] })).toEqual({
    message: "请选择 1–100 个商品 SKU",
    field: "items",
  });
  expect(validateBatchDraft({
    ...validDraft,
    lines: Array.from({ length: 101 }, (_, index) => ({
      ...validLines[0],
      supplier_sku_id: `sku-${index}`,
    })),
  })).toEqual({
    message: "请选择 1–100 个商品 SKU",
    field: "items",
  });
  expect(validateBatchDraft({
    ...validDraft,
    lines: Array.from({ length: 21 }, (_, index) => ({
      ...validLines[0],
      supplier_sku_id: `sku-${index}`,
      supplier_id: `supplier-${index}`,
    })),
  })).toEqual({ message: "每批最多选择 20 家供应商", field: "items" });
  expect(validateBatchDraft({
    ...validDraft,
    lines: [validLines[0], {
      ...validLines[0],
      supplier_sku_id: "SKU",
    }],
  })).toEqual({ message: "同一 SKU 不能重复添加", field: "items" });
  expect(validateBatchDraft({
    ...validDraft,
    lines: [{ ...validLines[0], cost_category_id: "" }],
  })).toEqual({ message: "请为每个商品选择成本类目", field: "items" });
  for (const quantity of ["0", "-1", "1.00000", "123456789012345"]) {
    expect(validateBatchDraft({
      ...validDraft,
      lines: [{ ...validLines[0], quantity }],
    })).toEqual({
      message: "采购数量必须大于 0，最多 4 位小数",
      field: "items",
    });
  }
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
