import { Errors } from "@/errors/error-factory";
import {
  platformPartnersRepository,
  type PlatformPartnerCreateRecordInput,
  type PlatformPartnerInviteCodeWithPartnerRecord,
  type PlatformPartnerMemberCreateRecordInput,
  type PlatformPartnerMemberStatusRecordInput,
  type PlatformPartnerRecord,
  type PlatformPartnerStatusRecordInput,
  type PlatformPartnerUpdateRecordInput,
  type TenantPartnerBindingCreateRecordInput,
} from "@/repositories/platform-partners";
import type {
  PlatformPartnerCreateInput,
  PlatformPartnerMemberCreateInput,
  PlatformPartnerMemberListQuery,
  PlatformPartnerMemberStatusUpdateInput,
  PlatformPartnerInviteCodeResolveInput,
  PlatformPartnerInviteCodeCreateInput,
  PlatformPartnerListQuery,
  PlatformPartnerStatusUpdateInput,
  PlatformPartnerUpdateInput,
  TenantPartnerBindingCreateInput,
  TenantPartnerInviteBindingCreateInput,
  TenantPartnerBindingListQuery,
} from "@/schema/platform-partners";
import type { AuthContext } from "@/services/authorization";
import {
  buildPartnerInviteCampaignCode,
  buildPartnerInviteCodeScene,
  normalizePartnerInviteCode,
} from "@/services/platform-partner-invite-code-utils";
import { systemSettingsService } from "@/services/system-settings";
import { wechatOpenLinkService } from "@/services/wechat-open-link";

export type PlatformPartnersRepositoryPort = Pick<
  typeof platformPartnersRepository,
  | "listPartners"
  | "findPartnerById"
  | "listLevels"
  | "createPartner"
  | "updatePartner"
  | "updatePartnerStatus"
  | "listPartnerMembers"
  | "createPartnerMember"
  | "findPartnerMemberById"
  | "updatePartnerMemberStatus"
  | "createInviteCode"
  | "listInviteCodes"
  | "findInviteCodeByCode"
  | "findActiveTenantBinding"
  | "createTenantBinding"
  | "listTenantBindings"
>;

type PlatformPartnersServiceDependencies = {
  repository?: PlatformPartnersRepositoryPort;
};

