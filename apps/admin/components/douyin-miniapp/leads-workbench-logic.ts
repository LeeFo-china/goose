import { DouyinBudgetAiAnalysisSchema } from "@gooes/domain";
import { z } from "zod";

export const LEAD_STATUSES = ["new", "contacted", "converted", "invalid"] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];
export type LeadAction = "assign" | "follow_up" | "convert" | "mark_invalid";
export type LeadFilters = {
  page: number;
  pageSize: number;
  status: LeadStatus | "";
  assigneeId: string;
  dateFrom: string;
  dateTo: string;
  keyword: string;
};
export const DEFAULT_LEAD_FILTERS: LeadFilters = {
  page: 1, pageSize: 20, status: "", assigneeId: "",
  dateFrom: "", dateTo: "", keyword: "",
};

export type Pagination = { page: number; pageSize: number; total: number; totalPages: number };
export type Appointment = {
  id: string;
  appointment_no: string;
  budget_range: { minimum_total: number; maximum_total: number } | null;
  preferred_visit_date: string;
  preferred_visit_period: "morning" | "afternoon" | "evening";
  community: string;
  status: "pending_confirmation" | "confirmed" | "completed" | "canceled" | "invalid";
  confirmed_visit_at: string | null;
  created_at: string;
  updated_at: string;
  version: number;
  source?: LeadSourceProjection;
};
export type LeadRow = {
  id: string;
  name: string | null;
  phone_masked: string | null;
  community: string | null;
  status: LeadStatus;
  version: number;
  created_at: string;
  followed_at: string | null;
  follow_remark: string | null;
  customer: { name: string | null; status: string | null } | null;
  assignee: { name: string | null; avatar: string | null; status: string | null } | null;
  latest_appointment: Appointment | null;
};
export type LeadPage = { list: LeadRow[]; pagination: Pagination };
export type FollowUp = {
  summary: string;
  result: string;
  follow_up_type: "phone" | "wechat" | "online_meeting" | "onsite" | "other";
  next_follow_up_at: string | null;
  created_at: string;
  employee_name: string | null;
};
export type LeadDetail = LeadRow & {
  demand: string | null;
  attribution: LeadSourceProjection["attribution"];
  budget: LeadSourceProjection["budget"];
  ai: LeadSourceProjection["ai"];
  appointments: { list: Appointment[]; pagination: Pagination; truncated: boolean };
  follow_ups: { list: FollowUp[]; pagination: Pagination };
};
export type FollowUpPage = { list: FollowUp[]; pagination: Pagination };
export type LeadSourceProjection = {
  attribution: Partial<Record<
    "source_type" | "entry_path" | "scene" | "campaign_code" | "content_id",
    string
  >>;
  demand: string | null;
  budget: {
    estimate_no: string;
    minimum_total: number;
    maximum_total: number;
    ai_status: "pending" | "succeeded" | "failed" | "skipped" | null;
  } | null;
  ai: {
    summary: string;
    allocation_advice: string[];
    risk_factors: string[];
    onsite_questions: string[];
  } | null;
};

