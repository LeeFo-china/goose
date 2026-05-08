import { Errors } from "@/errors/error-factory";
import { systemSettingsService } from "@/services/system-settings";

type WechatAccessTokenCache = {
  token: string;
  expiresAt: number;
};

type MiniProgramOpenLinkInput = {
  path: string;
  query: string;
  envVersion: "release" | "trial" | "develop";
};

type MiniProgramUrlLinkInput = MiniProgramOpenLinkInput & {
  expireAt: Date;
};

let accessTokenCache: WechatAccessTokenCache | null = null;

function normalizeEnvVersion(value: string): "release" | "trial" | "develop" {
  if (value === "trial" || value === "develop") {
    return value;
  }

  return "release";
}

async function getWechatAccessToken() {
  if (accessTokenCache && accessTokenCache.expiresAt > Date.now()) {
    return accessTokenCache.token;
  }

  const appId = await systemSettingsService.getSecretString("WECHAT_APPID");
  const secret = await systemSettingsService.getSecretString("WECHAT_SECRET");
  if (!appId || !secret) {
    throw Errors.badRequest("缺少微信小程序 AppID 或 Secret 配置");
  }

  const url = new URL("https://api.weixin.qq.com/cgi-bin/token");
  url.searchParams.set("grant_type", "client_credential");
  url.searchParams.set("appid", appId);
  url.searchParams.set("secret", secret);

  const response = await fetch(url);
  const data = await response.json() as {
    access_token?: string;
    expires_in?: number;
    errcode?: number;
    errmsg?: string;
  };

  if (!response.ok || !data.access_token) {
    throw Errors.badRequest(
      `获取微信 access_token 失败：${data.errmsg || response.statusText}`,
    );
  }

  accessTokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + Math.max(60, (data.expires_in || 7200) - 300) * 1000,
  };

  return data.access_token;
}

class WechatOpenLinkService {
  normalizeEnvVersion(value: string) {
    return normalizeEnvVersion(value);
  }

  async generateScheme(input: MiniProgramOpenLinkInput) {
    const appId = await systemSettingsService.getSecretString("WECHAT_APPID");
    if (!appId) {
      throw Errors.badRequest("缺少微信小程序 AppID 配置");
    }

    const params = new URLSearchParams({
      appid: appId,
      path: input.path,
      query: input.query,
      env_version: input.envVersion,
    });

    return `weixin://dl/business/?${params.toString()}`;
  }

  async generateUrlLink(input: MiniProgramUrlLinkInput) {
    const accessToken = await getWechatAccessToken();
    const response = await fetch(
      `https://api.weixin.qq.com/wxa/generate_urllink?access_token=${encodeURIComponent(accessToken)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          path: input.path,
          query: input.query,
          is_expire: true,
          expire_type: 0,
          expire_time: Math.floor(input.expireAt.getTime() / 1000),
          env_version: input.envVersion,
        }),
      },
    );
    const data = await response.json() as {
      url_link?: string;
      errcode?: number;
      errmsg?: string;
    };

    if (!response.ok || !data.url_link || data.errcode) {
      throw Errors.badRequest(
        `生成微信 URL Link 失败：${data.errmsg || response.statusText}`,
      );
    }

    return data.url_link;
  }
}

export const wechatOpenLinkService = new WechatOpenLinkService();
