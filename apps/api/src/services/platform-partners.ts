import { Errors } from "@/errors/error-factory";
import {
  platformPartnersRepository,
  type PlatformPartnerCreateRecordInput,
  type PlatformPartnerRecord,
  type PlatformPartnerStatusRecordInput,
  type PlatformPartnerUpdateRecordInput,
  type TenantPartnerBindingCreateRecordInput,
} from "@/repositories/platform-partners";
import type {
  PlatformPartnerCreateInput,
  PlatformPartnerInviteCodeCreateInput,
  PlatformPartnerListQuery,
  PlatformPartnerStatusUpdateInput,
  PlatformPartnerUpdateInput,
  TenantPartnerBindingCreateInput,
  TenantPartnerBindingListQuery,
} from "@/schema/platform-partners";
import type { AuthContext } from "@/services/authorization";

type PlatformPartnersRepositoryPort = Pick<
  typeof platformPartnersRepository,
  | "listPartners"
  | "findPartnerById"
  | "listLevels"
  | "createPartner"
  | "updatePartner"
  | "updatePartnerStatus"
  | "createInviteCode"
  | "listInviteCodes"
  | "findActiveTenantBinding"
  | "createTenantBinding"
  | "listTenantBindings"
>;

type PlatformPartnersServiceDependencies = {
  repository?: PlatformPartnersRepositoryPort;
};

const PARTNER_MANAGE_PERMISSION = "platform.partner.manage";
const BINDING_MANAGE_PERMISSION = "platform.partner.binding.manage";

export class PlatformPartnersService {
  private readonly repository: PlatformPartnersRepositoryPort;

  constructor(dependencies: PlatformPartnersServiceDependencies = {}) {
    this.repository = dependencies.repository ?? platformPartnersRepository;
  }

  async listPartners(authContext: AuthContext, query: PlatformPartnerListQuery) {
    this.assertPlatformAdmin(authContext);
    return this.repository.listPartners({
      page: query.page,
      pageSize: query.pageSize,
      status: query.status,
      keyword: query.keyword,
      region_code: query.region_code,
    });
  }

  async getPartner(authContext: AuthContext, partnerId: string) {
    this.assertPlatformAdmin(authContext);
    return this.requirePartner(partnerId);
  }

  async listLevels(authContext: AuthContext) {
    this.assertPlatformAdmin(authContext);
    return this.repository.listLevels();
  }

  async createPartner(
    authContext: AuthContext,
    input: PlatformPartnerCreateInput,
  ) {
    this.assertCanManagePartners(authContext);
    const employeeId = this.requireEmployeeId(authContext);

    return this.repository.createPartner({
      ...input,
      status: "pending",
      remark: input.remark ?? null,
      created_by_employee_id: employeeId,
      updated_by_employee_id: employeeId,
    } satisfies PlatformPartnerCreateRecordInput);
  }

  async updatePartner(
    authContext: AuthContext,
    partnerId: string,
    input: PlatformPartnerUpdateInput,
  ) {
    this.assertCanManagePartners(authContext);
    const employeeId = this.requireEmployeeId(authContext);

    return this.repository.updatePartner(partnerId, {
      ...input,
      remark: input.remark ?? undefined,
      updated_by_employee_id: employeeId,
    } satisfies PlatformPartnerUpdateRecordInput);
  }

  async updatePartnerStatus(
    authContext: AuthContext,
    partnerId: string,
    input: PlatformPartnerStatusUpdateInput,
  ) {
    this.assertCanManagePartners(authContext);
    const employeeId = this.requireEmployeeId(authContext);

    return this.repository.updatePartnerStatus(partnerId, {
      status: input.status,
      updated_by_employee_id: employeeId,
      change_reason: input.reason,
    } satisfies PlatformPartnerStatusRecordInput);
  }