const dateTime = z.iso.datetime({ offset: true });
const nullableUuid = z.uuid().nullable();
const nullableString = z.string().nullable();
const paginationSchema = z.strictObject({
  page: z.number().int().min(1), pageSize: z.number().int().min(1).max(100),
  total: z.number().int().min(0), totalPages: z.number().int().min(0),
});
const customerSchema = z.strictObject({
  id: z.uuid(), tenant_id: z.uuid(), name: nullableString,
  status: nullableString, owner_id: nullableUuid,
});
const employeeSchema = z.strictObject({
  id: z.uuid(), tenant_id: z.uuid(), name: nullableString,
  avatar: nullableString, status: nullableString,
});
const appointmentShape = {
  id: z.uuid(), appointment_no: z.string().min(1).max(40), tenant_id: z.uuid(),
  marketing_lead_id: z.uuid(), customer_id: nullableUuid,
  assigned_employee_id: nullableUuid, budget_estimate_id: nullableUuid,
  preferred_visit_date: z.iso.date(),
  preferred_visit_period: z.enum(["morning", "afternoon", "evening"]),
  community: z.string().min(1).max(80),
  status: z.enum(["pending_confirmation", "confirmed", "completed", "canceled", "invalid"]),
  confirmed_visit_at: dateTime.nullable(), created_at: dateTime,
  updated_at: dateTime, version: z.number().int().min(1),
};
const safeBudgetAmount = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const budgetRangeSchema = z.strictObject({
  minimum_total: safeBudgetAmount, maximum_total: safeBudgetAmount,
}).refine((range) => range.minimum_total <= range.maximum_total);
const appointmentSchema = z.strictObject({
  ...appointmentShape, budget_range: budgetRangeSchema.nullable(),
});
const appointmentDetailSchema = z.strictObject({
  ...appointmentShape, source_snapshot: z.record(z.string(), z.unknown()),
});
const leadBaseShape = {
  id: z.uuid(), name: nullableString, phone: nullableString,
  phone_masked: nullableString, can_view_phone: z.boolean(),
  can_call_phone: z.boolean(), can_copy_phone: z.boolean(),
  community: nullableString, status: z.enum(LEAD_STATUSES),
  version: z.number().int().min(1), created_at: dateTime,
  followed_at: dateTime.nullable(), follow_remark: nullableString,
  customer: customerSchema.nullable(), assignee: employeeSchema.nullable(),
};
const leadSchema = z.strictObject({
  ...leadBaseShape, latest_appointment: appointmentSchema.nullable(),
});
const leadPageSchema = z.strictObject({
  list: z.array(leadSchema), pagination: paginationSchema,
});
const followUpSchema = z.strictObject({
  id: z.uuid(), tenant_id: z.uuid(), marketing_lead_id: z.uuid(),
  douyin_measurement_appointment_id: z.uuid(), employee_id: z.uuid(),
  follow_up_type: z.enum(["phone", "wechat", "online_meeting", "onsite", "other"]),
  summary: z.string().min(1).max(500), result: z.string().min(1).max(1000),
  next_follow_up_at: dateTime.nullable(), created_at: dateTime,
  employee: employeeSchema.nullable(),
});
const followUpPageSchema = z.strictObject({
  list: z.array(followUpSchema), pagination: paginationSchema,
});
const leadDetailSchema = z.strictObject({
  ...leadBaseShape, latest_appointment: appointmentDetailSchema.nullable(),
  installation_id: nullableUuid,
  form_data: z.record(z.string(), z.unknown()),
  appointments: z.strictObject({ list: z.array(appointmentDetailSchema),
    pagination: paginationSchema, truncated: z.boolean() }),
  follow_ups: z.strictObject({ list: z.array(followUpSchema), pagination: paginationSchema }),
});
const commandBase = { lead_id: z.uuid(), lead_version: z.number().int().min(1),
  idempotent: z.boolean() };
const commandSchema = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("assign"), result: z.literal("assigned"),
    assigned_employee_id: z.uuid(), appointments_updated: z.number().int().min(0), ...commandBase }),
  z.strictObject({ action: z.literal("follow_up"), result: z.literal("followed_up"),
    follow_up_id: z.uuid(), appointment_id: z.uuid(), appointment_version: z.number().int().min(1),
    appointment_status: appointmentShape.status, ...commandBase }),
  z.strictObject({ action: z.literal("convert"), result: z.literal("converted"),
    customer_id: z.uuid(), created_customer: z.boolean(), repeated_conversion: z.boolean(),
    appointments_updated: z.number().int().min(0), ...commandBase }),
  z.strictObject({ action: z.literal("mark_invalid"), result: z.literal("invalid"),
    appointments_updated: z.number().int().min(0), repeated_invalidation: z.boolean(), ...commandBase }),
]);
type AppointmentProjectionInput = Omit<z.infer<typeof appointmentDetailSchema>, "source_snapshot" | "budget_estimate_id"> & { budget_range?: z.infer<typeof budgetRangeSchema> | null };
type LeadProjectionInput = Omit<z.infer<typeof leadSchema>, "latest_appointment"> & { latest_appointment: AppointmentProjectionInput | null };
function projectAppointment(raw: AppointmentProjectionInput): Appointment {
  return {
    id: raw.id, appointment_no: raw.appointment_no,
    budget_range: raw.budget_range ?? null,
    preferred_visit_date: raw.preferred_visit_date,
    preferred_visit_period: raw.preferred_visit_period, community: raw.community,
    status: raw.status, confirmed_visit_at: raw.confirmed_visit_at,
    created_at: raw.created_at, updated_at: raw.updated_at, version: raw.version,
  };
}
function projectLead(raw: LeadProjectionInput): LeadRow {
  return {
    id: raw.id, name: raw.name, phone_masked: raw.phone_masked,
    community: raw.community, status: raw.status, version: raw.version,
    created_at: raw.created_at, followed_at: raw.followed_at,
    follow_remark: raw.follow_remark,
    customer: raw.customer ? { name: raw.customer.name, status: raw.customer.status } : null,
    assignee: raw.assignee ? { name: raw.assignee.name, avatar: raw.assignee.avatar,
      status: raw.assignee.status } : null,
    latest_appointment: raw.latest_appointment
      ? projectAppointment(raw.latest_appointment) : null,
  };
}
export function normalizeLeadPage(raw: unknown, expected: {
  page: number; pageSize: number;
}): LeadPage | null {
  const parsed = leadPageSchema.safeParse(raw);
  if (!parsed.success || parsed.data.pagination.page !== expected.page
    || parsed.data.pagination.pageSize !== expected.pageSize) return null;
  const expectedPages = parsed.data.pagination.total === 0 ? 0
    : Math.ceil(parsed.data.pagination.total / expected.pageSize);
  if (parsed.data.pagination.totalPages !== expectedPages
    || parsed.data.list.length > expected.pageSize) return null;
  return { list: parsed.data.list.map(projectLead), pagination: parsed.data.pagination };
}

