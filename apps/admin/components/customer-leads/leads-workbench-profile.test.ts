import { expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CUSTOMER_LEAD_PROFILE, DOUYIN_LEAD_PROFILE } from "./leads-workbench-profile";
import { LeadActionForm } from "./leads-workbench-panels";
import { LeadDetailPanel } from "./leads-workbench-panels";
import { buildLeadApiQuery, buildLeadHref, createLeadIdempotencyIntent, parseLeadFilters } from "./leads-workbench-logic";
import { resolveAppointmentSelection } from "./leads-workbench-paging";
import { validateAction } from "./leads-workbench-view";
import { tenantNavGroups } from "@/components/layout/menu-config";
import * as workbenchView from "./leads-workbench-view";

const id = "22222222-2222-4222-8222-222222222222";
const pagination = { page: 1, pageSize: 20, total: 1, totalPages: 1 };
const summary = { id, source: "douyin_miniapp", source_label: "抖音小程序",
  name: "李女士", phone_masked: "138****8000", community: null, status: "new",
  version: 1, assigned_employee_id: null, assignee: null, customer_id: null,
  can_view_customer: false, created_at: "2026-09-06T00:00:00.000Z",
  followed_at: null, follow_remark: null };

test("fixed profiles isolate permissions, URLs and strict DTOs", () => {
  expect(CUSTOMER_LEAD_PROFILE.apiPath).toBe("/tenant/customer-leads");
  expect(CUSTOMER_LEAD_PROFILE.permissions.read).toBe("customer_lead.read");
  expect(DOUYIN_LEAD_PROFILE.permissions.read).toBe("douyin_lead.read");
  expect(CUSTOMER_LEAD_PROFILE.normalizePage({ list: [summary], pagination }, pagination)?.list[0]?.source_label).toBe("抖音小程序");
  expect(DOUYIN_LEAD_PROFILE.normalizePage({ list: [summary], pagination }, pagination)).toBeNull();
  expect(CUSTOMER_LEAD_PROFILE.normalizePage({ list: [{ ...summary, customer_id: id }], pagination }, pagination)).toBeNull();
  expect(CUSTOMER_LEAD_PROFILE.normalizePage({ list: [{ ...summary, phone: "13800008000" }], pagination }, pagination)).toBeNull();
});

test("generic ordinary followup accepts a nullable appointment result, old profile rejects it", () => {
  const result = { action: "follow_up", result: "followed_up", lead_id: id,
    lead_version: 2, idempotent: false, follow_up_id: id, appointment_id: null,
    appointment_version: null, appointment_status: null };
  expect(CUSTOMER_LEAD_PROFILE.isCommandResult(result, "follow_up", id)).toBe(true);
  expect(DOUYIN_LEAD_PROFILE.isCommandResult(result, "follow_up", id)).toBe(false);
  const command = CUSTOMER_LEAD_PROFILE.buildCommand("follow_up", {
    leadVersion: 1, idempotencyKey: id, summary: "电话沟通", result: "继续跟进",
    appointmentStatus: "confirmed", confirmedVisitAt: "2026-09-07T09:00" });
  expect(command).toMatchObject({ appointment_id: null, appointment_status: null,
    confirmed_visit_at: null });
});

test("ordinary followup renders without appointment status controls", () => {
  const html = renderToStaticMarkup(createElement(LeadActionForm, {
    action: "follow_up", appointmentRequired: false, appointments: [],
    assigneeOptions: [], values: {}, errors: {}, disabled: false, onChange: () => {},
  }));
  expect(html).toContain("不关联预约");
  expect(html).not.toContain("预约状态（选填）");
  expect(html).toContain("跟进摘要");
});

test("customer filters preserve only integrated sources and exclude assignee for unassigned leads", () => {
  const filters = parseLeadFilters(new URLSearchParams(`source=douyin_miniapp&assignment=unassigned&assigneeId=${id}&pageSize=200`), "customer");
  expect(filters).toMatchObject({ source: "douyin_miniapp", assignment: "unassigned", assigneeId: "", pageSize: 100 });
  expect(buildLeadHref(filters, "customer")).toStartWith("/customer-leads?");
  expect(buildLeadApiQuery(filters, "customer")).toBe("page=1&pageSize=100&source=douyin_miniapp&assignment=unassigned");
  expect(buildLeadApiQuery(filters)).not.toContain("assignment");
  expect(parseLeadFilters(new URLSearchParams("source=unknown&assignment=unknown"), "customer")).toMatchObject({ source: "", assignment: "all" });
});

