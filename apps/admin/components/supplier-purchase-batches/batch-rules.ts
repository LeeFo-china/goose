import type {
  BatchAccess,
  BatchDetail,
  BatchDraft,
  BatchSavePayload,
  BatchSettings,
  DestinationType,
} from "./batch-types";

export const BATCH_STATUS_LABELS = {
  draft: "草稿",
  pending_approval: "审批中",
  rejected: "已驳回",
  cancelled: "已取消",
  ordered: "已生成采购单",
};
export function batchAccess(permissions: readonly string[]): BatchAccess {
  const codes = new Set(permissions);
  return {
    canView: codes.has("supplier.purchase-requisition.view"),
    canManage: codes.has("supplier.purchase-requisition.manage"),
    canReadSettings: codes.has("supplier.view"),
    canViewWarehouses: codes.has("inventory.warehouse.view"),
    canManageWarehouses: codes.has("inventory.warehouse.manage"),
    canViewOrders: codes.has("supplier.purchase-order.view"),
  };
}
export function warehouseCreationBlocker(
  access: BatchAccess,
  settings: BatchSettings | null,
): string | null {
  if (!access.canManage) return "需要采购申请管理权限才能新建仓库补货";
  if (!access.canViewWarehouses || !access.canManageWarehouses) {
    return "需要仓库查看及管理权限才能新建仓库补货";
  }
  if (!access.canReadSettings) {
    return "缺少供应商查看权限，无法确认仓库补货是否开放；项目采购仍可使用";
  }
  if (!settings) return "正在确认仓库补货设置，暂不可创建";
  if (!settings.module_enabled || !settings.warehouse_procurement_enabled) {
    return "仓库补货尚未开放；已有批次仍可查看";
  }
  if (!settings.purchase_batch_workflow_enabled) {
    return "仓库补货必须启用审批流程";
  }
  return null;
}
export function newBatchDraft(): BatchDraft {
  return {
    destination_type: "project",
    project_id: null,
    warehouse_id: null,
    reason: "",
    remark: "",
    expected_delivery_date: "",
    lines: [],
  };
}
export function changeDestination(
  draft: BatchDraft,
  destination_type: DestinationType,
): BatchDraft {
  return {
    ...draft,
    destination_type,
    project_id: null,
    warehouse_id: null,
    lines: [],
  };
}
export function draftPayload(
  draft: BatchDraft,
  version: number,
): BatchSavePayload {
  return {
    destination_type: draft.destination_type,
    project_id: draft.destination_type === "project" ? draft.project_id : null,
    warehouse_id: draft.destination_type === "warehouse"
      ? draft.warehouse_id
      : null,
    expected_version: version,
    reason: draft.reason.trim(),
    remark: draft.remark.trim() || null,
    expected_delivery_date: draft.expected_delivery_date || null,
    items: draft.lines.map((
      { supplier_sku_id, quantity, cost_category_id },
    ) => ({
      supplier_sku_id,
      quantity,
      ...(cost_category_id ? { cost_category_id } : {}),
    })),
  };
}

export type BatchDraftValidation = {
  message: string;
  field: "destination" | "reason" | "remark" | "items";
};

export function validateBatchDraft(
  draft: BatchDraft,
): BatchDraftValidation | null {
  const hasDestination = draft.destination_type === "project"
    ? Boolean(draft.project_id)
    : Boolean(draft.warehouse_id);
  if (!hasDestination) {
    return { message: "请先选择采购项目或仓库", field: "destination" };
  }
  const reason = draft.reason.trim();
  if (!reason) {
    return { message: "请选择或填写采购用途", field: "reason" };
  }
  if (reason.length > 500) {
    return { message: "采购用途不能超过 500 字", field: "reason" };
  }
  if (draft.remark.trim().length > 500) {
    return { message: "备注不能超过 500 字", field: "remark" };
  }
  if (!draft.lines.length || draft.lines.length > 100) {
    return { message: "请选择 1–100 个商品 SKU", field: "items" };
  }
  if (new Set(draft.lines.map(({ supplier_id }) => supplier_id)).size > 20) {
    return { message: "每批最多选择 20 家供应商", field: "items" };
  }
  const skuIds = draft.lines.map(({ supplier_sku_id }) =>
    supplier_sku_id.toLowerCase()
  );
  if (new Set(skuIds).size !== draft.lines.length) {
    return { message: "同一 SKU 不能重复添加", field: "items" };
  }
  if (draft.lines.some(({ cost_category_id }) => !cost_category_id)) {
    return { message: "请为每个商品选择成本类目", field: "items" };
  }
  if (
    draft.lines.some(({ quantity }) =>
      !/^\d{1,14}(?:\.\d{1,4})?$/.test(quantity) || !/[1-9]/.test(quantity)
    )
  ) {
    return {
      message: "采购数量必须大于 0，最多 4 位小数",
      field: "items",
    };
  }
  return null;
}

export function draftError(draft: BatchDraft): string | null {
  return validateBatchDraft(draft)?.message ?? null;
}

export function batchContextChangeRequiresConfirmation(
  draft: BatchDraft,
): boolean {
  return draft.lines.length > 0;
}
export function destinationName(batch: BatchDetail): string {
  return batch.destination_type === "warehouse"
    ? batch.warehouse?.name ?? "仓库信息不可用"
    : batch.project?.name ?? "项目信息不可用";
}
export function batchError(
  error: unknown,
  fallback = "操作失败，请重试",
): string {
  return error instanceof Error ? error.message : fallback;
}
export function errorStatus(error: unknown): number | undefined {
  return error && typeof error === "object" && "status" in error &&
      typeof error.status === "number"
    ? error.status
    : undefined;
}
export function revisionDetails(
  error: unknown,
): {
  batch: { id: string; status: string };
  version: number;
  error_code: string;
  details: unknown[];
} | null {
  if (
    errorStatus(error) !== 409 || !error || typeof error !== "object" ||
    !("payload" in error)
  ) return null;
  const payload = error.payload;
  if (!payload || typeof payload !== "object" || !("details" in payload)) {
    return null;
  }
  const details = payload.details;
  if (
    !details || typeof details !== "object" || !("batch" in details) ||
    !("version" in details) || !("error_code" in details) ||
    !("details" in details)
  ) return null;
  const batch = details.batch;
  if (
    !batch || typeof batch !== "object" || !("id" in batch) ||
    !("status" in batch) || typeof batch.id !== "string" ||
    typeof batch.status !== "string" || typeof details.version !== "number" ||
    typeof details.error_code !== "string" || !Array.isArray(details.details)
  ) return null;
  return {
    batch: { id: batch.id, status: batch.status },
    version: details.version,
    error_code: details.error_code,
    details: details.details,
  };
}