export function normalizeLeadDetail(raw: unknown): LeadDetail | null {
  const parsed = leadDetailSchema.safeParse(raw);
  if (!parsed.success) return null;
  const value = parsed.data;
  const appointments = value.appointments.list.map((appointment) => ({
    ...projectAppointment(appointment),
    source: projectLeadSourceSnapshot(appointment.source_snapshot),
  }));
  const source = appointments[0]?.source
    ?? projectLeadSourceSnapshot(value.form_data);
  return {
    ...projectLead(value), demand: source.demand,
    attribution: source.attribution, budget: source.budget, ai: source.ai,
    appointments: { ...value.appointments, list: appointments },
    follow_ups: { ...value.follow_ups, list: value.follow_ups.list.map(projectFollowUp) },
  };
}

function projectFollowUp(item: z.infer<typeof followUpSchema>): FollowUp {
  return { summary: item.summary, result: item.result,
    follow_up_type: item.follow_up_type, next_follow_up_at: item.next_follow_up_at,
    created_at: item.created_at, employee_name: item.employee?.name ?? null };
}

export function normalizeFollowUpPage(raw: unknown, expected: {
  page: number; pageSize: number;
}): FollowUpPage | null {
  const parsed = followUpPageSchema.safeParse(raw);
  if (!parsed.success || parsed.data.pagination.page !== expected.page
    || parsed.data.pagination.pageSize !== expected.pageSize) return null;
  const expectedPages = parsed.data.pagination.total === 0 ? 0
    : Math.ceil(parsed.data.pagination.total / expected.pageSize);
  if (parsed.data.pagination.totalPages !== expectedPages
    || parsed.data.list.length > expected.pageSize) return null;
  return { list: parsed.data.list.map(projectFollowUp), pagination: parsed.data.pagination };
}

const attributionSchema = z.strictObject({
  entry_path: z.enum(["pages/home/index", "pages/company/index", "pages/privacy/index",
    "pages/cases/index", "pages/case-detail/index", "pages/sites/index",
    "pages/site-detail/index", "pages/lead/index", "pages/lead-success/index"]),
  scene: z.string().regex(/^[0-9]{1,20}$/),
  source_type: z.enum(["short_video", "live", "search", "profile", "share", "direct", "other"]),
  campaign_code: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/).optional(),
  content_id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/).optional(),
});
const aiStatuses = new Set(["pending", "succeeded", "failed", "skipped"]);

