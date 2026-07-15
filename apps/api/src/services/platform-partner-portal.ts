import type { FastifyRequest } from "fastify";
import { Errors } from "@/errors/error-factory";
import {
  platformPartnerPortalRepository,
  type PlatformPartnerMemberRecord,
  type PlatformPartnerPortalRepositoryPort,
} from "@/repositories/platform-partner-portal";
import type {
  PartnerDashboardCommissionLedgerListQuery,
  PartnerDashboardRevenueEventListQuery,
  PartnerDashboardSettlementListQuery,
  PartnerDashboardSummaryQuery,
  PartnerDashboardTenantListQuery,
  PartnerAuthUnbindWechatInput,
} from "@/schema/platform-partner-portal";
import { smsVerificationCodeService } from "@/services/sms-verification-codes";
import {
  defaultAuthUserResolver,
  defaultOauthIdentityEnsurer,
  defaultWechatSessionResolver,
} from "@/services/platform-partner-portal-auth-dependencies";
import {
  assertUsablePlatformPartnerMember,
  bindPlatformPartnerMemberWithoutSmsCode,
} from "@/services/platform-partner-portal-binding";
import { requireCurrentPlatformPartnerMember } from "@/services/platform-partner-identity";
import {
  buildPartnerAuthResponse,
  buildPartnerVisitorAuthResponse,
  PLATFORM_PARTNER_ROLE,
  serializeLevel,
  serializeMember,
  serializePartner,
  type PartnerAuthMeResponse,
  type PartnerAuthResponse,
  type VisitorSessionSigner,
} from "@/services/platform-partner-portal-auth-payloads";
import type {
  AuthUserResolver,
  OauthIdentityEnsurer,
  PlatformPartnerPortalServiceDependencies,
  WechatSessionResolver,
} from "@/services/platform-partner-portal-dependencies";
import {
  generatePartnerInviteCodeQrcode,
  getDefaultPartnerInviteCode,
  type PartnerInviteCodeQrcodeGenerator,
} from "@/services/platform-partner-portal-invite-codes";
import { isPhoneLoginWithoutCodeEnabled } from "@/utils/auth/test-login";
import { signToken, signVisitorSessionToken, type JwtPayload } from "@/utils/jwt";

const SMS_SCENE = "bind_platform_partner";
const UNBIND_SMS_SCENE = "unbind_platform_partner";
export type { PartnerAuthMeResponse, PartnerAuthResponse };

type SmsServicePort = Pick<
  typeof smsVerificationCodeService,
  "sendCode"
>;

export class PlatformPartnerPortalService {
  private readonly repository: PlatformPartnerPortalRepositoryPort;
  private readonly wechatSessionResolver: WechatSessionResolver;
  private readonly authUserResolver: AuthUserResolver;
  private readonly oauthIdentityEnsurer: OauthIdentityEnsurer;
  private readonly tokenSigner: (payload: Omit<JwtPayload, "iat" | "exp">) => string;
  private readonly visitorSessionSigner: VisitorSessionSigner;
  private readonly smsService: SmsServicePort;
  private readonly inviteCodeQrcodeGenerator: PartnerInviteCodeQrcodeGenerator;

  constructor(dependencies: PlatformPartnerPortalServiceDependencies = {}) {
    this.repository = dependencies.repository ?? platformPartnerPortalRepository;
    this.wechatSessionResolver = dependencies.wechatSessionResolver ?? defaultWechatSessionResolver;
    this.authUserResolver = dependencies.authUserResolver ?? defaultAuthUserResolver;
    this.oauthIdentityEnsurer = dependencies.oauthIdentityEnsurer ?? defaultOauthIdentityEnsurer;
    this.tokenSigner = dependencies.tokenSigner ?? signToken;
    this.visitorSessionSigner = dependencies.visitorSessionSigner ?? ((input) =>
      signVisitorSessionToken({
        openid: input.openid,
        unionid: input.unionid ?? undefined,
        visitor_id: input.visitorId,
      }));
    this.smsService = dependencies.smsService ?? smsVerificationCodeService;
    this.inviteCodeQrcodeGenerator =
      dependencies.inviteCodeQrcodeGenerator ?? generatePartnerInviteCodeQrcode;
  }

