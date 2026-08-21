import {
  DouyinBudgetAiAnalysisSchema,
  DouyinBudgetEstimateResultSchema,
} from "@gooes/domain";
import { z } from "zod";

import { Errors } from "@/errors/error-factory";
import type {
  TenantDouyinAppointmentDetailRow,
  TenantDouyinAppointmentRow,
} from "@/repositories/tenant-douyin-leads-contract";
import type {
  TenantDouyinFollowUpBundle,
  TenantDouyinLeadBundle,
} from "@/repositories/tenant-douyin-leads-hydration";

const AttributionSchema = z.strictObject({
  source_type: z.enum([
    "short_video", "live", "search", "profile", "share", "direct", "other",
  ]),
  entry_path: z.enum([
    "pages/home/index", "pages/company/index", "pages/privacy/index",
    "pages/cases/index", "pages/case-detail/index", "pages/sites/index",
    "pages/site-detail/index", "pages/lead/index", "pages/lead-success/index",
  ]),
  scene: z.string().regex(/^[0-9]{1,20}$/),
  campaign_code: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/).optional(),
  content_id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/).optional(),
});
const AiStatusSchema = z.enum(["pending", "succeeded", "failed", "skipped"]);
const SafeAmountSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const BudgetSchema = z.strictObject({
  estimate_no: z.string().regex(/^DYYS-\d{8}-\d{6}$/),
  minimum_total: SafeAmountSchema,
  maximum_total: SafeAmountSchema,
  ai_status: AiStatusSchema.nullable(),
}).refine((value) => value.minimum_total <= value.maximum_total);
export const TenantDouyinLeadPublicSourceSchema = z.strictObject({
  attribution: AttributionSchema.partial(),
  demand: z.string().trim().min(1).max(1_000).nullable(),
  budget: BudgetSchema.nullable(),
  ai: DouyinBudgetAiAnalysisSchema.nullable(),
});
const DateTimeSchema = z.iso.datetime({ offset: true });
const AppointmentShape = {
  id: z.uuid(), appointment_no: z.string().trim().min(1).max(40),
  preferred_visit_date: z.iso.date(),
  preferred_visit_period: z.enum(["morning", "afternoon", "evening"]),
  community: z.string().trim().min(1).max(80),
  status: z.enum([
    "pending_confirmation", "confirmed", "completed", "canceled", "invalid",
  ]),
  confirmed_visit_at: DateTimeSchema.nullable(), created_at: DateTimeSchema,
  updated_at: DateTimeSchema, version: z.number().int().min(1),
};
const BudgetRangeSchema = z.strictObject({ minimum_total: SafeAmountSchema,
  maximum_total: SafeAmountSchema }).refine((value) =>
  value.minimum_total <= value.maximum_total);
export const TenantDouyinLeadPublicListAppointmentSchema = z.strictObject({
  ...AppointmentShape, budget_range: BudgetRangeSchema.nullable(),
});
export const TenantDouyinLeadPublicDetailAppointmentSchema = z.strictObject({
  ...AppointmentShape, source: TenantDouyinLeadPublicSourceSchema,
});
const LeadShape = {
  id: z.uuid(), name: z.string().nullable(), phone_masked: z.string().nullable(),
  community: z.string().nullable(),
  status: z.enum(["new", "contacted", "converted", "invalid"]),
  version: z.number().int().min(1), created_at: DateTimeSchema,
  followed_at: DateTimeSchema.nullable(), follow_remark: z.string().nullable(),
  customer: z.strictObject({ name: z.string().nullable(),
    status: z.string().nullable() }).nullable(),
  assignee: z.strictObject({ name: z.string().nullable(),
    avatar: z.string().nullable(), status: z.string().nullable() }).nullable(),
};
export const TenantDouyinLeadPublicListItemSchema = z.strictObject({
  ...LeadShape,
  latest_appointment: TenantDouyinLeadPublicListAppointmentSchema.nullable(),
});
export const TenantDouyinLeadPublicDetailSchema = z.strictObject({
  ...LeadShape,
  latest_appointment: TenantDouyinLeadPublicDetailAppointmentSchema.nullable(),
  demand: z.string().trim().min(1).max(1_000).nullable(),
  attribution: AttributionSchema.partial(), budget: BudgetSchema.nullable(),
  ai: DouyinBudgetAiAnalysisSchema.nullable(),
});
export const TenantDouyinLeadPublicFollowUpSchema = z.strictObject({
  summary: z.string().trim().min(1).max(500),
  result: z.string().trim().min(1).max(1_000),
  follow_up_type: z.enum([
    "phone", "wechat", "online_meeting", "onsite", "other",
  ]),
  next_follow_up_at: DateTimeSchema.nullable(), created_at: DateTimeSchema,
  employee_name: z.string().nullable(),
});

type Appointment = TenantDouyinAppointmentRow | TenantDouyinAppointmentDetailRow;

export function serializePublicAppointment(
  appointment: Appointment & {
    readonly budget_range?: { readonly minimum_total: number;
      readonly maximum_total: number } | null;
  },
  options: { readonly includeSource: boolean },
) {
  const base = {
    id: appointment.id,
    appointment_no: appointment.appointment_no,
    preferred_visit_date: appointment.preferred_visit_date,
    preferred_visit_period: appointment.preferred_visit_period,
    community: appointment.community,
    status: appointment.status,
    confirmed_visit_at: appointment.confirmed_visit_at,
    created_at: appointment.created_at,
    updated_at: appointment.updated_at,
    version: appointment.version,
  };
  if (options.includeSource) {
    const raw = "source_snapshot" in appointment
      ? appointment.source_snapshot : undefined;
    return parsePublic(TenantDouyinLeadPublicDetailAppointmentSchema, {
      ...base, source: serializePublicLeadSource(raw),
    });
  }
  return parsePublic(TenantDouyinLeadPublicListAppointmentSchema, {
    ...base, budget_range: serializeBudgetRange(appointment.budget_range),
  });
}

