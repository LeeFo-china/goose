import {
  DOUYIN_VISIT_PERIODS,
  type DouyinVisitPeriod,
} from "../../models";
import type { BudgetLeadContext } from "../../platform/budget-lead-context";
import type { IdempotencyStatus } from "../../utils/idempotency";

export type LeadFormValue = {
  name: string;
  phone: string;
  sms_code: string;
  community: string;
  preferred_visit_date: string;
  preferred_visit_period: DouyinVisitPeriod | "";
  demand: string;
  consented_at: string;
};

export type LeadField = keyof LeadFormValue;
export type LeadValidationField =
  | "name"
  | "phone"
  | "sms_code"
  | "community"
  | "preferred_visit_date"
  | "preferred_visit_period"
  | "consent";
export type LeadFieldErrors = Partial<Record<LeadValidationField, string>>;

export type LeadValidationResult = {
  fieldErrors: LeadFieldErrors;
  firstField: LeadValidationField | null;
  summary: string | null;
};

const VALIDATION_ORDER: readonly LeadValidationField[] = [
  "name",
  "phone",
  "sms_code",
  "community",
  "preferred_visit_date",
  "preferred_visit_period",
  "consent",
];

const FIELD_TO_VALIDATION: Partial<Record<LeadField, LeadValidationField>> = {
  name: "name",
  phone: "phone",
  sms_code: "sms_code",
  community: "community",
  preferred_visit_date: "preferred_visit_date",
  preferred_visit_period: "preferred_visit_period",
  consented_at: "consent",
};

const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1_000;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function validateLeadForm(
  form: LeadFormValue,
  consented: boolean,
  minimumVisitDate = getShanghaiNaturalDate(),
  phoneCaptureMode: "sms" | "douyin_phone" = "sms",
): LeadValidationResult {
  const fieldErrors: LeadFieldErrors = {};
  if (!form.name.trim()) fieldErrors.name = "请填写称呼";
  if (phoneCaptureMode === "sms" && !/^1[3-9][0-9]{9}$/.test(form.phone.trim())) {
    fieldErrors.phone = "请填写正确的手机号";
  }
  if (phoneCaptureMode === "sms" && !/^[0-9]{6}$/.test(form.sms_code.trim())) {
    fieldErrors.sms_code = "请填写6位短信验证码";
  }
  if (!form.community.trim()) fieldErrors.community = "请填写小区名称";
  if (!form.preferred_visit_date) {
    fieldErrors.preferred_visit_date = "请选择期望量房日期";
  } else if (!isNaturalDate(form.preferred_visit_date)
    || form.preferred_visit_date < minimumVisitDate) {
    fieldErrors.preferred_visit_date = "请选择今天或之后的量房日期";
  }
  if (!DOUYIN_VISIT_PERIODS.some((period) => period === form.preferred_visit_period)) {
    fieldErrors.preferred_visit_period = "请选择期望量房时段";
  }
  if (!consented || !form.consented_at) {
    fieldErrors.consent = "请先阅读并同意隐私政策";
  }
  const firstField = VALIDATION_ORDER.find((field) => fieldErrors[field]) ?? null;
  return {
    fieldErrors,
    firstField,
    summary: firstField ? fieldErrors[firstField] ?? null : null,
  };
}

export function clearLeadFieldError(
  errors: LeadFieldErrors,
  field: LeadField | "consent",
): LeadFieldErrors {
  const validationField = field === "consent" ? "consent" : FIELD_TO_VALIDATION[field];
  if (!validationField || !errors[validationField]) return errors;
  const next = { ...errors };
  delete next[validationField];
  return next;
}

export function toggleOptionalDetails(current: boolean): boolean {
  return !current;
}

export function resolveLinkedBudgetContext<Context>(
  current: Context | null,
  incoming: Context | null,
  attemptStatus: IdempotencyStatus,
): Context | null {
  if (incoming) return incoming;
  return current && attemptStatus !== "draft" ? current : null;
}

export function resolveOptionalDetailsExpanded(
  current: boolean,
  _firstField: LeadValidationField | null,
): boolean {
  return current;
}

export function getShanghaiNaturalDate(now = Date.now()): string {
  return new Date(now + SHANGHAI_OFFSET_MS).toISOString().slice(0, 10);
}

export function sanitizeLeadField(field: LeadField, value: string): string {
  if (field === "phone") return value.replace(/[^0-9]/g, "").slice(0, 11);
  if (field === "sms_code") return value.replace(/[^0-9]/g, "").slice(0, 6);
  if (field === "preferred_visit_date") return value.slice(0, 10);
  if (field === "preferred_visit_period") return value.slice(0, 16);
  const limits: Partial<Record<LeadField, number>> = {
    name: 40,
    community: 80,
    demand: 1_000,
  };
  return value.slice(0, limits[field] ?? value.length);
}

export function optionalLeadDemand(value: string): { demand?: string } {
  const normalized = value.trim();
  return normalized ? { demand: normalized } : {};
}

export function toLeadIdempotencyDraft(
  form: LeadFormValue,
  privacyPolicyVersion: string,
  linkedBudget: BudgetLeadContext | null,
) {
  return {
    name: form.name.trim(),
    phone: form.phone.trim(),
    community: form.community.trim(),
    preferred_visit_date: form.preferred_visit_date,
    preferred_visit_period: form.preferred_visit_period,
    budget_estimate_id: linkedBudget?.estimateId ?? "",
    demand: form.demand.trim(),
    consented_at: form.consented_at,
    privacy_policy_version: privacyPolicyVersion,
  };
}

export function toLeadVisitPeriod(
  value: LeadFormValue["preferred_visit_period"],
): DouyinVisitPeriod | null {
  return DOUYIN_VISIT_PERIODS.find((period) => period === value) ?? null;
}

function isNaturalDate(value: string): boolean {
  if (!ISO_DATE_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
