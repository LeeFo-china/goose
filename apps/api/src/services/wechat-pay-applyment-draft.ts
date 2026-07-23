import { Errors } from "@/errors/error-factory";
import type {
  WechatPayApplymentRecord,
  WechatPayApplymentSensitiveRecord,
  WechatPayApplymentUpdate,
} from "@/repositories/wechat-pay-applyments";
import type {
  CreateWechatPayApplymentInput,
  UpdateWechatPayApplymentInput,
} from "@/schema/wechat-pay-applyments";
import {
  decryptApplymentSensitivePayload,
  encryptApplymentSensitivePayload,
  type ApplymentSensitiveDraftPayload,
} from "@/services/wechat-pay-applyment-sensitive-payload";

type TenantApplymentInput =
  | CreateWechatPayApplymentInput
  | UpdateWechatPayApplymentInput;

const SENSITIVE_DRAFT_FIELD_MAPPINGS = [
  { source: "identity_name", target: "identity_name" },
  { source: "identity_number", target: "identity_number" },
  { source: "identity_address", target: "identity_address" },
  { source: "super_admin_name", target: "contact_name" },
  { source: "super_admin_phone", target: "contact_phone" },
  { source: "super_admin_email", target: "contact_email" },
  {
    source: "contact_identity_number",
    target: "contact_identity_number",
  },
  {
    source: "contact_identity_address",
    target: "contact_identity_address",
  },
  { source: "settlement_account_name", target: "bank_account_name" },
  { source: "settlement_account_number", target: "bank_account_number" },
] as const satisfies readonly {
  source: keyof UpdateWechatPayApplymentInput;
  target: keyof ApplymentSensitiveDraftPayload;
}[];

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

export async function buildSensitivePayloadUpdate(input: {
  current: WechatPayApplymentRecord;
  input: UpdateWechatPayApplymentInput;
  tenantId: string;
  loadSensitivePayload: () => Promise<
    WechatPayApplymentSensitiveRecord | null
  >;
  rootSecret: string | null | undefined;
  now: string;
}): Promise<WechatPayApplymentUpdate> {
  const hasReplacement = hasSensitiveReplacement(input.input);
  const shouldClearAgentFields = input.current.has_sensitive_payload &&
    input.input.contact_type === "LEGAL";
  if (!hasReplacement && !shouldClearAgentFields) return {};

  let currentPayload: ApplymentSensitiveDraftPayload = {};
  let version = 1;
  if (input.current.has_sensitive_payload) {
    const stored = await input.loadSensitivePayload();
    if (
      !stored?.has_sensitive_payload ||
      !stored.sensitive_payload_ciphertext ||
      !stored.sensitive_payload_version ||
      (
        input.current.sensitive_payload_version !== null &&
        stored.sensitive_payload_version !==
          input.current.sensitive_payload_version
      )
    ) {
      throw Errors.business(
        500,
        "微信支付进件敏感资料存储状态异常",
        "WECHAT_PAY_APPLYMENT_SENSITIVE_PAYLOAD_CORRUPTED",
      );
    }
    version = stored.sensitive_payload_version;
    currentPayload = decryptApplymentSensitivePayload({
      context: {
        tenantId: input.tenantId,
        applymentId: input.current.id,
        version,
      },
      ciphertext: stored.sensitive_payload_ciphertext,
      rootSecret: input.rootSecret,
    });
  }
  const nextPayload = mergeSensitivePayload({
    current: currentPayload,
    patch: input.input,
    contactType: input.input.contact_type ?? input.current.contact_type,
  });
  if (
    !input.current.has_sensitive_payload &&
    !hasSensitiveDraftValues(nextPayload)
  ) return {};
  return {
    has_sensitive_payload: true,
    sensitive_payload_ciphertext: encryptApplymentSensitivePayload({
      context: {
        tenantId: input.tenantId,
        applymentId: input.current.id,
        version,
      },
      payload: nextPayload,
      rootSecret: input.rootSecret,
    }),
    sensitive_payload_version: version,
    sensitive_payload_updated_at: input.now,
  };
}

export function mergeSensitivePayload(input: {
  current: ApplymentSensitiveDraftPayload;
  patch: UpdateWechatPayApplymentInput;
  contactType: string | null;
}): ApplymentSensitiveDraftPayload {
  const next: ApplymentSensitiveDraftPayload = { ...input.current };
  for (const { source, target } of SENSITIVE_DRAFT_FIELD_MAPPINGS) {
    assignSensitive(next, target, input.patch[source]);
  }
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
  return getSensitiveReplacementFields(input).length > 0;
}

export function getSensitiveReplacementFields(input: object): string[] {
  const inputRecord = input as Record<string, unknown>;
  return SENSITIVE_DRAFT_FIELD_MAPPINGS
    .filter(({ source }) => inputRecord[source] !== undefined)
    .map(({ source }) => source);
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
