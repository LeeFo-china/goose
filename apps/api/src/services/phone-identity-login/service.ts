import { createHash, randomBytes } from "node:crypto";
import type { FastifyRequest } from "fastify";
import { ErrorCodes } from "@/errors/error-codes";
import { Errors } from "@/errors/error-factory";
import type {
  PhoneIdentityCandidateRepository,
} from "@/repositories/phone-identity-candidates";
import type {
  ClaimVerificationResult,
  PhoneIdentityLoginRepository,
} from "@/repositories/phone-identity-login";
import type {
  PhoneIdentityLoginSendCodeInput,
  PhoneIdentityLoginVerifyInput,
} from "@/schema/phone-identity-login";
import {
  buildVisitorSessionId,
  signVisitorSession,
} from "@/services/wechat-auth-legacy/common";
import type { SmsVerificationCodeService } from "@/services/sms-verification-codes";
import type { JwtPayload } from "@/utils/jwt";
import { buildPhoneIdentityCandidates } from "./candidates";
import type {
  PhoneIdentityBindings,
  PhoneIdentityBindingSelection,
} from "./bindings";
import type { PhoneIdentityCandidate } from "./types";

type RequestLogger = Pick<FastifyRequest["log"], "info" | "warn">;

type RequestLike = {
  id?: string;
  user?: JwtPayload;
  log?: RequestLogger;
};

type ShareLoginContext = {
  shareLinkId: string;
  tenantId: string;
  shareEmployeeId?: string | null;
  source?: string | null;
};

type VisitorSignerInput = {
  authUserId: string;
  openid: string;
  unionid?: string | null;
  verifiedPhone: string;
  shareLinkId?: string | null;
};

type VisitorSignerOutput = {
  token: string;
  visitorId: string;
};

export type PhoneIdentityLoginServiceDependencies = {
  smsService: Pick<SmsVerificationCodeService, "sendCode">;
  sessionRepository: Pick<
    PhoneIdentityLoginRepository,
    "claimVerification" | "beginSelection"
  >;
  candidateRepository: Pick<
    PhoneIdentityCandidateRepository,
    | "listCustomersByPhone"
    | "listEmployeesByPhone"
    | "listPartnerMembersByPhone"
    | "listActiveMembershipKeys"
    | "listActiveWechatOauthUserIds"
  >;
  tenantShareLinks: {
    resolveLoginContext: (token: string) => Promise<ShareLoginContext>;
  };
  bindings: Pick<PhoneIdentityBindings, "authenticate" | "buildCurrentAuth">;
  resolveAuthUserId: (request: RequestLike) => Promise<string | null>;
  now?: () => Date;
  createSelectionToken?: () => string;
  visitorSigner?: (input: VisitorSignerInput) => VisitorSignerOutput;
};

type SendCodeParams = {
  input: PhoneIdentityLoginSendCodeInput;
  request: RequestLike;
  requestIp: string | null;
  requestDevice?: string | null;
};

type VerifyParams = {
  input: PhoneIdentityLoginVerifyInput;
  request: RequestLike;
};

const SELECTION_TTL_SECONDS = 5 * 60;

export class PhoneIdentityLoginService {
  private readonly now: () => Date;
  private readonly createSelectionToken: () => string;
  private readonly visitorSigner: (input: VisitorSignerInput) => VisitorSignerOutput;

  constructor(private readonly dependencies: PhoneIdentityLoginServiceDependencies) {
    this.now = dependencies.now ?? (() => new Date());
    this.createSelectionToken = dependencies.createSelectionToken ??
      (() => randomBytes(32).toString("base64url"));
    this.visitorSigner = dependencies.visitorSigner ?? defaultVisitorSigner;
  }

  async sendCode(params: SendCodeParams) {
    this.requireWechatActor(params.request, false);
    const result = await this.dependencies.smsService.sendCode({
      phone: params.input.phone,
      scene: "login_identity",
      requestIp: params.requestIp,
      requestDevice: params.requestDevice ?? null,
    });

    this.logInfo(params.request, "phone_identity_login_code_sent", {
      requestId: params.request.id,
      hasRequestIp: Boolean(params.requestIp),
      hasRequestDevice: Boolean(params.requestDevice),
    });

    return result;
  }

