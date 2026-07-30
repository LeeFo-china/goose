import { existsSync, readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

import {
  buildRequisitionWorkspaceHref,
  commandConflictMessage,
  formatRequisitionDateTime,
  formatRequisitionMoney,
  requisitionBudgetFacts,
  readRequisitionWorkspaceState,
  shortBusinessId,
  toRequisitionDraftPayload,
  validateRequisitionDraft,
} from "./requisition-page-utils";

function readSource(path: string) {
  const url = new URL(path, import.meta.url);
  expect(existsSync(url), path).toBe(true);
  return existsSync(url) ? readFileSync(url, "utf8") : "";
}

describe("采购申请页面规则", () => {
  test("URL 持久化分页和五类服务端筛选", () => {
    expect(buildRequisitionWorkspaceHref({
      page: 3,
      keyword: "水 泥",
      status: "pending_approval",
      budgetStatus: "over_budget",
      projectId: "project/id",
      tenantSupplierId: "supplier id",
    })).toBe(
      "/supplier-purchase-requisitions?page=3&keyword=%E6%B0%B4+%E6%B3%A5&" +
        "status=pending_approval&budget_status=over_budget&" +
        "project_id=project%2Fid&tenant_supplier_id=supplier+id",
    );
  });

  test("从 URL 恢复分页和五类筛选并拒绝非法枚举", () => {
    expect(readRequisitionWorkspaceState(new URLSearchParams(
      "page=3&keyword=%E6%B0%B4%E6%B3%A5&status=pending_approval&" +
        "budget_status=over_budget&project_id=project-1&" +
        "tenant_supplier_id=supplier-1",
    ))).toEqual({
      page: 3,
      keyword: "水泥",
      status: "pending_approval",
      budgetStatus: "over_budget",
      projectId: "project-1",
      tenantSupplierId: "supplier-1",
    });
    expect(readRequisitionWorkspaceState(new URLSearchParams(
      "page=-2&status=bad&budget_status=bad",
    ))).toEqual({
      page: 1,
      keyword: "",
      status: "all",
      budgetStatus: "all",
      projectId: "all",
      tenantSupplierId: "all",
    });
  });

  test("草稿要求项目、供应商、原因、分类和一至一百个唯一 SKU", () => {
    expect(validateRequisitionDraft({
      projectId: "",
      tenantSupplierId: "",
      reason: "",
      expectedVersion: 0,
      items: [],
    })).toEqual({
      projectId: "请选择项目",
      tenantSupplierId: "请选择合作供应商",
      reason: "请填写临时采购原因",
      items: "采购申请至少需要一行商品",
    });

    expect(validateRequisitionDraft({
      projectId: "project-1",
      tenantSupplierId: "supplier-1",
      reason: "现场补料",
      expectedVersion: 1,
      items: [
        {
          supplierSkuId: "sku-1",
          costCategoryId: "",
          quantity: "1",
        },
        {
          supplierSkuId: "sku-1",
          costCategoryId: "category-1",
          quantity: "0",
        },
      ],
    }).items).toContain("不能重复");

    expect(() =>
      validateRequisitionDraft({
        projectId: "project-1",
        tenantSupplierId: "supplier-1",
        reason: "现场补料",
        expectedVersion: 1,
        items: Array.from({ length: 101 }, (_, index) => ({
          supplierSkuId: `sku-${index}`,
          costCategoryId: "category-1",
          quantity: "1",
        })),
      })
    ).toThrow("采购申请明细不能超过 100 行");
  });

  test("草稿 payload 不包含价格、税率或金额", () => {
    const payload = toRequisitionDraftPayload({
      projectId: "project-1",
      tenantSupplierId: "supplier-1",
      reason: "现场临时补料",
      expectedDeliveryDate: "",
      remark: "",
      expectedVersion: 0,
      items: [{
        supplierSkuId: "sku-1",
        costCategoryId: "category-1",
        quantity: "2.5",
        unit_price: "999.00",
        tax_rate: "0.13",
        amount: "2497.50",
      } as never],
    });

    expect(payload).toEqual({
      project_id: "project-1",
      tenant_supplier_id: "supplier-1",
      reason: "现场临时补料",
      expected_delivery_date: null,
      remark: null,
      expected_version: 0,
      items: [{
        supplier_sku_id: "sku-1",
        cost_category_id: "category-1",
        quantity: "2.5",
      }],
    });
    expect(JSON.stringify(payload)).not.toMatch(
      /unit_price|tax_rate|amount/,
    );
  });

  test("预算快照可用额扣除本申请后才是批准后可用和分类缺口", () => {
    expect(requisitionBudgetFacts("70.00", [
      {
        amount: "70.00",
        expense_amount_snapshot: "40.00",
        other_commitment_amount_snapshot: "20.00",
        available_amount_snapshot: "50.00",
      },
    ])).toEqual({
      requisitionAmount: "70.00",
      expenseAmount: "40.00",
      otherCommitmentAmount: "20.00",
      currentCommitmentAmount: "70.00",
      availableAfterApproval: "-20.00",
      shortfallAmount: "20.00",
    });
  });

  test("多分类缺口逐类累加而不是对批准后可用汇总取绝对值", () => {
    expect(requisitionBudgetFacts("80.00", [
      {
        amount: "70.00",
        expense_amount_snapshot: "40.00",
        other_commitment_amount_snapshot: "20.00",
        available_amount_snapshot: "50.00",
      },
      {
        amount: "10.00",
        expense_amount_snapshot: "10.00",
        other_commitment_amount_snapshot: "5.00",
        available_amount_snapshot: "100.00",
      },
    ])).toEqual({
      requisitionAmount: "80.00",
      expenseAmount: "50.00",
      otherCommitmentAmount: "25.00",
      currentCommitmentAmount: "80.00",
      availableAfterApproval: "70.00",
      shortfallAmount: "20.00",
    });
  });

  test("numeric(18,2) 大额和分币聚合不经过浮点数", () => {
    expect(requisitionBudgetFacts("9007199254740991.03", [
      {
        amount: "9007199254740991.01",
        expense_amount_snapshot: "9007199254740991.01",
        other_commitment_amount_snapshot: "0.01",
        available_amount_snapshot: "9007199254740991.02",
      },
      {
        amount: "0.02",
        expense_amount_snapshot: "0.02",
        other_commitment_amount_snapshot: "0.02",
        available_amount_snapshot: "0.03",
      },
    ])).toEqual({
      requisitionAmount: "9007199254740991.03",
      expenseAmount: "9007199254740991.03",
      otherCommitmentAmount: "0.03",
      currentCommitmentAmount: "9007199254740991.03",
      availableAfterApproval: "0.02",
      shortfallAmount: "0.00",
    });
    expect(formatRequisitionMoney("9007199254740991.01"))
      .toBe("¥9,007,199,254,740,991.01");
  });

  test("数量从水合字符串到 payload 保留 numeric(18,4) 精度", () => {
    for (const quantity of [
      "90071992547409.1234",
      "12345678901234.5678",
      "0.0001",
    ]) {
      const state = {
        projectId: "project-1",
        tenantSupplierId: "supplier-1",
        reason: "现场补料",
        expectedVersion: 1,
        items: [{
          supplierSkuId: "sku-1",
          costCategoryId: "category-1",
          quantity,
        }],
      };
      expect(validateRequisitionDraft(state)).toEqual({});
      expect(toRequisitionDraftPayload(state).items[0]?.quantity)
        .toBe(quantity);
    }
  });

  test("数量拒绝零值、指数、五位小数和十五位整数", () => {
    for (const quantity of [
      "0",
      "0.0000",
      "1e2",
      "1.00001",
      "100000000000000",
    ]) {
      expect(validateRequisitionDraft({
        projectId: "project-1",
        tenantSupplierId: "supplier-1",
        reason: "现场补料",
        expectedVersion: 1,
        items: [{
          supplierSkuId: "sku-1",
          costCategoryId: "category-1",
          quantity,
        }],
      }).items).toContain("采购数量必须大于 0");
    }
  });

  test("格式化工具覆盖非法金额、日期和缺失名称短 ID", () => {
    expect(formatRequisitionMoney("-0.01")).toBe("-¥0.01");
    expect(formatRequisitionMoney("12.5")).toBe("¥12.50");
    expect(formatRequisitionMoney("9999999999999999.99"))
      .toBe("¥9,999,999,999,999,999.99");
    expect(formatRequisitionMoney("1.005")).toBe("-");
    expect(formatRequisitionMoney("bad")).toBe("-");
    expect(() => requisitionBudgetFacts("1.005", []))
      .toThrow("无效的金额格式");
    expect(formatRequisitionDateTime("2026-07-30T08:00:00.000Z"))
      .not.toBe("-");
    expect(formatRequisitionDateTime("bad")).toBe("-");
    expect(shortBusinessId("12345678-1234")).toBe("12345678");
    expect(shortBusinessId("")).toBe("未知");
  });

  test("版本、价格和预算冲突都要求显式刷新最新数据", () => {
    for (const code of [
      "SUPPLIER_PURCHASE_REQUISITION_VERSION_CONFLICT",
      "SUPPLIER_PURCHASE_REQUISITION_PRICE_CHANGED",
      "SUPPLIER_PURCHASE_REQUISITION_BUDGET_CHANGED",
    ]) {
      expect(commandConflictMessage(code)).toContain("刷新最新数据");
    }
    expect(commandConflictMessage("OTHER")).toBeNull();
  });
});

describe("采购申请页面边界", () => {
  test("页面包含标题、主按钮、权限和自动创建入口", () => {
    const page = readSource(
      "../../app/(console)/supplier-purchase-requisitions/page.tsx",
    );
    const workspace = readSource("./requisition-workspace.tsx");

    expect(page).toContain(
      'permissions.has("supplier.purchase-requisition.view")',
    );
    expect(page).toContain(
      'permissions.has("supplier.purchase-requisition.manage")',
    );
    expect(page).toContain(
      'permissions.has("supplier.purchase-requisition.approve")',
    );
    expect(page).toContain('permissions.has("finance.budget.manage")');
    expect(page).toContain(
      'permissions.has("supplier.purchase-order.view")',
    );
    expect(page).toContain("session.employee?.id");
    expect(workspace).toContain("采购申请");
    expect(workspace).toContain("发起采购申请");
    expect(workspace).toContain('searchParams.get("create") === "1"');
    expect(workspace).toContain("router.replace");
  });

  test("工作区覆盖无权、加载、空、错误和只读状态", () => {
    const workspace = readSource("./requisition-workspace.tsx");
    const list = readSource("./requisition-list.tsx");
    const loading = readSource(
      "../../app/(console)/supplier-purchase-requisitions/loading.tsx",
    );

    expect(workspace).toContain("if (!canView)");
    expect(workspace).toContain("<StatusAlert");
    expect(workspace).toContain("<Skeleton");
    expect(workspace).toContain("当前账号仅可查看采购申请");
    expect(list).toContain("<Empty");
    expect(list).toContain("暂无采购申请");
    expect(loading).toContain("<Skeleton");
  });

  test("列表使用分页 API、五类筛选、映射名称和操作菜单", () => {
    const workspace = readSource("./requisition-workspace.tsx");
    const list = readSource("./requisition-list.tsx");
    const listState = readSource("./use-requisition-list.ts");
    const filters = readSource("./requisition-filters.tsx");
    const api = readSource("./requisition-api.ts");

    expect(listState).toContain("loadRequisitions(");
    expect(listState).toContain("budget_status");
    expect(listState).toContain("tenant_supplier_id");
    expect(workspace).toContain("pending_approval");
    expect(workspace).toContain("loadMoreProjects");
    expect(workspace).toContain("loadMoreSuppliers");
    expect(listState).toContain("listRequestVersion");
    expect(workspace).toContain(
      "canManage ? loadRequisitionCostCategories(1)",
    );
    expect(filters).toContain("加载更多项目筛选项");
    expect(filters).toContain("加载更多供应商筛选项");
    expect(filters).not.toContain("待我审批");
    expect(api).toContain("/supplier-purchase-requisition-project-options");
    expect(api).toContain("/supplier-purchase-requisition-supplier-options");
    expect(list).toContain("shortBusinessId");
    expect(list).toContain("<DropdownMenuGroup>");
    expect(list).toContain("查看");
    expect(list).toContain(
      'containerClassName="min-w-[1120px] overflow-x-auto"',
    );
  });

  test("编辑器分页加载 SKU 和成本分类并冻结创建与更新意图", () => {
    const editor = readSource("./requisition-editor.tsx");
    const editorFields = readSource("./requisition-editor-fields.tsx");
    const editorLines = readSource("./requisition-editor-lines.tsx");
    const saveFlow = readSource("./use-requisition-draft-save.ts");
    const editorSurface = editor + editorFields + editorLines + saveFlow;
    const api = readSource("./requisition-api.ts");

    expect(editor).toContain("<SheetTitle>");
    expect(editor).toContain("<SheetDescription>");
    expect(editor).toContain("<SheetFooter");
    expect(editorSurface).toContain("项目");
    expect(editorSurface).toContain("合作供应商");
    expect(editorSurface).toContain("成本分类");
    expect(editorSurface).toContain("采购数量");
    expect(editorSurface).toContain("临时采购原因");
    expect(editorSurface).toContain("期望到货日期");
    expect(editor).toContain("loadRequisitionCatalog");
    expect(editor).toContain("onLoadMoreCostCategories");
    expect(saveFlow).toContain("resolveSupplierCommandAttempt");
    expect(saveFlow).toContain("allocateResourceId: true");
    expect(editor).toContain("draftRequestVersion");
    expect(editor).toContain("catalogRequestVersion");
    expect(editor).toContain("saving || attempt");
    expect(editor).toContain("放弃本次重试并刷新");
    expect(editor).toMatch(
      /onSupplierChange=\{\(value\) => \{[\s\S]*?setCatalog\(emptyCatalog\)/,
    );
    expect(editor).toContain("quantity: item.quantity");
    expect(editor).not.toContain("quantity: Number(item.quantity)");
    expect(editor).toContain(
      '{ supplierSkuId, costCategoryId: "", quantity: "1" }',
    );
    expect(editorLines).toContain('type="text"');
    expect(editorLines).toContain('inputMode="decimal"');
    expect(saveFlow).toContain("createRequisitionDraft");
    expect(saveFlow).toContain("updateRequisitionDraft");
    expect(api).toContain("loadRequisitionCostCategories");
    expect(api).not.toMatch(
      /unit_price\\s*:|tax_rate\\s*:|amount\\s*:/,
    );
  });

  test("详情按动作规则操作并为冲突提供刷新恢复", () => {
    const detail = readSource("./requisition-detail.tsx");
    const review = readSource("./requisition-review-dialog.tsx");

    expect(detail).toContain("actionsFor(");
    expect(detail).toContain("const [hasLoaded");
    expect(detail).toContain("current && hasLoaded");
    expect(detail).toContain("busy || attempt");
    expect(detail).toContain("onAbandon");
    expect(detail).toContain("resolveSupplierCommandAttempt");
    expect(detail).toContain("刷新最新数据");
    expect(detail).toContain("purchase_order_id");
    expect(detail).toContain("/supplier-purchase-orders");
    expect(review).toContain("取消原因");
    expect(review).toContain("驳回原因");
    expect(review).toContain("审核备注");
    expect(review).toContain("frozen");
    expect(review).toContain("放弃本次重试并刷新");
    expect(review).toContain("<Spinner");
  });

  test("预算区显示五项服务端事实和无快照说明", () => {
    const summary = readSource("./requisition-budget-summary.tsx");

    for (const label of [
      "申请金额",
      "已支出",
      "其他有效承诺",
      "本申请承诺",
      "批准后可用余额",
    ]) {
      expect(summary).toContain(label);
    }
    expect(summary).toContain("提交后生成预算快照");
    expect(summary).toContain("text-destructive");
    expect(summary).toContain("超出预算");
    expect(summary).toContain(
      'detail.requisition.budget_status === "over_budget"',
    );
    expect(summary).not.toContain("Math.abs");
    expect(summary).not.toContain("Number(");
  });

  test("导航位于采购单前并受申请查看权限控制", () => {
    const menu = readSource("../layout/menu-config.ts");
    const requisitionIndex = menu.indexOf(
      'href: "/supplier-purchase-requisitions"',
    );
    const orderIndex = menu.indexOf('href: "/supplier-purchase-orders"');

    expect(requisitionIndex).toBeGreaterThan(-1);
    expect(requisitionIndex).toBeLessThan(orderIndex);
    expect(menu.slice(requisitionIndex, orderIndex)).toContain(
      'permission: "supplier.purchase-requisition.view"',
    );
  });

  test("采购申请工作区文件均不超过五百行", () => {
    for (const name of [
      "requisition-workspace.tsx",
      "requisition-list.tsx",
      "requisition-editor.tsx",
      "requisition-editor-fields.tsx",
      "requisition-editor-lines.tsx",
      "requisition-detail.tsx",
      "requisition-detail-content.tsx",
      "requisition-filters.tsx",
      "requisition-review-dialog.tsx",
      "requisition-budget-summary.tsx",
      "requisition-command-refresh.ts",
      "requisition-page-utils.ts",
      "use-requisition-draft-save.ts",
      "use-requisition-list.ts",
    ]) {
      const source = readSource(`./${name}`);
      expect(source.split("\n").length, name).toBeLessThanOrEqual(500);
    }
  });
});
