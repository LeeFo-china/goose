import type {
  EditablePurchaseOrder,
  PurchaseOrder,
  PurchaseOrderDraftLine,
  PurchaseOrderDraftState,
  PurchaseOrderStatus,
  PurchaseOrderWithReferences,
} from "./purchase-order-types";

export type PurchaseOrderAction = "edit" | "submit" | "cancel";

export type RequisitionCreationEntry = {
  href: "/supplier-purchase-requisitions?create=1";
  label: "发起采购申请";
  description: "采购单由已批准的采购申请转换生成";
};

export const purchaseOrderStatusMeta: Record<
  PurchaseOrderStatus,
  {
    label: string;
    variant: "secondary" | "success" | "outline";
  }
> = {
  draft: { label: "草稿", variant: "secondary" },
  submitted: { label: "已提交", variant: "success" },
  cancelled: { label: "已取消", variant: "outline" },
};

export function purchaseOrderActions(
  status: PurchaseOrderStatus,
  canManage: boolean,
): PurchaseOrderAction[] {
  if (!canManage) return [];
  if (status === "draft") return ["edit", "submit", "cancel"];
  if (status === "submitted") return ["cancel"];
  return [];
}

export function requisitionCreationEntry(
  canManagePurchaseRequisitions: boolean,
): RequisitionCreationEntry | null {
  if (!canManagePurchaseRequisitions) return null;
  return {
    href: "/supplier-purchase-requisitions?create=1",
    label: "发起采购申请",
    description: "采购单由已批准的采购申请转换生成",
  };
}

export function canEditPurchaseOrderDraft(
  order: Pick<
    PurchaseOrderWithReferences,
    "status" | "purchase_requisition_id"
  >,
  canManage: boolean,
): order is EditablePurchaseOrder {
  return canManage && order.status === "draft";
}

export function validatePurchaseOrderDraft(input: Pick<
  PurchaseOrderDraftState,
  "projectId" | "tenantSupplierId" | "lines"
>) {
  const errors: {
    projectId?: string;
    tenantSupplierId?: string;
    lines?: string;
  } = {};
  if (!input.projectId) errors.projectId = "请选择项目";
  if (!input.tenantSupplierId) {
    errors.tenantSupplierId = "请选择合作供应商";
  }
  if (input.lines.length === 0) {
    errors.lines = "采购单至少需要一行商品";
  } else if (input.lines.length > 100) {
    errors.lines = "采购单明细不能超过 100 行";
  } else if (input.lines.some(({ quantity }) =>
    !Number.isFinite(quantity) || quantity <= 0
  )) {
    errors.lines = "采购数量必须大于 0";
  }
  return errors;
}

export function addDraftLine(
  lines: PurchaseOrderDraftLine[],
  supplierSkuId: string,
) {
  if (lines.some((line) => line.supplierSkuId === supplierSkuId)) {
    return lines;
  }
  if (lines.length >= 100) {
    throw new Error("采购单明细不能超过 100 行");
  }
  return [...lines, { supplierSkuId, quantity: 1 }];
}

export function setDraftLineQuantity(
  lines: PurchaseOrderDraftLine[],
  supplierSkuId: string,
  quantity: number,
) {
  return lines.map((line) =>
    line.supplierSkuId === supplierSkuId ? { ...line, quantity } : line
  );
}

export function removeDraftLine(
  lines: PurchaseOrderDraftLine[],
  supplierSkuId: string,
) {
  return lines.filter((line) => line.supplierSkuId !== supplierSkuId);
}

export function toDraftPayload(input: PurchaseOrderDraftState) {
  return {
    project_id: input.projectId,
    tenant_supplier_id: input.tenantSupplierId,
    expected_version: input.expectedVersion,
    expected_delivery_date: input.expectedDeliveryDate ?? null,
    remark: input.remark?.trim() || null,
    items: input.lines.map((line) => ({
      supplier_sku_id: line.supplierSkuId,
      quantity: line.quantity,
    })),
  };
}

export function replaceSavedFacts(
  current: Partial<PurchaseOrder> | null,
  saved: Partial<PurchaseOrder> & Pick<
    PurchaseOrder,
    | "id"
    | "priced_at"
    | "subtotal_amount"
    | "tax_amount"
    | "total_amount"
    | "version"
  >,
) {
  return { ...(current ?? {}), ...saved };
}

export function commandErrorMessage(
  code: string | undefined,
  fallback: string,
) {
  if (code === "SUPPLIER_PURCHASE_ORDER_VERSION_CONFLICT") {
    return "采购单版本已变化，正在重新加载最新数据";
  }
  if (code === "SUPPLIER_PURCHASE_ORDER_PRICE_CHANGED") {
    return "采购价格已变化，请重新保存草稿刷新价格";
  }
  return fallback;
}

export function formatPurchaseMoney(value: string, currency = "CNY") {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "-";
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(amount);
}