  async createInviteCode(
    authContext: AuthContext,
    partnerId: string,
    input: PlatformPartnerInviteCodeCreateInput,
  ) {
    this.assertCanManagePartners(authContext);
    const employeeId = this.requireEmployeeId(authContext);
    const partner = await this.requirePartner(partnerId);
    if (partner.status !== "active") {
      throw Errors.badRequest("只有启用状态的合伙人可以生成邀请码");
    }

    return this.repository.createInviteCode({
      partner_id: partnerId,
      code: this.buildInviteCode(partner, input.region_code),
      region_code: input.region_code ?? null,
      campaign_code: input.campaign_code ?? null,
      expires_at: input.expires_at ?? null,
      created_by_employee_id: employeeId,
    });
  }

  async listInviteCodes(authContext: AuthContext, partnerId: string) {
    this.assertPlatformAdmin(authContext);
    await this.requirePartner(partnerId);
    return this.repository.listInviteCodes(partnerId);
  }

  async createTenantBinding(
    authContext: AuthContext,
    input: TenantPartnerBindingCreateInput,
  ) {
    this.assertCanManageBindings(authContext);
    const employeeId = this.requireEmployeeId(authContext);
    const [existingBinding, partner] = await Promise.all([
      this.repository.findActiveTenantBinding(input.tenant_id),
      this.requirePartner(input.partner_id),
    ]);
    if (existingBinding) {
      throw Errors.badRequest("该租户已存在有效合伙人绑定");
    }
    if (partner.status !== "active") {
      throw Errors.badRequest("只能绑定启用状态的合伙人");
    }

    return this.repository.createTenantBinding({
      tenant_id: input.tenant_id,
      partner_id: input.partner_id,
      invite_code_id: input.invite_code_id ?? null,
      source_type: input.source_type,
      source_id: input.source_id ?? null,
      changed_by_employee_id: employeeId,
      change_reason: input.change_reason,
    } satisfies TenantPartnerBindingCreateRecordInput);
  }

  async listTenantBindings(
    authContext: AuthContext,
    query: TenantPartnerBindingListQuery,
  ) {
    this.assertPlatformAdmin(authContext);
    return this.repository.listTenantBindings({
      page: query.page,
      pageSize: query.pageSize,
      partner_id: query.partner_id,
      tenant_id: query.tenant_id,
    });
  }

  private async requirePartner(partnerId: string) {
    const partner = await this.repository.findPartnerById(partnerId);
    if (!partner) {
      throw Errors.business(
        404,
        "城市合伙人不存在",
        "PLATFORM_PARTNER_NOT_FOUND",
      );
    }
    return partner;
  }

  private assertCanManagePartners(authContext: AuthContext) {
    this.assertPlatformAdmin(authContext);
    if (!this.hasPermission(authContext, PARTNER_MANAGE_PERMISSION)) {
      throw Errors.forbidden();
    }
  }

  private assertCanManageBindings(authContext: AuthContext) {
    this.assertPlatformAdmin(authContext);
    if (!this.hasPermission(authContext, BINDING_MANAGE_PERMISSION)) {
      throw Errors.forbidden();
    }
  }

  private assertPlatformAdmin(authContext: AuthContext) {
    if (!authContext.isPlatformAdmin) {
      throw Errors.forbidden();
    }
  }

  private hasPermission(authContext: AuthContext, permissionCode: string) {
    return authContext.permissions.some((permission) =>
      permission.code === permissionCode
    );
  }

  private requireEmployeeId(authContext: AuthContext) {
    if (!authContext.employeeId) {
      throw Errors.forbidden();
    }
    return authContext.employeeId;
  }

  private buildInviteCode(
    partner: PlatformPartnerRecord,
    regionCode: string | undefined,
  ) {
    const region = regionCode ?? partner.region_codes[0] ?? "all";
    const suffix = Date.now().toString(36).toUpperCase();
    return `CP-${region}-${suffix}`;
  }
}

export const platformPartnersService = new PlatformPartnersService();
