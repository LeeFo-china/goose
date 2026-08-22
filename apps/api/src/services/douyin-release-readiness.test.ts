import { describe, expect, test } from "bun:test";

import {
  evaluateDouyinReleaseReadiness,
  type DouyinReleaseReadinessFacts,
} from "./douyin-release-readiness";

const now = new Date("2026-08-20T10:00:00+08:00");
const tenantId = "11111111-1111-4111-8111-111111111111";

const passingFacts: DouyinReleaseReadinessFacts = {
  tenant: { id: tenantId, name: "固始晴天装饰工程有限公司", status: "active" },
  installation: {
    id: "22222222-2222-4222-8222-222222222222",
    authorizationStatus: "active",
    installationKind: "merchant",
  },
  profile: {
    status: "published",
    publicName: "固始晴天装饰",
    introduction: "固始晴天装饰专注本地住宅装修服务，提供设计、施工、材料协调和工地过程管理。公开案例均来自真实项目，预算测算仅用于前期沟通，最终方案以现场量房和业主确认范围为准。",
    publicPhone: "0376-1234567",
    logoUrl: "https://assets.example.com/logo.png",
  },
  activeServiceAreaCount: 2,
  projects: [
    project("11111111-1111-4111-8111-000000000001", "in_progress", 1),
    project("11111111-1111-4111-8111-000000000002", "in_progress", 1),
    project("11111111-1111-4111-8111-000000000003", "completed", 0),
    project("11111111-1111-4111-8111-000000000004", "completed", 0),
    project("11111111-1111-4111-8111-000000000005", "completed", 0),
    project("11111111-1111-4111-8111-000000000006", "completed", 0),
  ],
  activePricingVersion: {
    id: "33333333-3333-4333-8333-333333333333",
    versionNo: 3,
    disclaimer: "预算为初步估算，最终报价以现场量房和施工范围为准。",
  },
  smsReady: true,
  privacyVersion: "privacy-2026-08",
  requiredHosts: ["douyin", "douyin_lite", "toutiao"],
};
const firstProject = passingFacts.projects[0]!;
const activeTenant = passingFacts.tenant!;
const activeInstallation = passingFacts.installation!;

describe("evaluateDouyinReleaseReadiness", () => {
  test("returns a strict ready result for the passing release fixture", () => {
    const result = evaluateDouyinReleaseReadiness(passingFacts, now);

    expect(result.ready).toBe(true);
    expect(result.blockers).toEqual([]);
    expect(result.tenant).toEqual({
      id: tenantId,
      name: "固始晴天装饰工程有限公司",
    });
    expect(result.metrics).toMatchObject({
      published_project_count: 6,
      in_progress_project_count: 2,
      completed_project_count: 4,
      active_service_area_count: 2,
      active_pricing_version: 3,
      required_host_count: 3,
    });
    expect(JSON.stringify(result)).not.toMatch(/0376|1234567|address|phone/i);
  });

  test.each([
    ["profile missing", { profile: null }, "PUBLIC_PROFILE_MISSING"],
    ["too few projects", { projects: passingFacts.projects.slice(0, 5) }, "PUBLIC_PROJECT_COUNT_LOW"],
    ["test content", {
      projects: [
        { ...firstProject, title: "E2E 可删除" },
        ...passingFacts.projects.slice(1),
      ],
    }, "PUBLIC_PROJECT_TEST_CONTENT"],
    ["pricing missing", { activePricingVersion: null }, "BUDGET_PRICING_MISSING"],
    ["sms unavailable", { smsReady: false }, "SMS_UNAVAILABLE"],
  ] as const)("blocks %s", (_name, override, code) => {
    const result = evaluateDouyinReleaseReadiness({
      ...passingFacts,
      ...override,
    }, now);

    expect(result.ready).toBe(false);
    expect(result.blockers.map((item) => item.code)).toContain(code);
  });

  test("blocks incomplete projects, privacy risks, disabled hosts and invalid installation state", () => {
    const result = evaluateDouyinReleaseReadiness({
      ...passingFacts,
      tenant: { ...activeTenant, status: "suspended" },
      installation: { ...activeInstallation, authorizationStatus: "revoked" },
      requiredHosts: [],
      privacyVersion: "",
      projects: [
        {
          ...firstProject,
          description: "客户电话 13800138000，3号楼2单元1201室",
          imageCount: 1,
        },
        ...passingFacts.projects.slice(1),
      ],
    }, now);

    expect(result.blockers.map((item) => item.code)).toEqual(
      expect.arrayContaining([
        "TENANT_INACTIVE",
        "INSTALLATION_INACTIVE",
        "HOST_CONFIGURATION_MISSING",
        "PRIVACY_VERSION_MISSING",
        "PUBLIC_PROJECT_PRIVACY_RISK",
        "PUBLIC_PROJECT_COMPLETENESS_LOW",
      ]),
    );
  });
});

function project(
  id: string,
  phase: "in_progress" | "completed",
  publicLogCount: number,
) {
  return {
    id,
    phase,
    title: `${phase === "in_progress" ? "施工中" : "已完工"}真实案例${id.slice(-1)}`,
    description: "本项目公开展示户型、风格、施工阶段和预算区间，已去除客户身份与具体门牌信息。",
    area: 118,
    layout: "三室两厅",
    style: "现代简约",
    budgetBand: "20-30万",
    imageCount: 3,
    publicLogCount,
  } as const;
}
