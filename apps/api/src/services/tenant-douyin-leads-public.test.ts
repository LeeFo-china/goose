import { describe, expect, test } from "bun:test";

import {
  serializePublicAppointment,
  serializePublicFollowUp,
  serializePublicLead,
} from "./tenant-douyin-leads-public";

const TENANT_ID = "11111111-1111-4111-8111-111111111111";
const LEAD_ID = "22222222-2222-4222-8222-222222222222";
const APPOINTMENT_ID = "33333333-3333-4333-8333-333333333333";
const EMPLOYEE_ID = "55555555-5555-4555-8555-555555555555";
const CREATED_AT = "2026-08-21T08:00:00.000Z";

const appointment = {
  id: APPOINTMENT_ID, appointment_no: "DYLF-20260821-000001",
  tenant_id: TENANT_ID, marketing_lead_id: LEAD_ID, customer_id: null,
  assigned_employee_id: EMPLOYEE_ID, budget_estimate_id: null,
  preferred_visit_date: "2026-08-23", preferred_visit_period: "morning" as const,
  community: "晴天花园", status: "pending_confirmation" as const,
  confirmed_visit_at: null, created_at: CREATED_AT, updated_at: CREATED_AT,
  version: 1, source_snapshot: {
    request_ip: "10.0.0.1", future_secret: "never",
    attribution: { source_type: "short_video", entry_path: "pages/lead/index",
      scene: "023009", future_secret: "never" },
    demand: " 旧房翻新 ", budget_estimate: {
      estimate_no: "DYYS-20260821-000001", ai_status: "succeeded",
      result: { id: EMPLOYEE_ID, estimate_no: "DYYS-20260821-000001",
        minimum_total: 100_000, maximum_total: 140_000, categories: [],
        calculation_basis: [], included_items: [], excluded_items: [],
        pricing_version: "2026-08", pricing_effective_from: CREATED_AT,
        pricing_effective_to: null, disclaimer: "仅供参考", ai_status: "pending" },
      ai_analysis: { summary: "现场确认", allocation_advice: [],
        risk_factors: [], onsite_questions: [], future_secret: "never" },
    },
  },
};

describe("tenant Douyin lead public serializers", () => {
  test("projects exact lead, relation and list appointment fields", () => {
    const result = serializePublicLead({ bundle: {
      lead: { id: LEAD_ID, tenant_id: TENANT_ID,
        douyin_miniapp_installation_id: EMPLOYEE_ID, customer_id: EMPLOYEE_ID,
        assigned_employee_id: EMPLOYEE_ID, name: "李女士", phone: "13800138000",
        community: "晴天花园", lead_status: "new", created_at: CREATED_AT,
        followed_at: null, follow_remark: null, version: 1,
        form_data: { request_ip: "10.0.0.1", future_secret: "never" } },
      appointments: [{ ...appointment, budget_range: {
        minimum_total: 100_000, maximum_total: 140_000 } }],
      customer: { id: EMPLOYEE_ID, tenant_id: TENANT_ID, owner_id: EMPLOYEE_ID,
        name: "李女士", status: "potential" },
      assignee: { id: EMPLOYEE_ID, tenant_id: TENANT_ID, name: "王顾问",
        avatar: null, status: "active" },
    }, tenantId: TENANT_ID, phoneMasked: "138****8000", detail: false });
    expect(result).toEqual({ id: LEAD_ID, name: "李女士",
      phone_masked: "138****8000", community: "晴天花园", status: "new",
      version: 1, created_at: CREATED_AT, followed_at: null,
      follow_remark: null, customer: { name: "李女士", status: "potential" },
      assignee: { name: "王顾问", avatar: null, status: "active" },
      latest_appointment: { id: APPOINTMENT_ID,
        appointment_no: "DYLF-20260821-000001", preferred_visit_date: "2026-08-23",
        preferred_visit_period: "morning", community: "晴天花园",
        status: "pending_confirmation", confirmed_visit_at: null,
        created_at: CREATED_AT, updated_at: CREATED_AT, version: 1,
        budget_range: { minimum_total: 100_000, maximum_total: 140_000 } } });
    expect(JSON.stringify(result)).not.toMatch(
      /phone\"|tenant_id|customer_id|employee_id|installation_id|form_data|source_snapshot|future_secret/,
    );
  });

  test("strictly projects appointment source and degrades invalid future JSON", () => {
    const valid = serializePublicAppointment(appointment, { includeSource: true });
    expect(valid).toMatchObject({ source: { demand: "旧房翻新",
      attribution: {}, budget: { estimate_no: "DYYS-20260821-000001",
        minimum_total: 100_000, maximum_total: 140_000, ai_status: "succeeded" },
      ai: null } });
    expect(JSON.stringify(valid)).not.toMatch(/request_ip|future_secret|source_snapshot/);
    expect(serializePublicAppointment({ ...appointment, source_snapshot: {
      attribution: { source_type: "future" }, demand: 42,
      budget_estimate: { estimate_no: "bad", result: {
        minimum_total: 200, maximum_total: 100 } }, future_secret: "never",
    } }, { includeSource: true })).toMatchObject({ source: {
      attribution: {}, demand: null, budget: null, ai: null,
    } });
  });

  test("projects detail source at the service boundary without raw snapshots", () => {
    const result = serializePublicLead({ bundle: {
      lead: { id: LEAD_ID, tenant_id: TENANT_ID,
        douyin_miniapp_installation_id: EMPLOYEE_ID, customer_id: null,
        assigned_employee_id: null, name: "李女士", phone: "13800138000",
        community: "晴天花园", lead_status: "new", created_at: CREATED_AT,
        followed_at: null, follow_remark: null, version: 1,
        form_data: { request_ip: "10.0.0.1", future_secret: "never" } },
      appointments: [{ ...appointment, customer_id: null,
        assigned_employee_id: null }], customer: null, assignee: null,
    }, tenantId: TENANT_ID, phoneMasked: "138****8000", detail: true });
    expect(result).toMatchObject({ id: LEAD_ID, demand: "旧房翻新",
      attribution: {}, budget: { estimate_no: "DYYS-20260821-000001",
        minimum_total: 100_000, maximum_total: 140_000,
        ai_status: "succeeded" }, ai: null,
      latest_appointment: { id: APPOINTMENT_ID,
        source: { demand: "旧房翻新" } } });
    expect(JSON.stringify(result)).not.toMatch(
      /phone\"|installation_id|form_data|source_snapshot|tenant_id|customer_id|employee_id|request_ip|future_secret/,
    );
  });

  test("projects follow-up without relation or internal ids", () => {
    expect(serializePublicFollowUp({ followUp: { id: EMPLOYEE_ID,
      tenant_id: TENANT_ID, marketing_lead_id: LEAD_ID,
      douyin_measurement_appointment_id: APPOINTMENT_ID, employee_id: EMPLOYEE_ID,
      follow_up_type: "phone", summary: "已联系", result: "待量房",
      next_follow_up_at: null, created_at: CREATED_AT }, employee: {
      id: EMPLOYEE_ID, tenant_id: TENANT_ID, name: "王顾问", avatar: null,
      status: "active" } }, TENANT_ID, LEAD_ID)).toEqual({
      summary: "已联系", result: "待量房", follow_up_type: "phone",
      next_follow_up_at: null, created_at: CREATED_AT, employee_name: "王顾问",
    });
  });
});
