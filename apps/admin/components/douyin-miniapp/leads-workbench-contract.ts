import { DouyinBudgetAiAnalysisSchema } from "@gooes/domain";
import { z } from "zod";

export const LEAD_STATUSES = ["new", "contacted", "converted", "invalid"] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];
export type Pagination = { page: number; pageSize: number; total: number; totalPages: number };
export type LeadSourceProjection = {
  attribution: Partial<Record<
    "source_type" | "entry_path" | "scene" | "campaign_code" | "content_id",
    string
  >>;
  demand: string | null;
  budget: { estimate_no: string; minimum_total: number; maximum_total: number;
    ai_status: "pending" | "succeeded" | "failed" | "skipped" | null } | null;
  ai: { summary: string; allocation_advice: string[]; risk_factors: string[];
    onsite_questions: string[] } | null;
};
export type Appointment = {
  id: string; appointment_no: string; preferred_visit_date: string;
  preferred_visit_period: "morning" | "afternoon" | "evening"; community: string;
  status: "pending_confirmation" | "confirmed" | "completed" | "canceled" | "invalid";
  confirmed_visit_at: string | null; created_at: string; updated_at: string; version: number;
  budget_range?: { minimum_total: number; maximum_total: number } | null;
  source?: LeadSourceProjection;
};
export type LeadRow = {
  id: string; name: string | null; phone_masked: string | null; community: string | null;
  status: LeadStatus; version: number; created_at: string; followed_at: string | null;
  follow_remark: string | null; customer: { name: string | null; status: string | null } | null;
  assignee: { name: string | null; avatar: string | null; status: string | null } | null;
  latest_appointment: Appointment | null;
};
export type LeadPage = { list: LeadRow[]; pagination: Pagination };
export type FollowUp = {
  summary: string; result: string;
  follow_up_type: "phone" | "wechat" | "online_meeting" | "onsite" | "other";
  next_follow_up_at: string | null; created_at: string; employee_name: string | null;
};
export type LeadDetail = LeadRow & LeadSourceProjection & {
  appointments: { list: Appointment[]; pagination: Pagination; truncated: boolean };
  follow_ups: { list: FollowUp[]; pagination: Pagination };
};
export type FollowUpPage = { list: FollowUp[]; pagination: Pagination };
export type AppointmentPage = { list: Appointment[]; pagination: Pagination };

