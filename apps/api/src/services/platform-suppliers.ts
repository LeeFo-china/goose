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
import type {
  SupplierAddressCreateCommand,
  SupplierContactCreateCommand,
  SupplierQualificationCreateCommand,
  SupplierServiceRegionCreateCommand,
} from "@/schema/supplier-create-commands";
import { accessPolicyService } from "@/services/access-policy";
import type { AuthContext } from "@/services/authorization";
import { platformAuditLogService } from "@/services/platform-audit-logs";
import {
  assertQualificationTypeRules,
  createContext,
  isIdempotencyDatabaseError,
  permissionForAction,
  qualificationState,
  requireMutation,
  requireMutationQualification,
  requireMutationSupplier,
  requirePreviousQualification,
  requirePreviousSupplier,
  settingsState,
  supplierActionLabel,
  supplierAuditAction,
  supplierNotFound,
  supplierState,
} from "./platform-supplier-service-utils";
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
  idFactory?: () => string;
};
export type SupplierLifecycleAction = "submit" | "approve" | "reject" |
  "suspend" | "resume" | "blacklist";
type LifecycleInput = { expected_version: number; reason?: string };
type ServiceWrite<T> = T extends unknown ? Omit<T, "created_by_employee_id" | "updated_by_employee_id"> : never;
type CreateSupplierRequest = { supplierId: string; input: PlatformSupplierCreateInput;
  idempotencyKey: string };
type SettingsRequest = {
  tenantId: string; module_enabled: boolean;
  require_active_contract_for_new_order: boolean;
  expected_version: number; reason?: string; idempotencyKey: string;
};
export class PlatformSuppliersService {
  private readonly repository: PlatformSuppliersRepositoryPort;
  private readonly accessPolicy: AccessPolicyPort;
  private readonly audit: AuditPort;
  private readonly regions: RegionsPort;
  private readonly idFactory: () => string;
  constructor(dependencies: PlatformSuppliersServiceDependencies = {}) {
    this.repository = dependencies.repository ?? platformSuppliersRepository;
    this.accessPolicy = dependencies.accessPolicy ?? accessPolicyService;
    this.audit = dependencies.audit ?? platformAuditLogService;
    this.regions = dependencies.regions ?? administrativeAreaRepository;
    this.idFactory = dependencies.idFactory ?? (() => crypto.randomUUID());
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
    idempotencyKey: string,
  ) {
    const actor = this.require(auth, "manage");
    assertQualificationTypeRules(input);
    return this.mapIdempotencyError(() =>
      this.repository.createQualificationType({
        ...input, qualification_type_id: this.idFactory(),
        ...createContext(actor, idempotencyKey),
      }));
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
    idempotencyKey: string,
  ) {
    const actor = this.require(auth, "manage");
    return this.mapIdempotencyError(() =>
      this.repository.createQualification({
        ...input, qualification_id: this.idFactory(),
        ...createContext(actor, idempotencyKey),
      }));
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
  async createServiceRegion(
    auth: AuthContext,
    input: Omit<SupplierServiceRegionCreateCommand,
      "region_id" | "actor_user_id" | "actor_employee_id" | "idempotency_key">,
    idempotencyKey: string,
  ) {
    const actor = this.require(auth, "manage");
    return this.mapIdempotencyError(() =>
      this.repository.createServiceRegion({
        ...input, region_id: this.idFactory(),
        ...createContext(actor, idempotencyKey),
      }));
  }
  async upsertServiceRegion(auth: AuthContext, input: ServiceWrite<SupplierServiceRegionWrite>) {
    const actor = this.require(auth, "manage");
    let current = null;
    if (!("region_id" in input)) {
      throw Errors.badRequest("创建供应商服务区域必须使用幂等接口");
    }
    current = await this.requireOwnedServiceRegion(input.supplier_id, input.region_id);
    const regionCode = input.region_code ?? current?.region_code;
    const regionLevel = input.region_level ?? current?.region_level;
    if (!regionCode || !regionLevel) {
      throw Errors.badRequest("服务区域行政区划信息不完整");
    }
    await this.assertAdministrativeRegion(regionCode, regionLevel);
    return this.repository.upsertServiceRegion({
      ...input, region_code: regionCode, region_level: regionLevel,
      updated_by_employee_id: actor.employeeId });
  }
  listAddresses(auth: AuthContext, input: SupplierChildPageQuery) {
    this.require(auth, "view"); return this.repository.listAddresses(input);
  }
  createAddress(
    auth: AuthContext,
    input: Omit<SupplierAddressCreateCommand,
      "address_id" | "actor_user_id" | "actor_employee_id" | "idempotency_key">,
    idempotencyKey: string,
  ) {
    const actor = this.require(auth, "manage");
    return this.mapIdempotencyError(() =>
      this.repository.createAddress({
        ...input, address_id: this.idFactory(),
        ...createContext(actor, idempotencyKey),
      }));
  }
  async upsertAddress(auth: AuthContext, input: ServiceWrite<SupplierAddressWrite>) {
    const actor = this.require(auth, "manage");
    if (!("address_id" in input)) {
      throw Errors.badRequest("创建供应商地址必须使用幂等接口");
    }
    await this.requireOwnedAddress(input.supplier_id, input.address_id);
    return this.repository.upsertAddress({ ...input,
      updated_by_employee_id: actor.employeeId });
  }
  listContacts(auth: AuthContext, input: SupplierChildPageQuery) {
    this.require(auth, "view"); return this.repository.listContacts(input);
  }
  createContact(
    auth: AuthContext,
    input: Omit<SupplierContactCreateCommand,
      "contact_id" | "actor_user_id" | "actor_employee_id" | "idempotency_key">,
    idempotencyKey: string,
  ) {
    const actor = this.require(auth, "manage");
    return this.mapIdempotencyError(() =>
      this.repository.createContact({
        ...input, contact_id: this.idFactory(),
        ...createContext(actor, idempotencyKey),
      }));
  }
  async upsertContact(auth: AuthContext, input: ServiceWrite<SupplierContactWrite>) {
    const actor = this.require(auth, "manage");
    if (!("contact_id" in input)) {
      throw Errors.badRequest("创建供应商联系人必须使用幂等接口");
    }
    await this.requireOwnedContact(input.supplier_id, input.contact_id);
    return this.repository.upsertContact({ ...input,
      updated_by_employee_id: actor.employeeId });
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
        reason: input.reason,
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
        reason: input.reason ?? null,
      },
    });
    return setting;
  }
  private require(auth: AuthContext, permission: keyof typeof PERMISSION) {
    const isPlatformIdentity = auth.isPlatformStaff || auth.isPlatformAdmin;
    if (
      auth.tenantId !== null ||
      !isPlatformIdentity ||
      !auth.employeeId ||
      !auth.authUserId
    ) {
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
export const platformSuppliersService = new PlatformSuppliersService();
