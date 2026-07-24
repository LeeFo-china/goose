import { Errors } from "@/errors/error-factory";
import { administrativeAreaRepository } from "@/repositories/administrative-areas";
import {
  platformSuppliersRepository,
  type PlatformSupplierDetail, type PlatformSuppliersRepositoryPort,
  type SupplierMutationResult, type SupplierQualification,
} from "@/repositories/platform-suppliers";
import type {
  PlatformSupplierCreateInput, PlatformSupplierListQuery,
  PlatformSupplierUpdateInput, SupplierAddressWrite,
  SupplierChildPageQuery, SupplierContactWrite, SupplierEventPageQuery,
  SupplierQualificationCreateRecord,
  SupplierQualificationTypeCreateRecord, SupplierQualificationTypeListQuery,
  SupplierQualificationTypeUpdateRecord, SupplierQualificationUpdateRecord,
  SupplierServiceRegionWrite,
} from "@/schema/platform-suppliers";
import { accessPolicyService } from "@/services/access-policy";
import type { AuthContext } from "@/services/authorization";
import { platformAuditLogService } from "@/services/platform-audit-logs";
const PERMISSION = {
  view: "platform.supplier.view",
  manage: "platform.supplier.manage",
  review: "platform.supplier.review",
  blacklist: "platform.supplier.blacklist",
} as const;
type AccessPolicyPort = Pick<typeof accessPolicyService, "assertPermission">;
type AuditPort = Pick<typeof platformAuditLogService, "recordBestEffort">;
type RegionsPort = Pick<typeof administrativeAreaRepository, "list">;
export type PlatformSuppliersServiceDependencies = {
  repository?: PlatformSuppliersRepositoryPort;
  accessPolicy?: AccessPolicyPort;
  audit?: AuditPort;
  regions?: RegionsPort;
};
export type SupplierLifecycleAction = "submit" | "approve" | "reject" |
  "suspend" | "resume" | "blacklist";
type LifecycleInput = { expected_version: number; reason?: string };
type ServiceWrite<T> = T extends unknown ? Omit<T, "created_by_employee_id" | "updated_by_employee_id"> : never;
type MutationConflict = Extract<SupplierMutationResult, {
  status: "supplier_not_found" | "state_conflict" |
    "version_conflict" | "idempotency_conflict";
}>;
type CreateSupplierRequest = { supplierId: string; input: PlatformSupplierCreateInput;
  idempotencyKey: string };
