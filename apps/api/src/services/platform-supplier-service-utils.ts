import { Errors } from "@/errors/error-factory";
import type {
  PlatformSupplierDetail,
  SupplierMutationResult,
  SupplierQualification,
} from "@/repositories/platform-suppliers";

type SupplierLifecycleAction =
  | "submit"
  | "approve"
  | "reject"
  | "suspend"
  | "resume"
  | "blacklist";
type MutationConflict = Extract<SupplierMutationResult, {
  status:
    | "supplier_not_found"
    | "state_conflict"
    | "version_conflict"
    | "idempotency_conflict";
}>;

export function permissionForAction(action: SupplierLifecycleAction) {
  if (action === "approve" || action === "reject") return "review" as const;
  if (action === "blacklist") return "blacklist" as const;
  return "manage" as const;
}

export function requireMutation(result: SupplierMutationResult) {
  if (!isMutationConflict(result)) return result;
  const code = result.error_code ?? {
    supplier_not_found: "SUPPLIER_NOT_FOUND",
    state_conflict: "SUPPLIER_STATE_CONFLICT",
    version_conflict: "SUPPLIER_VERSION_CONFLICT",
    idempotency_conflict: "SUPPLIER_IDEMPOTENCY_CONFLICT",
  }[result.status];
  throw Errors.business(
    result.status === "supplier_not_found" ? 404 : 409,
    result.status === "supplier_not_found"
      ? "平台供应商不存在"
      : "供应商状态、版本或幂等键已变化，请刷新后重试",
    code,
    result,
  );
}

function isMutationConflict(
  result: SupplierMutationResult,
): result is MutationConflict {
  return result.status !== "created" && result.status !== "updated";
}

export function requireMutationSupplier(result: SupplierMutationResult) {
  if (result.status !== "created" && result.status !== "updated") {
    throw Errors.dbError("供应商命令返回状态无效", result);
  }
  if (!result.supplier) {
    throw Errors.dbError("供应商命令未返回主体", result);
  }
  return result.supplier;
}

export function requireMutationQualification(result: SupplierMutationResult) {
  if (result.status !== "updated" || !result.qualification) {
    throw Errors.dbError("供应商资质命令未返回资质", result);
  }
  return result.qualification;
}

export function requirePreviousSupplier(result: SupplierMutationResult) {
  if (
    (result.status === "created" || result.status === "updated") &&
    result.previous_supplier
  ) {
    return result.previous_supplier;
  }
  throw Errors.dbError("供应商命令未返回原状态", result);
}

export function requirePreviousQualification(result: SupplierMutationResult) {
  if (
    (result.status === "created" || result.status === "updated") &&
    result.previous_qualification
  ) {
    return result.previous_qualification;
  }
  throw Errors.dbError("供应商资质命令未返回原状态", result);
}

export function supplierNotFound(message = "平台供应商不存在") {
  return Errors.business(404, message, "SUPPLIER_NOT_FOUND");
}

export function assertQualificationTypeRules(input: {
  applicable_supplier_types: readonly string[];
  warning_days: number;
  is_required: boolean;
  blocks_new_orders: boolean;
}) {
  if (
    new Set(input.applicable_supplier_types).size !==
    input.applicable_supplier_types.length
  ) {
    throw Errors.badRequest("适用供应商类型不能重复");
  }
  if (
    !Number.isInteger(input.warning_days) ||
    input.warning_days < 0 ||
    input.warning_days > 3650
  ) {
    throw Errors.badRequest("资质预警天数必须介于 0 到 3650");
  }
  if (input.blocks_new_orders && !input.is_required) {
    throw Errors.badRequest("仅必需资质可以阻断新订单");
  }
}

export function supplierState(input: PlatformSupplierDetail) {
  return {
    onboarding_status: input.onboarding_status,
    operational_status: input.operational_status,
    version: input.version,
  };
}

export function qualificationState(input: SupplierQualification) {
  return {
    verification_status: input.verification_status,
    version: input.version,
  };
}

export function settingsState(input: {
  module_enabled: boolean;
  require_active_contract_for_new_order: boolean;
  ownership_reads_enabled: boolean;
  private_supplier_writes_enabled: boolean;
  private_catalog_writes_enabled: boolean;
  procurement_snapshot_v1_enabled: boolean;
  purchase_batch_workflow_enabled: boolean;
  version: number;
}) {
  return {
    module_enabled: input.module_enabled,
    require_active_contract_for_new_order:
      input.require_active_contract_for_new_order,
    ownership_reads_enabled: input.ownership_reads_enabled,
    private_supplier_writes_enabled: input.private_supplier_writes_enabled,
    private_catalog_writes_enabled: input.private_catalog_writes_enabled,
    procurement_snapshot_v1_enabled: input.procurement_snapshot_v1_enabled,
    purchase_batch_workflow_enabled: input.purchase_batch_workflow_enabled,
    version: input.version,
  };
}

export function supplierAuditAction(action: SupplierLifecycleAction) {
  return `platform_supplier_${action}` as
    | "platform_supplier_submit"
    | "platform_supplier_approve"
    | "platform_supplier_reject"
    | "platform_supplier_suspend"
    | "platform_supplier_resume"
    | "platform_supplier_blacklist";
}

export function supplierActionLabel(action: SupplierLifecycleAction) {
  return {
    submit: "提交审核",
    approve: "审核通过",
    reject: "驳回",
    suspend: "暂停",
    resume: "恢复",
    blacklist: "拉黑",
  }[action];
}

export function isIdempotencyDatabaseError(error: unknown) {
  if (!isRecord(error) || error.code !== "DB_ERROR") return false;
  return containsText(error.details, "SUPPLIER_IDEMPOTENCY_CONFLICT");
}

function containsText(value: unknown, expected: string): boolean {
  if (typeof value === "string") return value.includes(expected);
  if (Array.isArray(value)) {
    return value.some((item) => containsText(item, expected));
  }
  if (!isRecord(value)) return false;
  return Object.values(value).some((item) => containsText(item, expected));
}

export function createContext(
  actor: { authUserId: string; employeeId: string },
  idempotencyKey: string,
) {
  return {
    actor_user_id: actor.authUserId,
    actor_employee_id: actor.employeeId,
    idempotency_key: idempotencyKey,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
