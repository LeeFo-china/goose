import { createHash, randomBytes } from "node:crypto";
import { ErrorCodes } from "@/errors/error-codes";
import { Errors } from "@/errors/error-factory";
import {
  type ClaimVerificationResult,
} from "@/repositories/phone-identity-login";
import {
  type CustomerTenantOption,
} from "@/services/wechat-customer-identities/legacy-service";
import type {
  DouyinCustomerAuthAuthorizeInput,
  DouyinCustomerAuthSelectInput,
  DouyinCustomerAuthSendCodeInput,
  DouyinCustomerAuthVerifyInput,
} from "@/schema/douyin-customer-auth";
import { isPhoneLoginWithoutCodeEnabled } from "@/utils/auth/test-login";
import { signToken, type JwtPayload } from "@/utils/jwt";
import {
  buildPhoneIdentityCandidates,
} from "@/services/phone-identity-login/candidates";
import {
  hashToken,
  maskPhone,
  serializePublicCandidate,
  serializeStoredCandidate,
} from "@/services/phone-identity-login/helpers";
import { selectionError } from "@/services/phone-identity-login/helpers";
import type { PhoneIdentityCandidate } from "@/services/phone-identity-login/types";
import type {
  AccessTokenPort,
  DouyinCustomerAuthDependencies,
  DouyinCustomerAuthRequestLike as RequestLike,
  PhoneGateway,
  TokenSigner,
} from "./customer-auth-ports";

const SELECTION_TTL_SECONDS = 5 * 60;

export class DouyinCustomerAuthService {
  private accessTokens?: AccessTokenPort;
  private phoneGateway?: PhoneGateway;
  private readonly now: () => Date;
  private readonly createSelectionToken: () => string;
  private readonly tokenSigner: TokenSigner;
  private readonly privateKeyPem: string | null;

  constructor(private readonly dependencies: DouyinCustomerAuthDependencies) {
    this.accessTokens = dependencies.accessTokens;
    this.phoneGateway = dependencies.phoneGateway;
    this.now = dependencies.now ?? (() => new Date());
    this.createSelectionToken = dependencies.createSelectionToken ??
      (() => randomBytes(32).toString("base64url"));
    this.tokenSigner = dependencies.tokenSigner ?? signToken;
    this.privateKeyPem = dependencies.douyinPhoneNumberPrivateKeyPem === undefined
      ? normalizePrivateKey(process.env.DOUYIN_PHONE_NUMBER_PRIVATE_KEY_PEM)
      : normalizePrivateKey(dependencies.douyinPhoneNumberPrivateKeyPem);
  }

  async sendCode(params: {
    input: DouyinCustomerAuthSendCodeInput;
    request: RequestLike;
    requestIp: string | null;
  }) {
    const actor = this.requireDouyinActor(params.request);
    return this.dependencies.smsService.sendCode({
      phone: params.input.phone,
      scene: "login_identity",
      requestIp: params.requestIp,
      requestDevice: actor.subjectHash,
      requestIpLimit: 5,
    });
  }

  async authorizePhone(params: {
    input: DouyinCustomerAuthAuthorizeInput;
    request: RequestLike;
  }) {
    const actor = this.requireDouyinActor(params.request);
    const phone = await this.resolveAuthorizedPhone(actor, params.input);
    return this.authenticateByPhone(actor, phone, params.request);
  }

  async verifySms(params: {
    input: DouyinCustomerAuthVerifyInput;
    request: RequestLike;
  }) {
    const actor = this.requireDouyinActor(params.request);
    const authUserId = await this.resolveAuthUserId(actor, null);
    const now = this.now();
    const verification = await this.dependencies.sessionRepository.claimVerification({
      phone: params.input.phone,
      code: await this.resolveVerificationCode(params.input.phone, params.input.code, now),
      authUserId,
      openidHash: hashSubject(actor.subjectHash),
      now: now.toISOString(),
      expiresAt: new Date(now.getTime() + SELECTION_TTL_SECONDS * 1000)
        .toISOString(),
    });
    this.assertVerificationClaimed(verification);
    return this.authenticateByPhone(actor, params.input.phone, params.request, {
      authUserId,
      sessionId: verification.sessionId,
    });
  }

