import type {
  RequisitionBudgetStatus,
  RequisitionCreateDraftInput,
  RequisitionStatus,
  RequisitionUpdateDraftInput,
} from "./requisition-types";

export type RequisitionWorkspaceState = {
  page: number;
  keyword: string;
  status: RequisitionStatus | "all";
  budgetStatus: RequisitionBudgetStatus | "all";
  projectId: string;
  tenantSupplierId: string;
};

export type RequisitionDraftLine = {
  supplierSkuId: string;
  costCategoryId: string;
  quantity: number;
};

export type RequisitionDraftState = {
  projectId: string;
  tenantSupplierId: string;
  reason: string;
  expectedDeliveryDate?: string | null;
  remark?: string | null;
  expectedVersion: number;
  items: RequisitionDraftLine[];
};

export type RequisitionDraftErrors = Partial<
  Record<"projectId" | "tenantSupplierId" | "reason" | "items", string>
>;

export type BudgetSnapshotFact = {
  amount: string;
  expense_amount_snapshot: string;
  other_commitment_amount_snapshot: string;
  available_amount_snapshot: string;
};

export const requisitionStatusMeta = {
  draft: { label: "草稿", variant: "secondary" },
  pending_approval: { label: "待审批", variant: "warning" },
  approved: { label: "已批准", variant: "success" },
  rejected: { label: "已驳回", variant: "danger" },
  cancelled: { label: "已取消", variant: "secondary" },
  converted: { label: "已生成采购单", variant: "success" },
} as const;

export const requisitionBudgetStatusMeta = {
  unchecked: { label: "未检查", variant: "secondary" },
  within_budget: { label: "预算内", variant: "success" },
  over_budget: { label: "超预算", variant: "danger" },
} as const;

export function readRequisitionWorkspaceState(
  searchParams: Pick<URLSearchParams, "get">,
): RequisitionWorkspaceState {
  const pageValue = Number(searchParams.get("page") ?? "1");
  const statusValue = searchParams.get("status");
  const budgetValue = searchParams.get("budget_status");
  return {
    page: Number.isSafeInteger(pageValue) && pageValue > 0 ? pageValue : 1,
    keyword: searchParams.get("keyword")?.trim() ?? "",
    status: isRequisitionStatus(statusValue) ? statusValue : "all",
    budgetStatus: isBudgetStatus(budgetValue) ? budgetValue : "all",
    projectId: searchParams.get("project_id")?.trim() || "all",
    tenantSupplierId:
      searchParams.get("tenant_supplier_id")?.trim() || "all",
  };
}

export function buildRequisitionWorkspaceHref(
  state: RequisitionWorkspaceState,
): string {
  const query = new URLSearchParams();
  if (state.page > 1) query.set("page", String(state.page));
  if (state.keyword.trim()) query.set("keyword", state.keyword.trim());
  if (state.status !== "all") query.set("status", state.status);
  if (state.budgetStatus !== "all") {
    query.set("budget_status", state.budgetStatus);
  }
  if (state.projectId !== "all") query.set("project_id", state.projectId);
  if (state.tenantSupplierId !== "all") {
    query.set("tenant_supplier_id", state.tenantSupplierId);
  }
  const encoded = query.toString();
  return `/supplier-purchase-requisitions${encoded ? `?${encoded}` : ""}`;
}