  async login(input: {
    code: string;
    request?: FastifyRequest;
  }) {
    const resolution = await this.resolveWechatAuthUser(input);
    const member = await this.repository.findMemberByAuthUserId(resolution.userId);
    if (!member) {
      throw Errors.business(
        401,
        "当前微信未绑定城市合伙人身份",
        "PARTNER_WECHAT_NOT_BOUND",
      );
    }

    this.assertUsableMember(member);
    return this.buildAuthResponse(member, resolution.userId, resolution.openid, resolution.unionid);
  }

  async loginResolvedAuthUser(input: {
    userId: string;
    openid?: string;
    unionid?: string | null;
  }) {
    const member = await this.repository.findMemberByAuthUserId(input.userId);
    if (!member) {
      return null;
    }

    this.assertUsableMember(member);
    return this.buildAuthResponse(
      member,
      input.userId,
      input.openid,
      input.unionid ?? null,
    );
  }

  async sendCode(input: {
    phone: string;
    requestIp: string | null;
  }) {
    const member = await this.repository.findBindableMemberByPhone(input.phone);
    if (!member) {
      throw Errors.business(
        404,
        "未找到可绑定的合伙人成员",
        "PARTNER_MEMBER_NOT_FOUND",
      );
    }

    this.assertUsableMember(member, { allowPendingBind: true });
    await this.smsService.sendCode({
      phone: input.phone,
      scene: SMS_SCENE,
      requestIp: input.requestIp,
    });

    return { success: true as const };
  }

  async bindPhone(input: {
    code: string;
    phone: string;
    sms_code?: string;
    request?: FastifyRequest;
  }) {
    const resolution = await this.resolveWechatAuthUser(input);
    if (isPhoneLoginWithoutCodeEnabled()) {
      const boundMember = await bindPlatformPartnerMemberWithoutSmsCode({
        repository: this.repository,
        phone: input.phone,
        authUserId: resolution.userId,
      });

      return this.buildAuthResponse(
        boundMember,
        resolution.userId,
        resolution.openid,
        resolution.unionid,
      );
    }

    const smsCode = input.sms_code?.trim() || "";
    if (!smsCode) {
      throw Errors.business(400, "请输入验证码", "SMS_CODE_REQUIRED");
    }

    const claim = await this.repository.claimMemberBinding({
      phone: input.phone,
      code: smsCode,
      authUserId: resolution.userId,
    });
    this.assertBindingClaimed(claim);

    const boundMember = await this.repository.findMemberById(claim.memberId);
    if (!boundMember) {
      throw Errors.business(
        404,
        "未找到可绑定的合伙人成员",
        "PARTNER_MEMBER_NOT_FOUND",
      );
    }
    this.assertUsableMember(boundMember);

    return this.buildAuthResponse(
      boundMember,
      resolution.userId,
      resolution.openid,
      resolution.unionid,
    );
  }

  async sendUnbindCode(user: JwtPayload | undefined, requestIp: string | null) {
    const partnerUser = await this.requireCurrentPartnerMember(user);
    return this.smsService.sendCode({
      phone: partnerUser.member.phone,
      scene: UNBIND_SMS_SCENE,
      requestIp,
    });
  }