  async select(params: {
    input: DouyinCustomerAuthSelectInput;
    request: RequestLike;
  }) {
    const actor = this.requireDouyinActor(params.request);
    const authUserId = await this.resolveAuthUserId(actor, null);
    const now = this.now();
    const reservation = await this.dependencies.sessionRepository.reserveSelection({
      selectionTokenHash: hashToken(params.input.selection_token),
      candidateId: params.input.candidate_id,
      authUserId,
      openidHash: hashSubject(actor.subjectHash),
      now: now.toISOString(),
    });
    if (!("candidate" in reservation)) throw selectionError(reservation.status);
    if (reservation.candidate.targetMode !== "customer") {
      throw Errors.business(
        409,
        "所选身份不可用，请重新验证手机号",
        ErrorCodes.IDENTITY_OPTION_UNAVAILABLE,
      );
    }

    try {
      const customer = await this.loadCustomer({
        tenantId: reservation.candidate.tenantId,
        customerId: reservation.candidate.customerId,
        phone: reservation.verifiedPhone,
      });
      const auth = await this.bindAndSignCustomer({
        actor,
        authUserId,
        customer,
        verifiedPhone: reservation.verifiedPhone,
      });
      if (reservation.status !== "same_candidate_consumed") {
        const status = await this.dependencies.sessionRepository.finalizeSelection({
          sessionId: reservation.sessionId,
          candidateId: reservation.candidate.id,
          now: now.toISOString(),
        });
        if (status !== "consumed") {
          throw Errors.business(
            409,
            "身份选择状态已变化，请重新提交",
            ErrorCodes.IDENTITY_SELECTION_IN_PROGRESS,
          );
        }
      }
      return { status: "authenticated" as const, auth };
    } catch (error) {
      if (reservation.status !== "same_candidate_consumed") {
        await this.releaseSelection(reservation.sessionId, reservation.candidate.id, now);
      }
      throw error;
    }
  }

