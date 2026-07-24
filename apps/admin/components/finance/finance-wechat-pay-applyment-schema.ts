import type {
  WechatPayApplymentAttachment,
  WechatPayApplymentRecord,
} from "./finance-wechat-pay-applyment-shared";

const REQUIRED_TEXT_FIELDS = [
  "subject_type",
  "merchant_short_name",
  "license_name",
  "license_code",
  "legal_representative_name",
  "identity_period_begin",
  "identity_period_end",
  "contact_type",
  "super_admin_name",
  "super_admin_email",
  "service_phone",
  "settlement_account_type",
  "settlement_account_name",
  "settlement_bank_name",
  "settlement_id",
  "qualification_type",
  "business_scene_description",
  "contact_address",
] as const;

const OPTIONAL_TEXT_FIELDS = [
  "license_address",
  "license_period_begin",
  "license_period_end",
  "settlement_bank_full_name",
  "settlement_bank_branch_id",
  "remark",
] as const;

const SENSITIVE_REPLACEMENT_FIELDS = [
  "identity_name",
  "identity_number",
  "identity_address",
  "super_admin_phone",
  "settlement_account_number",
  "contact_identity_number",
  "contact_identity_address",
] as const;

const CONTACT_IDENTITY_PERIOD_FIELDS = [
  "contact_identity_period_begin",
  "contact_identity_period_end",
] as const;

const DEFAULT_SUBJECT_TYPE = "SUBJECT_TYPE_ENTERPRISE";
const DEFAULT_CONTACT_TYPE = "LEGAL";

const CONTACT_ATTACHMENT_CATEGORIES = new Set([
  "contact_id_card_front",
  "contact_id_card_back",
]);

export function buildWechatPayApplymentDraftFallbackValues(
  persisted: Partial<WechatPayApplymentRecord> | null,
  latestLocal: Record<string, unknown> | null,
): {
  fallbackValues: Record<string, unknown>;
  localFallbackValues: Record<string, unknown>;
} {
  return {
    fallbackValues: { ...(persisted ?? {}) },
    localFallbackValues: { ...(latestLocal ?? {}) },
  };
}

export function buildWechatPayApplymentPartialDraftPayload(
  form: FormData,
  options: {
    attachments: WechatPayApplymentAttachment[];
    contactType?: string;
    subjectType?: string;
    overrides?: Record<string, unknown>;
    fallbackValues?: Record<string, unknown> | null;
    localFallbackValues?: Record<string, unknown> | null;
  },
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  const overrides = options.overrides ?? {};
  for (const field of [...REQUIRED_TEXT_FIELDS, ...OPTIONAL_TEXT_FIELDS]) {
    payload[field] = nullableTextWithFallback(
      form,
      field,
      draftFallbackValue(options, field),
    );
  }
  for (const field of CONTACT_IDENTITY_PERIOD_FIELDS) {
    payload[field] = nullableTextWithFallback(
      form,
      field,
      draftFallbackValue(options, field),
    );
  }
  for (const field of SENSITIVE_REPLACEMENT_FIELDS) {
    setNonBlankText(
      payload,
      form,
      field,
      options.localFallbackValues?.[field],
      normalizeIdentityNumber,
    );
  }
  for (const [field, value] of Object.entries(overrides)) {
    if (field !== "attachments") payload[field] = value;
  }

  const formSubjectType = text(form, "subject_type") ||
    normalizedFallback(draftFallbackValue(options, "subject_type"));
  const subjectTypeOverride = nonBlankOverride(overrides.subject_type);
  const subjectType = subjectTypeOverride ||
    options.subjectType ||
    formSubjectType ||
    DEFAULT_SUBJECT_TYPE;
  payload.subject_type = subjectType;
  if (
    subjectType !== formSubjectType &&
    !hasCompleteSettlementRuleOverride(overrides)
  ) {
    payload.settlement_id = null;
    payload.qualification_type = null;
  }
  const contactType = options.contactType ||
    nonBlankOverride(overrides.contact_type) ||
    text(form, "contact_type") ||
    normalizedFallback(draftFallbackValue(options, "contact_type")) ||
    DEFAULT_CONTACT_TYPE;
  payload.contact_type = contactType;
  if (contactType === "SUPER" && hasContactIdentityValue(payload)) {
    payload.contact_identity_doc_type = "IDENTIFICATION_TYPE_IDCARD";
  }
  if (hasLegalIdentityValue(payload)) {
    payload.identity_doc_type = "IDENTIFICATION_TYPE_IDCARD";
  }
  if (contactType === "LEGAL") removeContactIdentityValues(payload);

  payload.attachments = options.attachments.filter((attachment) =>
    contactType !== "LEGAL" ||
    !CONTACT_ATTACHMENT_CATEGORIES.has(attachment.category ?? "")
  );
  return payload;
}

