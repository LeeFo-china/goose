import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { LeadActionForm, LeadDetailPanel, type LeadDetail } from "./leads-workbench";
import {
  createLatestLeadPageTarget,
  formatLeadAppointmentOption,
  resetLeadPageActivity,
  resolveAppointmentSelection,
  transitionLeadPageState,
} from "./leads-workbench-paging";
import { createLeadRequestAuthority, normalizeAppointmentPage } from
  "./leads-workbench-logic";

const LEAD_ID = "22222222-2222-4222-8222-222222222222";
const APPOINTMENT_A = "33333333-3333-4333-8333-333333333331";
const APPOINTMENT_B = "33333333-3333-4333-8333-333333333332";

function appointment(id: string, appointmentNo: string, community: string) {
  return {
    id, appointment_no: appointmentNo, preferred_visit_date: "2026-08-23",
    preferred_visit_period: "morning" as const, community,
    status: "pending_confirmation" as const, confirmed_visit_at: null,
    created_at: "2026-08-21T08:00:00.000Z",
    updated_at: "2026-08-21T08:00:00.000Z", version: 1,
    source: { attribution: {}, demand: null, budget: null, ai: null },
  };
}
const first = appointment(APPOINTMENT_A, "DYLF-20260821-000001", "晴天花园");
const second = appointment(APPOINTMENT_B, "DYLF-20260821-000002", "江湾府");
const pagination = { page: 1, pageSize: 20, total: 21, totalPages: 2 };

describe("lead appointment and follow-up paging", () => {
  test("strictly accepts safe appointment pages and rejects internal fields", () => {
    expect(normalizeAppointmentPage({ list: [first], pagination }, {
      page: 1, pageSize: 20,
    })).toEqual({ list: [first], pagination });
    for (const field of ["tenant_id", "marketing_lead_id", "customer_id",
      "assigned_employee_id", "budget_estimate_id", "source_snapshot"]) {
      expect(normalizeAppointmentPage({ list: [{ ...first, [field]: LEAD_ID }], pagination },
        { page: 1, pageSize: 20 })).toBeNull();
    }
  });

  test("makes same-slot appointments distinguishable by number, community and status", () => {
    expect(formatLeadAppointmentOption(first)).toBe(
      "DYLF-20260821-000001 · 2026-08-23 上午 · 晴天花园 · 待确认",
    );
    expect(formatLeadAppointmentOption(second)).not.toBe(formatLeadAppointmentOption(first));
  });

  test("keeps latest retry targets independent for appointment and follow-up pages", () => {
    const appointments = createLatestLeadPageTarget({ leadId: LEAD_ID, page: 1, pageSize: 20 });
    const followUps = createLatestLeadPageTarget({ leadId: LEAD_ID, page: 1, pageSize: 20 });
    appointments.update({ leadId: LEAD_ID, page: 2, pageSize: 20 });
    expect(appointments.current().page).toBe(2);
    expect(followUps.current().page).toBe(1);
    expect(appointments.current()).not.toBe(appointments.current());
  });

  test("ignores late requests by keeping appointment and follow-up authorities separate", () => {
    const appointments = createLeadRequestAuthority();
    const followUps = createLeadRequestAuthority();
    const stale = appointments.begin();
    const followUp = followUps.begin();
    const latest = appointments.begin();
    expect(appointments.isCurrent(stale)).toBe(false);
    expect(appointments.isCurrent(latest)).toBe(true);
    expect(followUps.isCurrent(followUp)).toBe(true);
  });

  test("preserves current data on page failure and clears error on recovery", () => {
    const current = { data: { list: [first], pagination }, error: null };
    const failed = transitionLeadPageState(current, {
      type: "failed", message: "预约加载失败，请重试",
    });
    expect(failed.data).toBe(current.data);
    expect(failed.error).toBe("预约加载失败，请重试");
    const recoveredPage = { list: [second], pagination: { ...pagination, page: 2 } };
    expect(transitionLeadPageState(failed, { type: "success", data: recoveredPage }))
      .toEqual({ data: recoveredPage, error: null });
  });

  test("clears stale page loading and error when authoritative detail refresh starts", () => {
    expect(resetLeadPageActivity({ loading: true, error: "第 2 页加载失败" }))
      .toEqual({ loading: false, error: null });
  });

  test("keeps a selected appointment when present and otherwise selects first", () => {
    expect(resolveAppointmentSelection(APPOINTMENT_A, [first, second])).toBe(APPOINTMENT_A);
    expect(resolveAppointmentSelection(APPOINTMENT_A, [second])).toBe(APPOINTMENT_B);
    expect(resolveAppointmentSelection(APPOINTMENT_A, [])).toBe("");
  });

  test("renders reachable appointment pagination, retry and accessible state", () => {
    const html = renderToStaticMarkup(createElement(LeadActionForm, {
      action: "follow_up", appointments: [first, second], appointmentPagination: pagination,
      appointmentLoading: false, appointmentError: "预约加载失败，请重试",
      assigneeOptions: [], values: { appointmentId: APPOINTMENT_A,
        followUpType: "phone", summary: "", result: "" }, errors: {}, disabled: false,
      onAppointmentPage: () => undefined, onAppointmentRetry: () => undefined,
      onChange: () => undefined,
    }));
    expect(html).toContain("DYLF-20260821-000001");
    expect(html).toContain("晴天花园");
    expect(html).toContain("预约加载失败，请重试");
    expect(html).toContain("重试量房预约");
    expect(html).toContain("下一页预约");
    expect(html).toContain('aria-label="量房预约分页"');
  });

  test("renders explicit appointment loading and empty states", () => {
    const base = { action: "follow_up" as const, appointments: [], assigneeOptions: [],
      values: { appointmentId: "", followUpType: "phone", summary: "", result: "" },
      errors: {}, disabled: false, onChange: () => undefined };
    expect(renderToStaticMarkup(createElement(LeadActionForm, {
      ...base, appointmentLoading: true,
    }))).toContain("正在加载量房预约");
    expect(renderToStaticMarkup(createElement(LeadActionForm, base)))
      .toContain("暂无量房预约");
  });

  test("renders follow-up failure beside history without replacing detail", () => {
    const detail = {
      id: LEAD_ID, name: "李女士", phone_masked: "138****8000", community: "晴天花园",
      status: "contacted", version: 1, created_at: "2026-08-21T08:00:00.000Z",
      followed_at: null, follow_remark: null, customer: null, assignee: null,
      latest_appointment: first, demand: null, attribution: {}, budget: null, ai: null,
      appointments: { list: [first], pagination, truncated: true },
      follow_ups: { list: [], pagination: { ...pagination, total: 21 } },
    } satisfies LeadDetail;
    const html = renderToStaticMarkup(createElement(LeadDetailPanel, {
      detail, actions: [], busy: false, followUpLoading: false,
      followUpError: "第 2 页跟进记录加载失败，请重试",
      onAction: () => undefined, onFollowUpPage: () => undefined,
      onFollowUpRetry: () => undefined,
    }));
    expect(html).toContain("李女士");
    expect(html).toContain("第 2 页跟进记录加载失败，请重试");
    expect(html).toContain("重试跟进记录");
  });
});
