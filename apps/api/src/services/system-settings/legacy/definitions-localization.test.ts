import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";
import { SETTING_DEFINITIONS } from "./definitions";

describe("system setting definitions localization", () => {
  test("uses Chinese names and descriptions for visible setting copy", () => {
    const visibleCopy = SETTING_DEFINITIONS
      .flatMap((definition) => [definition.name, definition.description])
      .join("\n");

    for (const legacyPhrase of [
      "APIv3 Key",
      "商户 API 私钥",
      "商户 API 证书",
      "WebService",
      "Web JS Key",
      "AppID",
      "Endpoint",
      "AccessKey ID",
      "AccessKey Secret",
      "SecretId",
      "SecretKey",
      "SdkAppId",
      "worker 轮询",
      "ffmpeg",
      "ASR",
      "visitor 为",
      "visible 为",
      "pending 为",
      "mock 为",
      "disabled 为",
      "签名 URL",
      "公开 URL",
    ]) {
      expect(visibleCopy).not.toContain(legacyPhrase);
    }

    expect(visibleCopy).toContain("服务端密钥");
    expect(visibleCopy).toContain("签名校验密钥");
    expect(visibleCopy).toContain("接口域名");
    expect(visibleCopy).toContain("应用编号");
    expect(visibleCopy).toContain("腾讯云语音识别链路");
    expect(visibleCopy).toContain("小程序短链");
    expect(visibleCopy).toContain("微信直达链接");
  });

  test("uses Chinese validation errors for boolean setting values", () => {
    const cryptoSource = readFileSync(new URL("./crypto.ts", import.meta.url), "utf8");

    expect(cryptoSource).toContain("配置值必须选择是或否");
    expect(cryptoSource).not.toContain("配置值必须是 true 或 false");
  });
});
