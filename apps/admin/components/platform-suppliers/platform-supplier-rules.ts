import type { PlatformSupplierDetailRecord } from "./platform-supplier-types";

export type LifecycleAction =
  | "submit"
  | "approve"
  | "reject"
  | "suspend"
  | "resume"
  | "blacklist";

export function isSupplierReadOnly(
  supplier: Pick<PlatformSupplierDetailRecord, "operational_status">,
) {
  return supplier.operational_status === "blacklisted";
}

export function canEditSupplier(
  supplier: Pick<
    PlatformSupplierDetailRecord,
    "onboarding_status" | "operational_status"
  >,
  canManage: boolean,
) {
  return (
    canManage &&
    !isSupplierReadOnly(supplier) &&
    ["draft", "rejected"].includes(supplier.onboarding_status)
  );
}

export function isLatestResourceRequest(
  requestId: number,
  latestRequestId: number,
) {
  return requestId === latestRequestId;
}

export function availableLifecycleActions(
  supplier: PlatformSupplierDetailRecord,
  permissions: {
    canManage: boolean;
    canReview: boolean;
    canBlacklist: boolean;
  },
) {
  if (isSupplierReadOnly(supplier)) return [];

  const actions: LifecycleAction[] = [];
  if (
    permissions.canManage &&
    ["draft", "rejected"].includes(supplier.onboarding_status)
  ) {
    actions.push("submit");
  }
  if (
    permissions.canReview &&
    supplier.onboarding_status === "pending_review"
  ) {
    actions.push("approve", "reject");
  }
  if (
    permissions.canManage &&
    supplier.onboarding_status === "approved" &&
    supplier.operational_status === "active"
  ) {
    actions.push("suspend");
  }
  if (
    permissions.canManage &&
    supplier.operational_status === "suspended"
  ) {
    actions.push("resume");
  }
  if (
    permissions.canBlacklist &&
    supplier.operational_status !== "blacklisted"
  ) {
    actions.push("blacklist");
  }
  return actions;
}

export function previousChildPage(page: number) {
  return Math.max(1, page - 1);
}

export function nextChildPage(page: number, totalPages: number) {
  return Math.min(Math.max(1, totalPages), page + 1);
}

export function normalizeSupplierPage(value: string | undefined) {
  const parsed = Number(value ?? "1");
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1;
}
