import { describe, expect, test } from "bun:test";

import {
  availableLifecycleActions,
  canEditSupplier,
  isSupplierReadOnly,
  isLatestResourceRequest,
  nextChildPage,
  normalizeSupplierPage,
  previousChildPage,
} from "./platform-supplier-rules";
import type { PlatformSupplierDetailRecord } from "./platform-supplier-types";

const supplier: PlatformSupplierDetailRecord = {
  id: "00000000-0000-4000-8000-000000000001",
  code: "SUP-001",
  name: "测试供应商",
  legal_name: "测试供应商有限公司",
  unified_social_credit_code: null,
  supplier_type: "manufacturer",
  onboarding_status: "approved",
  operational_status: "active",
  review_remark: null,
  reviewed_by_employee_id: null,
  reviewed_at: null,
  blacklisted_by_employee_id: null,
  blacklisted_at: null,
  blacklist_reason: null,
  created_by_employee_id: "00000000-0000-4000-8000-000000000002",
  updated_by_employee_id: "00000000-0000-4000-8000-000000000002",
  version: 1,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

describe("平台供应商交互规则", () => {
  test("黑名单供应商统一进入只读状态且没有生命周期动作", () => {
    const blacklisted = {
      ...supplier,
      operational_status: "blacklisted" as const,
    };

    expect(isSupplierReadOnly(blacklisted)).toBe(true);
    expect(canEditSupplier(blacklisted, true)).toBe(false);
    expect(
      availableLifecycleActions(blacklisted, {
        canManage: true,
        canReview: true,
        canBlacklist: true,
      }),
    ).toEqual([]);
  });

  test("只允许最后发出的子资源请求更新页面", () => {
    expect(isLatestResourceRequest(3, 3)).toBe(true);
    expect(isLatestResourceRequest(2, 3)).toBe(false);
  });

  test("子资源页码严格限制在有效边界内", () => {
    expect(previousChildPage(1)).toBe(1);
    expect(previousChildPage(3)).toBe(2);
    expect(nextChildPage(1, 3)).toBe(2);
    expect(nextChildPage(3, 3)).toBe(3);
    expect(nextChildPage(3, 0)).toBe(1);
  });

  test("列表页码只接受安全正整数", () => {
    expect(normalizeSupplierPage("2")).toBe(2);
    expect(normalizeSupplierPage("2junk")).toBe(1);
    expect(normalizeSupplierPage("0")).toBe(1);
    expect(normalizeSupplierPage("1e999")).toBe(1);
    expect(normalizeSupplierPage(undefined)).toBe(1);
  });
});