const dateTime = z.iso.datetime({ offset: true });
const nullableString = z.string().nullable();
const paginationSchema = z.strictObject({
  page: z.number().int().min(1), pageSize: z.number().int().min(1).max(100),
  total: z.number().int().min(0), totalPages: z.number().int().min(0),
});
const safeBudgetAmount = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const budgetRangeSchema = z.strictObject({
  minimum_total: safeBudgetAmount, maximum_total: safeBudgetAmount,
}).refine((range) => range.minimum_total <= range.maximum_total);
const attributionSchema = z.strictObject({
  source_type: z.enum(["short_video", "live", "search", "profile", "share", "direct", "other"]).optional(),
  entry_path: z.enum(["pages/home/index", "pages/company/index", "pages/privacy/index",
    "pages/cases/index", "pages/case-detail/index", "pages/sites/index",
    "pages/site-detail/index", "pages/lead/index", "pages/lead-success/index"]).optional(),
  scene: z.string().regex(/^[0-9]{1,20}$/).optional(),
  campaign_code: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/).optional(),
  content_id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/).optional(),
});
const budgetSchema = z.strictObject({
  estimate_no: z.string().regex(/^DYYS-\d{8}-\d{6}$/),
  minimum_total: safeBudgetAmount, maximum_total: safeBudgetAmount,
  ai_status: z.enum(["pending", "succeeded", "failed", "skipped"]).nullable(),
}).refine((budget) => budget.minimum_total <= budget.maximum_total);
const sourceSchema = z.strictObject({
  attribution: attributionSchema, demand: z.string().trim().min(1).max(1_000).nullable(),
  budget: budgetSchema.nullable(), ai: DouyinBudgetAiAnalysisSchema.nullable(),
});
const appointmentCommonShape = {
  id: z.uuid(), appointment_no: z.string().trim().min(1).max(40),
  preferred_visit_date: z.iso.date(),
  preferred_visit_period: z.enum(["morning", "afternoon", "evening"]),
  community: z.string().trim().min(1).max(80),
  status: z.enum(["pending_confirmation", "confirmed", "completed", "canceled", "invalid"]),
  confirmed_visit_at: dateTime.nullable(), created_at: dateTime,
  updated_at: dateTime, version: z.number().int().min(1),
};
const listAppointmentSchema = z.strictObject({
  ...appointmentCommonShape, budget_range: budgetRangeSchema.nullable(),
});
const detailAppointmentSchema = z.strictObject({
  ...appointmentCommonShape, source: sourceSchema,
});
const customerSchema = z.strictObject({ name: nullableString, status: nullableString });
const employeeSchema = z.strictObject({
  name: nullableString, avatar: nullableString, status: nullableString,
});
const leadCommonShape = {
  id: z.uuid(), name: nullableString, phone_masked: nullableString, community: nullableString,
  status: z.enum(LEAD_STATUSES), version: z.number().int().min(1), created_at: dateTime,
  followed_at: dateTime.nullable(), follow_remark: nullableString,
  customer: customerSchema.nullable(), assignee: employeeSchema.nullable(),
};
const leadSchema = z.strictObject({
  ...leadCommonShape, latest_appointment: listAppointmentSchema.nullable(),
});
const followUpSchema = z.strictObject({
  summary: z.string().trim().min(1).max(500), result: z.string().trim().min(1).max(1_000),
  follow_up_type: z.enum(["phone", "wechat", "online_meeting", "onsite", "other"]),
  next_follow_up_at: dateTime.nullable(), created_at: dateTime, employee_name: nullableString,
});
const leadPageSchema = z.strictObject({
  list: z.array(leadSchema), pagination: paginationSchema,
});
const appointmentPageSchema = z.strictObject({
  list: z.array(detailAppointmentSchema), pagination: paginationSchema,
});
const followUpPageSchema = z.strictObject({
  list: z.array(followUpSchema), pagination: paginationSchema,
});
const leadDetailSchema = z.strictObject({
  ...leadCommonShape, latest_appointment: detailAppointmentSchema.nullable(),
  ...sourceSchema.shape,
  appointments: z.strictObject({ list: z.array(detailAppointmentSchema),
    pagination: paginationSchema, truncated: z.boolean() }),
  follow_ups: followUpPageSchema,
});

function validPage<T>(value: { list: T[]; pagination: Pagination }, expected: {
  page: number; pageSize: number;
}): boolean {
  const { pagination, list } = value;
  const expectedPages = pagination.total === 0 ? 0
    : Math.ceil(pagination.total / expected.pageSize);
  return pagination.page === expected.page && pagination.pageSize === expected.pageSize
    && pagination.totalPages === expectedPages && list.length <= expected.pageSize
    && list.length <= pagination.total;
}

export function normalizeLeadPage(raw: unknown, expected: {
  page: number; pageSize: number;
}): LeadPage | null {
  const parsed = leadPageSchema.safeParse(raw);
  return parsed.success && validPage(parsed.data, expected) ? parsed.data : null;
}

export function normalizeLeadDetail(raw: unknown): LeadDetail | null {
  const parsed = leadDetailSchema.safeParse(raw);
  if (!parsed.success) return null;
  const { appointments, follow_ups: followUps } = parsed.data;
  if (!validPage(appointments, { page: 1, pageSize: 20 })
    || !validPage(followUps, { page: 1, pageSize: 20 })
    || appointments.truncated !== (appointments.pagination.total > appointments.list.length)) {
    return null;
  }
  return parsed.data;
}

export function normalizeAppointmentPage(raw: unknown, expected: {
  page: number; pageSize: number;
}): AppointmentPage | null {
  const parsed = appointmentPageSchema.safeParse(raw);
  return parsed.success && validPage(parsed.data, expected) ? parsed.data : null;
}

export function normalizeFollowUpPage(raw: unknown, expected: {
  page: number; pageSize: number;
}): FollowUpPage | null {
  const parsed = followUpPageSchema.safeParse(raw);
  return parsed.success && validPage(parsed.data, expected) ? parsed.data : null;
}
