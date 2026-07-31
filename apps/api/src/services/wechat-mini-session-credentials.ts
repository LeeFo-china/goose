import { createHash } from "node:crypto";

import { Errors } from "@/errors/error-factory";
import { userIdentityRepository } from "@/repositories/user-identities";
import {
  wechatMiniSessionCredentialRepository,
  type WechatMiniSessionCredentialRecord,
  type WechatMiniSessionCredentialStatus,
} from "@/repositories/wechat-mini-session-credentials";

import {
  decryptWechatMiniSessionKey,
  encryptWechatMiniSessionKey,
} from "./wechat-mini-session-crypto";

const CURRENT_KEY_VERSION = 1;
const SESSION_REFRESH_REQUIRED_CODE =
  "BRANDING_VIRTUAL_PAYMENT_SESSION_REFRESH_REQUIRED";

type IdentityRepositoryPort = Pick<
  typeof userIdentityRepository,
  "findActiveOauthIdentity"
>;

type CredentialRepositoryPort = Pick<
  typeof wechatMiniSessionCredentialRepository,
  | "rotate"
  | "findLatestForOauthIdentity"
  | "markUsed"
  | "invalidate"
  | "revokeForOauthIdentity"
>;

type WechatMiniSessionCredentialServiceDependencies = {
  identityRepository?: IdentityRepositoryPort;
  credentialRepository?: CredentialRepositoryPort;
};

type CredentialMetadata = {
  credentialId: string;
  oauthIdentityId: string;
  sessionRevision: number;
  status: WechatMiniSessionCredentialStatus;
  obtainedAt: string;
};

export class WechatMiniSessionCredentialService {
  private readonly identityRepository: IdentityRepositoryPort;
  private readonly credentialRepository: CredentialRepositoryPort;

  constructor(
    dependencies: WechatMiniSessionCredentialServiceDependencies = {},
  ) {
    this.identityRepository =
      dependencies.identityRepository ?? userIdentityRepository;
    this.credentialRepository =
      dependencies.credentialRepository ?? wechatMiniSessionCredentialRepository;
  }

  async rotateForLogin(input: {
    userId: string;
    openid: string;
    sessionKey: string;
  }): Promise<CredentialMetadata> {
    const identity = await this.identityRepository.findActiveOauthIdentity(
      "wechat_mini",
      input.openid,
    );
    if (!identity || identity.user_id !== input.userId) {
      throwSessionRefreshRequired();
    }

    const encryptedSessionKey = encryptWechatMiniSessionKey(
      input.sessionKey,
      CURRENT_KEY_VERSION,
    );
    const record = await this.credentialRepository.rotate({
      oauthIdentityId: identity.id,
      userId: input.userId,
      openid: input.openid,
      openidHash: createHash("sha256").update(input.openid).digest("hex"),
      encryptedSessionKey,
      keyVersion: CURRENT_KEY_VERSION,
    });

    return credentialMetadata(record);
  }

  async getActiveForUser(input: {
    userId: string;
    openid: string;
  }): Promise<{
    credentialId: string;
    oauthIdentityId: string;
    sessionKey: string;
    sessionRevision: number;
  }> {
    const identity = await this.identityRepository.findActiveOauthIdentity(
      "wechat_mini",
      input.openid,
    );
    if (!identity || identity.user_id !== input.userId) {
      throwSessionRefreshRequired();
    }

    const record = await this.credentialRepository
      .findLatestForOauthIdentity({
        oauthIdentityId: identity.id,
        userId: input.userId,
        openid: input.openid,
      });
    if (!record || record.status !== "active") {
      throwSessionRefreshRequired();
    }

    const sessionKey = decryptWechatMiniSessionKey(
      record.encrypted_session_key,
      record.key_version,
    );
    const isStillActive = await this.credentialRepository.markUsed({
      credentialId: record.id,
      sessionRevision: record.session_revision,
      userId: input.userId,
      openid: input.openid,
    });
    if (!isStillActive) {
      throwSessionRefreshRequired();
    }

    return {
      credentialId: record.id,
      oauthIdentityId: record.oauth_identity_id,
      sessionKey,
      sessionRevision: record.session_revision,
    };
  }

  async invalidate(input: {
    userId: string;
    openid: string;
    credentialId: string;
    sessionRevision: number;
  }): Promise<CredentialMetadata> {
    const identity = await this.identityRepository.findActiveOauthIdentity(
      "wechat_mini",
      input.openid,
    );
    if (!identity || identity.user_id !== input.userId) {
      throwSessionRefreshRequired();
    }
    const record = await this.credentialRepository.invalidate(input);
    if (!record) {
      throwSessionRefreshRequired();
    }
    return credentialMetadata(record);
  }

  async revokeForOauthIdentity(oauthIdentityId: string): Promise<number> {
    const revoked = await this.credentialRepository
      .revokeForOauthIdentity(oauthIdentityId);
    return revoked.length;
  }
}

function credentialMetadata(
  record: WechatMiniSessionCredentialRecord,
): CredentialMetadata {
  return {
    credentialId: record.id,
    oauthIdentityId: record.oauth_identity_id,
    sessionRevision: record.session_revision,
    status: record.status,
    obtainedAt: record.obtained_at,
  };
}

function throwSessionRefreshRequired(): never {
  throw Errors.business(
    409,
    "微信会话已失效，请重新登录",
    SESSION_REFRESH_REQUIRED_CODE,
  );
}

export const wechatMiniSessionCredentialService =
  new WechatMiniSessionCredentialService();
