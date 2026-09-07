import { z } from "zod";

import { LEAD_STATUSES } from "./leads-workbench-contract";
import type { LeadStatus } from "./leads-workbench-contract";
export {
  LEAD_STATUSES, normalizeAppointmentPage, normalizeFollowUpPage,
  normalizeLeadDetail, normalizeLeadPage,
} from "./leads-workbench-contract";
export type {
  Appointment, AppointmentPage, FollowUp, FollowUpPage, LeadDetail, LeadPage,
  LeadRow, LeadSourceProjection, LeadStatus, Pagination,
} from "./leads-workbench-contract";

export type LeadAction = "assign" | "follow_up" | "convert" | "mark_invalid";
export type LeadFilters = {
  source?: "douyin_miniapp" | "h5" | "";
  assignment?: "all" | "assigned" | "unassigned";
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

const appointmentStatusSchema = z.enum([
  "pending_confirmation", "confirmed", "completed", "canceled", "invalid",
]);
const commandBase = { lead_id: z.uuid(), lead_version: z.number().int().min(1),
  idempotent: z.boolean() };
const commandSchema = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("assign"), result: z.literal("assigned"),
    assigned_employee_id: z.uuid(), appointments_updated: z.number().int().min(0), ...commandBase }),
  z.strictObject({ action: z.literal("follow_up"), result: z.literal("followed_up"),
    follow_up_id: z.uuid(), appointment_id: z.uuid(), appointment_version: z.number().int().min(1),
    appointment_status: appointmentStatusSchema, ...commandBase }),
  z.strictObject({ action: z.literal("convert"), result: z.literal("converted"),
    customer_id: z.uuid(), created_customer: z.boolean(), repeated_conversion: z.boolean(),
    appointments_updated: z.number().int().min(0), ...commandBase }),
  z.strictObject({ action: z.literal("mark_invalid"), result: z.literal("invalid"),
    appointments_updated: z.number().int().min(0), repeated_invalidation: z.boolean(), ...commandBase }),
]);

export function parseLeadFilters(params: URLSearchParams, profile: "douyin" | "customer" = "douyin"): LeadFilters {
  const page = boundedInteger(params.get("page"), 1, 10_000, 1);
  const pageSize = boundedInteger(params.get("pageSize"), 1, 100, 20);
  const statusValue = params.get("status") ?? "";
  const status = LEAD_STATUSES.includes(statusValue as LeadStatus)
    ? statusValue as LeadStatus : "";
  const assigneeValue = params.get("assigneeId") ?? "";
  const assigneeId = z.uuid().safeParse(assigneeValue).success ? assigneeValue : "";
  return normalizeLeadDateRange({ page, pageSize, status, assigneeId,
    ...(profile === "customer" ? {
      source: params.get("source") === "douyin_miniapp" ? "douyin_miniapp" as const
        : params.get("source") === "h5" ? "h5" as const : "" as const,
      assignment: params.get("assignment") === "assigned" ? "assigned" as const
        : params.get("assignment") === "unassigned" ? "unassigned" as const : "all" as const,
      ...(params.get("assignment") === "unassigned" ? { assigneeId: "" } : {}),
    } : {}),
    dateFrom: validDate(params.get("dateFrom")), dateTo: validDate(params.get("dateTo")),
    keyword: validKeyword(params.get("keyword")) });
}

export function normalizeLeadDateRange(filters: LeadFilters): LeadFilters {
  if (!filters.dateFrom || !filters.dateTo || filters.dateFrom <= filters.dateTo) return { ...filters };
  return { ...filters, dateFrom: filters.dateTo, dateTo: filters.dateFrom };
}

export function buildLeadHref(filters: LeadFilters, profile: "douyin" | "customer" = "douyin"): string {
  const safe = normalizeLeadDateRange(filters);
  const params = new URLSearchParams({ pageSize: String(safe.pageSize) });
  if (safe.page > 1) params.set("page", String(safe.page));
  if (safe.status) params.set("status", safe.status);
  if (safe.assigneeId && !(profile === "customer" && safe.assignment === "unassigned")) params.set("assigneeId", safe.assigneeId);
  if (profile === "customer") {
    if (safe.source) params.set("source", safe.source);
    params.set("assignment", safe.assignment ?? "all");
  }
  if (safe.dateFrom) params.set("dateFrom", safe.dateFrom);
  if (safe.dateTo) params.set("dateTo", safe.dateTo);
  if (safe.keyword) params.set("keyword", safe.keyword);
  return `${profile === "customer" ? "/customer-leads" : "/douyin-miniapp/leads"}?${params}`;
}

export function buildLeadApiQuery(filters: LeadFilters, profile: "douyin" | "customer" = "douyin"): string {
  const params = new URLSearchParams(buildLeadHref(filters, profile).split("?")[1] ?? "");
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
  commandBuilder: (action: LeadAction, input: LeadCommandInput) => {
    idempotency_key: string;
  } = buildLeadCommand,
) {
  let signature: string | null = null;
  let key: string | null = null;
  return {
    keyFor(input: LeadActionIntentInput): string {
      const nextSignature = leadActionIntentSignature(input, commandBuilder);
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

function leadActionIntentSignature(input: LeadActionIntentInput,
  commandBuilder: (action: LeadAction, input: LeadCommandInput) => {
    idempotency_key: string;
  }): string {
  const command = commandBuilder(input.action, {
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
