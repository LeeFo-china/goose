import type { FastifyRequest } from "fastify";
import { Errors } from "@/errors/error-factory";
import type {
  PlatformPartnerMemberRebindApproveResult,
  PlatformPartnerMemberRebindRequestRecord,
} from "@/repositories/platform-partner-member-rebind";
import {
  platformPartnerMemberRebindRepository,
} from "@/repositories/platform-partner-member-rebind";
import type { PlatformPartnerMemberRecord } from "@/repositories/platform-partner-portal";
import type {
  CreatePlatformPartnerMemberRebindRequestInput,
  PlatformPartnerMemberRebindListQuery,
  ReviewPlatformPartnerMemberRebindRequestInput,
} from "@/schema/platform-partner-member-rebind";
import { authorizationService, type AuthContext } from "@/services/authorization";
import {
  defaultAuthUserResolver,
  defaultOauthIdentityEnsurer,
} from "@/services/platform-partner-portal-auth-dependencies";
import { assertUsablePlatformPartnerMember } from "@/services/platform-partner-portal-binding";
import { platformAuditLogService } from "@/services/platform-audit-logs";
import { smsVerificationCodeService } from "@/services/sms-verification-codes";
import { isPhoneLoginWithoutCodeEnabled } from "@/utils/auth/test-login";
import type { JwtPayload } from "@/utils/jwt";

const PARTNER_MANAGE_PERMISSION = "platform.partner.manage";
const REBIND_SMS_SCENE = "rebind_platform_partner";

type RebindRepositoryPort = Pick<
  typeof platformPartnerMemberRebindRepository,
  | "findBoundMemberByPhone"
  | "findPendingDuplicateByMemberId"
  | "createRequest"
  | "listRequests"
  | "findRequestById"
  | "approveRequest"
  | "rejectRequest"
>;

type SmsServicePort = Pick<
  typeof smsVerificationCodeService,
  "sendCode" | "findValidPending" | "markVerified"
>;

type AuthUserResolver = (input: {
  request?: FastifyRequest;
  openid: string;
  unionid?: string | null;
}) => Promise<{ userId: string; isNewUser: boolean }>;

type OauthIdentityEnsurer = (input: {
  userId: string;
  openid: string;
  unionid?: string | null;
}) => Promise<void>;

type AuditLogServicePort = Pick<typeof platformAuditLogService, "recordBestEffort">;
type AuthorizationServicePort = Pick<typeof authorizationService, "invalidateAuthContext">;

type PlatformPartnerMemberRebindServiceDependencies = {
  repository?: RebindRepositoryPort;
  smsService?: SmsServicePort;
  authUserResolver?: AuthUserResolver;
  oauthIdentityEnsurer?: OauthIdentityEnsurer;
  auditLogService?: AuditLogServicePort;
  authorizationService?: AuthorizationServicePort;
};

export class PlatformPartnerMemberRebindService {
  private readonly repository: RebindRepositoryPort;
  private readonly smsService: SmsServicePort;
  private readonly authUserResolver: AuthUserResolver;
  private readonly oauthIdentityEnsurer: OauthIdentityEnsurer;
  private readonly auditLogService: AuditLogServicePort;
  private readonly authorization: AuthorizationServicePort;

  constructor(
    dependencies: PlatformPartnerMemberRebindServiceDependencies = {},
  ) {
    this.repository = dependencies.repository ??
      platformPartnerMemberRebindRepository;
    this.smsService = dependencies.smsService ?? smsVerificationCodeService;
    this.authUserResolver = dependencies.authUserResolver ??
      defaultAuthUserResolver;
    this.oauthIdentityEnsurer = dependencies.oauthIdentityEnsurer ??
      defaultOauthIdentityEnsurer;
    this.auditLogService = dependencies.auditLogService ?? platformAuditLogService;
    this.authorization = dependencies.authorizationService ?? authorizationService;
  }

  async sendRebindCode(input: {
    phone: string;
    requestIp: string | null;
    requestDevice?: string | null;
  }) {
    const phone = input.phone.trim();
    const member = await this.requireBoundMemberByPhone(phone);

    return this.smsService.sendCode({
      phone: member.phone,
      scene: REBIND_SMS_SCENE,
      requestIp: input.requestIp,
      requestDevice: input.requestDevice ?? null,
    });
  }