  async unbindWechat(user: JwtPayload | undefined, input: PartnerAuthUnbindWechatInput) {
    const partnerUser = await this.requireCurrentPartnerMember(user);
    if (isPhoneLoginWithoutCodeEnabled()) {
      const claim = await this.repository.unbindMemberAuthUser({
        memberId: partnerUser.member.id,
        authUserId: partnerUser.userId,
        partnerId: partnerUser.partnerId,
      });
      this.assertUnbindClaimed(claim);

      return {
        success: true as const,
        message: "微信绑定已解除",
        auth: buildPartnerVisitorAuthResponse(user, this.visitorSessionSigner),
      };
    }

    const smsCode = input.sms_code?.trim() || "";
    if (!smsCode) {
      throw Errors.business(400, "请输入验证码", "SMS_CODE_REQUIRED");
    }

    const claim = await this.repository.claimMemberUnbind({
      memberId: partnerUser.member.id,
      authUserId: partnerUser.userId,
      partnerId: partnerUser.partnerId,
      code: smsCode,
    });
    this.assertUnbindClaimed(claim);

    return {
      success: true as const,
      message: "微信绑定已解除",
      auth: buildPartnerVisitorAuthResponse(user, this.visitorSessionSigner),
    };
  }

  async me(user?: JwtPayload) {
    const partnerUser = await this.requireCurrentPartnerMember(user);

    return {
      user_id: partnerUser.userId,
      roles: [PLATFORM_PARTNER_ROLE],
      mode: "platform_partner",
      authMode: "platform_partner",
      member: serializeMember(partnerUser.member),
      partner: serializePartner(partnerUser.member.partner!),
      level: serializeLevel(partnerUser.member.partner!),
    } satisfies PartnerAuthMeResponse;
  }

  async summary(user: JwtPayload | undefined, query: PartnerDashboardSummaryQuery) {
    const partnerUser = await this.requireCurrentPartnerMember(user);
    const range = this.resolveMonthRange(query.month);
    const metrics = await this.repository.getMonthlySummary({
      partnerId: partnerUser.partnerId,
      month: range.month,
      startDate: range.startDate,
      endDate: range.endDate,
    });

    return { month: range.month, range: { start: range.startDate, end: range.endDate }, metrics };
  }

  async listInviteCodes(user: JwtPayload | undefined) {
    const partnerUser = await this.requireCurrentPartnerMember(user);
    return this.repository.listInviteCodes(partnerUser.partnerId);
  }

  async getDefaultInviteCode(user: JwtPayload | undefined) {
    const partnerUser = await this.requireCurrentPartnerMember(user);
    return getDefaultPartnerInviteCode({
      partner: partnerUser.member.partner!,
      repository: this.repository,
      qrcodeGenerator: this.inviteCodeQrcodeGenerator,
    });
  }

  async listTenants(
    user: JwtPayload | undefined,
    query: PartnerDashboardTenantListQuery,
  ) {
    const partnerUser = await this.requireCurrentPartnerMember(user);
    return this.repository.listTenantBindings({
      page: query.page, pageSize: query.pageSize, status: query.status, partnerId: partnerUser.partnerId,
    });
  }

  async listRevenueEvents(
    user: JwtPayload | undefined,
    query: PartnerDashboardRevenueEventListQuery,
  ) {
    const partnerUser = await this.requireCurrentPartnerMember(user);
    const range = query.month ? this.resolveMonthRange(query.month) : null;
    return this.repository.listRevenueEvents({
      partnerId: partnerUser.partnerId,
      page: query.page, pageSize: query.pageSize,
      revenue_type: query.revenue_type,
      status: query.status,
      startDate: range?.startDate,
      endDate: range?.endDate,
    });
  }

  async listCommissionLedger(
    user: JwtPayload | undefined,
    query: PartnerDashboardCommissionLedgerListQuery,
  ) {
    const partnerUser = await this.requireCurrentPartnerMember(user);
    return this.repository.listCommissionLedgers({
      page: query.page, pageSize: query.pageSize, status: query.status, partnerId: partnerUser.partnerId,
    });
  }

  async listSettlements(
    user: JwtPayload | undefined,
    query: PartnerDashboardSettlementListQuery,
  ) {
    const partnerUser = await this.requireCurrentPartnerMember(user);
    return this.repository.listSettlementBatches({
      page: query.page, pageSize: query.pageSize, status: query.status, partnerId: partnerUser.partnerId,
    });
  }

