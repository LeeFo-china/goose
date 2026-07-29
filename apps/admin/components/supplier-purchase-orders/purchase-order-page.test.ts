import { existsSync, readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

function readSource(path: string) {
  const url = new URL(path, import.meta.url);
  expect(existsSync(url), path).toBe(true);
  return existsSync(url) ? readFileSync(url, "utf8") : "";
}

describe("供应商采购单页面边界", () => {
  test("按采购单查看权限注册导航和页面入口", () => {
    const menu = readSource("../layout/menu-config.ts");
    const page = readSource(
      "../../app/(console)/supplier-purchase-orders/page.tsx",
    );

    expect(menu).toContain('href: "/supplier-purchase-orders"');
    expect(menu).toContain('label: "采购单"');
    expect(menu).toContain('permission: "supplier.purchase-order.view"');
    expect(page).toContain(
      'permissions.has("supplier.purchase-order.view")',
    );
    expect(page).toContain(
      'permissions.has("supplier.purchase-order.manage")',
    );
    expect(page).toContain("canViewPurchaseOrders");
    expect(page).toContain("canManagePurchaseOrders");
  });

  test("工作区显式处理无权和只读状态", () => {
    const workspace = readSource("./purchase-order-workspace.tsx");

    expect(workspace).toContain("if (!canViewPurchaseOrders)");
    expect(workspace).toContain("canManagePurchaseOrders");
    expect(workspace).toContain("<StatusAlert>");
    expect(workspace).toContain("<PurchaseOrderEditor");
    expect(workspace).toContain("<PurchaseOrderDetail");
  });

  test("保存接口只发送 SKU、数量和草稿头字段", () => {
    const api = readSource("./purchase-order-api.ts");
    const rules = readSource("./purchase-order-rules.ts");

    expect(api).toContain("/save-draft");
    expect(api).toContain('"Idempotency-Key"');
    expect(rules).toContain("toDraftPayload");
    expect(rules).not.toContain("unit_price:");
    expect(rules).not.toContain("tax_rate:");
    expect(rules).not.toContain("total_amount:");
  });

  test("采购单权限下分页加载选项并在保存后刷新服务端快照", () => {
    const api = readSource("./purchase-order-api.ts");
    const workspace = readSource("./purchase-order-workspace.tsx");
    const editor = readSource("./purchase-order-editor.tsx");

    expect(api).toContain("/supplier-purchase-order-project-options");
    expect(api).toContain("/supplier-purchase-order-supplier-options");
    expect(api).not.toContain('"/suppliers?page=1&pageSize=100"');
    expect(workspace).toContain("loadMoreProjects");
    expect(workspace).toContain("loadMoreSuppliers");
    expect(editor).toContain("加载更多项目");
    expect(editor).toContain("加载更多合作供应商");
    expect(editor).toContain("loadPurchaseOrderItems(orderId)");
    expect(editor).toContain("catalogFactFromSnapshot(item)");
  });

  test("提交与取消在不确定重试时复用命令身份", () => {
    const detail = readSource("./purchase-order-detail.tsx");

    expect(detail).toContain("resolveSupplierCommandAttempt");
    expect(detail).toContain("nextAttempt.idempotencyKey");
    expect(detail).toContain("setCommandAttempt(null)");
    expect(detail).not.toContain("crypto.randomUUID()");
  });
});