  async createRequest(
    user: JwtPayload | undefined,
    input: CreatePlatformPartnerMemberRebindRequestInput,
    request?: FastifyRequest,
  ) {
    const phone = input.phone.trim();
    const member = await this.requireBoundMemberByPhone(phone);
    const smsCode = input.sms_code?.trim() || "";
    let verificationCode: Awaited<ReturnType<SmsServicePort["findValidPending"]>> = null;
    if (!isPhoneLoginWithoutCodeEnabled()) {
      if (!smsCode) {
        throw Errors.business(400, "请输入验证码", "SMS_CODE_REQUIRED");
      }

      verificationCode = await this.smsService.findValidPending({
        phone,
        scene: REBIND_SMS_SCENE,
        code: smsCode,
      });
      if (!verificationCode) {
        throw Errors.business(
          400,
          "验证码错误或已过期",
          "SMS_CODE_INVALID",
        );
      }
    }

    const duplicate = await this.repository.findPendingDuplicateByMemberId(
      member.id,
    );
    if (duplicate) {
      throw Errors.business(
        409,
        "该合伙人成员已有待审核换绑申请，请勿重复提交",
        "PARTNER_REBIND_REQUEST_DUPLICATED",
      );
    }

    const newAuthUser = await this.resolveCurrentAuthUser(user, request);
    if (newAuthUser.userId === member.auth_user_id) {
      throw Errors.business(
        409,
        "当前微信已绑定该合伙人成员",
        "PARTNER_REBIND_SAME_WECHAT",
      );
    }

    const record = await this.repository.createRequest({
      partnerId: member.partner_id,
      memberId: member.id,
      phone: member.phone,
      oldAuthUserId: member.auth_user_id!,
      newAuthUserId: newAuthUser.userId,
      applicantName: normalizeNullableText(input.applicant_name),
      reason: normalizeNullableText(input.reason),
    });
    if (verificationCode) {
      await this.smsService.markVerified(verificationCode.id);
    }

    return {
      id: record.id,
      status: record.status,
      message: "换绑申请已提交，请等待平台审核",
    };
  }

  async list(
    authContext: AuthContext,
    query: PlatformPartnerMemberRebindListQuery,
  ) {
    this.assertPlatformAdmin(authContext);
    return this.repository.listRequests(query);
  }

  async approve(
    authContext: AuthContext,
    id: string,
    input: ReviewPlatformPartnerMemberRebindRequestInput,
  ) {
    this.assertCanManagePartners(authContext);
    const employeeId = this.requireEmployeeId(authContext);
    const comment = normalizeNullableText(input.comment);
    const result = await this.repository.approveRequest({
      id,
      reviewerEmployeeId: employeeId,
      comment,
    });
    const record = this.assertApproved(result);

    this.authorization.invalidateAuthContext({
      authUserId: record.old_auth_user_id,
    });
    this.authorization.invalidateAuthContext({
      authUserId: record.new_auth_user_id,
    });
    await this.auditLogService.recordBestEffort({
      action: "platform_partner_member_rebind_approve",
      actorEmployeeId: employeeId,
      actorUserId: authContext.authUserId,
      resourceType: "platform_partner_member_rebind_request",
      resourceId: record.id,
      resourceLabel: maskPhone(record.phone),
      summary: "审核通过合伙人成员微信换绑申请",
      metadata: {
        partner_id: record.partner_id,
        member_id: record.member_id,
      },
    });

    return record;
  }

  async reject(
    authContext: AuthContext,
    id: string,
    input: ReviewPlatformPartnerMemberRebindRequestInput,
  ) {
    this.assertCanManagePartners(authContext);
    const employeeId = this.requireEmployeeId(authContext);
    const record = await this.repository.findRequestById(id);
    if (!record) {
      throw Errors.business(
        404,
        "合伙人成员换绑申请不存在",
        "PARTNER_REBIND_REQUEST_NOT_FOUND",
      );
    }
    if (record.status !== "pending") {
      throw Errors.business(
        409,
        "合伙人成员换绑申请已处理",
        "PARTNER_REBIND_REQUEST_ALREADY_REVIEWED",
      );
    }

    const reviewed = await this.repository.rejectRequest({
      id,
      reviewerEmployeeId: employeeId,
      comment: normalizeNullableText(input.comment),
    });
    if (!reviewed) {
      throw Errors.business(
        409,
        "合伙人成员换绑申请已处理",
        "PARTNER_REBIND_REQUEST_ALREADY_REVIEWED",
      );
    }

    await this.auditLogService.recordBestEffort({
      action: "platform_partner_member_rebind_reject",
      actorEmployeeId: employeeId,
      actorUserId: authContext.authUserId,
      resourceType: "platform_partner_member_rebind_request",
      resourceId: record.id,
      resourceLabel: maskPhone(record.phone),
      summary: "驳回合伙人成员微信换绑申请",
      metadata: {
        partner_id: record.partner_id,
        member_id: record.member_id,
      },
    });

    return reviewed;
  }