const PARTNER_MANAGE_PERMISSION = "platform.partner.manage";
const BINDING_MANAGE_PERMISSION = "platform.partner.binding.manage";
const INVITE_BINDING_CHANGE_REASON = "装企小程序扫码入驻自动绑定";
const DEFAULT_PARTNER_ONBOARDING_PAGE = "pages/visitor/index";

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

  async listPartnerMembers(
    authContext: AuthContext,
    partnerId: string,
    query: PlatformPartnerMemberListQuery,
  ) {
    this.assertPlatformAdmin(authContext);
    await this.requirePartner(partnerId);
    return this.repository.listPartnerMembers({
      partnerId,
      page: query.page,
      pageSize: query.pageSize,
    });
  }

  async createPartnerMember(
    authContext: AuthContext,
    partnerId: string,
    input: PlatformPartnerMemberCreateInput,
  ) {
    this.assertCanManagePartners(authContext);
    const employeeId = this.requireEmployeeId(authContext);
    const partner = await this.requirePartner(partnerId);
    if (partner.status !== "active" && partner.status !== "pending") {
      throw Errors.badRequest("只有待审核或启用状态的合伙人可以创建登录成员");
    }

    return this.repository.createPartnerMember({
      partner_id: partnerId,
      name: input.name,
      phone: input.phone,
      role: input.role,
      status: "pending_bind",
      created_by_employee_id: employeeId,
      updated_by_employee_id: employeeId,
    } satisfies PlatformPartnerMemberCreateRecordInput);
  }

  async updatePartnerMemberStatus(
    authContext: AuthContext,
    memberId: string,
    input: PlatformPartnerMemberStatusUpdateInput,
  ) {
    this.assertCanManagePartners(authContext);
    const employeeId = this.requireEmployeeId(authContext);
    const member = await this.repository.findPartnerMemberById(memberId);
    if (!member) {
      throw Errors.business(
        404,
        "合伙人成员不存在",
        "PLATFORM_PARTNER_MEMBER_NOT_FOUND",
      );
    }

    return this.repository.updatePartnerMemberStatus(memberId, {
      status: input.status,
      updated_by_employee_id: employeeId,
      remark: input.reason,
    } satisfies PlatformPartnerMemberStatusRecordInput);
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

    const code = this.buildInviteCode(partner, input.region_code);
    return this.repository.createInviteCode({
      partner_id: partnerId,
      code,
      region_code: input.region_code ?? null,
      campaign_code: buildPartnerInviteCampaignCode(code),
      expires_at: input.expires_at ?? null,
      created_by_employee_id: employeeId,
    });
  }

  async listInviteCodes(authContext: AuthContext, partnerId: string) {
    this.assertPlatformAdmin(authContext);
    await this.requirePartner(partnerId);
    return this.repository.listInviteCodes(partnerId);
  }

  async getInviteCodeQrcode(authContext: AuthContext, code: string) {
    this.assertPlatformAdmin(authContext);
    const inviteCode = await this.requireAvailableInviteCode(code);
    const page = await systemSettingsService.getString(
      "WECHAT_PARTNER_ONBOARDING_PAGE",
      DEFAULT_PARTNER_ONBOARDING_PAGE,
    );
    const envVersion = wechatOpenLinkService.normalizeEnvVersion(
      await systemSettingsService.getString(
        "WECHAT_MINIPROGRAM_ENV_VERSION",
        "release",
      ),
    );
    const buffer = await wechatOpenLinkService.generateUnlimitedCode({
      page,
      scene: buildPartnerInviteCodeScene(inviteCode.code),
      envVersion,
    });

    return { buffer, contentType: "image/png" };
  }

  async resolveInviteCode(input: PlatformPartnerInviteCodeResolveInput) {
    const inviteCode = await this.requireAvailableInviteCode(input.code);
    return this.buildInviteCodeOnboardingPayload(inviteCode);
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

  async bindTenantByInviteCode(
    authContext: AuthContext,
    input: TenantPartnerInviteBindingCreateInput,
  ) {
    const tenantId = this.requireTenantId(authContext);
    const inviteCode = await this.requireAvailableInviteCode(input.invite_code);
    const existingBinding = await this.repository.findActiveTenantBinding(tenantId);
    if (existingBinding) {
      if (existingBinding.partner_id === inviteCode.partner_id) {
        return {
          ...this.buildInviteCodeOnboardingPayload(inviteCode),
          binding: existingBinding,
          created: false,
          idempotent: true,
        };
      }

      throw Errors.business(
        409,
        "该租户已绑定其他城市合伙人",
        "TENANT_PARTNER_BINDING_EXISTS",
        {
          tenant_id: tenantId,
          existing_partner_id: existingBinding.partner_id,
          requested_partner_id: inviteCode.partner_id,
        },
      );
    }

    const binding = await this.repository.createTenantBinding({
      tenant_id: tenantId,
      partner_id: inviteCode.partner_id,
      invite_code_id: inviteCode.id,
      source_type: "invite_code",
      source_id: input.source_id ?? null,
      changed_by_employee_id: authContext.employeeId,
      change_reason: INVITE_BINDING_CHANGE_REASON,
    } satisfies TenantPartnerBindingCreateRecordInput);

    return {
      ...this.buildInviteCodeOnboardingPayload(inviteCode),
      binding,
      created: true,
      idempotent: false,
    };
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

  private async requireAvailableInviteCode(code: string) {
    const normalizedCode = normalizePartnerInviteCode(code);
    const inviteCode = await this.repository.findInviteCodeByCode(normalizedCode);
    if (!inviteCode || inviteCode.status !== "active") {
      throw Errors.business(
        404,
        "合伙人邀请码不存在或已失效",
        "PARTNER_INVITE_CODE_UNAVAILABLE",
      );
    }

    if (
      inviteCode.expires_at &&
      new Date(inviteCode.expires_at).getTime() <= Date.now()
    ) {
      throw Errors.business(
        410,
        "合伙人邀请码已过期",
        "PARTNER_INVITE_CODE_EXPIRED",
      );
    }

    if (!inviteCode.partner || inviteCode.partner.status !== "active") {
      throw Errors.business(
        409,
        "城市合伙人当前不可绑定",
        "PARTNER_INVITE_PARTNER_UNAVAILABLE",
      );
    }

    return inviteCode;
  }

  private buildInviteCodeOnboardingPayload(
    inviteCode: PlatformPartnerInviteCodeWithPartnerRecord,
  ) {
    const partner = inviteCode.partner;
    if (!partner) {
      throw Errors.business(
        409,
        "城市合伙人当前不可绑定",
        "PARTNER_INVITE_PARTNER_UNAVAILABLE",
      );
    }

    return {
      invite_code: {
        id: inviteCode.id,
        code: inviteCode.code,
        region_code: inviteCode.region_code,
        campaign_code: inviteCode.campaign_code,
        expires_at: inviteCode.expires_at,
      },
      partner: {
        id: partner.id,
        name: partner.name,
        status: partner.status,
        region_codes: partner.region_codes,
        level: partner.level
          ? {
            code: partner.level.code,
            name: partner.level.name,
          }
          : null,
      },
      onboarding: {
        can_bind: true,
        binding_source_type: "invite_code" as const,
      },
    };
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

  private requireTenantId(authContext: AuthContext) {
    if (!authContext.tenantId) {
      throw Errors.business(
        403,
        "当前操作必须在租户上下文中执行",
        "TENANT_CONTEXT_REQUIRED",
      );
    }
    return authContext.tenantId;
  }

  private normalizeInviteCode(code: string) {
    return code.trim().toUpperCase();
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
