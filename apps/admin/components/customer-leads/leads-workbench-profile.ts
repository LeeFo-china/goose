import { CustomerLeadCommandResultSchema } from "@gooes/domain";
import { buildLeadCommand, isLeadCommandResult, normalizeLeadPage, normalizeLeadDetail,
  normalizeAppointmentPage, normalizeFollowUpPage, type LeadAction,
  type LeadCommandInput } from "./leads-workbench-logic";
import { normalizeCustomerLeadPage, normalizeCustomerLeadDetail,
  normalizeCustomerAppointmentPage, normalizeCustomerFollowUpPage } from "./leads-workbench-customer-contract";

export const DOUYIN_LEAD_PROFILE = {
  id: "douyin", title: "抖音线索", description: "处理量房预约、负责人、跟进和客户转化。",
  apiPath: "/tenant/douyin-miniapp/leads", href: "/douyin-miniapp/leads",
  appointmentRequired: true, sourceFilters: false,
  permissions: { read: "douyin_lead.read", assign: "douyin_lead.assign",
    follow_up: "douyin_lead.follow_up", convert: "douyin_lead.convert", mark_invalid: "douyin_lead.convert" },
  normalizePage: normalizeLeadPage, normalizeDetail: normalizeLeadDetail,
  normalizeAppointments: normalizeAppointmentPage, normalizeFollowUps: normalizeFollowUpPage,
  buildCommand: buildLeadCommand, isCommandResult: isLeadCommandResult,
} as const;

export const CUSTOMER_LEAD_PROFILE = {
  id: "customer", title: "客户线索", description: "处理客户线索、分配负责人、记录跟进和客户转化。",
  apiPath: "/tenant/customer-leads", href: "/customer-leads",
  appointmentRequired: false, sourceFilters: true,
  permissions: { read: "customer_lead.read", assign: "customer_lead.assign",
    follow_up: "customer_lead.follow_up", convert: "customer_lead.convert", mark_invalid: "customer_lead.convert" },
  normalizePage: normalizeCustomerLeadPage, normalizeDetail: normalizeCustomerLeadDetail,
  normalizeAppointments: normalizeCustomerAppointmentPage, normalizeFollowUps: normalizeCustomerFollowUpPage,
  buildCommand(action: LeadAction, input: LeadCommandInput) {
    const command = buildLeadCommand(action, input);
    if (action !== "follow_up") return command;
    return { ...command, appointment_id: input.appointmentId || null,
      ...(!input.appointmentId ? { appointment_status: null, confirmed_visit_at: null } : {}) };
  },
  isCommandResult(raw: unknown, action: LeadAction, leadId: string): boolean {
    const parsed = CustomerLeadCommandResultSchema.safeParse(raw);
    return parsed.success && parsed.data.action === action && parsed.data.lead_id === leadId;
  },
} as const;

export type LeadWorkbenchProfileId = "douyin" | "customer";
export type LeadWorkbenchProfile = typeof DOUYIN_LEAD_PROFILE | typeof CUSTOMER_LEAD_PROFILE;
export function getLeadWorkbenchProfile(id: LeadWorkbenchProfileId): LeadWorkbenchProfile {
  return id === "customer" ? CUSTOMER_LEAD_PROFILE : DOUYIN_LEAD_PROFILE;
}
