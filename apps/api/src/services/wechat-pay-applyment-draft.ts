import type {
  WechatPayApplymentRecord,
  WechatPayApplymentUpdate,
} from "@/repositories/wechat-pay-applyments";
import type {
  CreateWechatPayApplymentInput,
  UpdateWechatPayApplymentInput,
} from "@/schema/wechat-pay-applyments";
import type { ApplymentSensitiveDraftPayload } from "@/services/wechat-pay-applyment-sensitive-payload";

type TenantApplymentInput =
  | CreateWechatPayApplymentInput
  | UpdateWechatPayApplymentInput;

export function buildTenantApplymentSafePatch(
  input: TenantApplymentInput,
): WechatPayApplymentUpdate {
  const patch: WechatPayApplymentUpdate = {};
  assignIfDefined(patch, "subject_type", input.subject_type);
  assignIfDefined(patch, "merchant_short_name", input.merchant_short_name);
  assignIfDefined(patch, "license_name", input.license_name);
  assignIfDefined(patch, "license_code", input.license_code);
  assignIfDefined(patch, "license_address", input.license_address);
  assignIfDefined(patch, "license_period_begin", input.license_period_begin);
  assignIfDefined(patch, "license_period_end", input.license_period_end);
  assignIfDefined(
    patch,
    "legal_representative_name",
    input.legal_representative_name,
  );
  assignIfDefined(patch, "identity_doc_type", input.identity_doc_type);
  assignIfDefined(patch, "identity_period_begin", input.identity_period_begin);
  assignIfDefined(patch, "identity_period_end", input.identity_period_end);
  if (input.identity_address === null) {
    patch.identity_address_masked = null;
  } else if (typeof input.identity_address === "string") {
    patch.identity_address_masked = maskAddress(input.identity_address);
  }
  assignIfDefined(patch, "contact_type", input.contact_type);
  assignIfDefined(patch, "super_admin_name", input.super_admin_name);
  assignIfDefined(patch, "super_admin_email", input.super_admin_email);
  assignIfDefined(
    patch,
    "contact_identity_doc_type",
    input.contact_identity_doc_type,
  );
  assignIfDefined(
    patch,
    "contact_identity_period_begin",
    input.contact_identity_period_begin,
  );
  assignIfDefined(
    patch,
    "contact_identity_period_end",
    input.contact_identity_period_end,
  );
  if (input.contact_type === "LEGAL") {
    patch.contact_identity_doc_type = null;
    patch.contact_identity_period_begin = null;
    patch.contact_identity_period_end = null;
  }
  assignIfDefined(patch, "service_phone", input.service_phone);
  assignIfDefined(
    patch,
    "settlement_account_type",
    input.settlement_account_type,
  );
  assignIfDefined(
    patch,
    "settlement_account_name",
    input.settlement_account_name,
  );
  assignIfDefined(patch, "settlement_bank_name", input.settlement_bank_name);
  assignIfDefined(
    patch,
    "settlement_bank_full_name",
    input.settlement_bank_full_name,
  );
  assignIfDefined(
    patch,
    "settlement_bank_branch_id",
    input.settlement_bank_branch_id,
  );
  if (input.settlement_account_number === null) {
    patch.settlement_account_number_masked = null;
    patch.settlement_account_summary = null;
  } else if (typeof input.settlement_account_number === "string") {
    const accountNumber = input.settlement_account_number;
    patch.settlement_account_number_masked = maskBankAccountNumber(accountNumber);
    patch.settlement_account_summary = buildSettlementAccountSummary(
      input.settlement_bank_name ?? null,
      accountNumber,
    );
  } else {
    assignIfDefined(
      patch,
      "settlement_account_summary",
      input.settlement_account_summary,
    );
  }
  assignIfDefined(patch, "settlement_id", input.settlement_id);
  assignIfDefined(patch, "qualification_type", input.qualification_type);
  assignIfDefined(
    patch,
    "business_scene_description",
    input.business_scene_description,
  );
  assignIfDefined(patch, "contact_address", input.contact_address);
  assignIfDefined(patch, "attachments", input.attachments);
  assignIfDefined(patch, "remark", input.remark);
  if (input.super_admin_phone === null) {
    patch.super_admin_phone_masked = null;
  } else if (typeof input.super_admin_phone === "string") {
    patch.super_admin_phone_masked = maskPhone(input.super_admin_phone);
  }
  return patch;
}

export function buildCreateSensitivePayload(
  input: CreateWechatPayApplymentInput,
): ApplymentSensitiveDraftPayload {
  return {
    identity_name: input.identity_name,
    identity_number: input.identity_number,
    identity_address: input.identity_address ?? null,
    contact_name: input.super_admin_name,
    contact_phone: input.super_admin_phone,
    contact_email: input.super_admin_email,
    contact_identity_number: input.contact_type === "SUPER"
      ? input.contact_identity_number ?? null
      : null,
    contact_identity_address: input.contact_type === "SUPER"
      ? input.contact_identity_address ?? null
      : null,
    bank_account_name: input.settlement_account_name,
    bank_account_number: input.settlement_account_number,
  };
}

