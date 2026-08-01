import { Errors } from "@/errors/error-factory";
import { systemSettingsService } from "@/services/system-settings";
import {
  wechatMiniProgramAccessTokenProvider,
} from "@/services/wechat-miniprogram-access-token";

type MiniProgramOpenLinkInput = {
  path: string;
  query: string;
  envVersion: "release" | "trial" | "develop";
};

type MiniProgramCodeInput = {
  page: string;
  scene: string;
  envVersion: "release" | "trial" | "develop";
  checkPath: boolean;
};

type MiniProgramUrlLinkInput = MiniProgramOpenLinkInput & {
  expireAt: Date;
};

function normalizeEnvVersion(value: string): "release" | "trial" | "develop" {
  if (value === "trial" || value === "develop") {
    return value;
  }

  return "release";
}

export function buildUnlimitedCodePayload(input: MiniProgramCodeInput) {
  return {
    scene: input.scene,
    page: input.page,
    check_path: input.checkPath,
    env_version: input.envVersion,
  };
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
    const accessToken = await wechatMiniProgramAccessTokenProvider
      .getAccessToken();
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

  async generateUnlimitedCode(input: MiniProgramCodeInput) {
    const accessToken = await wechatMiniProgramAccessTokenProvider
      .getAccessToken();
    const response = await fetch(
      `https://api.weixin.qq.com/wxa/getwxacodeunlimit?access_token=${encodeURIComponent(accessToken)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(buildUnlimitedCodePayload(input)),
      },
    );
    const contentType = response.headers.get("content-type") || "";
    if (!response.ok) {
      throw Errors.dbError("生成微信小程序码失败", { status: response.status });
    }

    if (contentType.includes("application/json")) {
      const result = await response.json();
      throw Errors.dbError("生成微信小程序码失败", result);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length === 0) {
      throw Errors.dbError("生成微信小程序码失败");
    }

    return buffer;
  }
}

export const wechatOpenLinkService = new WechatOpenLinkService();
