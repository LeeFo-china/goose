import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { TenantDouyinLeadCaptureConfig } from "./workspace-lead-capture-config";
import type { TenantDouyinWorkspace } from "./workspace-types";

const installation: NonNullable<TenantDouyinWorkspace["installation"]> = {
  id: "22222222-2222-4222-8222-222222222222",
  authorizer_appid: "ttd033a68e4e56ccd301",
  installation_kind: "merchant",
  authorization_status: "active",
  permission_snapshot: [],
  runtime_config: {
    brand: { logo_url: null, qualifications: [] },
    theme: { primary_color: "#C45A32", navigation_text_color: "black" },
    features: {
      cases: true,
      sites: true,
      sms_lead: true,
      douyin_phone: false,
      phone_capture_mode: "sms",
    },
    home_banners: [],
    trust_metrics: [],
    privacy_policy_version: "2026-07-19",
  },
  template_version: null,
  template_release_id: null,
  created_at: "2026-09-06T00:00:00.000Z",
  updated_at: "2026-09-06T00:00:01.000Z",
};

describe("TenantDouyinLeadCaptureConfig", () => {
  test("renders an informational SMS-only state without mutable controls", () => {
    const editable = renderToStaticMarkup(createElement(
      TenantDouyinLeadCaptureConfig,
      { canManage: true, installation },
    ));
    expect(editable).toContain("手机号留资");
    expect(editable).toContain(installation.authorizer_appid);
    expect(editable).not.toContain("legacy-component-id");
    expect(editable).not.toContain("线索组件 ID");
    expect(editable).toContain("短信验证码模式");
    expect(editable).toContain("免费量房由用户填写手机号并完成短信验证");
    expect(editable).toContain("抖音手机号快捷登录仅用于客户账号登录");
    expect(editable).not.toContain("抖音官方手机号快捷留资");
    expect(editable).not.toContain("保存留资配置");
    expect(editable).not.toContain('role="switch"');

    const readonly = renderToStaticMarkup(createElement(
      TenantDouyinLeadCaptureConfig,
      { canManage: false, installation },
    ));
    expect(readonly).toContain("短信验证码模式");
  });

  test("contains no client mutation path", async () => {
    const source = await Bun.file(new URL(
      "./workspace-lead-capture-config.tsx",
      import.meta.url,
    )).text();
    expect(source).not.toContain("requestBackendJson");
    expect(source).not.toContain("<Switch");
    expect(source).not.toContain("useState");
  });
});
