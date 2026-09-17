import { createHash } from "node:crypto";

import { ErrorCodes } from "@/errors/error-codes";
import { Errors } from "@/errors/error-factory";
import { invalidateWechatIdentityCheckCache } from "@/plugins/auth/legacy/wechat-cache";
import {
  platformAuthRepository,
  type PlatformAuthRepository,
} from "@/repositories/platform-auth";
import { userIdentityRepository } from "@/repositories/user-identities";
import { authorizationService } from "@/services/authorization";
import { userIdentityService } from "@/services/user-identities";

type AccountRepositoryPort = Pick<
  PlatformAuthRepository,
  "findEmployeeAccount"
>;
type IdentityRepositoryPort = Pick<
  typeof userIdentityRepository,
  "findActiveOauthIdentity" | "unbindOauthIdentities" | "recordAuthEvent"
>;
type IdentityCachePort = Pick<
  typeof userIdentityService,
  "invalidateOauthIdentityCache"
>;

export type PlatformWechatUnbindInput = {
  authUserId: string;
  employeeId: string;
  openid?: string | null;
};

export type PlatformAuthServiceDependencies = {
  accountRepository?: AccountRepositoryPort;
  identityRepository?: IdentityRepositoryPort;
  identityCache?: IdentityCachePort;
  invalidateWechatIdentityCheckCache?: typeof invalidateWechatIdentityCheckCache;
  invalidateAuthContext?: typeof authorizationService.invalidateAuthContext;
};

export class PlatformAuthService {
  private readonly accountRepository: AccountRepositoryPort;
  private readonly identityRepository: IdentityRepositoryPort;
  private readonly identityCache: IdentityCachePort;
  private readonly invalidateWechatIdentityCheck: typeof invalidateWechatIdentityCheckCache;
  private readonly invalidateAuth: typeof authorizationService.invalidateAuthContext;

  constructor(dependencies: PlatformAuthServiceDependencies = {}) {
    this.accountRepository =
      dependencies.accountRepository ?? platformAuthRepository;
    this.identityRepository =
      dependencies.identityRepository ?? userIdentityRepository;
    this.identityCache = dependencies.identityCache ?? userIdentityService;
    this.invalidateWechatIdentityCheck =
      dependencies.invalidateWechatIdentityCheckCache
      ?? invalidateWechatIdentityCheckCache;
    this.invalidateAuth =
      dependencies.invalidateAuthContext
      ?? ((input) => authorizationService.invalidateAuthContext(input));
  }

  async unbindWechat(input: PlatformWechatUnbindInput) {
    const openid = input.openid;
    if (!openid) {
      throw this.bindingChanged();
    }
    const verifiedInput = { ...input, openid };

    const account = await this.accountRepository.findEmployeeAccount(
      input.employeeId,
    );
    if (
      !account
      || account.tenant_id !== null
      || account.user_id !== input.authUserId
      || account.status !== "active"
    ) {
      throw this.bindingChanged();
    }

    if (!/^1[3-9]\d{9}$/.test(account.phone?.trim() ?? "")) {
      throw Errors.business(
        422,
        "当前平台账号未绑定可用手机号，无法解除唯一登录方式",
        ErrorCodes.UNBIND_FORBIDDEN,
      );
    }

    const oauthIdentity = await this.identityRepository
      .findActiveOauthIdentity("wechat_mini", openid);
    if (oauthIdentity?.user_id !== input.authUserId) {
      throw this.bindingChanged();
    }

    const unbound = await this.identityRepository.unbindOauthIdentities({
      userId: input.authUserId,
      platform: "wechat_mini",
      openid,
    });
    this.invalidateIdentityCaches(verifiedInput);
    if (unbound.length !== 1) {
      throw this.bindingChanged();
    }

    this.invalidateAuth({
      authUserId: input.authUserId,
      employeeId: input.employeeId,
    });
    await this.recordUnbindEventBestEffort(verifiedInput);
    return { success: true, message: "微信绑定已解除" } as const;
  }

  private invalidateIdentityCaches(
    input: PlatformWechatUnbindInput & { openid: string },
  ) {
    this.identityCache.invalidateOauthIdentityCache({
      userId: input.authUserId,
      platform: "wechat_mini",
      openid: input.openid,
    });
    this.invalidateWechatIdentityCheck({
      authUserId: input.authUserId,
      openid: input.openid,
    });
  }

  private async recordUnbindEventBestEffort(
    input: PlatformWechatUnbindInput & { openid: string },
  ) {
    try {
      await this.identityRepository.recordAuthEvent({
        userId: input.authUserId,
        eventType: "identity_oauth_unbound",
        platform: "wechat_mini",
        openidHash: createHash("sha256").update(input.openid).digest("hex"),
        operatorUserId: input.authUserId,
        metadata: {
          source: "platform_admin_unbind_wechat",
          employee_id: input.employeeId,
        },
      });
    } catch {
      // 审计写入失败不能回滚已完成的身份解绑。
    }
  }

  private bindingChanged() {
    return Errors.business(
      409,
      "当前微信绑定关系已变化，请重新登录",
      ErrorCodes.WECHAT_BINDING_NOT_MATCHED,
    );
  }
}

export const platformAuthService = new PlatformAuthService();
