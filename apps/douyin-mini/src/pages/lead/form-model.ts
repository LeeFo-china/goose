export type LeadFormValue = {
  name: string;
  phone: string;
  sms_code: string;
  community: string;
  area: string;
  budget: string;
  start_time: string;
  demand: string;
  consented_at: string;
};

export type LeadField = keyof LeadFormValue;
export type LeadValidationField = "name" | "phone" | "sms_code" | "area" | "consent";
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
  "area",
  "consent",
];

const FIELD_TO_VALIDATION: Partial<Record<LeadField, LeadValidationField>> = {
  name: "name",
  phone: "phone",
  sms_code: "sms_code",
  area: "area",
  consented_at: "consent",
};

export function validateLeadForm(
  form: LeadFormValue,
  consented: boolean,
): LeadValidationResult {
  const fieldErrors: LeadFieldErrors = {};
  if (!form.name.trim()) fieldErrors.name = "请填写称呼";
  if (!/^1[3-9][0-9]{9}$/.test(form.phone.trim())) {
    fieldErrors.phone = "请填写正确的手机号";
  }
  if (!/^[0-9]{6}$/.test(form.sms_code.trim())) {
    fieldErrors.sms_code = "请填写6位短信验证码";
  }
  if (form.area.trim()) {
    const area = Number(form.area);
    if (!Number.isFinite(area) || area <= 0 || area > 100_000) {
      fieldErrors.area = "请填写正确的房屋面积";
    }
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
  firstField: LeadValidationField | null,
): boolean {
  return current || firstField === "area";
}
