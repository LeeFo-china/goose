import { Errors } from "@/errors/error-factory";
import { wechatAuthIdentityRepository } from "@/repositories/wechat-auth-identities";

class WechatAuthIdentityService {
  findIdentityByOpenId(openid: string) {
    return wechatAuthIdentityRepository.findIdentityByOpenId(openid);
  }

  findOpenIdByAuthUserId(authUserId: string) {
    return wechatAuthIdentityRepository.findOpenIdByAuthUserId(authUserId);
  }

  async getRequiredOpenIdByAuthUserId(authUserId: string) {
    const openid = await this.findOpenIdByAuthUserId(authUserId);
    if (!openid) {
      throw Errors.badRequest("当前账号未绑定微信身份");
    }
    return openid;
  }

  deleteIdentityByAuthUserOpenId(input: {
    authUserId: string;
    openid: string;
  }) {
    return wechatAuthIdentityRepository.deleteIdentityByAuthUserOpenId(input);
  }

  deleteIdentityByOpenId(openid: string) {
    return wechatAuthIdentityRepository.deleteIdentityByOpenId(openid);
  }

  upsertIdentity(input: {
    authUserId: string;
    openid: string;
    unionid?: string | null;
    errorMessage?: string;
  }) {
    return wechatAuthIdentityRepository.upsertIdentity(input);
  }

  updateIdentityAuthUser(input: {
    fromAuthUserId: string;
    toAuthUserId: string;
    openid: string;
  }) {
    return wechatAuthIdentityRepository.updateIdentityAuthUser(input);
  }

  findLegacyAuthUserByOpenId(openid: string) {
    return wechatAuthIdentityRepository.findLegacyAuthUserByOpenId(openid);
  }

  createWechatAuthUser(input: {
    openid: string;
    unionid?: string | null;
    uniqueEmail?: boolean;
  }) {
    return wechatAuthIdentityRepository.createWechatAuthUser(input);
  }
}

export const wechatAuthIdentityService = new WechatAuthIdentityService();