export function projectLeadSourceSnapshot(raw: unknown): LeadSourceProjection {
  const source = asRecord(raw);
  const rawAttribution = asRecord(source?.attribution);
  const attributionResult = attributionSchema.safeParse(rawAttribution ? {
    entry_path: rawAttribution.entry_path,
    scene: rawAttribution.scene,
    source_type: rawAttribution.source_type,
    ...(rawAttribution.campaign_code === undefined
      ? {} : { campaign_code: rawAttribution.campaign_code }),
    ...(rawAttribution.content_id === undefined
      ? {} : { content_id: rawAttribution.content_id }),
  } : null);
  const attribution = attributionResult.success ? { ...attributionResult.data } : {};
  const demand = typeof source?.demand === "string" && source.demand.trim().length > 0
      && source.demand.trim().length <= 1_000 ? source.demand.trim() : null;
  const estimate = asRecord(source?.budget_estimate);
  const result = asRecord(estimate?.result);
  const estimateNo = patternString(estimate?.estimate_no, /^DYYS-\d{8}-\d{6}$/);
  const minimum = safeAmount(result?.minimum_total);
  const maximum = safeAmount(result?.maximum_total);
  const isBudgetValid = estimateNo !== null && minimum !== null && maximum !== null
    && minimum <= maximum;
  const aiStatus = typeof estimate?.ai_status === "string"
      && aiStatuses.has(estimate.ai_status) ? estimate.ai_status as
        LeadSourceProjection["budget"] extends infer Budget
          ? Budget extends { ai_status: infer Status } ? Status : never : never
      : null;
  const aiResult = DouyinBudgetAiAnalysisSchema.safeParse(estimate?.ai_analysis);
  return {
    attribution, demand,
    budget: isBudgetValid ? { estimate_no: estimateNo, minimum_total: minimum,
      maximum_total: maximum, ai_status: aiStatus } : null,
    ai: isBudgetValid && aiStatus === "succeeded" && aiResult.success
      ? { summary: aiResult.data.summary,
        allocation_advice: [...aiResult.data.allocation_advice],
        risk_factors: [...aiResult.data.risk_factors],
        onsite_questions: [...aiResult.data.onsite_questions] }
      : null,
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}
function patternString(value: unknown, pattern: RegExp): string | null {
  return typeof value === "string" && pattern.test(value) ? value : null;
}
function safeAmount(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value : null;
}

export function parseLeadFilters(params: URLSearchParams): LeadFilters {
  const page = boundedInteger(params.get("page"), 1, 10_000, 1);
  const pageSize = boundedInteger(params.get("pageSize"), 1, 100, 20);
  const statusValue = params.get("status") ?? "";
  const status = LEAD_STATUSES.includes(statusValue as LeadStatus)
    ? statusValue as LeadStatus : "";
  const assigneeValue = params.get("assigneeId") ?? "";
  const assigneeId = z.uuid().safeParse(assigneeValue).success ? assigneeValue : "";
  return normalizeLeadDateRange({ page, pageSize, status, assigneeId,
    dateFrom: validDate(params.get("dateFrom")), dateTo: validDate(params.get("dateTo")),
    keyword: validKeyword(params.get("keyword")) });
}

export function normalizeLeadDateRange(filters: LeadFilters): LeadFilters {
  if (!filters.dateFrom || !filters.dateTo || filters.dateFrom <= filters.dateTo) return { ...filters };
  return { ...filters, dateFrom: filters.dateTo, dateTo: filters.dateFrom };
}

export function buildLeadHref(filters: LeadFilters): string {
  const safe = normalizeLeadDateRange(filters);
  const params = new URLSearchParams({ pageSize: String(safe.pageSize) });
  if (safe.page > 1) params.set("page", String(safe.page));
  if (safe.status) params.set("status", safe.status);
  if (safe.assigneeId) params.set("assigneeId", safe.assigneeId);
  if (safe.dateFrom) params.set("dateFrom", safe.dateFrom);
  if (safe.dateTo) params.set("dateTo", safe.dateTo);
  if (safe.keyword) params.set("keyword", safe.keyword);
  return `/douyin-miniapp/leads?${params}`;
}

export function buildLeadApiQuery(filters: LeadFilters): string {
  const params = new URLSearchParams(buildLeadHref(filters).split("?")[1] ?? "");
  params.set("page", String(filters.page));
  params.set("pageSize", String(filters.pageSize));
  const ordered = new URLSearchParams({
    page: params.get("page") ?? "1",
    pageSize: params.get("pageSize") ?? "20",
  });
  for (const [key, value] of params) {
    if (key !== "page" && key !== "pageSize") ordered.set(key, value);
  }
  return ordered.toString();
}

function boundedInteger(value: string | null, min: number, max: number, fallback: number): number {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, Math.floor(parsed))) : fallback;
}
function validDate(value: string | null): string {
  return value && z.iso.date().safeParse(value).success ? value : "";
}
function validKeyword(value: string | null): string {
  const keyword = value?.trim() ?? "";
  return keyword.length <= 80 && /^[\p{L}\p{N}\s#号栋室-]*$/u.test(keyword) ? keyword : "";
}

export function createLeadRequestAuthority() {
  let ticket = 0;
  let controller: AbortController | null = null;
  return {
    begin() { controller?.abort(); controller = new AbortController();
      return { ticket: ++ticket, controller }; },
    isCurrent(request: { ticket: number; controller: AbortController }) {
      return request.ticket === ticket && request.controller === controller
        && !request.controller.signal.aborted;
    },
    invalidate() { ticket += 1; controller?.abort(); controller = null; },
  };
}

export function createLatestLeadListTarget(initial: LeadFilters) {
  let target = { ...initial };
  return {
    update(next: LeadFilters): void { target = { ...next }; },
    current(): LeadFilters { return { ...target }; },
  };
}

export function createSubmissionGate() {
  let pending = false;
  return { enter() { if (pending) return false; pending = true; return true; },
    leave() { pending = false; } };
}

export function getAllowedLeadActions(permissions: readonly string[]): LeadAction[] {
  const set = new Set(permissions);
  return [
    ...(set.has("douyin_lead.assign") ? ["assign" as const] : []),
    ...(set.has("douyin_lead.follow_up") ? ["follow_up" as const] : []),
    ...(set.has("douyin_lead.convert")
      ? ["convert" as const, "mark_invalid" as const] : []),
  ];
}

export type LeadCommandInput = {
  leadVersion: number; idempotencyKey: string; assigneeId?: string;
  appointmentId?: string; followUpType?: string; summary?: string; result?: string;
  nextFollowUpAt?: string; appointmentStatus?: string; confirmedVisitAt?: string;
  reason?: string;
};

export type LeadActionIntentInput = {
  leadId: string;
  leadVersion: number;
  action: LeadAction;
  values: Omit<LeadCommandInput, "leadVersion" | "idempotencyKey">;
};

export function createLeadIdempotencyIntent(
  keyFactory: () => string = () => crypto.randomUUID(),
) {
  let signature: string | null = null;
  let key: string | null = null;
  return {
    keyFor(input: LeadActionIntentInput): string {
      const nextSignature = leadActionIntentSignature(input);
      if (signature !== nextSignature || key === null) {
        signature = nextSignature;
        key = keyFactory();
      }
      return key;
    },
    complete(): void { signature = null; key = null; },
  };
}

export function buildLeadCommand(action: LeadAction, input: LeadCommandInput) {
  const base = { expected_lead_version: input.leadVersion,
    idempotency_key: input.idempotencyKey };
  if (action === "assign") return { assigned_employee_id: input.assigneeId ?? "", ...base };
  if (action === "follow_up") return {
    appointment_id: input.appointmentId ?? "", follow_up_type: input.followUpType ?? "phone",
    summary: input.summary?.trim() ?? "", result: input.result?.trim() ?? "",
    next_follow_up_at: toIso(input.nextFollowUpAt),
    appointment_status: input.appointmentStatus || null,
    confirmed_visit_at: input.appointmentStatus === "confirmed"
      ? toIso(input.confirmedVisitAt) : null, ...base,
  };
  if (action === "mark_invalid") return { reason: input.reason?.trim() ?? "", ...base };
  return base;
}

function leadActionIntentSignature(input: LeadActionIntentInput): string {
  const command = buildLeadCommand(input.action, {
    ...input.values,
    leadVersion: input.leadVersion,
    idempotencyKey: "00000000-0000-4000-8000-000000000000",
  });
  const { idempotency_key: _idempotencyKey, ...semanticPayload } = command;
  return JSON.stringify({
    leadId: input.leadId,
    action: input.action,
    payload: semanticPayload,
  });
}
function toIso(value: string | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function getLeadViewState(input: { loading: boolean; error: string | null; count: number }) {
  if (input.loading && input.count === 0) return "loading" as const;
  if (input.error && input.count === 0) return "error" as const;
  if (input.count === 0) return "empty" as const;
  return "ready" as const;
}

export function isLeadCommandResult(raw: unknown, action: LeadAction, leadId: string): boolean {
  const parsed = commandSchema.safeParse(raw);
  return parsed.success && parsed.data.action === action && parsed.data.lead_id === leadId;
}
