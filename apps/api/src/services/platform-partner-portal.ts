import type { FastifyRequest } from "fastify";
import { Errors } from "@/errors/error-factory";
import {
  platformPartnerPortalRepository,
  type PlatformPartnerMemberRecord,
  type PlatformPartnerPortalRepositoryPort,
  type PlatformPartnerRecord,
} from "@/repositories/platform-partner-portal";
import { smsVerificationCodeService } from "@/services/sms-verification-codes";
import { userIdentityService } from "@/services/user-identities";
import {
  createWechatVisitorUser,
  getOrCreateAuthUser,
  getWeChatSession,
} from "@/services/wechat-auth-legacy/identity";
import {
  runAuthBackgroundTask,
  serializeBackgroundError,
} from "@/services/wechat-auth-legacy/common";
import { signToken, type JwtPayload } from "@/utils/jwt";

const PLATFORM_PARTNER_ROLE = "platform_partner";
const SMS_SCENE = "bind_platform_partner";

export type PartnerAuthMemberPayload = {
  id: string;
  partner_id: string;
  name: string;
  phone: string;
  role: PlatformPartnerMemberRecord["role"];
  status: PlatformPartnerMemberRecord["status"];
};

export type PartnerAuthLevelPayload = {
  id: string;
  code: string;
  name: string;
  status: string;
};

export type PartnerAuthPartnerPayload = {
  id: string;
  name: string;
  status: PlatformPartnerRecord["status"];
  region_codes: string[];
  level: {
    code: string;
    name: string;
  } | null;
};

export type PartnerAuthResponse = {
  token: string;
  user_id: string;
  roles: [typeof PLATFORM_PARTNER_ROLE];
  authMode: "platform_partner";
  member: PartnerAuthMemberPayload;
  partner: PartnerAuthPartnerPayload;
  level: PartnerAuthLevelPayload | null;
};

export type PartnerAuthMeResponse = Omit<PartnerAuthResponse, "token">;

export interface PlatformPartnerPortalServicePort {
  login(input: {
    code: string;
    request?: FastifyRequest;
  }): Promise<PartnerAuthResponse>;
  sendCode(input: {
    phone: string;
    requestIp: string | null;
  }): Promise<{ success: true }>;
  bindPhone(input: {
    code: string;
    phone: string;
    sms_code: string;
    request?: FastifyRequest;
  }): Promise<PartnerAuthResponse>;
  me(user?: JwtPayload): Promise<PartnerAuthMeResponse>;
}

type WechatSessionResolver = (code: string) => Promise<{
  openid?: string;
  unionid?: string | null;
}>;

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

type SmsServicePort = Pick<
  typeof smsVerificationCodeService,
  "sendCode"
>;

type PlatformPartnerPortalServiceDependencies = {
  repository?: PlatformPartnerPortalRepositoryPort;
  wechatSessionResolver?: WechatSessionResolver;
  authUserResolver?: AuthUserResolver;
  oauthIdentityEnsurer?: OauthIdentityEnsurer;
  tokenSigner?: (payload: Omit<JwtPayload, "iat" | "exp">) => string;
  smsService?: SmsServicePort;
};

export class PlatformPartnerPortalService implements PlatformPartnerPortalServicePort {
  private readonly repository: PlatformPartnerPortalRepositoryPort;
  private readonly wechatSessionResolver: WechatSessionResolver;
  private readonly authUserResolver: AuthUserResolver;
  private readonly oauthIdentityEnsurer: OauthIdentityEnsurer;
  private readonly tokenSigner: (payload: Omit<JwtPayload, "iat" | "exp">) => string;
  private readonly smsService: SmsServicePort;

