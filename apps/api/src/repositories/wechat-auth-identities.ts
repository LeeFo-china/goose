import { Errors } from "@/errors/error-factory";
import { SupabaseDB } from "@/utils/supabase";

export type WechatIdentityRow = {
  auth_user_id: string;
  openid: string;
  unionid: string | null;
};

export type LegacyWechatAuthUserRow = {
  id: string;
  email?: string | null;
  openid?: string | null;
  unionid?: string | null;
};

class WechatAuthIdentityRepository {
  private adminClient = SupabaseDB.getAdminClient();

  async findIdentityByOpenId(openid: string) {
    const { data, error } = await this.adminClient
      .from("wechat_identities")
      .select("auth_user_id, openid, unionid")
      .eq("openid", openid)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询微信用户失败", {
        code: error.code,
        details: error.details,
        hint: error.hint,
        message: error.message,
      });
    }

    return (data || null) as WechatIdentityRow | null;
  }

  async findOpenIdByAuthUserId(authUserId: string) {
    const { data, error } = await this.adminClient
      .from("wechat_identities")
      .select("openid")
      .eq("auth_user_id", authUserId)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询微信身份失败", error);
    }

    return (data?.openid as string | undefined) ?? null;
  }

  async deleteIdentityByAuthUserOpenId(input: {
    authUserId: string;
    openid: string;
  }) {
    const { error } = await this.adminClient
      .from("wechat_identities")
      .delete()
      .eq("auth_user_id", input.authUserId)
      .eq("openid", input.openid)
      .select("auth_user_id");

    if (error) {
      throw Errors.dbError("清理已解绑微信身份映射失败", error);
    }
  }

  async deleteIdentityByOpenId(openid: string) {
    const { error } = await this.adminClient
      .from("wechat_identities")
      .delete()
      .eq("openid", openid)
      .select("auth_user_id");

    if (error) {
      throw Errors.dbError("清理旧微信身份映射失败", error);
    }
  }

  async upsertIdentity(input: {
    authUserId: string;
    openid: string;
    unionid?: string | null;
    errorMessage?: string;
  }) {
    const { error } = await this.adminClient.from("wechat_identities").upsert({
      auth_user_id: input.authUserId,
      openid: input.openid,
      unionid: input.unionid ?? null,
    }).select("auth_user_id");

    if (error) {
      throw Errors.dbError(input.errorMessage || "创建微信身份映射失败", error);
    }
  }

  async updateIdentityAuthUser(input: {
    fromAuthUserId: string;
    toAuthUserId: string;
    openid: string;
  }) {
    const { error } = await this.adminClient
      .from("wechat_identities")
      .update({ auth_user_id: input.toAuthUserId })
      .eq("auth_user_id", input.fromAuthUserId)
      .eq("openid", input.openid)
      .select("auth_user_id");

    if (error) {
      throw Errors.dbError("更新微信身份映射失败", error);
    }
  }

  async findLegacyAuthUserByOpenId(openid: string) {
    const { data, error } = await this.adminClient.rpc("find_auth_user_by_openid", {
      p_openid: openid,
    });

    if (error) {
      throw Errors.dbError("查询历史微信用户失败", {
        code: error.code,
        details: error.details,
        hint: error.hint,
        message: error.message,
      });
    }

    const rows = Array.isArray(data) ? (data as LegacyWechatAuthUserRow[]) : [];
    return rows[0] || null;
  }

  async createWechatAuthUser(input: {
    openid: string;
    unionid?: string | null;
    uniqueEmail?: boolean;
  }) {
    const emailLocalPart = input.uniqueEmail
      ? `${input.openid}.${crypto.randomUUID()}`
      : input.openid;
    const { data, error } = await this.adminClient.auth.admin.createUser({
      email: `${emailLocalPart}@wechat.local`,
      password: crypto.randomUUID(),
      email_confirm: true,
      user_metadata: {
        openid: input.openid,
        unionid: input.unionid || null,
        source: "wechat_miniprogram",
      },
    });

    return { data, error };
  }
}

export const wechatAuthIdentityRepository = new WechatAuthIdentityRepository();