export function serializePublicLead(input: {
  readonly bundle: TenantDouyinLeadBundle;
  readonly tenantId: string;
  readonly phoneMasked: string | null;
  readonly detail: boolean;
}) {
  assertPublicLeadBundleScope(input.bundle, input.tenantId);
  const { lead, appointments, customer, assignee } = input.bundle;
  const latest = appointments[0] ?? null;
  const common = {
    id: lead.id,
    name: lead.name,
    phone_masked: input.phoneMasked,
    community: lead.community,
    status: lead.lead_status,
    version: lead.version,
    created_at: lead.created_at,
    followed_at: lead.followed_at,
    follow_remark: lead.follow_remark,
    customer: customer ? { name: customer.name, status: customer.status } : null,
    assignee: assignee ? { name: assignee.name, avatar: assignee.avatar,
      status: assignee.status } : null,
    latest_appointment: latest ? serializePublicAppointment(latest, {
      includeSource: input.detail,
    }) : null,
  };
  if (!input.detail) return parsePublic(TenantDouyinLeadPublicListItemSchema,
    common);
  if (lead.form_data === undefined) throwInvalidResponse();
  const source = latest && "source_snapshot" in latest
    ? serializePublicLeadSource(latest.source_snapshot)
    : serializePublicLeadSource(lead.form_data);
  return parsePublic(TenantDouyinLeadPublicDetailSchema, { ...common,
    demand: source.demand, attribution: source.attribution,
    budget: source.budget, ai: source.ai });
}

export function serializePublicFollowUp(
  bundle: TenantDouyinFollowUpBundle,
  tenantId: string,
  leadId: string,
) {
  if (bundle.followUp.tenant_id !== tenantId
    || bundle.followUp.marketing_lead_id !== leadId
    || (bundle.employee !== null && (bundle.employee.tenant_id !== tenantId
      || bundle.employee.id !== bundle.followUp.employee_id))) {
    throwInvalidResponse();
  }
  return parsePublic(TenantDouyinLeadPublicFollowUpSchema, {
    summary: bundle.followUp.summary,
    result: bundle.followUp.result,
    follow_up_type: bundle.followUp.follow_up_type,
    next_follow_up_at: bundle.followUp.next_follow_up_at,
    created_at: bundle.followUp.created_at,
    employee_name: bundle.employee?.name ?? null,
  });
}

export function serializePublicLeadSource(raw: unknown) {
  const source = asRecord(raw);
  const rawAttribution = asRecord(source?.attribution);
  const attribution = AttributionSchema.safeParse(rawAttribution).success
    ? AttributionSchema.parse(rawAttribution) : {};
  const demandResult = z.string().trim().min(1).max(1_000).safeParse(source?.demand);
  const estimate = asRecord(source?.budget_estimate);
  const result = DouyinBudgetEstimateResultSchema.safeParse(estimate?.result);
  const estimateNo = estimate?.estimate_no;
  const aiStatus = AiStatusSchema.safeParse(estimate?.ai_status);
  const budgetResult = BudgetSchema.safeParse({
    estimate_no: estimateNo,
    minimum_total: result.success ? result.data.minimum_total : undefined,
    maximum_total: result.success ? result.data.maximum_total : undefined,
    ai_status: aiStatus.success ? aiStatus.data : null,
  });
  const aiResult = DouyinBudgetAiAnalysisSchema.safeParse(estimate?.ai_analysis);
  return parsePublic(TenantDouyinLeadPublicSourceSchema, {
    attribution,
    demand: demandResult.success ? demandResult.data : null,
    budget: budgetResult.success && result.success && aiStatus.success
      && estimateNo === result.data.estimate_no
      ? budgetResult.data : null,
    ai: budgetResult.success && result.success
      && estimateNo === result.data.estimate_no
      && aiStatus.success
      && budgetResult.data.ai_status === "succeeded"
      && aiResult.success ? aiResult.data : null,
  });
}

function serializeBudgetRange(value: unknown) {
  const parsed = z.strictObject({ minimum_total: SafeAmountSchema,
    maximum_total: SafeAmountSchema }).refine((range) =>
    range.minimum_total <= range.maximum_total).safeParse(value);
  return parsed.success ? parsed.data : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

function parsePublic<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throwInvalidResponse();
  return parsed.data;
}

export function assertPublicLeadBundleScope(bundle: TenantDouyinLeadBundle,
  tenantId: string): void {
  const { lead, appointments, customer, assignee } = bundle;
  if (lead.tenant_id !== tenantId
    || (lead.customer_id !== null && customer === null)
    || (lead.assigned_employee_id !== null && assignee === null)
    || appointments.some((row) => row.tenant_id !== tenantId
      || row.marketing_lead_id !== lead.id
      || (row.customer_id !== null && row.customer_id !== lead.customer_id))
    || (customer !== null && (customer.tenant_id !== tenantId
      || customer.id !== lead.customer_id))
    || (assignee !== null && (assignee.tenant_id !== tenantId
      || assignee.id !== lead.assigned_employee_id))) throwInvalidResponse();
}

function throwInvalidResponse(): never {
  throw Errors.business(500, "抖音线索响应数据无效",
    "DOUYIN_LEAD_RESPONSE_INVALID");
}