  constructor(dependencies: PlatformPartnerPortalServiceDependencies = {}) {
    this.repository = dependencies.repository ?? platformPartnerPortalRepository;
    this.wechatSessionResolver = dependencies.wechatSessionResolver ?? defaultWechatSessionResolver;
    this.authUserResolver = dependencies.authUserResolver ?? defaultAuthUserResolver;
    this.oauthIdentityEnsurer = dependencies.oauthIdentityEnsurer ?? defaultOauthIdentityEnsurer;
    this.tokenSigner = dependencies.tokenSigner ?? signToken;
    this.smsService = dependencies.smsService ?? smsVerificationCodeService;
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
    sms_code: string;
    request?: FastifyRequest;
  }) {
    const resolution = await this.resolveWechatAuthUser(input);
    const claim = await this.repository.claimMemberBinding({
      phone: input.phone,
      code: input.sms_code,
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

  async me(user?: JwtPayload) {
    if (
      !user?.sub ||
      !user.partner_id ||
      !Array.isArray(user.roles) ||
      !user.roles.includes(PLATFORM_PARTNER_ROLE)
    ) {
      throw Errors.business(403, "无城市合伙人访问权限", "PARTNER_AUTH_REQUIRED");
    }

    const member = await this.repository.findMemberByAuthUserId(user.sub);
    if (!member || member.partner_id !== user.partner_id) {
      throw Errors.business(403, "无城市合伙人访问权限", "PARTNER_AUTH_REQUIRED");
    }

    this.assertUsableMember(member);

    return {
      user_id: user.sub,
      roles: [PLATFORM_PARTNER_ROLE],
      authMode: "platform_partner",
      member: this.serializeMember(member),
      partner: this.serializePartner(member.partner!),
      level: this.serializeLevel(member.partner!),
    } satisfies PartnerAuthMeResponse;
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

    throw Errors.business(
      409,
      "该合伙人成员已绑定其他微信",
      "PARTNER_MEMBER_ALREADY_BOUND",
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
    const isAllowedMemberStatus = member.status === "active" ||
      (options.allowPendingBind === true && member.status === "pending_bind");
    if (!isAllowedMemberStatus || !member.partner || member.partner.status !== "active") {
      throw Errors.business(
        403,
        "合伙人账号不可用",
        "PARTNER_ACCOUNT_DISABLED",
      );
    }
  }

  private buildAuthResponse(
    member: PlatformPartnerMemberRecord,
    userId: string,
    openid?: string,
    unionid?: string | null,
  ): PartnerAuthResponse {
    if (!member.partner) {
      throw Errors.business(
        403,
        "合伙人账号不可用",
        "PARTNER_ACCOUNT_DISABLED",
      );
    }

    const token = this.tokenSigner({
      sub: userId,
      token_type: "platform_partner",
      login_channel: "wechat",
      roles: [PLATFORM_PARTNER_ROLE],
      partner_id: member.partner_id,
      openid,
      unionid: unionid ?? null,
    });

    return {
      token,
      user_id: userId,
      roles: [PLATFORM_PARTNER_ROLE],
      authMode: "platform_partner",
      member: this.serializeMember(member),
      partner: this.serializePartner(member.partner),
      level: this.serializeLevel(member.partner),
    };
  }

  private serializeMember(member: PlatformPartnerMemberRecord): PartnerAuthMemberPayload {
    return {
      id: member.id,
      partner_id: member.partner_id,
      name: member.name,
      phone: member.phone,
      role: member.role,
      status: member.status,
    };
  }

  private serializePartner(partner: PlatformPartnerRecord): PartnerAuthPartnerPayload {
    return {
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
    };
  }

  private serializeLevel(partner: PlatformPartnerRecord): PartnerAuthLevelPayload | null {
    return partner.level
      ? {
        id: partner.level.id,
        code: partner.level.code,
        name: partner.level.name,
        status: partner.level.status,
      }
      : null;
  }
}

async function defaultWechatSessionResolver(code: string) {
  return getWeChatSession.call({}, code);
}

async function defaultAuthUserResolver(input: {
  request?: FastifyRequest;
  openid: string;
  unionid?: string | null;
}) {
  const request = input.request ?? createFallbackRequest();
  const context = {
    serializeBackgroundError,
    runAuthBackgroundTask,
    createWechatVisitorUser,
  };
  const resolution = await getOrCreateAuthUser.call(
    context,
    request,
    input.openid,
    input.unionid ?? undefined,
    { allowVisitorSession: false },
  );

  if (resolution.kind !== "auth_user") {
    throw Errors.unauthorized();
  }

  return {
    userId: resolution.userId,
    isNewUser: resolution.isNewUser,
  };
}

async function defaultOauthIdentityEnsurer(input: {
  userId: string;
  openid: string;
  unionid?: string | null;
}) {
  await userIdentityService.syncOauthIdentityBestEffort({
    userId: input.userId,
    platform: "wechat_mini",
    openid: input.openid,
    unionid: input.unionid ?? null,
    source: "platform_partner_portal_auth",
  });

  const activeIdentity = await userIdentityService.findActiveOauthIdentity({
    platform: "wechat_mini",
    openid: input.openid,
  });
  if (activeIdentity?.user_id !== input.userId) {
    throw Errors.dbError("同步微信登录凭证失败");
  }
}

function createFallbackRequest() {
  const log = {
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
  };

  return {
    id: "partner-portal-auth",
    log,
  } as unknown as FastifyRequest;
}

export const platformPartnerPortalService = new PlatformPartnerPortalService();
