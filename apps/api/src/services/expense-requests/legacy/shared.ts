import { Errors } from "@/errors/error-factory";
import { expenseRequestRepository } from "@/repositories/expense-requests";
import type {
  ApproveExpenseRequestInput,
  CancelExpenseRequestInput,
  CreateExpenseRequestInput,
  ExpenseApprovalCandidateQueryType,
  ExpenseApprovalChainItemInput,
  ExpenseApprovalTemplateQueryType,
  ExpenseRequestListQueryType,
  ExpenseRequestProjectCandidateQueryType,
  ExpenseRequestItemInput,
  PayExpenseRequestInput,
  RejectExpenseRequestInput,
  SubmitExpenseRequestInput,
  UpdateExpenseRequestInput,
} from "@/schema/expense-requests";
import type {
  ExpenseApprovalCandidateEmployee,
  ExpenseApprovalChainPayload,
  ExpenseApprovalChainRecord,
  ExpenseProjectCandidateRow,
  ExpenseRequestRecord,
} from "@/repositories/expense-requests";
import type { AuthContext } from "@/services/authorization";
import { accessPolicyService } from "@/services/access-policy";
import { expenseRequestCategoryService } from "@/services/expense-request-categories";
import {
  resolveStoredFileUrl,
  resolveStoredFileUrlList,
} from "@/services/files/file-url-resolver";
import { ProjectStatusConfig, isProjectStatus } from "@gooes/domain";

export type ExpenseRequestVisibilityFilter = Awaited<
  ReturnType<typeof accessPolicyService.getVisibleExpenseFilters>
>;

export type ExpenseRequestOperationPermission =
  | "expense_request.approve_manager"
  | "expense_request.approve_finance"
  | "expense_request.pay";

export type ExpenseRequestAccessScope = "self" | "assigned" | "department" | "all";

export type ApprovalChainStep = "manager_review" | "finance_review";

export const approvalChainStepConfigs: Array<{
  step: ApprovalChainStep;
  step_name: string;
  sort_order: number;
  required_permission: ExpenseRequestOperationPermission;
  description: string;
}> = [
  {
    step: "manager_review",
    step_name: "经理审批",
    sort_order: 1,
    required_permission: "expense_request.approve_manager",
    description: "请选择具备经理审批权限的负责人",
  },
  {
    step: "finance_review",
    step_name: "财务审批",
    sort_order: 2,
    required_permission: "expense_request.approve_finance",
    description: "请选择具备财务审批权限的会计或财务人员",
  },
];

export const approvalStepPermissionMap: Record<string, ExpenseRequestOperationPermission> = {
  manager_review: "expense_request.approve_manager",
  finance_review: "expense_request.approve_finance",
  payment: "expense_request.pay",
};

export const scopeWeight: Record<ExpenseRequestAccessScope, number> = {
  self: 1,
  assigned: 2,
  department: 3,
  all: 4,
};

export type ResolvedExpenseRequestItemInput = ExpenseRequestItemInput & {
  category: string;
  category_code: string | null;
  category_remark: string | null;
};

export type ExpenseApprovalRecordLike = {
  approval_round?: number | null;
  step?: string | null;
  action?: string | null;
  approver_id?: string | null;
  created_at?: string | null;
};

export function calculateTotalAmount(items: Array<ExpenseRequestItemInput | ResolvedExpenseRequestItemInput>) {
  return Number(
    items.reduce((sum, item) => sum + Number(item.amount || 0), 0).toFixed(2),
  );
}

export function buildLegacyFields(
  title: string | null | undefined,
  items: Array<ExpenseRequestItemInput | ResolvedExpenseRequestItemInput>,
  totalAmount: number,
) {
  const firstItem = items[0];
  const evidenceImages = items.flatMap((item) => item.evidence_images || []);

  return {
    amount: totalAmount,
    category: firstItem?.category ?? "GENERAL",
    reason: title ?? firstItem?.remark ?? "费用申请",
    evidence_images: evidenceImages,
  };
}

export function generateExpenseRequestNo() {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  const stamp = [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
  ].join("");
  const random = Math.floor(Math.random() * 9000) + 1000;

  return `ER${stamp}${random}`;
}

