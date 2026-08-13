import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  ASSIGNEE_SEARCH_DEBOUNCE_MS,
  buildTrialAssigneeCandidatesPath,
  clampTrialAssigneeSearchPage,
  createBoundTrialAssigneeCandidate,
  createHistoricalTrialAssigneeCandidate,
  formatTrialAssigneeCandidate,
  formatTrialAssigneeCandidateMeta,
  getTrialAssigneeEmptyMessage,
  getTrialAssigneeSelectionActions,
  getVisibleTrialAssigneeCandidates,
  parseTrialAssigneeCandidatePage,
  resolveTrialAssigneeCandidateTransition,
  resetTrialAssigneeSearchPage,
  selectTrialAssigneeCandidate,
} from "./platform-service-trial-assignee-options";

const ACTIVE_ID = "11111111-1111-4111-8111-111111111111";
const INCLUDED_ID = "22222222-2222-4222-8222-222222222222";

const activeCandidate = {
  id: ACTIVE_ID,
  name: "王运营",
  phone_masked: "138****8000",
  status: "active" as const,
  roles: [
    { code: "platform_admin", name: "平台管理员" },
    { code: "platform_support", name: null },
  ],
  selectable: true,
  historical: false,
};

describe("platform service trial assignee options", () => {
  test("builds the bounded candidate endpoint with remote-search inputs", () => {
    expect(buildTrialAssigneeCandidatesPath({
      page: 2,
      pageSize: 20,
      keyword: "  王 运营  ",
      includeEmployeeId: INCLUDED_ID,
    })).toBe(
      `/platform/billing/service-trials/assignee-candidates?page=2&pageSize=20&keyword=%E7%8E%8B+%E8%BF%90%E8%90%A5&includeEmployeeId=${INCLUDED_ID}`,
    );
    expect(buildTrialAssigneeCandidatesPath({ page: 1, pageSize: 20 }))
      .toBe("/platform/billing/service-trials/assignee-candidates?page=1&pageSize=20");
    expect(() => buildTrialAssigneeCandidatesPath({ page: 1, pageSize: 101 }))
      .toThrow("pageSize");
    expect(() => buildTrialAssigneeCandidatesPath({
      page: 1,
      pageSize: 20,
      keyword: "检".repeat(81),
    })).toThrow("keyword");
    expect(() => buildTrialAssigneeCandidatesPath({
      page: 1,
      pageSize: 20,
      includeEmployeeId: "not-an-employee-id",
    })).toThrow("includeEmployeeId");
  });

  test("resets pagination only when the normalized keyword changes", () => {
    expect(resetTrialAssigneeSearchPage({ page: 3, keyword: "王" }, " 李 "))
      .toEqual({ page: 1, keyword: "李" });
    expect(resetTrialAssigneeSearchPage({ page: 3, keyword: " 王 " }, "王"))
      .toEqual({ page: 3, keyword: "王" });
    const unchanged = { page: 3, keyword: "王" };
    expect(resetTrialAssigneeSearchPage(unchanged, "王")).toBe(unchanged);
  });

  test("clamps a stale page to the last available page so the request can recover", () => {
    expect(clampTrialAssigneeSearchPage(2, 1)).toBe(1);
    expect(clampTrialAssigneeSearchPage(4, 2)).toBe(2);
    expect(clampTrialAssigneeSearchPage(2, 0)).toBe(1);
    expect(clampTrialAssigneeSearchPage(2, 3)).toBe(2);
  });

  test("announces a request error only through the dedicated alert", () => {
    expect(getTrialAssigneeEmptyMessage({ loading: true, error: "" })).toBe("加载中...");
    expect(getTrialAssigneeEmptyMessage({ loading: false, error: "" }))
      .toBe("没有匹配的平台人员");
    expect(getTrialAssigneeEmptyMessage({ loading: false, error: "网络错误" })).toBeNull();
  });

  test("formats a readable name, masked phone and stable role label", () => {
    expect(formatTrialAssigneeCandidate(activeCandidate))
      .toBe("王运营 · 138****8000 · 平台管理员、platform_support");
    expect(formatTrialAssigneeCandidateMeta(activeCandidate))
      .toBe("138****8000 · 平台管理员、platform_support");
    expect(selectTrialAssigneeCandidate(activeCandidate)).toBe(ACTIVE_ID);
    expect(selectTrialAssigneeCandidate({ ...activeCandidate, selectable: false }))
      .toBeNull();
  });

  test("offers clear only for optional assign and filter modes", () => {
    expect(getTrialAssigneeSelectionActions({
      value: ACTIVE_ID,
      allowClear: true,
      required: false,
    })).toEqual(["clear"]);
    expect(getTrialAssigneeSelectionActions({
      value: ACTIVE_ID,
      allowClear: true,
      required: true,
    })).toEqual([]);
    expect(getTrialAssigneeSelectionActions({
      value: ACTIVE_ID,
      allowClear: false,
      required: false,
    })).toEqual([]);
  });

  test("hides stale non-selected candidates while the next result is pending or failed", () => {
    const selected = { ...activeCandidate, id: INCLUDED_ID, name: "李顾问" };
    const stale = [activeCandidate];

    expect(getVisibleTrialAssigneeCandidates({
      candidates: stale,
      value: INCLUDED_ID,
      selectedCandidate: selected,
      resultIsCurrent: false,
    })).toEqual([selected]);
    expect(getVisibleTrialAssigneeCandidates({
      candidates: stale,
      value: null,
      selectedCandidate: null,
      resultIsCurrent: false,
    })).toEqual([]);
    expect(getVisibleTrialAssigneeCandidates({
      candidates: stale,
      value: INCLUDED_ID,
      selectedCandidate: selected,
      resultIsCurrent: true,
    })).toEqual([activeCandidate, selected]);
  });

  test("creates a readable disabled historical value from a bound trial assignee", () => {
    const historical = createHistoricalTrialAssigneeCandidate({
      id: INCLUDED_ID,
      name: "李顾问",
      phone: "139****9000",
      status: "suspended",
    });

    expect(historical).toMatchObject({
      id: INCLUDED_ID,
      name: "李顾问",
      phone_masked: "139****9000",
      status: "suspended",
      selectable: false,
      historical: true,
    });
    expect(formatTrialAssigneeCandidate(historical))
      .toBe("李顾问 · 139****9000 · 历史负责人（已停用）");
    expect(formatTrialAssigneeCandidateMeta(historical))
      .toBe("139****9000 · 历史负责人（已停用）");
    expect(formatTrialAssigneeCandidate({ ...historical, name: null, phone_masked: null }))
      .toBe("未命名平台人员 · 历史负责人（已停用）");
    expect(formatTrialAssigneeCandidate(historical)).not.toContain(INCLUDED_ID);
  });

  test("shows an active bound relation as the current unconfirmed assignee", () => {
    const boundActive = createBoundTrialAssigneeCandidate({
      id: INCLUDED_ID,
      name: "王运营",
      phone: "138****8000",
      status: "active",
    });

    expect(boundActive).toMatchObject({
      status: "active",
      selectable: false,
      historical: false,
    });
    expect(formatTrialAssigneeCandidate(boundActive))
      .toBe("王运营 · 138****8000 · 当前负责人（资格待确认）");
    expect(formatTrialAssigneeCandidate(boundActive)).not.toContain(INCLUDED_ID);
  });

  test("reconciles reopen, prop changes, API confirmation and clear without stale candidates", () => {
    const boundActive = createBoundTrialAssigneeCandidate({
      id: ACTIVE_ID,
      name: "王运营",
      phone: "138****8000",
      status: "active",
    });
    const boundInactive = createBoundTrialAssigneeCandidate({
      id: INCLUDED_ID,
      name: "李顾问",
      phone: "139****9000",
      status: "suspended",
    });
    const confirmedActive = { ...activeCandidate, id: INCLUDED_ID };

    expect(resolveTrialAssigneeCandidateTransition({
      value: ACTIVE_ID,
      currentCandidate: null,
      initialCandidate: boundActive,
    })).toBe(boundActive);
    expect(resolveTrialAssigneeCandidateTransition({
      value: ACTIVE_ID,
      currentCandidate: boundActive,
      initialCandidate: boundActive,
      confirmedCandidate: activeCandidate,
    })).toBe(activeCandidate);
    expect(resolveTrialAssigneeCandidateTransition({
      value: INCLUDED_ID,
      currentCandidate: boundInactive,
      initialCandidate: boundInactive,
      confirmedCandidate: boundInactive,
    })).toBe(boundInactive);
    expect(resolveTrialAssigneeCandidateTransition({
      value: INCLUDED_ID,
      currentCandidate: boundInactive,
      initialCandidate: boundInactive,
      confirmedCandidate: confirmedActive,
    })).toBe(confirmedActive);
    expect(resolveTrialAssigneeCandidateTransition({
      value: ACTIVE_ID,
      currentCandidate: confirmedActive,
      initialCandidate: boundActive,
    })).toBe(boundActive);
    const suspendedSameId = createBoundTrialAssigneeCandidate({
      id: ACTIVE_ID,
      name: "王运营（已停用）",
      phone: "138****8001",
      status: "suspended",
    });
    expect(resolveTrialAssigneeCandidateTransition({
      value: ACTIVE_ID,
      currentCandidate: activeCandidate,
      initialCandidate: suspendedSameId,
    })).toBe(suspendedSameId);
    expect(resolveTrialAssigneeCandidateTransition({
      value: ACTIVE_ID,
      currentCandidate: activeCandidate,
      initialCandidate: suspendedSameId,
      confirmedCandidate: activeCandidate,
    })).toBe(activeCandidate);
    expect(resolveTrialAssigneeCandidateTransition({
      value: null,
      currentCandidate: activeCandidate,
      initialCandidate: boundActive,
    })).toBeNull();
  });

  test("strictly binds records and pagination from the response data", () => {
    expect(parseTrialAssigneeCandidatePage({
      list: [activeCandidate],
      pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
    })).toEqual({
      list: [activeCandidate],
      pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
    });

    for (const malformed of [
      {
        list: [{ ...activeCandidate, phone_masked: "13800138000" }],
        pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
      },
      {
        list: [{ ...activeCandidate, unexpected: true }],
        pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
      },
      {
        list: [activeCandidate],
        pagination: { page: 1, pageSize: 20, total: 1, totalPages: 2 },
      },
      {
        list: [activeCandidate],
        pagination: { page: 1, pageSize: 101, total: 1, totalPages: 1 },
      },
    ]) {
      expect(() => parseTrialAssigneeCandidatePage(malformed))
        .toThrow("平台跟进人候选数据格式错误");
    }
  });

  test("locks remote interaction states and cancellation into the component source", () => {
    const source = readFileSync(
      fileURLToPath(new URL("./platform-service-trial-assignee-combobox.tsx", import.meta.url)),
      "utf8",
    );

    expect(ASSIGNEE_SEARCH_DEBOUNCE_MS).toBe(250);
    expect(source).toContain("new AbortController()");
    expect(source).toContain("if (!open || disabled) return");
    expect(source).toContain("controller.abort()");
    expect(source).toContain("<Command label={ariaLabel}");
    expect(source).toContain('label={`${ariaLabel}候选列表`}');
    expect(source).toContain("onOpenChange={handleOpenChange}");
    expect(source).toContain("if (!nextOpen) setLoading(false)");
    expect(source).toContain("clampTrialAssigneeSearchPage(");
    expect(source).toContain("getTrialAssigneeEmptyMessage({ loading, error })");
    expect(source).not.toContain('error || "没有匹配的平台人员"');
    expect(source).toContain("ASSIGNEE_SEARCH_DEBOUNCE_MS");
    expect(source).toContain("onCandidateChange?.(selected)");
    expect(source).toContain("maxLength={80}");
    expect(source).toContain('"平台跟进人加载失败"');
    expect(source).toContain("上一页");
    expect(source).toContain("下一页");
    expect(source).toContain("取消当前分配");
    expect(source).toContain("shouldFilter={false}");
  });
});
