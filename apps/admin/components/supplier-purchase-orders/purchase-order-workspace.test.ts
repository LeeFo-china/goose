import { existsSync, readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

import {
  addDraftLine,
  canEditPurchaseOrderDraft,
  commandErrorMessage,
  purchaseOrderActions,
  removeDraftLine,
  replaceSavedFacts,
  setDraftLineQuantity,
  toDraftPayload,
  validatePurchaseOrderDraft,
} from "./purchase-order-rules";

const SKU_ID = "70000000-0000-4000-8000-000000000001";

function readSource(path: string) {
  const url = new URL(path, import.meta.url);
  expect(existsSync(url), path).toBe(true);
  return existsSync(url) ? readFileSync(url, "utf8") : "";
}

describe("采购单工作台规则", () => {
  test("严格映射草稿、已提交和已取消状态的动作", () => {
    expect(purchaseOrderActions("draft", true)).toEqual([
      "edit",
      "submit",
      "cancel",
    ]);
    expect(purchaseOrderActions("submitted", true)).toEqual(["cancel"]);
    expect(purchaseOrderActions("cancelled", true)).toEqual([]);
    expect(purchaseOrderActions("draft", false)).toEqual([]);
  });

  test("所有已有草稿保持可编辑且非草稿不可进入编辑器", () => {
    expect(canEditPurchaseOrderDraft({
      status: "draft",
      purchase_requisition_id: "requisition-1",
    }, true)).toBe(true);
    expect(canEditPurchaseOrderDraft({
      status: "draft",
      purchase_requisition_id: null,
    }, true)).toBe(true);
    expect(canEditPurchaseOrderDraft({
      status: "submitted",
      purchase_requisition_id: "requisition-1",
    }, true)).toBe(false);
    expect(canEditPurchaseOrderDraft({
      status: "cancelled",
      purchase_requisition_id: null,
    }, true)).toBe(false);
    expect(canEditPurchaseOrderDraft({
      status: "draft",
      purchase_requisition_id: "requisition-1",
    }, false)).toBe(false);
  });

  test("要求项目、供应商和至少一行有效商品", () => {
    expect(validatePurchaseOrderDraft({
      projectId: "",
      tenantSupplierId: "",
      lines: [],
    })).toEqual({
      projectId: "请选择项目",
      tenantSupplierId: "请选择合作供应商",
      lines: "采购单至少需要一行商品",
    });
    expect(validatePurchaseOrderDraft({
      projectId: "project-1",
      tenantSupplierId: "relationship-1",
      lines: [{ supplierSkuId: SKU_ID, quantity: 0 }],
    })).toEqual({ lines: "采购数量必须大于 0" });
  });

  test("目录添加不重复且最多一百行", () => {
    const first = addDraftLine([], SKU_ID);
    expect(first).toEqual([{ supplierSkuId: SKU_ID, quantity: 1 }]);
    expect(addDraftLine(first, SKU_ID)).toBe(first);

    const full = Array.from({ length: 100 }, (_, index) => ({
      supplierSkuId: `sku-${index}`,
      quantity: 1,
    }));
    expect(() => addDraftLine(full, "sku-overflow")).toThrow(
      "采购单明细不能超过 100 行",
    );
  });

  test("支持数量更新和删除行", () => {
    const lines = [{ supplierSkuId: SKU_ID, quantity: 1 }];
    expect(setDraftLineQuantity(lines, SKU_ID, 2.5)).toEqual([
      { supplierSkuId: SKU_ID, quantity: 2.5 },
    ]);
    expect(removeDraftLine(lines, SKU_ID)).toEqual([]);
  });

  test("草稿 payload 不携带任何客户端价格事实", () => {
    const payload = toDraftPayload({
      projectId: "project-1",
      tenantSupplierId: "relationship-1",
      expectedVersion: 2,
      expectedDeliveryDate: null,
      remark: "尽快送达",
      lines: [{
        supplierSkuId: SKU_ID,
        quantity: 3,
        unitPrice: "999.00",
      } as never],
    });

    expect(payload).toEqual({
      project_id: "project-1",
      tenant_supplier_id: "relationship-1",
      expected_version: 2,
      expected_delivery_date: null,
      remark: "尽快送达",
      items: [{ supplier_sku_id: SKU_ID, quantity: 3 }],
    });
    expect(JSON.stringify(payload)).not.toContain("999.00");
  });

  test("保存后以后端金额、计价时间和版本替换本地事实", () => {
    const saved = replaceSavedFacts(null, {
      id: "order-1",
      priced_at: "2026-07-29T08:00:00.000Z",
      subtotal_amount: "20.00",
      tax_amount: "2.60",
      total_amount: "22.60",
      version: 3,
    });

    expect(saved).toMatchObject({
      priced_at: "2026-07-29T08:00:00.000Z",
      subtotal_amount: "20.00",
      tax_amount: "2.60",
      total_amount: "22.60",
      version: 3,
    });
  });

  test("给版本与价格冲突提供确定恢复指引", () => {
    expect(commandErrorMessage(
      "SUPPLIER_PURCHASE_ORDER_VERSION_CONFLICT",
      "保存失败",
    )).toContain("重新加载");
    expect(commandErrorMessage(
      "SUPPLIER_PURCHASE_ORDER_PRICE_CHANGED",
      "提交失败",
    )).toBe("采购价格已变化，请重新保存草稿刷新价格");
  });

  test("列表内容区在固定工作区内独立滚动", () => {
    const workspace = readSource("./purchase-order-workspace.tsx");
    const list = readSource("./purchase-order-list.tsx");

    expect(workspace).toContain(
      'className="flex h-[calc(100vh-6.5625rem)] min-h-0 flex-col gap-5 overflow-hidden"',
    );
    expect(workspace).toContain(
      '<Card className="flex min-h-0 flex-1 flex-col overflow-hidden shadow-none">',
    );
    expect(workspace).toContain(
      '<CardHeader className="shrink-0 border-b bg-muted/20 p-4">',
    );
    expect(workspace).toContain(
      '<CardContent className="flex min-h-0 flex-1 flex-col p-0">',
    );
    expect(workspace).toContain(
      '<div className="min-h-0 flex-1 overflow-auto">',
    );
    expect(workspace).toContain(
      '<div className="shrink-0 flex flex-col gap-3 bg-card px-4 py-3 md:flex-row md:items-center md:justify-between">',
    );
    expect(list).toContain(
      'containerClassName="min-w-[1120px] overflow-x-auto"',
    );
    expect(list).toContain('<TableHeader className="sticky top-0 bg-card">');
  });
});