type SettingsRequest = {
  tenantId: string; module_enabled: boolean;
  require_active_contract_for_new_order: boolean;
  expected_version: number; idempotencyKey: string;
};
export class PlatformSuppliersService {
  private readonly repository: PlatformSuppliersRepositoryPort;
  private readonly accessPolicy: AccessPolicyPort;
  private readonly audit: AuditPort;
  private readonly regions: RegionsPort;
  constructor(dependencies: PlatformSuppliersServiceDependencies = {}) {
    this.repository = dependencies.repository ?? platformSuppliersRepository;
    this.accessPolicy = dependencies.accessPolicy ?? accessPolicyService;
    this.audit = dependencies.audit ?? platformAuditLogService;
    this.regions = dependencies.regions ?? administrativeAreaRepository;
  }
  listSuppliers(auth: AuthContext, query: PlatformSupplierListQuery) {
    this.require(auth, "view"); return this.repository.listSuppliers(query);
  }
  async getSupplier(auth: AuthContext, supplierId: string) {
    this.require(auth, "view"); return this.requireSupplier(supplierId);
  }
  listQualificationTypes(auth: AuthContext, query: SupplierQualificationTypeListQuery) {
    this.require(auth, "view"); return this.repository.listQualificationTypes(query);
  }
  async createQualificationType(
    auth: AuthContext, input: SupplierQualificationTypeCreateRecord,
  ) {
    this.require(auth, "manage");
    assertQualificationTypeRules(input);
    return this.repository.createQualificationType(input);
  }
  async updateQualificationType(
    auth: AuthContext, input: SupplierQualificationTypeUpdateRecord,
  ) {
    this.require(auth, "manage");
    const current = await this.requireQualificationType(input.qualification_type_id);
    assertQualificationTypeRules({ ...current, ...input });
    return this.repository.updateQualificationType(input);
  }
  async createSupplier(auth: AuthContext, request: CreateSupplierRequest) {
    const actor = this.require(auth, "manage");
    const result = await this.runCommand(() => this.repository.createSupplier({
      supplier_id: request.supplierId, ...request.input,
      actor_user_id: actor.authUserId, actor_employee_id: actor.employeeId,
      idempotency_key: request.idempotencyKey,
    }));
    if (result.idempotent) return result;
    const supplier = requireMutationSupplier(result);
    await this.audit.recordBestEffort({
      action: "platform_supplier_create", actorEmployeeId: actor.employeeId,
      actorUserId: actor.authUserId, resourceType: "supplier",
      resourceId: supplier.id, resourceLabel: supplier.name, status: "success",
      summary: `创建平台供应商「${supplier.name}」`,
      metadata: { from: null, to: supplierState(supplier) },
    });
    return result;
  }
  async updateSupplier(
    auth: AuthContext, supplierId: string, input: PlatformSupplierUpdateInput,
  ) {
    const actor = this.require(auth, "manage");
    return this.runCommand(() => this.repository.updateSupplier({
      supplier_id: supplierId, ...input,
      updated_by_employee_id: actor.employeeId,
    }));
  }
  async mutateSupplier(
    auth: AuthContext, supplierId: string, action: SupplierLifecycleAction,
    input: LifecycleInput, idempotencyKey: string,
  ) {
    const actor = this.require(auth, permissionForAction(action));
    const result = await this.runCommand(() => this.repository.mutateSupplier({
      supplier_id: supplierId, action, expected_version: input.expected_version,
      reason: input.reason, actor_user_id: actor.authUserId,
      actor_employee_id: actor.employeeId,
      idempotency_key: idempotencyKey,
    }));
    if (result.idempotent) return result;
    const before = requirePreviousSupplier(result);
    const after = requireMutationSupplier(result);
    await this.recordSupplierAudit(actor, action, before, after, input.reason);
    return result;
  }
  listQualifications(auth: AuthContext, input: SupplierChildPageQuery) {
    this.require(auth, "view"); return this.repository.listQualifications(input);
  }
  async createQualification(
    auth: AuthContext, input: ServiceWrite<SupplierQualificationCreateRecord>,
  ) {
    const actor = this.require(auth, "manage");
    await this.requireSupplier(input.supplier_id);
    return this.repository.createQualification({
      ...input, created_by_employee_id: actor.employeeId,
      updated_by_employee_id: actor.employeeId,
    });
  }
  async updateQualification(
    auth: AuthContext, input: ServiceWrite<SupplierQualificationUpdateRecord>,
  ) {
    const actor = this.require(auth, "manage");
    await this.requireOwnedQualification(input.supplier_id, input.qualification_id);
    return this.repository.updateQualification({
      ...input, updated_by_employee_id: actor.employeeId,
    });
  }
  async reviewQualification(
    auth: AuthContext, supplierId: string, qualificationId: string,
    verificationStatus: "verified" | "rejected",
    input: LifecycleInput, idempotencyKey: string,
  ) {
    const actor = this.require(auth, "review");
    await this.requireOwnedQualification(supplierId, qualificationId);
    const result = await this.runCommand(() => this.repository.reviewQualification({
      supplier_id: supplierId, qualification_id: qualificationId,
      verification_status: verificationStatus,
      expected_version: input.expected_version, reason: input.reason,
      actor_user_id: actor.authUserId, actor_employee_id: actor.employeeId,
      idempotency_key: idempotencyKey,
    }));
    if (result.idempotent) return result;
    const supplier = await this.requireSupplier(supplierId);
    const before = requirePreviousQualification(result);
    const after = requireMutationQualification(result);
    await this.audit.recordBestEffort({
      action: verificationStatus === "verified"
        ? "supplier_qualification_verify"
        : "supplier_qualification_reject",
      actorEmployeeId: actor.employeeId, actorUserId: actor.authUserId,
      resourceType: "supplier_qualification",
      resourceId: qualificationId, resourceLabel: supplier.name, status: "success",
      summary: `${verificationStatus === "verified" ? "核验通过" : "驳回"}供应商「${supplier.name}」资质`,
      metadata: {
        from: qualificationState(before),
        to: qualificationState(after),
        reason: input.reason ?? null,
      },
    });
    return result;
  }
  listServiceRegions(auth: AuthContext, input: SupplierChildPageQuery) {
    this.require(auth, "view"); return this.repository.listServiceRegions(input);
  }
  async upsertServiceRegion(auth: AuthContext, input: ServiceWrite<SupplierServiceRegionWrite>) {
    const actor = this.require(auth, "manage");
    let current = null;
    if ("region_id" in input) {
      current = await this.requireOwnedServiceRegion(input.supplier_id, input.region_id);
    } else {
      await this.requireSupplier(input.supplier_id);
    }
    const regionCode = input.region_code ?? current?.region_code;
    const regionLevel = input.region_level ?? current?.region_level;
    if (!regionCode || !regionLevel) {
      throw Errors.badRequest("服务区域行政区划信息不完整");
    }
    await this.assertAdministrativeRegion(regionCode, regionLevel);
    if ("region_id" in input) return this.repository.upsertServiceRegion({
      ...input, region_code: regionCode, region_level: regionLevel,
      updated_by_employee_id: actor.employeeId });
    return this.repository.upsertServiceRegion({ ...input,
      created_by_employee_id: actor.employeeId, updated_by_employee_id: actor.employeeId });
  }
  listAddresses(auth: AuthContext, input: SupplierChildPageQuery) {
    this.require(auth, "view"); return this.repository.listAddresses(input);
  }
  async upsertAddress(auth: AuthContext, input: ServiceWrite<SupplierAddressWrite>) {
    const actor = this.require(auth, "manage");
    if ("address_id" in input) {
      await this.requireOwnedAddress(input.supplier_id, input.address_id);
      return this.repository.upsertAddress({ ...input,
        updated_by_employee_id: actor.employeeId });
    }
    await this.requireSupplier(input.supplier_id);
    return this.repository.upsertAddress({ ...input,
      created_by_employee_id: actor.employeeId, updated_by_employee_id: actor.employeeId });
  }
  listContacts(auth: AuthContext, input: SupplierChildPageQuery) {
    this.require(auth, "view"); return this.repository.listContacts(input);
  }
  async upsertContact(auth: AuthContext, input: ServiceWrite<SupplierContactWrite>) {
    const actor = this.require(auth, "manage");
    if ("contact_id" in input) {
      await this.requireOwnedContact(input.supplier_id, input.contact_id);
      return this.repository.upsertContact({ ...input,
        updated_by_employee_id: actor.employeeId });
    }
    await this.requireSupplier(input.supplier_id);
    return this.repository.upsertContact({ ...input,
      created_by_employee_id: actor.employeeId, updated_by_employee_id: actor.employeeId });
  }
  listEvents(auth: AuthContext, input: SupplierEventPageQuery) {
    this.require(auth, "view"); return this.repository.listEvents(input);
  }
  getTenantSupplierSettings(auth: AuthContext, tenantId: string) {
    this.require(auth, "view"); return this.repository.getTenantSupplierSettings(tenantId);
  }
  async setTenantSupplierSettings(auth: AuthContext, input: SettingsRequest) {
    const actor = this.require(auth, "manage");
    const result = await this.mapIdempotencyError(() =>
      this.repository.setTenantSupplierSettings({
        tenant_id: input.tenantId, module_enabled: input.module_enabled,
        require_active_contract_for_new_order:
          input.require_active_contract_for_new_order,
        expected_version: input.expected_version, actor_user_id: actor.authUserId,
        actor_employee_id: actor.employeeId,
        idempotency_key: input.idempotencyKey,
      }));
    if (result.idempotent) return result.setting;
    const setting = result.setting;
    await this.audit.recordBestEffort({
      action: input.module_enabled
        ? "tenant_supplier_module_enable"
        : "tenant_supplier_module_disable",
      actorEmployeeId: actor.employeeId, actorUserId: actor.authUserId,
      targetTenantId: input.tenantId, resourceType: "tenant_supplier_settings",
      resourceId: input.tenantId,
      resourceLabel: `租户 ${input.tenantId}`,
      status: "success",
      summary: `${input.module_enabled ? "启用" : "停用"}租户供应商模块`,
      metadata: {
        from: result.previous_setting ? settingsState(result.previous_setting) : null,
        to: settingsState(setting),
      },
    });
    return setting;
  }
  private require(auth: AuthContext, permission: keyof typeof PERMISSION) {
    if (!auth.isPlatformAdmin || !auth.employeeId || !auth.authUserId) {
      throw Errors.forbidden();
    }
    this.accessPolicy.assertPermission(auth, PERMISSION[permission]);
    return { authUserId: auth.authUserId, employeeId: auth.employeeId };
  }
  private async requireSupplier(supplierId: string) {
    const supplier = await this.repository.findSupplierById(supplierId);
    if (!supplier) throw supplierNotFound();
    return supplier;
  }
  private async requireQualificationType(qualificationTypeId: string) {
    const type = await this.repository.findQualificationTypeById(qualificationTypeId);
    if (!type) throw supplierNotFound("供应商资质类型不存在");
    return type;
  }
  private async requireOwnedQualification(
    supplierId: string,
    qualificationId: string,
  ) {
    const qualification = await this.repository.findQualificationByIdForSupplier(
      supplierId, qualificationId,
    );
    if (!qualification) throw supplierNotFound("供应商资质不存在");
    return qualification;
  }
  private async requireOwnedServiceRegion(supplierId: string, regionId: string) {
    const region = await this.repository.findServiceRegionByIdForSupplier(
      supplierId, regionId);
    if (!region) throw supplierNotFound("供应商服务区域不存在");
    return region;
  }
  private async requireOwnedAddress(supplierId: string, addressId: string) {
    const address = await this.repository.findAddressByIdForSupplier(
      supplierId, addressId);
    if (!address) throw supplierNotFound("供应商地址不存在");
    return address;
  }
  private async requireOwnedContact(supplierId: string, contactId: string) {
    const contact = await this.repository.findContactByIdForSupplier(
      supplierId, contactId);
    if (!contact) throw supplierNotFound("供应商联系人不存在");
    return contact;
  }
  private async assertAdministrativeRegion(
    regionCode: string,
    regionLevel: "province" | "city" | "district",
  ) {
    const rows = await this.regions.list({ keyword: regionCode });
    const region = rows.find((item) =>
      item.adcode === regionCode && item.status === "active");
    if (!region) throw Errors.badRequest("行政区划不存在或已停用");
    if (region.level !== regionLevel) {
      throw Errors.badRequest("行政区划级别与所选区域不一致");
    }
  }
  private async recordSupplierAudit(
    actor: { authUserId: string; employeeId: string },
    action: SupplierLifecycleAction,
    before: PlatformSupplierDetail,
    after: PlatformSupplierDetail,
    reason?: string,
  ) {
    await this.audit.recordBestEffort({
      action: supplierAuditAction(action),
      actorEmployeeId: actor.employeeId,
      actorUserId: actor.authUserId,
      resourceType: "supplier",
      resourceId: after.id,
      resourceLabel: after.name,
      status: "success",
      summary: `${supplierActionLabel(action)}平台供应商「${after.name}」`,
      metadata: {
        from: supplierState(before),
        to: supplierState(after),
        reason: reason ?? null,
      },
    });
  }
  private async runCommand(operation: () => Promise<SupplierMutationResult>) {
    return requireMutation(await this.mapIdempotencyError(operation));
  }
  private async mapIdempotencyError<T>(operation: () => Promise<T>) {
    try {
      return await operation();
    } catch (error) {
      if (!isIdempotencyDatabaseError(error)) throw error;
      throw Errors.business(
        409,
        "幂等键已用于其他供应商操作",
        "SUPPLIER_IDEMPOTENCY_CONFLICT",
      );
    }
  }
}
function permissionForAction(action: SupplierLifecycleAction) {
  if (action === "approve" || action === "reject") return "review" as const;
  if (action === "blacklist") return "blacklist" as const;
  return "manage" as const;
}
function requireMutation(result: SupplierMutationResult) {
  if (!isMutationConflict(result)) return result;
  const code = result.error_code ?? {
    supplier_not_found: "SUPPLIER_NOT_FOUND", state_conflict: "SUPPLIER_STATE_CONFLICT",
    version_conflict: "SUPPLIER_VERSION_CONFLICT",
    idempotency_conflict: "SUPPLIER_IDEMPOTENCY_CONFLICT",
  }[result.status];
  throw Errors.business(
    result.status === "supplier_not_found" ? 404 : 409,
    result.status === "supplier_not_found"
      ? "平台供应商不存在"
      : "供应商状态、版本或幂等键已变化，请刷新后重试",
    code, result,
  );
}
function isMutationConflict(result: SupplierMutationResult): result is MutationConflict {
  return result.status !== "created" && result.status !== "updated";
}
function requireMutationSupplier(result: SupplierMutationResult) {
  if (result.status !== "created" && result.status !== "updated") {
    throw Errors.dbError("供应商命令返回状态无效", result);
  }
  if (!result.supplier) throw Errors.dbError("供应商命令未返回主体", result);
  return result.supplier;
}
function requireMutationQualification(result: SupplierMutationResult) {
  if (result.status !== "updated" || !result.qualification) {
    throw Errors.dbError("供应商资质命令未返回资质", result);
  }
  return result.qualification;
}
function requirePreviousSupplier(result: SupplierMutationResult) {
  if ((result.status === "created" || result.status === "updated") &&
    result.previous_supplier) return result.previous_supplier;
  throw Errors.dbError("供应商命令未返回原状态", result);
}
function requirePreviousQualification(result: SupplierMutationResult) {
  if ((result.status === "created" || result.status === "updated") &&
    result.previous_qualification) return result.previous_qualification;
  throw Errors.dbError("供应商资质命令未返回原状态", result);
}
function supplierNotFound(message = "平台供应商不存在") {
  return Errors.business(404, message, "SUPPLIER_NOT_FOUND");
}
function assertQualificationTypeRules(input: {
  applicable_supplier_types: readonly string[]; warning_days: number;
  is_required: boolean; blocks_new_orders: boolean;
}) {
  if (new Set(input.applicable_supplier_types).size !==
    input.applicable_supplier_types.length) {
    throw Errors.badRequest("适用供应商类型不能重复");
  }
  if (!Number.isInteger(input.warning_days) ||
    input.warning_days < 0 || input.warning_days > 3650) {
    throw Errors.badRequest("资质预警天数必须介于 0 到 3650");
  }
  if (input.blocks_new_orders && !input.is_required) {
    throw Errors.badRequest("仅必需资质可以阻断新订单");
  }
}
function supplierState(input: PlatformSupplierDetail) {
  return { onboarding_status: input.onboarding_status,
    operational_status: input.operational_status, version: input.version };
}
function qualificationState(input: SupplierQualification) {
  return { verification_status: input.verification_status, version: input.version };
}
function settingsState(input: {
  module_enabled: boolean; require_active_contract_for_new_order: boolean; version: number;
}) {
  return { module_enabled: input.module_enabled,
    require_active_contract_for_new_order:
      input.require_active_contract_for_new_order, version: input.version };
}
function supplierAuditAction(action: SupplierLifecycleAction) {
  return `platform_supplier_${action}` as
    | "platform_supplier_submit" | "platform_supplier_approve"
    | "platform_supplier_reject" | "platform_supplier_suspend"
    | "platform_supplier_resume" | "platform_supplier_blacklist";
}
function supplierActionLabel(action: SupplierLifecycleAction) {
  return {
    submit: "提交审核", approve: "审核通过", reject: "驳回",
    suspend: "暂停", resume: "恢复", blacklist: "拉黑",
  }[action];
}
function isIdempotencyDatabaseError(error: unknown) {
  if (!isRecord(error) || error.code !== "DB_ERROR") return false;
  return containsText(error.details, "SUPPLIER_IDEMPOTENCY_CONFLICT");
}
function containsText(value: unknown, expected: string): boolean {
  if (typeof value === "string") return value.includes(expected);
  if (Array.isArray(value)) return value.some((item) => containsText(item, expected));
  if (!isRecord(value)) return false;
  return Object.values(value).some((item) => containsText(item, expected));
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
export const platformSuppliersService = new PlatformSuppliersService();