  private async authenticateByPhone(
    actor: DouyinActor,
    phone: string,
    request: RequestLike,
    existing?: { authUserId: string; sessionId: string },
  ) {
    const discovery = await this.discoverCustomerCandidates(actor, phone, existing?.authUserId ?? null);
    if (discovery.candidates.length === 0) {
      throw Errors.business(
        404,
        "该手机号未匹配到客户项目，请联系装修公司确认预留手机号",
        ErrorCodes.CUSTOMER_CONTEXT_MISSING,
      );
    }
    if (discovery.candidates.length === 1) {
      const candidate = discovery.candidates[0]!;
      const customer = await this.loadCustomer({
        tenantId: candidate.tenantId,
        customerId: candidate.customerId,
        phone,
      });
      const authUserId = existing?.authUserId ??
        await this.resolveAuthUserId(actor, customer.user_id);
      return {
        status: "authenticated" as const,
        auth: await this.bindAndSignCustomer({
          actor,
          authUserId,
          customer,
          verifiedPhone: phone,
        }),
      };
    }

    const authUserId = existing?.authUserId ?? await this.resolveAuthUserId(actor, null);
    const selectionToken = this.createSelectionToken();
    const sessionId = existing?.sessionId ?? crypto.randomUUID();
    const beginStatus = await this.dependencies.sessionRepository.beginSelection({
      sessionId,
      authUserId,
      openidHash: hashSubject(actor.subjectHash),
      selectionTokenHash: hashToken(selectionToken),
      shareContext: {},
      candidates: discovery.candidates.map(serializeStoredCandidate),
      now: this.now().toISOString(),
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
      phone_masked: maskPhone(phone),
      candidates: discovery.candidates.map(serializePublicCandidate),
    };
  }

  private async discoverCustomerCandidates(
    actor: DouyinActor,
    phone: string,
    authUserId: string | null,
  ) {
    const [customers, employees, partnerMembers, activeMembershipKeys] =
      await Promise.all([
        this.dependencies.candidateRepository.listCustomersByPhone(phone),
        this.dependencies.candidateRepository.listEmployeesByPhone(phone),
        this.dependencies.candidateRepository.listPartnerMembersByPhone(phone),
        authUserId
          ? this.dependencies.candidateRepository.listActiveMembershipKeys(authUserId)
          : Promise.resolve(new Set<string>()),
      ]);
    const relatedUserIds = customers
      .map((item) => item.user_id)
      .filter((id): id is string => Boolean(id));
    const activeOauthUserIds =
      await this.dependencies.candidateRepository.listActiveOauthUserIds(
        relatedUserIds,
        "douyin_mini",
      );
    return buildPhoneIdentityCandidates({
      currentAuthUserId: authUserId ?? actor.subjectHash,
      customers,
      employees,
      partnerMembers,
      activeMembershipKeys,
      activeWechatOauthUserIds: new Set<string>(),
      activeOauthUserIds,
      includeTargetModes: new Set(["customer"]),
      rebindKind: "douyin_mini",
    });
  }

  private async bindAndSignCustomer(input: {
    actor: DouyinActor;
    authUserId: string;
    customer: CustomerTenantOption;
    verifiedPhone: string;
  }) {
    await this.dependencies.userIdentities.syncOauthIdentityBestEffort({
      userId: input.authUserId,
      platform: "douyin_mini",
      openid: input.actor.subjectHash,
      unionid: null,
      source: "douyin_customer_auth",
    });
    await this.dependencies.customerIdentity.bindCustomerAuthUser({
      authUserId: input.authUserId,
      customer: input.customer,
    });
    await this.dependencies.userIdentities.syncBusinessMembershipBestEffort({
      userId: input.authUserId,
      tenantId: input.customer.tenant_id,
      identityType: "customer",
      identityId: input.customer.id,
      source: "douyin_customer_auth",
    });
    const tenant = relationOne(input.customer.tenant);
    const token = this.tokenSigner({
      sub: input.authUserId,
      token_type: "auth",
      login_channel: "douyin",
      roles: ["customer"],
      tenant_id: input.customer.tenant_id,
      tenant_slug: tenant?.slug ?? null,
      customer_id: input.customer.id,
      verified_phone: input.verifiedPhone,
      douyin_installation_id: input.actor.installationId,
      douyin_app_id: input.actor.appId,
      subject_hash: input.actor.subjectHash,
    });
    return {
      token,
      user_id: input.authUserId,
      mode: "customer" as const,
      authMode: "customer" as const,
      roles: ["customer"],
      verified_phone: input.verifiedPhone,
      has_customer_profile: true,
      tenant: {
        id: input.customer.tenant_id,
        name: tenant?.name ?? null,
        slug: tenant?.slug ?? null,
      },
      customer: {
        id: input.customer.id,
        name: input.customer.name,
        phone: input.customer.phone,
      },
    };
  }

  private async resolveAuthUserId(
    actor: DouyinActor,
    preferredUserId: string | null,
  ) {
    const activeIdentity = await this.dependencies.userIdentities.findActiveOauthIdentity({
      platform: "douyin_mini",
      openid: actor.subjectHash,
    });
    if (activeIdentity) return activeIdentity.user_id;
    if (preferredUserId) return preferredUserId;
    return this.dependencies.authUsers.createLocalPlatformUser({
      platform: "douyin_mini",
      subject: actor.subjectHash,
      source: "douyin_customer_auth",
    });
  }

  private async resolveAuthorizedPhone(
    actor: DouyinActor,
    input: DouyinCustomerAuthAuthorizeInput,
  ) {
    if (!this.privateKeyPem) {
      throw Errors.business(
        503,
        "抖音手机号授权暂不可用",
        "DOUYIN_PHONE_NUMBER_CONFIG_INVALID",
      );
    }
    const { accessTokens, phoneGateway } = this.phoneDependencies();
    const accessToken = await accessTokens.getAuthorizerAccessToken({
      authorizerAppId: actor.appId,
      deploymentKey: await this.resolveDeploymentKey(actor),
    });
    const result = await phoneGateway.getPhoneNumberInfo({
      appId: actor.appId,
      authorizerAccessToken: accessToken,
      code: input.douyin_phone_code,
      privateKeyPem: this.privateKeyPem,
    });
    return result.phone;
  }

  private async resolveDeploymentKey(actor: DouyinActor) {
    const repository = this.dependencies.contextRepository;
    if (!repository) return "";
    const installation = await repository.findActiveInstallation({
      installationId: actor.installationId,
      tenantId: actor.tenantId,
      appId: actor.appId,
    });
    const deploymentKey = installation?.deployment_key?.trim();
    if (!deploymentKey) {
      throw Errors.business(409, "抖音小程序服务配置无效", "DOUYIN_INSTALLATION_DISABLED");
    }
    return deploymentKey;
  }

  private async loadCustomer(input: {
    tenantId: string | null;
    customerId: string | null;
    phone: string;
  }) {
    if (!input.tenantId || !input.customerId) {
      throw Errors.business(409, "所选身份不可用，请重新验证手机号", ErrorCodes.IDENTITY_OPTION_UNAVAILABLE);
    }
    const customer = await this.dependencies.customerIdentity
      .getCustomerTenantOptionById(input.customerId, input.tenantId);
    const tenant = relationOne(customer?.tenant ?? null);
    if (!customer || customer.phone !== input.phone || tenant?.status !== "active") {
      throw Errors.business(409, "所选身份不可用，请重新验证手机号", ErrorCodes.IDENTITY_OPTION_UNAVAILABLE);
    }
    return customer;
  }

  private async resolveVerificationCode(phone: string, code: string, now: Date) {
    if (!isPhoneLoginWithoutCodeEnabled()) return code;
    const reservation = await this.dependencies.smsService.reserveBypassCode({
      phone,
      scene: "login_identity",
      now: now.toISOString(),
    });
    return reservation.code;
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

  private requireDouyinActor(request: RequestLike): DouyinActor {
    const user = request.user;
    if (
      user?.token_type !== "douyin_miniapp" ||
      user.login_channel !== "douyin" ||
      !user.tenant_id ||
      !user.douyin_installation_id ||
      !user.douyin_app_id ||
      !user.subject_hash ||
      user.sub !== user.subject_hash
    ) {
      throw Errors.unauthorized("请先建立有效的抖音小程序会话", ErrorCodes.AUTH_SESSION_REQUIRED);
    }
    return {
      tenantId: user.tenant_id,
      installationId: user.douyin_installation_id,
      appId: user.douyin_app_id,
      subjectHash: user.subject_hash,
    };
  }

  private phoneDependencies() {
    if (!this.accessTokens || !this.phoneGateway) {
      throw Errors.business(
        503,
        "抖音手机号授权暂不可用",
        "DOUYIN_PHONE_NUMBER_CONFIG_INVALID",
      );
    }
    return { accessTokens: this.accessTokens, phoneGateway: this.phoneGateway };
  }

  private async releaseSelection(sessionId: string, candidateId: string, now: Date) {
    try {
      await this.dependencies.sessionRepository.releaseSelection({
        sessionId,
        candidateId,
        now: now.toISOString(),
      });
    } catch {
      // Release is best effort; keep the original binding error.
    }
  }
}

type DouyinActor = {
  tenantId: string;
  installationId: string;
  appId: string;
  subjectHash: string;
};

function relationOne<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function hashSubject(subjectHash: string) {
  return createHash("sha256").update(subjectHash).digest("hex");
}

function normalizePrivateKey(value: string | null | undefined) {
  const normalized = value?.trim().replace(/\\n/g, "\n");
  return normalized ? normalized : null;
}
