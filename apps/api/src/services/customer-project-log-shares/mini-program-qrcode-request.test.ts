import { describe, expect, mock, test } from "bun:test";

import { buildMiniProgramQrcodeRequest } from "./mini-program-qrcode-request";

describe("buildMiniProgramQrcodeRequest", () => {
  test("读取 develop 设置并写入微信请求字段", async () => {
    const getString = mock(async () => "develop");
    const body = await buildMiniProgramQrcodeRequest({
      scene: "voucher-token",
      page: "pages/share-campaign-claim-voucher/index",
      settings: { getString },
      normalizeEnvVersion: (value) => value === "develop" ? value : "release",
    });

    expect(getString).toHaveBeenCalledWith(
      "WECHAT_MINIPROGRAM_ENV_VERSION",
      "release",
    );
    expect(body).toEqual({
      scene: "voucher-token",
      page: "pages/share-campaign-claim-voucher/index",
      check_path: false,
      env_version: "develop",
    });
  });

  test("配置缺失时向设置服务传递 release 默认值", async () => {
    const body = await buildMiniProgramQrcodeRequest({
      scene: "share-token",
      page: "pages/share-campaign/index",
      settings: {
        getString: async (_key, fallback = "") => fallback,
      },
      normalizeEnvVersion: (value) => value === "trial" ? value : "release",
    });

    expect(body.env_version).toBe("release");
  });

  test("非法配置交给现有 normalizeEnvVersion 归一", async () => {
    const normalizeEnvVersion = mock(() => "release" as const);
    const body = await buildMiniProgramQrcodeRequest({
      scene: "share-token",
      page: "pages/share-campaign/index",
      settings: { getString: async () => "unknown" },
      normalizeEnvVersion,
    });

    expect(normalizeEnvVersion).toHaveBeenCalledWith("unknown");
    expect(body.env_version).toBe("release");
  });
});
