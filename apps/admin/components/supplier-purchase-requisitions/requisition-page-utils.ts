import type {
  RequisitionBudgetStatus,
  RequisitionCreateDraftInput,
  RequisitionStatus,
  RequisitionUpdateDraftInput,
} from "./requisition-types";

const CENTS_PER_UNIT = BigInt(100);
const ZERO_CENTS = BigInt(0);
export const REQUISITION_QUANTITY_ERROR =
  "采购数量必须大于 0、整数位不超过 14 位且最多保留 4 位小数";

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
  quantity: string;
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
    draft.items.some(({ quantity }) => !isValidRequisitionQuantity(quantity))
  ) {
    errors.items = REQUISITION_QUANTITY_ERROR;
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
      quantity: normalizeRequisitionQuantity(item.quantity) ?? item.quantity,
    })),
  } as RequisitionCreateDraftInput | RequisitionUpdateDraftInput;
}

export function requisitionBudgetFacts(
  requisitionAmount: string,
  snapshots: BudgetSnapshotFact[],
) {
  const availableAfterApproval = snapshots.reduce(
    (total, snapshot) =>
      total + moneyCents(snapshot.available_amount_snapshot) -
      moneyCents(snapshot.amount),
    ZERO_CENTS,
  );
  const shortfallAmount = snapshots.reduce((total, snapshot) => {
    const shortfall = moneyCents(snapshot.amount) -
      moneyCents(snapshot.available_amount_snapshot);
    return total + (shortfall > ZERO_CENTS ? shortfall : ZERO_CENTS);
  }, ZERO_CENTS);
  return {
    requisitionAmount: decimalFromCents(moneyCents(requisitionAmount)),
    expenseAmount: sumMoney(snapshots, "expense_amount_snapshot"),
    otherCommitmentAmount: sumMoney(
      snapshots,
      "other_commitment_amount_snapshot",
    ),
    currentCommitmentAmount: sumMoney(snapshots, "amount"),
    availableAfterApproval: decimalFromCents(availableAfterApproval),
    shortfallAmount: decimalFromCents(shortfallAmount),
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

export function formatRequisitionMoney(value: string) {
  const cents = decimalToCents(value);
  if (cents === null) return "-";
  const negative = cents < ZERO_CENTS;
  const absolute = negative ? -cents : cents;
  const integer = (absolute / CENTS_PER_UNIT).toString().replace(
    /\B(?=(\d{3})+(?!\d))/g,
    ",",
  );
  const fraction = (absolute % CENTS_PER_UNIT).toString().padStart(2, "0");
  return `${negative ? "-" : ""}¥${integer}.${fraction}`;
}

export function subtractRequisitionMoney(left: string, right: string) {
  return decimalFromCents(moneyCents(left) - moneyCents(right));
}

export function isNegativeRequisitionMoney(value: string) {
  return moneyCents(value) < ZERO_CENTS;
}

export function normalizeRequisitionQuantity(value: string) {
  const match = /^(\d+)(?:\.(\d{1,4}))?$/.exec(value);
  if (!match) return null;
  const integer = (match[1] ?? "").replace(/^0+(?=\d)/, "");
  if (integer.length > 14) return null;
  return match[2] === undefined ? integer : `${integer}.${match[2]}`;
}

export function isValidRequisitionQuantity(value: string) {
  const normalized = normalizeRequisitionQuantity(value);
  return normalized !== null && /[1-9]/.test(normalized);
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

function sumMoney(
  snapshots: BudgetSnapshotFact[],
  key: keyof BudgetSnapshotFact,
) {
  return decimalFromCents(snapshots.reduce(
    (total, snapshot) => total + moneyCents(snapshot[key]),
    ZERO_CENTS,
  ));
}

function moneyCents(value: string) {
  const cents = decimalToCents(value);
  if (cents === null) throw new RangeError("无效的金额格式");
  return cents;
}

function decimalToCents(value: string) {
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(value);
  if (!match) return null;
  const fraction = match[3] ?? "";
  const fractionCents = BigInt((fraction + "00").slice(0, 2));
  const cents = BigInt(match[2] ?? "0") * CENTS_PER_UNIT + fractionCents;
  return match[1] === "-" ? -cents : cents;
}

function decimalFromCents(cents: bigint) {
  const negative = cents < ZERO_CENTS;
  const absolute = negative ? -cents : cents;
  return `${negative ? "-" : ""}${absolute / CENTS_PER_UNIT}.${
    (absolute % CENTS_PER_UNIT).toString().padStart(2, "0")
  }`;
}

function isRequisitionStatus(value: string | null): value is RequisitionStatus {
  return value !== null && value in requisitionStatusMeta;
}

function isBudgetStatus(
  value: string | null,
): value is RequisitionBudgetStatus {
  return value !== null && value in requisitionBudgetStatusMeta;
}
