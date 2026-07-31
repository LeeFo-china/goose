import { existsSync, readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

import {
  appendPayablePage,
  buildPaymentRequestHref,
  resetPayableFilters,
} from "./use-payable-list";
import type { SupplierPayable, SupplierPayablePage } from "./payable-types";

function readSource(path: string) {
  const url = new URL(path, import.meta.url);
  expect(existsSync(url), path).toBe(true);
  return existsSync(url) ? readFileSync(url, "utf8") : "";
}

describe("供应商应付页面规则", () => {
  test("筛选变化回到第一页", () => {
    expect(resetPayableFilters({
      page: 4,
      projectId: "all",
      tenantSupplierId: "all",
      status: "all",
      dueFrom: "",
      dueTo: "",
    }, { status: "overdue" })).toEqual({
      page: 1,
      projectId: "all",
      tenantSupplierId: "all",
      status: "overdue",
      dueFrom: "",
      dueTo: "",
    });
  });

  test("加载更多稳定合并下一页且去重", () => {
    const current = page([payable("00000000-0000-4000-8000-000000000001")], 1);
    const next = page([
      payable("00000000-0000-4000-8000-000000000001"),
      payable("00000000-0000-4000-8000-000000000002"),
    ], 2);

    expect(appendPayablePage(current, next).list.map(({ id }) => id)).toEqual([
      "00000000-0000-4000-8000-000000000001",
      "00000000-0000-4000-8000-000000000002",
    ]);
    expect(appendPayablePage(current, next).pagination.page).toBe(2);
  });

  test("付款申请深链只携带最多一百个唯一 UUID，不携带金额", () => {
    const ids = Array.from({ length: 102 }, (_, index) =>
      `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`
    );
    const href = buildPaymentRequestHref([...ids, ids[0]!, "bad", "99.00"]);
    const url = new URL(href, "http://admin.local");

    expect(url.pathname).toBe("/supplier-payment-requests");
    expect(url.searchParams.get("create")).toBe("1");
    expect(url.searchParams.get("payableIds")?.split(",")).toHaveLength(100);
    expect(href).not.toContain("99.00");
  });
});

describe("供应商应付页面边界", () => {
  test("服务端页面 fail closed 传递查看权限", () => {
    const source = readSource("../../app/(console)/supplier-payables/page.tsx");
    expect(source).toContain('permissions.has("supplier.payable.view")');
    expect(source).toContain('permissions.has("supplier.view")');
    expect(source).toContain(
      'permissions.has("supplier.purchase-order.view")',
    );
  });

  test("无权限或模块关闭不加载应付并覆盖稳定状态", () => {
    const workspace = readSource("./payable-workspace.tsx");
    const hook = readSource("./use-payable-list.ts");
    const list = readSource("./payable-list.tsx");
    const loading = readSource(
      "../../app/(console)/supplier-payables/loading.tsx",
    );

    expect(workspace).toContain("if (!canView)");
    expect(workspace).toContain("if (!settings.module_enabled)");
    expect(workspace).toContain("loadTenantSupplierSettings");
    expect(hook).toContain("if (!canLoad) return");
    expect(hook).toContain("pageSize: 20");
    expect(workspace).toContain("<StatusAlert");
    expect(list).toContain("<Empty");
    expect(list).toContain("<Skeleton");
    expect(loading).toContain("<Skeleton");
  });

  test("列表、选择、筛选、摘要和菜单契约完整", () => {
    const workspace = readSource("./payable-workspace.tsx");
    const list = readSource("./payable-list.tsx");
    const filters = readSource("./payable-filters.tsx");
    const summary = readSource("./payable-summary.tsx");
    const menu = readSource("../layout/menu-config.ts");

    expect(workspace).toContain("available_to_request_amount");
    expect(workspace).toContain("project_id");
    expect(workspace).toContain("tenant_supplier_id");
    expect(workspace).toContain("currency");
    expect(workspace).not.toContain("localStorage");
    expect(list).toContain("可申请");
    expect(list).toContain("采购/收货单");
    expect(filters).toContain("到期开始日期");
    expect(filters).toContain("全部状态");
    expect(summary).toContain("待付金额");
    expect(menu).toContain('href: "/supplier-payables"');
    expect(menu).toContain('permission: "supplier.payable.view"');
  });
});

function page(list: SupplierPayable[], current: number): SupplierPayablePage {
  return {
    list,
    pagination: {
      page: current,
      pageSize: 20,
      total: list.length,
      totalPages: 2,
    },
  };
}

function payable(id: string): SupplierPayable {
  return {
    id,
    project_id: "10000000-0000-4000-8000-000000000001",
    tenant_supplier_id: "20000000-0000-4000-8000-000000000001",
    supplier_id: "30000000-0000-4000-8000-000000000001",
    supplier_purchase_order_id: "40000000-0000-4000-8000-000000000001",
    receipt_id: "50000000-0000-4000-8000-000000000001",
    receipt_item_id: "60000000-0000-4000-8000-000000000001",
    invoice_required_before_payment: false,
    amount: "100.00",
    paid_amount: "20.00",
    reserved_amount: "30.00",
    open_amount: "80.00",
    available_to_request_amount: "50.00",
    currency: "CNY",
    occurred_at: "2026-07-01T00:00:00.000Z",
    due_at: "2026-07-31T00:00:00.000Z",
    status: "open",
  };
}