export function normalizeRelationName(value: unknown) {
  if (Array.isArray(value)) {
    const first = value[0] as { name?: unknown } | undefined;
    return typeof first?.name === "string" ? first.name : null;
  }

  if (value && typeof value === "object") {
    const item = value as { name?: unknown };
    return typeof item.name === "string" ? item.name : null;
  }

  return null;
}

export function normalizeRelationValue<T extends Record<string, unknown>>(value: unknown) {
  if (Array.isArray(value)) {
    return (value[0] as T | undefined) ?? null;
  }

  if (value && typeof value === "object") {
    return value as T;
  }

  return null;
}

export function normalizeTenantDepartmentName(value: unknown) {
  if (Array.isArray(value)) {
    const first = value[0] as { alias_name?: unknown } | undefined;
    return typeof first?.alias_name === "string" ? first.alias_name : null;
  }

  if (value && typeof value === "object") {
    const item = value as { alias_name?: unknown };
    return typeof item.alias_name === "string" ? item.alias_name : null;
  }

  return null;
}

export function sameDepartmentScope(
  left: { tenant_department_id?: string | null },
  right: { tenant_department_id?: string | null },
) {
  return Boolean(
    left.tenant_department_id &&
      right.tenant_department_id &&
      left.tenant_department_id === right.tenant_department_id,
  );
}

export function normalizeScope(value: string | null | undefined): ExpenseRequestAccessScope {
  if (value === "department" || value === "assigned" || value === "all") {
    return value;
  }

  return "self";
}

export function resolveAvatarRelation(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => resolveAvatarRelation(item));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  const row = value as Record<string, unknown>;
  if (!("avatar" in row)) {
    return value;
  }

  return {
    ...row,
    avatar: resolveStoredFileUrl(typeof row.avatar === "string" ? row.avatar : null),
  };
}

export function resolveEvidenceImagesRelation(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => resolveEvidenceImagesRelation(item));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  const row = value as Record<string, unknown>;
  if (!("evidence_images" in row)) {
    return value;
  }

  const categoryFields = "category" in row || "category_code" in row
    ? {
      category_name: typeof row.category_code === "string" &&
          row.category_code.trim()
        ? typeof row.category === "string"
          ? row.category
          : null
        : null,
    }
    : {};

  return {
    ...row,
    ...categoryFields,
    evidence_images: resolveStoredFileUrlList(row.evidence_images),
  };
}

export function resolveApprovalChainRelations(value: unknown): unknown {
  if (!Array.isArray(value)) {
    return value;
  }

  return value.map((item) => {
    if (!item || typeof item !== "object") {
      return item;
    }

    const row = item as Record<string, unknown>;
    return {
      ...row,
      assignee: resolveAvatarRelation(row.assignee),
    };
  });
}

export function dedupeApprovalRecords(value: unknown): unknown {
  if (!Array.isArray(value)) {
    return value;
  }

  const seen = new Set<string>();
  const rows: unknown[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") {
      rows.push(item);
      continue;
    }

    const row = item as ExpenseApprovalRecordLike;
    const key = [
      row.approval_round ?? 1,
      row.step ?? "",
      row.action ?? "",
      row.approver_id ?? "",
    ].join(":");
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    rows.push(item);
  }

  return rows;
}


export {
  Errors,
  expenseRequestRepository,
  accessPolicyService,
  expenseRequestCategoryService,
  resolveStoredFileUrl,
  resolveStoredFileUrlList,
  ProjectStatusConfig,
  isProjectStatus,
};
export type {
  ApproveExpenseRequestInput,
  CancelExpenseRequestInput,
  CreateExpenseRequestInput,
  ExpenseApprovalCandidateQueryType,
  ExpenseApprovalChainItemInput,
  ExpenseApprovalTemplateQueryType,
  ExpenseRequestListQueryType,
  ExpenseRequestProjectCandidateQueryType,
  ExpenseRequestItemInput,
  PayExpenseRequestInput,
  RejectExpenseRequestInput,
  SubmitExpenseRequestInput,
  UpdateExpenseRequestInput,
  ExpenseApprovalCandidateEmployee,
  ExpenseApprovalChainPayload,
  ExpenseApprovalChainRecord,
  ExpenseProjectCandidateRow,
  ExpenseRequestRecord,
  AuthContext,
};
