import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  buildLeadCaptureConfigRequest,
  parseLeadCaptureConfigResponse,
  TenantDouyinLeadCaptureConfig,
} from "./workspace-lead-capture-config";
import type { TenantDouyinWorkspace } from "./workspace-types";

const installation: NonNullable<TenantDouyinWorkspace["installation"]> = {
  id: "22222222-2222-4222-8222-222222222222",
  authorizer_appid: "ttd033a68e4e56ccd301",
  installation_kind: "merchant",
  authorization_status: "active",
  clue_component_id: "5785490b6443ad9def6f88e69c57920c",
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
  test("builds exact requests, retaining the component ID when disabled", () => {
    expect(buildLeadCaptureConfigRequest(installation, false,
      " 5785490b6443ad9def6f88e69c57920c ")).toEqual({
      data: {
        authorizer_appid: installation.authorizer_appid,
        enabled: false,
        clue_component_id: "5785490b6443ad9def6f88e69c57920c",
        expected_updated_at: installation.updated_at,
      },
      error: null,
    });
    expect(buildLeadCaptureConfigRequest(installation, true, "")).toEqual({
      data: null,
      error: "启用抖音官方手机号时必须填写线索组件 ID",
    });
  });

  test("strictly parses the public response and rejects extra fields", () => {
    const response = {
      installation_id: installation.id,
      authorizer_appid: installation.authorizer_appid,
      enabled: true,
      clue_component_id: installation.clue_component_id,
      updated_at: "2026-09-06T00:00:02.000Z",
    };
    expect(parseLeadCaptureConfigResponse(response)).toEqual(response);
    expect(() => parseLeadCaptureConfigResponse({ ...response, secret: true }))
      .toThrow("手机号留资配置响应格式无效");
    expect(() => parseLeadCaptureConfigResponse({
      ...response,
      clue_component_id: null,
    })).toThrow("手机号留资配置响应格式无效");
  });

  test("renders current AppID, retained ID and a permission-aware form", () => {
    const editable = renderToStaticMarkup(createElement(
      TenantDouyinLeadCaptureConfig,
      { canManage: true, installation },
    ));
    expect(editable).toContain("手机号留资");
    expect(editable).toContain(installation.authorizer_appid);
    expect(editable).toContain(installation.clue_component_id!);
    expect(editable).toContain("抖音官方手机号快捷留资");
    expect(editable).toContain("保存留资配置");

    const readonly = renderToStaticMarkup(createElement(
      TenantDouyinLeadCaptureConfig,
      { canManage: false, installation },
    ));
    expect(readonly).toContain("只读模式");
    expect(readonly).toContain("disabled");

    const inactive = renderToStaticMarkup(createElement(
      TenantDouyinLeadCaptureConfig,
      {
        canManage: true,
        installation: { ...installation, authorization_status: "disabled" },
      },
    ));
    expect(inactive).toContain("小程序授权未启用");
    expect(inactive).toContain("disabled");
  });

  test("uses the tenant PATCH endpoint and refreshes stale workspaces", async () => {
    const source = await Bun.file(new URL(
      "./workspace-lead-capture-config.tsx",
      import.meta.url,
    )).text();
    expect(source).toContain('"/tenant/douyin-miniapp/lead-capture-config"');
    expect(source).toContain('method: "PATCH"');
    expect(source).toContain('code === "DOUYIN_LEAD_CAPTURE_CONFIG_STALE"');
    expect(source).toContain("window.location.reload()");
  });
});
