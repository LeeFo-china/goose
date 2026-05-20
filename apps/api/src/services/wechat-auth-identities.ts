import { wechatAuthIdentityRepository } from "@/repositories/wechat-auth-identities";

class WechatAuthIdentityService {
  createWechatAuthUser(input: {
    openid: string;
    unionid?: string | null;
    uniqueEmail?: boolean;
  }) {
    return wechatAuthIdentityRepository.createWechatAuthUser(input);
  }
}

export const wechatAuthIdentityService = new WechatAuthIdentityService();