export function hasSensitiveDraftValues(
  payload: ApplymentSensitiveDraftPayload,
): boolean {
  return Object.values(payload).some((value) =>
    value !== null && value !== undefined && String(value).trim() !== ""
  );
}

export function buildDraftChangeAudit(input: object) {
  const sensitiveFields = new Set([
    "identity_name",
    "identity_number",
    "identity_address",
    "super_admin_phone",
    "contact_identity_number",
    "contact_identity_address",
    "settlement_account_number",
  ]);
  const changedFields = Object.keys(input)
    .filter((field) => field !== "draft_update_source")
    .sort();
  const changeSource = "draft_update_source" in input
    ? input.draft_update_source
    : undefined;
  return {
    changed_fields: changedFields,
    change_source: changeSource ?? "manual_save",
    has_sensitive_replacement: changedFields.some((field) =>
      sensitiveFields.has(field)
    ),
  };
}

export function mergeSensitivePayload(input: {
  current: ApplymentSensitiveDraftPayload;
  patch: UpdateWechatPayApplymentInput;
  contactType: string | null;
}): ApplymentSensitiveDraftPayload {
  const next: ApplymentSensitiveDraftPayload = { ...input.current };
  assignSensitive(next, "identity_name", input.patch.identity_name);
  assignSensitive(next, "identity_number", input.patch.identity_number);
  assignSensitive(next, "identity_address", input.patch.identity_address);
  assignSensitive(next, "contact_name", input.patch.super_admin_name);
  assignSensitive(next, "contact_phone", input.patch.super_admin_phone);
  assignSensitive(next, "contact_email", input.patch.super_admin_email);
  assignSensitive(
    next,
    "contact_identity_number",
    input.patch.contact_identity_number,
  );
  assignSensitive(
    next,
    "contact_identity_address",
    input.patch.contact_identity_address,
  );
  assignSensitive(
    next,
    "bank_account_name",
    input.patch.settlement_account_name,
  );
  assignSensitive(
    next,
    "bank_account_number",
    input.patch.settlement_account_number,
  );
  if (
    input.contactType === "LEGAL" &&
    (
      next.contact_identity_number !== undefined ||
      next.contact_identity_address !== undefined
    )
  ) {
    next.contact_identity_number = null;
    next.contact_identity_address = null;
  }
  return next;
}

export function hasSensitiveReplacement(
  input: UpdateWechatPayApplymentInput,
): boolean {
  return [
    input.identity_name,
    input.identity_number,
    input.identity_address,
    input.super_admin_name,
    input.super_admin_phone,
    input.super_admin_email,
    input.contact_identity_number,
    input.contact_identity_address,
    input.settlement_account_name,
    input.settlement_account_number,
  ].some((value) => value !== undefined);
}

export function sanitizeApplymentRecord(
  applyment: WechatPayApplymentRecord,
): WechatPayApplymentRecord {
  const unsafe = applyment as WechatPayApplymentRecord & {
    sensitive_payload_ciphertext?: unknown;
  };
  const { sensitive_payload_ciphertext: _ignored, ...safe } = unsafe;
  return safe;
}

function assignIfDefined<K extends keyof WechatPayApplymentUpdate>(
  target: WechatPayApplymentUpdate,
  key: K,
  value: WechatPayApplymentUpdate[K] | undefined,
) {
  if (value !== undefined) target[key] = value;
}

function assignSensitive<K extends keyof ApplymentSensitiveDraftPayload>(
  target: ApplymentSensitiveDraftPayload,
  key: K,
  value: ApplymentSensitiveDraftPayload[K] | undefined,
) {
  if (value !== undefined) target[key] = value;
}

function maskPhone(phone: string | null | undefined) {
  const normalized = phone?.trim() ?? "";
  if (normalized.length < 7) return normalized || null;
  return `${normalized.slice(0, 3)}****${normalized.slice(-4)}`;
}

function maskBankAccountNumber(accountNumber: string) {
  const normalized = accountNumber.trim();
  if (normalized.length <= 6) return normalized;
  const hiddenLength = Math.max(normalized.length - 6, 4);
  return `${normalized.slice(0, 2)}${"*".repeat(hiddenLength)}${normalized.slice(-4)}`;
}

function maskAddress(address: string | null | undefined) {
  const normalized = address?.trim() ?? "";
  if (!normalized) return null;
  if (normalized.length <= 6) return `${normalized.slice(0, 2)}***`;
  return `${normalized.slice(0, 6)}***${normalized.slice(-2)}`;
}

function buildSettlementAccountSummary(
  bankName: string | null | undefined,
  accountNumber: string,
) {
  const tail = accountNumber.trim().slice(-4);
  const prefix = bankName?.trim();
  return [prefix, tail ? `尾号 ${tail}` : null].filter(Boolean).join(" ");
}
