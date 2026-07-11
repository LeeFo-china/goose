export interface PartnerApplicationFormErrors {
  readonly applicant_name?: string;
  readonly contact_name?: string;
  readonly phone?: string;
  readonly privacy?: string;
  readonly region_name?: string;
  readonly sms_code?: string;
}

interface PartnerAttribution {
  readonly sourceUrl?: string;
  readonly utmCampaign?: string;
  readonly utmMedium?: string;
  readonly utmSource?: string;
}

const SOURCE_URL_MAX_LENGTH = 500;
const UTM_MAX_LENGTH = 120;
const INVALID_FIELD_ORDER: ReadonlyArray<
  readonly [keyof PartnerApplicationFormErrors, string]
> = [
  ["applicant_name", "applicant_name"],
  ["contact_name", "contact_name"],
  ["phone", "phone"],
  ["sms_code", "sms_code"],
  ["region_name", "region_name"],
  ["privacy", "agree_privacy"],
];

export function validatePartnerApplicationForm(
  formData: FormData,
  agreePrivacy: boolean,
): PartnerApplicationFormErrors {
  const errors: Record<string, string> = {};
  if (!stringField(formData, "applicant_name")) {
    errors.applicant_name = "请填写申请主体";
  }
  if (!stringField(formData, "contact_name")) {
    errors.contact_name = "请填写联系人";
  }

  const phoneError = validatePhone(stringField(formData, "phone"));
  if (phoneError) errors.phone = phoneError;

  const smsCode = optionalString(formData, "sms_code");
  if (smsCode && !/^\d{4,6}$/.test(smsCode)) {
    errors.sms_code = "请输入 4-6 位数字验证码";
  }
  if (!stringField(formData, "region_name")) {
    errors.region_name = "请填写意向代理城市";
  }
  if (!agreePrivacy) errors.privacy = "请先确认申请信息使用说明";

  return errors;
}

export function validatePhone(value: string): string | undefined {
  return /^1[3-9]\d{9}$/.test(value.trim())
    ? undefined
    : "请输入正确的 11 位手机号";
}

export function buildPartnerApplicationPayload(
  formData: FormData,
  subjectType: string,
  agreePrivacy: boolean,
  attribution = readBrowserAttribution(),
): Record<string, unknown> {
  return cleanPayload({
    applicant_name: stringField(formData, "applicant_name"),
    subject_type: subjectType,
    contact_name: stringField(formData, "contact_name"),
    phone: stringField(formData, "phone"),
    sms_code: optionalString(formData, "sms_code"),
    region_codes: [],
    region_name: stringField(formData, "region_name"),
    business_description: optionalString(formData, "business_description"),
    resource_description: optionalString(formData, "resource_description"),
    message: optionalString(formData, "message"),
    source_channel: "official_website",
    source_url: attribution.sourceUrl,
    utm_source: attribution.utmSource,
    utm_medium: attribution.utmMedium,
    utm_campaign: attribution.utmCampaign,
    agree_privacy: agreePrivacy,
  });
}

export function normalizePartnerAttribution(
  href: string,
  search: string,
): PartnerAttribution {
  const params = new URLSearchParams(search);

  return {
    sourceUrl: normalizeSourceUrl(href),
    utmSource: normalizeUtm(params.get("utm_source")),
    utmMedium: normalizeUtm(params.get("utm_medium")),
    utmCampaign: normalizeUtm(params.get("utm_campaign")),
  };
}

export function focusFirstInvalidField(
  form: HTMLFormElement,
  errors: PartnerApplicationFormErrors,
): string | null {
  for (const [errorKey, fieldName] of INVALID_FIELD_ORDER) {
    if (!errors[errorKey]) continue;
    const control = form.elements.namedItem(fieldName);
    if (control && "focus" in control && typeof control.focus === "function") {
      control.focus();
      return fieldName;
    }
  }

  return null;
}

function readBrowserAttribution(): PartnerAttribution {
  return typeof window === "undefined"
    ? {}
    : normalizePartnerAttribution(window.location.href, window.location.search);
}

function normalizeSourceUrl(href: string): string | undefined {
  const sourceUrl = href.trim();
  if (!sourceUrl) return undefined;
  if (sourceUrl.length <= SOURCE_URL_MAX_LENGTH) return sourceUrl;

  try {
    const parsed = new URL(sourceUrl);
    parsed.search = "";
    parsed.hash = "";
    const withoutMarketingQuery = parsed.toString();
    return withoutMarketingQuery.length <= SOURCE_URL_MAX_LENGTH
      ? withoutMarketingQuery
      : undefined;
  } catch {
    return undefined;
  }
}

function normalizeUtm(value: string | null): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized.slice(0, UTM_MAX_LENGTH) : undefined;
}

function stringField(formData: FormData, key: string): string {
  const value = formData.get(key);

  return typeof value === "string" ? value.trim() : "";
}

function optionalString(formData: FormData, key: string): string | undefined {
  return stringField(formData, key) || undefined;
}

function cleanPayload(payload: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(payload).filter(
      ([, value]) => value !== undefined && value !== "",
    ),
  );
}