export function validateRequisitionDraft(
  draft: RequisitionDraftState,
): RequisitionDraftErrors {
  if (draft.items.length > 100) {
    throw new RangeError("采购申请明细不能超过 100 行");
  }
  const errors: RequisitionDraftErrors = {};
  if (!draft.projectId) errors.projectId = "请选择项目";
  if (!draft.tenantSupplierId) {
    errors.tenantSupplierId = "请选择合作供应商";
  }
  const reason = draft.reason.trim();
  if (!reason) {
    errors.reason = "请填写临时采购原因";
  } else if (reason.length > 500) {
    errors.reason = "临时采购原因不能超过 500 个字符";
  }
  if (draft.items.length === 0) {
    errors.items = "采购申请至少需要一行商品";
    return errors;
  }
  const ids = draft.items.map(({ supplierSkuId }) =>
    supplierSkuId.toLowerCase()
  );
  if (new Set(ids).size !== ids.length) {
    errors.items = "同一 SKU 不能重复添加";
  } else if (draft.items.some(({ costCategoryId }) => !costCategoryId)) {
    errors.items = "请为每行选择成本分类";
  } else if (
    draft.items.some(({ quantity }) =>
      !Number.isFinite(quantity) || quantity <= 0 ||
      !/^\d+(?:\.\d{1,4})?$/.test(String(quantity))
    )
  ) {
    errors.items = "采购数量必须大于 0 且最多保留 4 位小数";
  }
  return errors;
}

export function toRequisitionDraftPayload(
  draft: RequisitionDraftState,
): RequisitionCreateDraftInput | RequisitionUpdateDraftInput {
  return {
    project_id: draft.projectId,
    tenant_supplier_id: draft.tenantSupplierId,
    reason: draft.reason.trim(),
    expected_delivery_date: draft.expectedDeliveryDate || null,
    remark: draft.remark?.trim() || null,
    expected_version: draft.expectedVersion,
    items: draft.items.map((item) => ({
      supplier_sku_id: item.supplierSkuId,
      cost_category_id: item.costCategoryId,
      quantity: String(item.quantity),
    })),
  } as RequisitionCreateDraftInput | RequisitionUpdateDraftInput;
}

export function requisitionBudgetFacts(
  requisitionAmount: string,
  snapshots: BudgetSnapshotFact[],
) {
  return {
    requisitionAmount: finiteAmount(requisitionAmount),
    expenseAmount: sum(snapshots, "expense_amount_snapshot"),
    otherCommitmentAmount: sum(
      snapshots,
      "other_commitment_amount_snapshot",
    ),
    currentCommitmentAmount: sum(snapshots, "amount"),
    availableAfterApproval: sum(snapshots, "available_amount_snapshot"),
  };
}

export function commandConflictMessage(code: string | undefined) {
  const messages: Record<string, string> = {
    SUPPLIER_PURCHASE_REQUISITION_VERSION_CONFLICT:
      "申请版本已变化，请刷新最新数据后再操作。",
    SUPPLIER_PURCHASE_REQUISITION_PRICE_CHANGED:
      "供应价格已变化，请刷新最新数据并重新确认。",
    SUPPLIER_PURCHASE_REQUISITION_BUDGET_CHANGED:
      "项目预算事实已变化，请刷新最新数据并重新确认。",
    SUPPLIER_PURCHASE_REQUISITION_STATE_CONFLICT:
      "申请状态已变化，请刷新最新数据后再操作。",
  };
  return code ? messages[code] ?? null : null;
}

export function formatRequisitionMoney(value: string | number) {
  const amount = Number(value);
  return Number.isFinite(amount)
    ? new Intl.NumberFormat("zh-CN", {
      style: "currency",
      currency: "CNY",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount)
    : "-";
}

export function formatRequisitionDateTime(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString("zh-CN");
}

export function shortBusinessId(value: string) {
  return value ? value.slice(0, 8) : "未知";
}

export function errorCode(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error &&
      typeof error.code === "string"
    ? error.code
    : undefined;
}

export function errorStatus(error: unknown) {
  return typeof error === "object" && error !== null && "status" in error &&
      typeof error.status === "number"
    ? error.status
    : undefined;
}

export function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function sum(
  snapshots: BudgetSnapshotFact[],
  key: keyof BudgetSnapshotFact,
) {
  return snapshots.reduce(
    (total, snapshot) => total + finiteAmount(snapshot[key]),
    0,
  );
}

function finiteAmount(value: string) {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
}

function isRequisitionStatus(value: string | null): value is RequisitionStatus {
  return value !== null && value in requisitionStatusMeta;
}

function isBudgetStatus(
  value: string | null,
): value is RequisitionBudgetStatus {
  return value !== null && value in requisitionBudgetStatusMeta;
}
