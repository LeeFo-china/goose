import { Errors } from "@/errors/error-factory";
import { SupabaseDB } from "@/utils/supabase";

export type WechatMiniSessionCredentialStatus =
  | "active"
  | "invalid"
  | "revoked";

export type WechatMiniSessionCredentialRecord = {
  id: string;
  oauth_identity_id: string;
  openid_hash: string;
  encrypted_session_key: string;
  encryption_key_version: number;
  session_revision: number;
  status: WechatMiniSessionCredentialStatus;
  obtained_at: string;
  last_used_at: string | null;
  invalidated_at: string | null;
  created_at: string;
  updated_at: string;
};

type RpcResult = {
  data: unknown;
  error: unknown;
};

type RpcClient = {
  rpc: (
    functionName: string,
    parameters: Record<string, unknown>,
  ) => Promise<RpcResult>;
};

export class WechatMiniSessionCredentialRepository {
  private readonly client = SupabaseDB.getAdminClient() as unknown as RpcClient;

  private async rpc(
    functionName: string,
    parameters: Record<string, unknown>,
    errorMessage: string,
  ): Promise<unknown> {
    const { data, error } = await this.client.rpc(functionName, parameters);
    if (error) {
      throw Errors.dbError(errorMessage, error);
    }
    return data;
  }

  async rotate(input: {
    oauthIdentityId: string;
    userId: string;
    openid: string;
    openidHash: string;
    encryptedSessionKey: string;
    encryptionKeyVersion: number;
  }): Promise<WechatMiniSessionCredentialRecord> {
    const data = await this.rpc(
      "rotate_wechat_mini_session_credential",
      {
        p_oauth_identity_id: input.oauthIdentityId,
        p_user_id: input.userId,
        p_openid: input.openid,
        p_openid_hash: input.openidHash,
        p_encrypted_session_key: input.encryptedSessionKey,
        p_encryption_key_version: input.encryptionKeyVersion,
      },
      "轮换微信会话凭据失败",
    );
    return this.requireFirst(data, "轮换微信会话凭据失败");
  }

  async findLatestForOauthIdentity(input: {
    oauthIdentityId: string;
    userId: string;
    openid: string;
  }): Promise<WechatMiniSessionCredentialRecord | null> {
    const data = await this.rpc(
      "get_wechat_mini_session_credential",
      {
        p_oauth_identity_id: input.oauthIdentityId,
        p_user_id: input.userId,
        p_openid: input.openid,
      },
      "查询微信会话凭据失败",
    );
    return this.first(data);
  }

  async markUsed(input: {
    credentialId: string;
    sessionRevision: number;
    userId: string;
    openid: string;
  }): Promise<boolean> {
    const data = await this.rpc(
      "touch_wechat_mini_session_credential",
      {
        p_credential_id: input.credentialId,
        p_session_revision: input.sessionRevision,
        p_user_id: input.userId,
        p_openid: input.openid,
      },
      "更新微信会话凭据使用时间失败",
    );
    return data === true;
  }

  async invalidate(input: {
    credentialId: string;
    sessionRevision: number;
    userId: string;
    openid: string;
  }): Promise<WechatMiniSessionCredentialRecord | null> {
    const data = await this.rpc(
      "invalidate_wechat_mini_session_credential",
      {
        p_credential_id: input.credentialId,
        p_session_revision: input.sessionRevision,
        p_user_id: input.userId,
        p_openid: input.openid,
      },
      "失效微信会话凭据失败",
    );
    return this.first(data);
  }

  async revokeForOauthIdentity(
    oauthIdentityId: string,
  ): Promise<WechatMiniSessionCredentialRecord[]> {
    const data = await this.rpc(
      "revoke_wechat_mini_session_credentials",
      { p_oauth_identity_id: oauthIdentityId },
      "撤销微信会话凭据失败",
    );
    return Array.isArray(data)
      ? data as WechatMiniSessionCredentialRecord[]
      : [];
  }

  private first(data: unknown): WechatMiniSessionCredentialRecord | null {
    return Array.isArray(data) && data[0]
      ? data[0] as WechatMiniSessionCredentialRecord
      : null;
  }

  private requireFirst(
    data: unknown,
    message: string,
  ): WechatMiniSessionCredentialRecord {
    const record = this.first(data);
    if (!record) {
      throw Errors.dbError(message, { reason: "rpc_returned_no_rows" });
    }
    return record;
  }
}

export const wechatMiniSessionCredentialRepository =
  new WechatMiniSessionCredentialRepository();
