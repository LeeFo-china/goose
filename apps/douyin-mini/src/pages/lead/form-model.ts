import {
  DOUYIN_VISIT_PERIODS,
  type DouyinVisitPeriod,
} from "../../models";

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

export type LeadSuccessRouteInput = {
  appointmentNo: string;
  preferredVisitDate: string;
  preferredVisitPeriod: DouyinVisitPeriod;
  estimateLinked: boolean;
};

export type LeadSuccessView = LeadSuccessRouteInput & {
  preferredVisitDateLabel: string;
  preferredVisitPeriodLabel: string;
};

const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1_000;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const APPOINTMENT_NO_PATTERN = /^DYLF-\d{8}-\d{6}$/;
const SUCCESS_OPTION_KEYS = [
  "appointment_no",
  "preferred_visit_date",
  "preferred_visit_period",
  "estimate_linked",
] as const;
const VISIT_PERIOD_LABELS: Readonly<Record<DouyinVisitPeriod, string>> = {
  morning: "上午",
  afternoon: "下午",
  evening: "晚间",
};

export function validateLeadForm(
  form: LeadFormValue,
  consented: boolean,
  minimumVisitDate = getShanghaiNaturalDate(),
): LeadValidationResult {
  const fieldErrors: LeadFieldErrors = {};
  if (!form.name.trim()) fieldErrors.name = "请填写称呼";
  if (!/^1[3-9][0-9]{9}$/.test(form.phone.trim())) {
    fieldErrors.phone = "请填写正确的手机号";
  }
  if (!/^[0-9]{6}$/.test(form.sms_code.trim())) {
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

export function resolveOptionalDetailsExpanded(
  current: boolean,
  _firstField: LeadValidationField | null,
): boolean {
  return current;
}

export function getShanghaiNaturalDate(now = Date.now()): string {
  return new Date(now + SHANGHAI_OFFSET_MS).toISOString().slice(0, 10);
}

export function buildLeadSuccessRoute(input: LeadSuccessRouteInput): string {
  const values = {
    appointment_no: input.appointmentNo,
    preferred_visit_date: input.preferredVisitDate,
    preferred_visit_period: input.preferredVisitPeriod,
    estimate_linked: input.estimateLinked ? "1" : "0",
  };
  const query = SUCCESS_OPTION_KEYS
    .map((key) => `${key}=${encodeURIComponent(values[key])}`)
    .join("&");
  return `/pages/lead-success/index?${query}`;
}

export function parseLeadSuccessOptions(
  options: Record<string, string | undefined>,
): LeadSuccessView | null {
  const keys = Object.keys(options);
  if (keys.length !== SUCCESS_OPTION_KEYS.length
    || !keys.every((key) => SUCCESS_OPTION_KEYS.includes(
      key as (typeof SUCCESS_OPTION_KEYS)[number],
    ))) return null;
  const appointmentNo = options.appointment_no;
  const preferredVisitDate = options.preferred_visit_date;
  const preferredVisitPeriod = options.preferred_visit_period;
  const estimateLinked = options.estimate_linked;
  if (typeof appointmentNo !== "string" || !APPOINTMENT_NO_PATTERN.test(appointmentNo)
    || typeof preferredVisitDate !== "string" || !isNaturalDate(preferredVisitDate)
    || !isVisitPeriod(preferredVisitPeriod)
    || (estimateLinked !== "0" && estimateLinked !== "1")) return null;
  return {
    appointmentNo,
    preferredVisitDate,
    preferredVisitDateLabel: formatVisitDate(preferredVisitDate),
    preferredVisitPeriod,
    preferredVisitPeriodLabel: VISIT_PERIOD_LABELS[preferredVisitPeriod],
    estimateLinked: estimateLinked === "1",
  };
}

function isNaturalDate(value: string): boolean {
  if (!ISO_DATE_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function isVisitPeriod(value: unknown): value is DouyinVisitPeriod {
  return typeof value === "string"
    && DOUYIN_VISIT_PERIODS.some((period) => period === value);
}

function formatVisitDate(value: string): string {
  const [year, month, day] = value.split("-");
  return `${year}年${Number(month)}月${Number(day)}日`;
}