  private async requireCurrentPartnerMember(user?: JwtPayload) {
    return requireCurrentPlatformPartnerMember(user, this.repository);
  }

  private resolveMonthRange(month?: string) {
    const normalizedMonth = month ?? new Date().toISOString().slice(0, 7);
    const match = normalizedMonth.match(/^(\d{4})-(\d{2})$/);
    if (!match) throw Errors.badRequest("月份格式必须为 YYYY-MM");

    const year = Number(match[1]);
    const monthIndex = Number(match[2]) - 1;
    if (monthIndex < 0 || monthIndex > 11) {
      throw Errors.badRequest("月份格式必须为 YYYY-MM");
    }

    return {
      month: normalizedMonth,
      startDate: new Date(Date.UTC(year, monthIndex, 1)).toISOString(),
      endDate: new Date(Date.UTC(year, monthIndex + 1, 1)).toISOString(),
    };
  }

  private assertBindingClaimed(
    claim: Awaited<ReturnType<PlatformPartnerPortalRepositoryPort["claimMemberBinding"]>>,
  ): asserts claim is { status: "bound"; memberId: string } {
    if (claim.status === "bound") {
      return;
    }

    if (claim.status === "sms_invalid") {
      throw Errors.business(401, "验证码错误或已过期", "SMS_CODE_INVALID");
    }

    if (claim.status === "member_not_found") {
      throw Errors.business(
        404,
        "未找到可绑定的合伙人成员",
        "PARTNER_MEMBER_NOT_FOUND",
      );
    }

    if (claim.status === "partner_unavailable") {
      throw Errors.business(
        403,
        "合伙人账号不可用",
        "PARTNER_ACCOUNT_DISABLED",
      );
    }

    throw Errors.business(
      409,
      "该合伙人成员已绑定其他微信",
      "PARTNER_MEMBER_ALREADY_BOUND",
    );
  }

  private assertUnbindClaimed(
    claim: Awaited<ReturnType<PlatformPartnerPortalRepositoryPort["claimMemberUnbind"]>>,
  ): asserts claim is { status: "unbound"; memberId: string } {
    if (claim.status === "unbound") {
      return;
    }

    if (claim.status === "sms_invalid") {
      throw Errors.business(401, "验证码错误或已过期", "SMS_CODE_INVALID");
    }

    if (claim.status === "partner_unavailable") {
      throw Errors.business(
        403,
        "合伙人账号不可用",
        "PARTNER_ACCOUNT_DISABLED",
      );
    }

    throw Errors.business(
      409,
      "当前微信未绑定该合伙人成员",
      "PARTNER_MEMBER_NOT_BOUND",
    );
  }

  private async resolveWechatAuthUser(input: {
    code: string;
    request?: FastifyRequest;
  }) {
    const wxSession = await this.wechatSessionResolver(input.code);
    if (!wxSession.openid) {
      throw Errors.badRequest("微信登录失败：缺少 openid");
    }

    const authUser = await this.authUserResolver({
      request: input.request,
      openid: wxSession.openid,
      unionid: wxSession.unionid ?? null,
    });
    await this.oauthIdentityEnsurer({
      userId: authUser.userId,
      openid: wxSession.openid,
      unionid: wxSession.unionid ?? null,
    });

    return {
      userId: authUser.userId,
      openid: wxSession.openid,
      unionid: wxSession.unionid ?? null,
    };
  }

  private assertUsableMember(
    member: PlatformPartnerMemberRecord,
    options: { allowPendingBind?: boolean } = {},
  ) {
    assertUsablePlatformPartnerMember(member, options);
  }

  private buildAuthResponse(
    member: PlatformPartnerMemberRecord,
    userId: string,
    openid?: string,
    unionid?: string | null,
  ): PartnerAuthResponse {
    return buildPartnerAuthResponse({
      member,
      userId,
      openid,
      unionid,
      tokenSigner: this.tokenSigner,
    });
  }
}

export const platformPartnerPortalService = new PlatformPartnerPortalService();