  async verify(params: VerifyParams) {
    const actor = await this.requireWechatActor(params.request, true);
    const now = this.now();
    const verification = await this.dependencies.sessionRepository.claimVerification({
      phone: params.input.phone,
      code: params.input.code,
      authUserId: actor.authUserId,
      openidHash: actor.openidHash,
      now: now.toISOString(),
      expiresAt: new Date(now.getTime() + SELECTION_TTL_SECONDS * 1000)
        .toISOString(),
    });
    this.assertVerificationClaimed(verification);

    const shareContext = params.input.share_token
      ? await this.dependencies.tenantShareLinks.resolveLoginContext(
        params.input.share_token,
      ) as ShareLoginContext
      : null;
    const discovery = await this.discoverCandidates({
      phone: params.input.phone,
      authUserId: actor.authUserId,
      shareTenantId: shareContext?.tenantId ?? null,
    });

    this.logInfo(params.request, "phone_identity_login_verified", {
      requestId: params.request.id,
      sessionId: verification.sessionId,
      rawMatchCount: discovery.rawMatchCount,
      candidateCount: discovery.candidates.length,
      hasShareContext: Boolean(shareContext),
    });

    if (discovery.candidates.length === 0) {
      if (discovery.rawMatchCount > 0) {
        throw Errors.business(
          403,
          "该手机号关联身份暂不可用，请联系管理员处理",
          ErrorCodes.IDENTITY_ACCOUNT_UNAVAILABLE,
        );
      }

      return {
        status: "visitor_verified" as const,
        next_action: "submit_platform_lead" as const,
        auth: this.buildVerifiedVisitorAuth({
          authUserId: actor.authUserId,
          openid: actor.openid,
          unionid: actor.unionid,
          verifiedPhone: params.input.phone,
          shareLinkId: shareContext?.shareLinkId ?? null,
        }),
      };
    }

    if (discovery.candidates.length === 1) {
      const [candidate] = discovery.candidates;
      if (!candidate) {
        throw Errors.business(
          403,
          "该手机号关联身份暂不可用，请联系管理员处理",
          ErrorCodes.IDENTITY_ACCOUNT_UNAVAILABLE,
        );
      }
      const auth = await this.authenticateCandidate(candidate, {
        authUserId: actor.authUserId,
        openid: actor.openid,
        phone: params.input.phone,
      });
      return {
        status: "authenticated" as const,
        auth,
      };
    }

    const selectionToken = this.createSelectionToken();
    const beginStatus = await this.dependencies.sessionRepository.beginSelection({
      sessionId: verification.sessionId,
      authUserId: actor.authUserId,
      openidHash: actor.openidHash,
      selectionTokenHash: hashToken(selectionToken),
      shareContext: serializeShareContext(shareContext),
      candidates: discovery.candidates.map(serializeStoredCandidate),
      now: now.toISOString(),
    });
    if (beginStatus !== "ready") {
      throw Errors.business(
        409,
        "身份选择状态不可用，请重新验证手机号",
        ErrorCodes.IDENTITY_SELECTION_IN_PROGRESS,
      );
    }

    return {
      status: "selection_required" as const,
      selection_token: selectionToken,
      expires_in: SELECTION_TTL_SECONDS,
      phone_masked: maskPhone(params.input.phone),
      candidates: discovery.candidates.map(serializePublicCandidate),
    };
  }

  private async discoverCandidates(input: {
    phone: string;
    authUserId: string;
    shareTenantId: string | null;
  }) {
    const [
      customers,
      employees,
      partnerMembers,
      activeMembershipKeys,
    ] = await Promise.all([
      this.dependencies.candidateRepository.listCustomersByPhone(input.phone),
      this.dependencies.candidateRepository.listEmployeesByPhone(input.phone),
      this.dependencies.candidateRepository.listPartnerMembersByPhone(input.phone),
      this.dependencies.candidateRepository.listActiveMembershipKeys(input.authUserId),
    ]);
    const relatedUserIds = [
      ...customers.map((item) => item.user_id),
      ...employees.map((item) => item.user_id),
      ...partnerMembers.map((item) => item.auth_user_id),
    ].filter((id): id is string => typeof id === "string" && id.length > 0);
    const activeWechatOauthUserIds =
      await this.dependencies.candidateRepository.listActiveWechatOauthUserIds(
        relatedUserIds,
      );

    return buildPhoneIdentityCandidates({
      currentAuthUserId: input.authUserId,
      customers,
      employees,
      partnerMembers,
      activeMembershipKeys,
      activeWechatOauthUserIds,
      shareTenantId: input.shareTenantId,
    });
  }

  private async authenticateCandidate(candidate: PhoneIdentityCandidate, input: {
    authUserId: string;
    openid: string;
    phone: string;
  }) {
    const selection = toBindingSelection(candidate, input);
    if (candidate.bindingState === "current") {
      return this.dependencies.bindings.buildCurrentAuth(selection);
    }

    return this.dependencies.bindings.authenticate(selection);
  }

