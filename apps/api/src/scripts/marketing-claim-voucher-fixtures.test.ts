import { describe, expect, test } from "bun:test";

import {
  DEV_MARKETING_FIXTURE_TENANT_ID,
  MARKETING_CLAIM_VOUCHER_FIXTURE_IDS,
  parseMarketingClaimVoucherFixtureArgs,
  sanitizeMarketingFixtureReport,
} from "./marketing-claim-voucher-fixtures";

describe("marketing claim voucher fixture guard", () => {
  test("必须显式指定 dev 目标和确认开关", () => {
    expect(() => parseMarketingClaimVoucherFixtureArgs([])).toThrow(
      "必须显式指定 --target=dev",
    );
    expect(() => parseMarketingClaimVoucherFixtureArgs([
      "--target=dev",
      "--mode=upsert",
    ])).toThrow("必须显式传入 --confirm-dev-fixtures");
  });

  test("拒绝 production 和未知目标", () => {
    expect(() => parseMarketingClaimVoucherFixtureArgs([
      "--target=production",
      "--confirm-dev-fixtures",
      "--mode=upsert",
    ])).toThrow("只允许 target=dev");
  });

  test.each(["upsert", "cleanup"] as const)(
    "解析 %s 模式和 dry-run",
    (mode) => {
      expect(parseMarketingClaimVoucherFixtureArgs([
        "--target=dev",
        "--confirm-dev-fixtures",
        `--mode=${mode}`,
        "--dry-run",
      ])).toEqual({
        target: "dev",
        tenantId: DEV_MARKETING_FIXTURE_TENANT_ID,
        mode,
        dryRun: true,
      });
    },
  );

  test("fixture ID 固定且互不重复", () => {
    const ids = Object.values(MARKETING_CLAIM_VOUCHER_FIXTURE_IDS);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => /^[0-9a-f-]{36}$/.test(id))).toBe(true);
  });

  test("报告移除登录与服务端凭证但保留联调入口", () => {
    expect(sanitizeMarketingFixtureReport({
      project_id: "project-1",
      voucher_path: "/employee/marketing-center/claim-vouchers/rcv_fixture",
      login_token: "login-secret",
      authorization: "Bearer secret",
      service_role_key: "service-secret",
      jwt_secret: "jwt-secret",
    })).toEqual({
      project_id: "project-1",
      voucher_path: "/employee/marketing-center/claim-vouchers/rcv_fixture",
    });
  });
});