  private async requireBoundMemberByPhone(phone: string) {
    const member = await this.repository.findBoundMemberByPhone(phone);
    if (!member) {
      throw Errors.business(
        404,
        "未找到已绑定的合伙人成员",
        "PARTNER_MEMBER_NOT_FOUND",
      );
    }

    this.assertUsableMember(member);
    if (!member.auth_user_id) {
      throw Errors.business(
        409,
        "该合伙人成员尚未绑定微信",
        "PARTNER_MEMBER_NOT_BOUND",
      );
    }

    return member;
  }

  private async resolveCurrentAuthUser(
    user: JwtPayload | undefined,
    request?: FastifyRequest,
  ) {
    if (user?.sub) {
      return { userId: user.sub };
    }

    const openid = typeof user?.openid === "string" ? user.openid.trim() : "";
    if (user?.token_type !== "visitor_session" || !openid) {
      throw Errors.unauthorized("请先登录");
    }

    const resolverInput = request
      ? { request, openid, unionid: user.unionid ?? null }
      : { openid, unionid: user.unionid ?? null };
    const authUser = await this.authUserResolver(resolverInput);
    await this.oauthIdentityEnsurer({
      userId: authUser.userId,
      openid,
      unionid: user.unionid ?? null,
    });
    return { userId: authUser.userId };
  }

  private assertApproved(
    result: PlatformPartnerMemberRebindApproveResult,
  ): PlatformPartnerMemberRebindRequestRecord {
    if (result.status === "approved") return result.request;

    if (result.status === "request_not_found") {
      throw Errors.business(
        404,
        "合伙人成员换绑申请不存在",
        "PARTNER_REBIND_REQUEST_NOT_FOUND",
      );
    }

    if (result.status === "request_already_reviewed") {
      throw Errors.business(
        409,
        "合伙人成员换绑申请已处理",
        "PARTNER_REBIND_REQUEST_ALREADY_REVIEWED",
      );
    }

    if (result.status === "partner_unavailable") {
      throw Errors.business(
        403,
        "合伙人账号不可用",
        "PARTNER_ACCOUNT_DISABLED",
      );
    }

    if (result.status === "new_auth_user_already_bound") {
      throw Errors.business(
        409,
        "当前微信已绑定其他合伙人成员",
        "PARTNER_MEMBER_ALREADY_BOUND",
      );
    }

    throw Errors.business(
      409,
      "目标身份绑定关系已变化，无法完成换绑",
      "PARTNER_REBIND_TARGET_CHANGED",
    );
  }

  private assertCanManagePartners(authContext: AuthContext) {
    this.assertPlatformAdmin(authContext);
    if (!authContext.permissions.some((item) =>
      item.code === PARTNER_MANAGE_PERMISSION
    )) {
      throw Errors.forbidden();
    }
  }

  private assertPlatformAdmin(authContext: AuthContext) {
    if (!authContext.isPlatformAdmin) {
      throw Errors.forbidden();
    }
  }

  private requireEmployeeId(authContext: AuthContext) {
    if (!authContext.employeeId) {
      throw Errors.forbidden();
    }
    return authContext.employeeId;
  }

  private assertUsableMember(member: PlatformPartnerMemberRecord) {
    assertUsablePlatformPartnerMember(member);
  }
}

function normalizeNullableText(value?: string | null) {
  const normalized = value?.trim() ?? "";
  return normalized || null;
}

function maskPhone(phone: string) {
  return phone.replace(/^(\d{3})\d{4}(\d{4})$/, "$1****$2");
}

export const platformPartnerMemberRebindService =
  new PlatformPartnerMemberRebindService();