  private buildVerifiedVisitorAuth(input: VisitorSignerInput) {
    const signed = this.visitorSigner(input);
    return {
      token: signed.token,
      user_id: null,
      visitor_id: signed.visitorId,
      roles: ["visitor"],
      mode: "platform_visitor",
      authMode: "platform_visitor",
      phone: input.verifiedPhone,
      verified_phone: input.verifiedPhone,
      has_customer_profile: false,
      tenant: null,
      customer: null,
      employee: null,
      partner: null,
    };
  }

  private assertVerificationClaimed(
    result: ClaimVerificationResult,
  ): asserts result is { status: "claimed"; sessionId: string } {
    if (result.status === "claimed") return;
    if (result.status === "sms_expired") {
      throw Errors.business(400, "验证码已过期", ErrorCodes.SMS_CODE_EXPIRED);
    }
    throw Errors.business(400, "验证码错误", ErrorCodes.SMS_CODE_INVALID);
  }

  private async requireWechatActor(
    request: RequestLike,
    requireAuthUserId: true,
  ): Promise<{
    authUserId: string;
    openid: string;
    unionid: string | null;
    openidHash: string;
  }>;
  private requireWechatActor(
    request: RequestLike,
    requireAuthUserId: false,
  ): {
    openid: string;
    unionid: string | null;
    openidHash: string;
  };
  private requireWechatActor(request: RequestLike, requireAuthUserId: boolean) {
    const openid = typeof request.user?.openid === "string"
      ? request.user.openid.trim()
      : "";
    if (!openid || request.user?.login_channel === "admin_web") {
      throw Errors.unauthorized(
        "请先建立有效的小程序微信会话",
        ErrorCodes.AUTH_SESSION_REQUIRED,
      );
    }

    const base = {
      openid,
      unionid: request.user?.unionid ?? null,
      openidHash: createHash("sha256").update(openid).digest("hex"),
    };
    if (!requireAuthUserId) return base;

    return this.resolveActorAuthUserId(request, base);
  }

  private async resolveActorAuthUserId(
    request: RequestLike,
    base: { openid: string; unionid: string | null; openidHash: string },
  ) {
    const tokenAuthUserId = typeof request.user?.sub === "string"
      ? request.user.sub
      : "";
    const authUserId = tokenAuthUserId ||
      await this.dependencies.resolveAuthUserId(request);
    if (!authUserId) {
      throw Errors.unauthorized(
        "请先建立有效的小程序微信会话",
        ErrorCodes.AUTH_SESSION_REQUIRED,
      );
    }

    return {
      ...base,
      authUserId,
    };
  }

  private logInfo(
    request: RequestLike,
    event: string,
    payload: Record<string, unknown>,
  ) {
    request.log?.info({ event, ...payload }, "[auth] phone identity login");
  }
}

function toBindingSelection(
  candidate: PhoneIdentityCandidate,
  input: { authUserId: string; openid: string; phone: string },
): PhoneIdentityBindingSelection {
  return {
    targetMode: candidate.targetMode,
    tenantId: candidate.tenantId,
    customerId: candidate.customerId,
    employeeId: candidate.employeeId,
    partnerMemberId: candidate.partnerMemberId,
    authUserId: input.authUserId,
    openid: input.openid,
    phone: input.phone,
  };
}

function serializePublicCandidate(candidate: PhoneIdentityCandidate) {
  return {
    candidate_id: candidate.candidateId,
    target_mode: candidate.targetMode,
    role_label: candidate.roleLabel,
    title: candidate.title,
    subtitle: candidate.subtitle,
    binding_state: candidate.bindingState,
    ...(candidate.rebindKind ? { rebind_kind: candidate.rebindKind } : {}),
  };
}

function serializeStoredCandidate(candidate: PhoneIdentityCandidate) {
  return {
    id: candidate.candidateId,
    target_mode: candidate.targetMode,
    tenant_id: candidate.tenantId,
    customer_id: candidate.customerId,
    employee_id: candidate.employeeId,
    partner_id: candidate.partnerId,
    partner_member_id: candidate.partnerMemberId,
  };
}

function serializeShareContext(context: ShareLoginContext | null) {
  if (!context) return {};
  return {
    share_link_id: context.shareLinkId,
    tenant_id: context.tenantId,
    share_employee_id: context.shareEmployeeId ?? null,
    source: context.source ?? null,
  };
}

function defaultVisitorSigner(input: VisitorSignerInput) {
  const visitorId = buildVisitorSessionId(input.openid);
  return {
    visitorId,
    token: signVisitorSession({
      authUserId: input.authUserId,
      openid: input.openid,
      unionid: input.unionid ?? null,
      visitorId,
      verifiedPhone: input.verifiedPhone,
      shareLinkId: input.shareLinkId ?? null,
    }),
  };
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function maskPhone(phone: string) {
  return `${phone.slice(0, 3)}****${phone.slice(-4)}`;
}