export function buildWechatPayApplymentManualFieldOverride(
  field: string,
  value: string,
): Record<string, unknown> {
  const normalized = value.trim();
  if (
    REQUIRED_TEXT_FIELDS.includes(
      field as (typeof REQUIRED_TEXT_FIELDS)[number],
    ) ||
    OPTIONAL_TEXT_FIELDS.includes(
      field as (typeof OPTIONAL_TEXT_FIELDS)[number],
    ) ||
    CONTACT_IDENTITY_PERIOD_FIELDS.includes(
      field as (typeof CONTACT_IDENTITY_PERIOD_FIELDS)[number],
    )
  ) {
    return { [field]: normalized || null };
  }
  if (!normalized) return {};
  return { [field]: normalizeIdentityNumber(field, normalized) };
}

export function buildWechatPayApplymentPayload(
  form: FormData,
  options: {
    hasSensitivePayload: boolean;
    attachments: WechatPayApplymentAttachment[];
  },
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (const field of REQUIRED_TEXT_FIELDS) payload[field] = text(form, field);
  for (const field of OPTIONAL_TEXT_FIELDS) {
    payload[field] = text(form, field) || null;
  }

  payload.identity_doc_type = "IDENTIFICATION_TYPE_IDCARD";
  for (const field of SENSITIVE_REPLACEMENT_FIELDS) {
    const value = text(form, field);
    if (value) payload[field] = normalizeIdentityNumber(field, value);
    if (!value && !options.hasSensitivePayload) delete payload[field];
  }

  const contactType = text(form, "contact_type");
  if (contactType === "SUPER") {
    payload.contact_identity_doc_type = "IDENTIFICATION_TYPE_IDCARD";
    payload.contact_identity_period_begin = text(
      form,
      "contact_identity_period_begin",
    );
    payload.contact_identity_period_end = text(
      form,
      "contact_identity_period_end",
    );
  } else {
    delete payload.contact_identity_number;
    delete payload.contact_identity_address;
    delete payload.contact_identity_doc_type;
    delete payload.contact_identity_period_begin;
    delete payload.contact_identity_period_end;
  }

  payload.attachments = options.attachments.filter((attachment) =>
    contactType === "SUPER" ||
    !CONTACT_ATTACHMENT_CATEGORIES.has(attachment.category ?? "")
  );
  return payload;
}

function text(form: FormData, key: string) {
  return String(form.get(key) ?? "").trim();
}

function nullableText(form: FormData, key: string) {
  return text(form, key) || null;
}

function nullableTextWithFallback(
  form: FormData,
  key: string,
  fallback: unknown,
) {
  return form.has(key) ? nullableText(form, key) : normalizedFallback(fallback) ||
    null;
}

function draftFallbackValue(
  options: {
    fallbackValues?: Record<string, unknown> | null;
    localFallbackValues?: Record<string, unknown> | null;
  },
  key: string,
) {
  if (
    options.localFallbackValues &&
    Object.prototype.hasOwnProperty.call(options.localFallbackValues, key)
  ) {
    return options.localFallbackValues[key];
  }
  return options.fallbackValues?.[key];
}

function normalizedFallback(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function nonBlankOverride(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function hasCompleteSettlementRuleOverride(
  overrides: Record<string, unknown>,
): boolean {
  return Boolean(
    nonBlankOverride(overrides.settlement_id) &&
      nonBlankOverride(overrides.qualification_type),
  );
}

function normalizeIdentityNumber(field: string, value: string) {
  return field.endsWith("identity_number") || field === "identity_number"
    ? value.toUpperCase()
    : value;
}

function setNonBlankText(
  payload: Record<string, unknown>,
  form: FormData,
  field: string,
  localFallback: unknown,
  normalize: (field: string, value: string) => string = (_, value) => value,
) {
  const value = form.has(field)
    ? text(form, field)
    : normalizedFallback(localFallback);
  if (value) payload[field] = normalize(field, value);
}

function hasLegalIdentityValue(payload: Record<string, unknown>) {
  return [
    "identity_name",
    "identity_number",
    "identity_address",
    "identity_period_begin",
    "identity_period_end",
  ].some((field) => hasTextValue(payload[field]));
}

function hasContactIdentityValue(payload: Record<string, unknown>) {
  return [
    "contact_identity_number",
    "contact_identity_address",
    "contact_identity_period_begin",
    "contact_identity_period_end",
  ].some((field) => hasTextValue(payload[field]));
}

function hasTextValue(value: unknown) {
  return typeof value === "string" && value.length > 0;
}

function removeContactIdentityValues(payload: Record<string, unknown>) {
  for (const field of [
    "contact_identity_number",
    "contact_identity_address",
    "contact_identity_doc_type",
    "contact_identity_period_begin",
    "contact_identity_period_end",
  ]) {
    delete payload[field];
  }
}
