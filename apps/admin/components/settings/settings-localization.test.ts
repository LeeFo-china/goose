import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

function readSource(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

describe("settings localization", () => {
  test("uses Chinese labels for system setting group tabs", () => {
    const source = readFileSync(
      new URL("../../app/(console)/settings/page.tsx", import.meta.url),
      "utf8",
    );

    expect(source).toContain('location: "定位匹配"');
    expect(source).toContain('picture_library: "图片资料库"');
    expect(source).toContain('visitor: "访客配置"');
    expect(source).toContain('"location"');
    expect(source).toContain('"picture_library"');
    expect(source).toContain('"visitor"');
    expect(source).not.toContain("label: groupLabels[groupCode] || groupCode");
  });

  test("renders settings summary with shadcn badge metrics", () => {
    const source = readFileSync(
      new URL("../../app/(console)/settings/page.tsx", import.meta.url),
      "utf8",
    );

    expect(source).toContain("SettingsHeaderMetric");
    expect(source).toContain('import { Badge } from "@/components/ui/badge"');
    expect(source).toContain('label="配置项"');
    expect(source).toContain('label="未配置"');
    expect(source).not.toContain("text-xs text-muted-foreground");
  });

  test("uses Chinese labels for platform settings interactions", () => {
    const source = [
      readSource("./settings-actions.tsx"),
      readSource("./settings-file-access-policy-editor.tsx"),
      readSource("./platform-payment-settings-panel.tsx"),
      readSource("./platform-payment-settings-shared.tsx"),
      readSource("./platform-payment-secret-form.tsx"),
    ].join("\n");

    for (const legacyPhrase of [
      "Run:",
      "status=",
      "request_id=",
      "WebService 配置测试",
      "WebService Key",
      "WebService SK",
      "小程序 Key",
      "APIv3 Key",
      "商户 API 私钥 PEM",
      "微信支付 API 地址",
      "服务商 AppID",
      "小程序 AppID",
      "默认子商户 AppID",
      "签名 URL",
      "公开 URL",
    ]) {
      expect(source).not.toContain(legacyPhrase);
    }

    expect(source).toContain("运行编号：");
    expect(source).toContain("腾讯位置服务接口测试");
    expect(source).toContain("服务端密钥");
    expect(source).toContain("签名校验密钥");
    expect(source).toContain("小程序密钥");
    expect(source).toContain("接口 v3 密钥");
    expect(source).toContain("服务商应用编号");
    expect(source).toContain("小程序应用编号");
    expect(source).toContain("签名链接");
    expect(source).toContain("公开链接");
    expect(source).toContain("paymentChannelLabel");
    expect(source).toContain("租户充值");
    expect(source).toContain("项目收款");
    expect(source).toContain("商户进件");
  });
});
