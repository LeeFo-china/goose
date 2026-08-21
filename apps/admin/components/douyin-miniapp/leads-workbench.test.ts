import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { tenantNavGroups } from "@/components/layout/menu-config";
import { normalizeAssigneeCandidatePage } from "./leads-assignee-options";
import * as workbenchModule from "./leads-workbench";
import {
  LeadActionForm,
  LeadDetailPanel,
  LeadsWorkbench,
  createActionSubmissionCoordinator,
  type LeadDetail,
  type LeadPage,
} from "./leads-workbench";
import {
  DEFAULT_LEAD_FILTERS,
  buildLeadApiQuery,
  buildLeadCommand,
  buildLeadHref,
  createLeadIdempotencyIntent,
  createLatestLeadListTarget,
  createLeadRequestAuthority,
  createSubmissionGate,
  getAllowedLeadActions,
  getLeadViewState,
  normalizeLeadPage,
  parseLeadFilters,
  projectLeadSourceSnapshot,
} from "./leads-workbench-logic";

const LEAD_ID = "22222222-2222-4222-8222-222222222222";
const APPOINTMENT_ID = "33333333-3333-4333-8333-333333333333";
const EMPLOYEE_ID = "55555555-5555-4555-8555-555555555555";

const page: LeadPage = {
  list: [{
    id: LEAD_ID,
    name: "李女士",
    phone_masked: "138****8000",
    community: "晴天花园",
    status: "new",
    version: 3,
    created_at: "2026-08-21T08:00:00.000Z",
    followed_at: null,
    follow_remark: null,
    customer: { name: "李女士", status: "potential" },
    assignee: { name: "王顾问", avatar: null, status: "active" },
    latest_appointment: {
      id: APPOINTMENT_ID,
      appointment_no: "DYLF-20260821-000001",
      budget_range: { minimum_total: 100_000, maximum_total: 140_000 },
      preferred_visit_date: "2026-08-23",
      preferred_visit_period: "morning",
      community: "晴天花园",
      status: "pending_confirmation",
      confirmed_visit_at: null,
      created_at: "2026-08-21T08:00:00.000Z",
      updated_at: "2026-08-21T08:00:00.000Z",
      version: 1,
    },
  }],
  pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
};

const detail: LeadDetail = {
  ...page.list[0]!,
  demand: "旧房翻新，希望增加收纳",
  attribution: { source_type: "short_video", scene: "023009",
    entry_path: "pages/case-detail/index" },
  budget: { estimate_no: "DYYS-20260821-000001", minimum_total: 100_000,
    maximum_total: 140_000, ai_status: "succeeded" },
  ai: { summary: "优先核实拆改范围", allocation_advice: ["先确认水电"],
    risk_factors: ["旧房墙体待核验"], onsite_questions: ["是否调整厨房布局"] },
  appointments: { list: [page.list[0]!.latest_appointment!],
    pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
    truncated: false },
  follow_ups: { list: [], pagination: {
    page: 1, pageSize: 20, total: 0, totalPages: 0,
  } },
};

