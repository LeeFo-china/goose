import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { DouyinReleaseReadiness } from "@gooes/domain";

import {
  ReleaseReadinessPanel,
  releaseReadinessActionRoute,
} from "./release-readiness-panel";

const readiness: DouyinReleaseReadiness = {
  ready: false,
  checked_at: "2026-08-20T10:00:00.000+08:00",
  tenant: {
    id: "11111111-1111-4111-8111-111111111111",
    name: "固始晴天装饰工程有限公司",
  },
  blockers: [
    {
      severity: "blocker",
      code: "PUBLIC_PROFILE_INCOMPLETE",
      message: "公开公司资料不完整",
      details: { field: "introduction" },
    },
    {
      severity: "blocker",
      code: "BUDGET_PRICING_MISSING",
      message: "预算报价版本未启用",
      details: {},
    },
    {
      severity: "blocker",
      code: "SMS_UNAVAILABLE",
      message: "短信验证码服务不可用",
      details: {},
    },
  ],
  warnings: [
    {
      severity: "warning",
      code: "HOST_NOT_SMOKED",
      message: "宿主尚未完成真机验收",
      details: { host: "douyin" },
    },
  ],
  metrics: {
    published_project_count: 5,
    active_service_area_count: 1,
    required_host_count: 3,
  },
};

describe("ReleaseReadinessPanel", () => {
  test("maps blockers to concrete admin routes", () => {
    expect(releaseReadinessActionRoute("PUBLIC_PROFILE_INCOMPLETE")).toEqual({
      label: "维护公开资料",
      href: "/settings/service-provider",
    });
    expect(releaseReadinessActionRoute("PUBLIC_PROJECT_COUNT_LOW")).toEqual({
      label: "管理项目内容",
      href: "/douyin-miniapp/projects",
    });
    expect(releaseReadinessActionRoute("BUDGET_PRICING_MISSING")).toEqual({
      label: "维护预算报价",
      href: "/douyin-miniapp/budget",
    });
    expect(releaseReadinessActionRoute("SMS_UNAVAILABLE")).toEqual({
      label: "检查短信配置",
      href: "/settings",
    });
  });

  test("renders blocker, warning and metric groups without sensitive data", () => {
    const html = renderToStaticMarkup(
      createElement(ReleaseReadinessPanel, { readiness }),
    );

    expect(html).toContain("提审就绪检查");
    expect(html).toContain("3 项阻断");
    expect(html).toContain("公开公司资料不完整");
    expect(html).toContain("预算报价版本未启用");
    expect(html).toContain("短信验证码服务不可用");
    expect(html).toContain("宿主尚未完成真机验收");
    expect(html).toContain("公开项目");
    expect(html).toContain("5");
    expect(html).toContain('href="/settings/service-provider"');
    expect(html).toContain('href="/douyin-miniapp/budget"');
    expect(JSON.stringify(html)).not.toMatch(/13800138000|token|secret/i);
  });

  test("renders a ready state with the last checked timestamp", () => {
    const html = renderToStaticMarkup(
      createElement(ReleaseReadinessPanel, {
        readiness: {
          ...readiness,
          ready: true,
          blockers: [],
          warnings: [],
        },
      }),
    );

    expect(html).toContain("已达到提审条件");
    expect(html).toContain("2026");
    expect(html).not.toContain("3 项阻断");
  });
});