test("generic detail projects source context and enforces privacy and page bounds", () => {
  const raw = { ...summary, source_context: null, latest_appointment: null,
    appointments: { list: [], pagination: { ...pagination, total: 0, totalPages: 0 } },
    follow_ups: { list: [], pagination: { ...pagination, total: 0, totalPages: 0 } },
    actions: { assign: { enabled: false, reason: "无分配权限" },
      follow_up: { enabled: true, reason: null }, convert: { enabled: true, reason: null },
      mark_invalid: { enabled: true, reason: null } } };
  const detail = CUSTOMER_LEAD_PROFILE.normalizeDetail(raw);
  expect(detail).not.toBeNull();
  expect(DOUYIN_LEAD_PROFILE.normalizeDetail(raw)).toBeNull();
  expect(CUSTOMER_LEAD_PROFILE.normalizeDetail({ ...raw, appointments: { ...raw.appointments,
    pagination: { ...raw.appointments.pagination, page: 2 } } })).toBeNull();
  if (!detail) return;
  const hidden = renderToStaticMarkup(createElement(LeadDetailPanel, { detail,
    actions: ["assign"], busy: false, followUpLoading: false,
    onAction: () => {}, onFollowUpPage: () => {} }));
  expect(hidden).not.toContain(`/customers/${id}`);
  expect(hidden).toContain("无分配权限");
  expect(hidden).toContain("抖音小程序");
  const visible = CUSTOMER_LEAD_PROFILE.normalizeDetail({ ...raw, customer_id: id, can_view_customer: true });
  expect(visible).not.toBeNull();
  if (!visible) return;
  const visibleHtml = renderToStaticMarkup(createElement(LeadDetailPanel, { detail: visible,
    actions: [], busy: false, followUpLoading: false, onAction: () => {}, onFollowUpPage: () => {} }));
  expect(visibleHtml).toContain(`/customers/${id}`);
});

test("ordinary followups validate without an appointment while legacy followups require one", () => {
  const values = { summary: "电话沟通", result: "继续跟进" };
  expect(validateAction("follow_up", values, false)).toEqual({});
  expect(validateAction("follow_up", values)).toEqual({ appointmentId: "请选择量房预约" });
  expect(resolveAppointmentSelection("", [], false)).toBe("");
  expect(tenantNavGroups.flatMap((group) => group.items).find((item) => item.href === "/customer-leads")?.permission).toBe("customer_lead.read");
});

test("ordinary followup idempotency tracks the effective nullable command", () => {
  let serial = 0;
  const intent = createLeadIdempotencyIntent(() => `key-${++serial}`, CUSTOMER_LEAD_PROFILE.buildCommand);
  const base = { leadId: id, leadVersion: 1, action: "follow_up" as const,
    values: { summary: "电话沟通", result: "继续跟进" } };
  const first = intent.keyFor(base);
  expect(intent.keyFor({ ...base, values: { ...base.values,
    appointmentStatus: "confirmed", confirmedVisitAt: "2026-09-07T09:00" } })).toBe(first);
});

test("409 conflicts require reading fresh state before another confirmation", () => {
  const view = workbenchView as typeof workbenchView & {
    getLeadActionFailure?: (error: unknown) => { message: string; requiresRefresh: boolean };
  };
  expect(typeof view.getLeadActionFailure).toBe("function");
  if (!view.getLeadActionFailure) return;
  expect(view.getLeadActionFailure({ status: 409, code: "CUSTOMER_LEAD_VERSION_CONFLICT" }))
    .toEqual({ message: "线索已更新，请刷新后重试", requiresRefresh: true });
  expect(view.getLeadActionFailure({ status: 409, code: "DOUYIN_LEAD_VERSION_CONFLICT" }).requiresRefresh).toBe(true);
  expect(view.getLeadActionFailure(new TypeError("offline")).requiresRefresh).toBe(false);
});