describe("tenant Douyin lead workbench behavior", () => {
  test("restores bounded URL filters and keeps the default page contract", () => {
    expect(parseLeadFilters(new URLSearchParams())).toEqual(DEFAULT_LEAD_FILTERS);
    expect(parseLeadFilters(new URLSearchParams(
      `page=2&pageSize=500&status=contacted&assigneeId=${EMPLOYEE_ID}&dateFrom=2026-08-01&dateTo=2026-08-22&keyword=%E6%99%B4%E5%A4%A9`,
    ))).toEqual({
      page: 2,
      pageSize: 100,
      status: "contacted",
      assigneeId: EMPLOYEE_ID,
      dateFrom: "2026-08-01",
      dateTo: "2026-08-22",
      keyword: "晴天",
    });
    expect(buildLeadHref({ ...DEFAULT_LEAD_FILTERS, status: "new" }))
      .toBe("/douyin-miniapp/leads?pageSize=20&status=new");
    expect(buildLeadApiQuery(DEFAULT_LEAD_FILTERS)).toBe("page=1&pageSize=20");
    const reversed = { ...DEFAULT_LEAD_FILTERS,
      dateFrom: "2026-08-22", dateTo: "2026-08-01" };
    expect(parseLeadFilters(new URLSearchParams(
      "dateFrom=2026-08-22&dateTo=2026-08-01",
    ))).toMatchObject({ dateFrom: "2026-08-01", dateTo: "2026-08-22" });
    expect(buildLeadApiQuery(reversed)).toContain(
      "dateFrom=2026-08-01&dateTo=2026-08-22",
    );
  });

  test("strictly projects the backend DTO and removes raw phone and relation IDs", () => {
    const rawLead = {
      id: LEAD_ID, name: "李女士", phone: "13800138000",
      phone_masked: "138****8000", can_view_phone: true,
      can_call_phone: false, can_copy_phone: false, community: "晴天花园",
      status: "new", version: 3, created_at: "2026-08-21T08:00:00.000Z",
      followed_at: null, follow_remark: null,
      customer: { id: "44444444-4444-4444-8444-444444444444",
        tenant_id: "11111111-1111-4111-8111-111111111111", name: "李女士",
        status: "potential", owner_id: EMPLOYEE_ID },
      assignee: { id: EMPLOYEE_ID,
        tenant_id: "11111111-1111-4111-8111-111111111111", name: "王顾问",
        avatar: null, status: "active" },
      latest_appointment: {
        id: APPOINTMENT_ID, appointment_no: "DYLF-20260821-000001",
        tenant_id: "11111111-1111-4111-8111-111111111111",
        marketing_lead_id: LEAD_ID,
        customer_id: "44444444-4444-4444-8444-444444444444",
        assigned_employee_id: EMPLOYEE_ID,
        budget_estimate_id: "44444444-4444-4444-8444-444444444444",
        budget_range: { minimum_total: 100_000, maximum_total: 140_000 },
        preferred_visit_date: "2026-08-23", preferred_visit_period: "morning",
        community: "晴天花园", status: "pending_confirmation",
        confirmed_visit_at: null, created_at: "2026-08-21T08:00:00.000Z",
        updated_at: "2026-08-21T08:00:00.000Z", version: 1,
      },
    };
    const normalized = normalizeLeadPage({ list: [rawLead], pagination: {
      page: 1, pageSize: 20, total: 1, totalPages: 1,
    } }, { page: 1, pageSize: 20 });
    expect(normalized?.list[0]).toEqual(page.list[0]);
    expect(normalized?.list[0]).not.toHaveProperty("phone");
    expect(normalized?.list[0]?.latest_appointment).toMatchObject({
      budget_range: { minimum_total: 100_000, maximum_total: 140_000 },
    });
    expect(normalized?.list[0]?.latest_appointment).not.toHaveProperty("budget_estimate_id");
    expect(normalizeLeadPage({ list: [{ ...rawLead, source_snapshot: {} }],
      pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 } },
    { page: 1, pageSize: 20 })).toBeNull();
  });

  test("whitelists source snapshot budget and AI fields without forwarding unknown data", () => {
    const projection = projectLeadSourceSnapshot({
      privacy_policy_version: "2026-08-01",
      consented_at: "2026-08-21T08:00:00.000Z",
      attribution: {
        source_type: "short_video", entry_path: "pages/case-detail/index",
        scene: "023009", campaign_code: "summer-2026", content_id: "video-12",
        subject_hash: "must-not-leak",
      },
      demand: "旧房翻新，希望增加收纳",
      budget_estimate: {
        estimate_no: "DYYS-20260821-000001",
        result: { minimum_total: 100_000, maximum_total: 140_000,
          pricing_version_id: "must-not-leak" },
        ai_status: "succeeded",
        ai_analysis: {
          summary: "预算主要集中在基础施工和收纳。",
          allocation_advice: ["优先确认水电点位"],
          risk_factors: ["旧房拆改范围待现场核实"],
          onsite_questions: ["确认承重墙与管线位置"],
        },
        raw_response: "must-not-leak",
        request_ip: "must-not-leak",
      },
      internal_id: LEAD_ID,
    });
    expect(projection).toEqual({
      attribution: {
        source_type: "short_video", entry_path: "pages/case-detail/index",
        scene: "023009", campaign_code: "summer-2026", content_id: "video-12",
      },
      demand: "旧房翻新，希望增加收纳",
      budget: { estimate_no: "DYYS-20260821-000001",
        minimum_total: 100_000, maximum_total: 140_000, ai_status: "succeeded" },
      ai: { summary: "预算主要集中在基础施工和收纳。",
        allocation_advice: ["优先确认水电点位"],
        risk_factors: ["旧房拆改范围待现场核实"],
        onsite_questions: ["确认承重墙与管线位置"] },
    });
    expect(JSON.stringify(projection)).not.toMatch(/raw_response|subject_hash|request_ip|internal_id|pricing_version_id/);
    expect(projectLeadSourceSnapshot({ budget_estimate: {
      estimate_no: "bad", result: { minimum_total: 200, maximum_total: 100 },
      ai_status: "succeeded", ai_analysis: {},
    } })).toMatchObject({ budget: null, ai: null });
    expect(projectLeadSourceSnapshot({ budget_estimate: {
      estimate_no: "DYYS-20260821-000001",
      result: { minimum_total: 100, maximum_total: 200 },
      ai_status: "succeeded", ai_analysis: {
        summary: "有效摘要", allocation_advice: [], risk_factors: [],
        onsite_questions: [], raw_response: "unknown",
      },
    } })).toMatchObject({ budget: {
      estimate_no: "DYYS-20260821-000001", minimum_total: 100,
      maximum_total: 200, ai_status: "succeeded",
    }, ai: null });
  });

  test("only the latest list or detail request may update state", () => {
    const authority = createLeadRequestAuthority();
    const first = authority.begin();
    const second = authority.begin();
    expect(first.controller.signal.aborted).toBe(true);
    expect(authority.isCurrent(first)).toBe(false);
    expect(authority.isCurrent(second)).toBe(true);
    authority.invalidate();
    expect(second.controller.signal.aborted).toBe(true);
  });

  test("keeps filter options, assignment candidates and mutations independent", () => {
    const filterOptions = createLeadRequestAuthority();
    const assignmentCandidates = createLeadRequestAuthority();
    const mutation = createLeadRequestAuthority();
    const firstFilter = filterOptions.begin();
    const assignment = assignmentCandidates.begin();
    const command = mutation.begin();
    const latestFilter = filterOptions.begin();
    expect(firstFilter.controller.signal.aborted).toBe(true);
    expect(filterOptions.isCurrent(latestFilter)).toBe(true);
    expect(assignment.controller.signal.aborted).toBe(false);
    expect(command.controller.signal.aborted).toBe(false);
  });

  test("hides unauthorized actions and never makes existing conversion depend on customer.create", () => {
    expect(getAllowedLeadActions([])).toEqual([]);
    expect(getAllowedLeadActions(["douyin_lead.assign", "douyin_lead.follow_up"]))
      .toEqual(["assign", "follow_up"]);
    expect(getAllowedLeadActions(["douyin_lead.convert"]))
      .toEqual(["convert", "mark_invalid"]);
    expect(getAllowedLeadActions(["douyin_lead.convert", "customer.create"]))
      .toEqual(["convert", "mark_invalid"]);
  });

  test("accepts only bounded strict assignee candidates", () => {
    expect(normalizeAssigneeCandidatePage({
      list: [{ id: EMPLOYEE_ID, name: "王顾问" }],
      pagination: { page: 1, pageSize: 100, total: 101, totalPages: 2 },
    })).toEqual({
      list: [{ value: EMPLOYEE_ID, label: "王顾问" }],
      pagination: { page: 1, pageSize: 100, total: 101, totalPages: 2 },
    });
    expect(normalizeAssigneeCandidatePage({
      list: [{ id: EMPLOYEE_ID, name: "王顾问", tenant_id: LEAD_ID }],
      pagination: { page: 1, pageSize: 100, total: 1, totalPages: 1 },
    })).toBeNull();
    const selectedOutsideSearch = {
      list: [{ id: EMPLOYEE_ID, name: "第 101 位负责人" }],
      pagination: { page: 1, pageSize: 100, total: 0, totalPages: 0 },
    };
    const normalizeFilter = (workbenchModule as unknown as Record<string, unknown>)
      .normalizeAssigneeFilterOptionPage;
    expect(typeof normalizeFilter).toBe("function");
    if (typeof normalizeFilter !== "function") return;
    expect(normalizeFilter(selectedOutsideSearch, EMPLOYEE_ID)?.list)
      .toEqual([{ value: EMPLOYEE_ID, label: "第 101 位负责人" }]);
    expect(normalizeAssigneeCandidatePage(selectedOutsideSearch)).toBeNull();
  });

  test("targets separate read filter and assignment option endpoints", () => {
    const builder = (workbenchModule as unknown as Record<string, unknown>)
      .buildAssigneeOptionsPath;
    expect(typeof builder).toBe("function");
    if (typeof builder !== "function") return;
    expect(builder("filter", " 王顾问 ", EMPLOYEE_ID)).toBe(
      `/tenant/douyin-miniapp/leads/assignee-filter-options?page=1&pageSize=100&keyword=%E7%8E%8B%E9%A1%BE%E9%97%AE&includeEmployeeId=${EMPLOYEE_ID}`,
    );
    expect(builder("assign", "")).toBe(
      "/tenant/douyin-miniapp/leads/assignee-candidates?page=1&pageSize=100",
    );
  });

  test("retains filter options and the selected employee after failed searches", () => {
    const transition = (workbenchModule as unknown as Record<string, unknown>)
      .transitionAssigneeFilterOptions;
    expect(typeof transition).toBe("function");
    if (typeof transition !== "function") return;
    const current = { options: [{ value: EMPLOYEE_ID, label: "第 101 位负责人" }],
      hasMore: true };
    expect(transition(current, { type: "failed" })).toBe(current);
    expect(transition(current, { type: "invalid" })).toBe(current);
    expect(transition(current, { type: "success", page: {
      list: [{ value: LEAD_ID, label: "新负责人" }],
      pagination: { page: 1, pageSize: 100, total: 1, totalPages: 1 },
    } })).toEqual({ options: [{ value: LEAD_ID, label: "新负责人" }], hasMore: false });
  });

  test("renders the restored URL assignee as a selectable filter option", () => {
    const html = renderToStaticMarkup(createElement(LeadsWorkbench, {
      initialData: page, initialError: null,
      initialFilters: { ...DEFAULT_LEAD_FILTERS, assigneeId: EMPLOYEE_ID },
      initialFilterAssigneeOptions: {
        options: [{ value: EMPLOYEE_ID, label: "第 101 位负责人" }], hasMore: true,
      },
      permissions: ["douyin_lead.read"],
    }));
    expect(html).toContain("第 101 位负责人");
    expect(html).toContain('role="combobox"');
    expect(html).toContain('id="douyin-lead-assignee-filter"');
  });

  test("blocks reversed interactive dates before list navigation", () => {
    const validator = (workbenchModule as unknown as Record<string, unknown>)
      .validateLeadFilterDraft;
    expect(typeof validator).toBe("function");
    if (typeof validator !== "function") return;
    expect(validator({ ...DEFAULT_LEAD_FILTERS,
      dateFrom: "2026-08-22", dateTo: "2026-08-01" }))
      .toBe("结束日期不能早于开始日期");
    expect(validator(DEFAULT_LEAD_FILTERS)).toBeNull();
  });

  test("serializes strict command payloads without tenant, customer or internal fields", () => {
    expect(buildLeadCommand("assign", {
      leadVersion: 3,
      idempotencyKey: "66666666-6666-4666-8666-666666666666",
      assigneeId: EMPLOYEE_ID,
    })).toEqual({
      assigned_employee_id: EMPLOYEE_ID,
      expected_lead_version: 3,
      idempotency_key: "66666666-6666-4666-8666-666666666666",
    });
    expect(buildLeadCommand("convert", {
      leadVersion: 3,
      idempotencyKey: "66666666-6666-4666-8666-666666666666",
    })).toEqual({
      expected_lead_version: 3,
      idempotency_key: "66666666-6666-4666-8666-666666666666",
    });
  });

  test("prevents duplicate submission synchronously", () => {
    const gate = createSubmissionGate();
    expect(gate.enter()).toBe(true);
    expect(gate.enter()).toBe(false);
    gate.leave();
    expect(gate.enter()).toBe(true);
  });

  test("switches to refresh-only after the command is accepted", () => {
    const coordinator = createActionSubmissionCoordinator();
    expect(coordinator.nextStep()).toBe("mutate");
    coordinator.acceptCommand();
    expect(coordinator.nextStep()).toBe("refresh");
    coordinator.reset();
    expect(coordinator.nextStep()).toBe("mutate");
  });

  test("reuses an action key after failure and rotates it when the payload changes", () => {
    const keys = [
      "66666666-6666-4666-8666-666666666666",
      "77777777-7777-4777-8777-777777777777",
      "88888888-8888-4888-8888-888888888888",
    ];
    const intent = createLeadIdempotencyIntent(() => keys.shift() ?? "unexpected");
    const original = { leadId: LEAD_ID, leadVersion: 3, action: "follow_up" as const,
      values: { appointmentId: APPOINTMENT_ID, followUpType: "phone",
        summary: "已电话联系", result: "周末到店" } };

    const firstAttempt = intent.keyFor(original);
    expect(intent.keyFor(original)).toBe(firstAttempt);
    expect(intent.keyFor({ ...original,
      values: { ...original.values, result: "改为周日下午量房" },
    })).not.toBe(firstAttempt);
    intent.complete();
    expect(intent.keyFor(original)).toBe("88888888-8888-4888-8888-888888888888");
  });

  test("keeps the latest URL target available when a list request fails", () => {
    const target = createLatestLeadListTarget(DEFAULT_LEAD_FILTERS);
    const latest = { ...DEFAULT_LEAD_FILTERS, page: 3, status: "contacted" as const,
      keyword: "晴天" };
    target.update(latest);
    expect(target.current()).toEqual(latest);
    expect(target.current()).not.toBe(latest);
  });

  test("separates loading, error, empty and ready states", () => {
    expect(getLeadViewState({ loading: true, error: null, count: 0 })).toBe("loading");
    expect(getLeadViewState({ loading: false, error: "失败", count: 0 })).toBe("error");
    expect(getLeadViewState({ loading: false, error: null, count: 0 })).toBe("empty");
    expect(getLeadViewState({ loading: false, error: null, count: 1 })).toBe("ready");
  });

  test("renders a scannable row with masked phone and no internal identifiers", () => {
    const html = renderToStaticMarkup(createElement(LeadsWorkbench, {
      initialData: page,
      initialError: null,
      initialFilters: DEFAULT_LEAD_FILTERS,
      permissions: ["douyin_lead.read"],
    }));
    for (const text of [
      "李女士", "138****8000", "晴天花园", "2026-08-23 上午",
      "¥100,000 至 ¥140,000", "新线索", "王顾问", "已关联客户",
      "搜索负责人筛选", "暂无负责人筛选项",
    ]) expect(html).toContain(text);
    expect(html).toContain("flex-col items-stretch");
    expect(html).toContain("md:flex-row");
    expect(html).not.toContain(LEAD_ID);
    expect(html).not.toContain(APPOINTMENT_ID);
    expect(html).not.toContain("13800138000");
  });

  test("renders appointment, attribution, deterministic budget and strict AI detail", () => {
    const html = renderToStaticMarkup(createElement(LeadDetailPanel, {
      detail, actions: [], busy: false, followUpLoading: false,
      onAction: () => undefined, onFollowUpPage: () => undefined,
    }));
    for (const text of [
      "DYLF-20260821-000001", "2026-08-23 上午", "待确认",
      "短视频", "¥100,000 至 ¥140,000", "优先核实拆改范围",
      "暂无跟进记录",
    ]) expect(html).toContain(text);
    expect(html).not.toContain(LEAD_ID);
    expect(html).not.toContain(APPOINTMENT_ID);
  });

  test("uses stable accessible field relationships for invalid follow-up input", () => {
    const html = renderToStaticMarkup(createElement(LeadActionForm, {
      action: "follow_up",
      appointments: [{ value: APPOINTMENT_ID, label: "2026-08-23 上午" }],
      assigneeOptions: [],
      values: { appointmentId: APPOINTMENT_ID, followUpType: "phone", summary: "", result: "" },
      errors: { summary: "请填写跟进摘要" },
      disabled: false,
      onChange: () => undefined,
    }));
    expect(html).toContain('id="douyin-lead-follow-summary"');
    expect(html).toContain('aria-describedby="douyin-lead-follow-summary-error"');
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('id="douyin-lead-follow-summary-error"');
  });

  test("renders explicit assignee loading, error and empty states", () => {
    const base = { action: "assign" as const, appointments: [], assigneeOptions: [],
      values: { assigneeId: "" }, errors: {}, disabled: false,
      onChange: () => undefined };
    const loading = renderToStaticMarkup(createElement(LeadActionForm, {
      ...base, assigneeLoading: true,
    }));
    const error = renderToStaticMarkup(createElement(LeadActionForm, {
      ...base, assigneeError: "负责人候选加载失败，请重试",
    }));
    const empty = renderToStaticMarkup(createElement(LeadActionForm, base));
    expect(loading).toContain("正在加载负责人候选");
    expect(error).toContain("重试负责人候选");
    expect(empty).toContain("暂无可分配负责人");
  });

  test("registers the permission-gated lead route beside the Douyin workspace", () => {
    const items = tenantNavGroups.find((group) => group.label === "抖音小程序")?.items ?? [];
    const workspaceIndex = items.findIndex((item) => item.href === "/douyin-miniapp/workspace");
    expect(items[workspaceIndex + 1]).toMatchObject({
      href: "/douyin-miniapp/leads",
      label: "抖音线索",
      permission: "douyin_lead.read",
    });
  });
});
