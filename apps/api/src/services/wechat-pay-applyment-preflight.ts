import { AppError } from "@/errors/app-error";
import { platformPaymentConfigRepository } from "@/repositories/platform-payment-configs";
import {
  wechatPayApplymentRepository,
  type WechatPayApplymentRecord,
  type WechatPayApplymentSensitiveRecord,
} from "@/repositories/wechat-pay-applyments";
import { WechatPayApplymentAttachmentCategorySchema } from "@/schema/wechat-pay-applyments";
import { getApplymentSubmitReadinessMissingFields } from "@/services/wechat-pay-applyment-readiness";
import { decryptApplymentSensitivePayload } from "@/services/wechat-pay-applyment-sensitive-payload";
import { loadApplymentRuntimeProfile } from "@/services/wechat-pay-applyment-submission-support";
import { wechatPaySecretBundleService } from "@/services/wechat-pay-secret-bundles";
import type {
  WechatPayApplymentPreflightBlocker,
  WechatPayApplymentPreflightReport,
} from "@/services/wechat-pay-applyments-types";

export type {
  WechatPayApplymentPreflightBlocker,
  WechatPayApplymentPreflightReport,
} from "@/services/wechat-pay-applyments-types";

const SUBMISSION_LEASE_MS = 5 * 60 * 1000;
const MAX_MEDIA_SIZE_BYTES = 2 * 1024 * 1024;
const ALLOWED_MEDIA_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/bmp",
]);
const SAFE_CODE_PATTERN = /^[A-Z][A-Z0-9_]{0,127}$/;
const SAFE_FIELD_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;
const SUBMITTABLE_STATUSES = new Set(["approved", "wechat_editing"]);
const SINGLETON_MEDIA_CATEGORIES = new Set([
  "license_copy",
  "legal_representative_id_card_front",
  "legal_representative_id_card_back",
  "contact_id_card_front",
  "contact_id_card_back",
  "settlement_account_proof",
]);

type PreflightRepository = {
  findById: (input: { id: string }) => Promise<WechatPayApplymentRecord | null>;
  findSensitivePayloadById: (input: {
    id: string;
    tenantId: string;
  }) => Promise<WechatPayApplymentSensitiveRecord | null>;
};

type PreflightDependencies = {
  repository?: PreflightRepository;
  loadRuntimeProfile?: () => Promise<unknown>;
  encryptionRootSecretFactory?: () => string | null | undefined;
  nowFactory?: () => string;
};

export async function runWechatPayApplymentPreflight(
  applymentId: string,
  dependencies: PreflightDependencies = {},
): Promise<WechatPayApplymentPreflightReport> {
  const blockers = createBlockerCollector();
  const repository = dependencies.repository ?? wechatPayApplymentRepository;
  const now = dependencies.nowFactory?.() ?? new Date().toISOString();
  let applyment: WechatPayApplymentRecord | null;

  try {
    applyment = await repository.findById({ id: applymentId });
  } catch {
    blockers.add({ code: "PREFLIGHT_DATA_ACCESS_FAILED" });
    return blockers.report();
  }
  if (!applyment) {
    blockers.add({ code: "APPLYMENT_NOT_FOUND" });
    return blockers.report();
  }

  collectSubmissionStatusBlockers(applyment, now, blockers.add);
  collectRequiredFieldBlockers(applyment, blockers.add);
  collectAttachmentBlockers(applyment, blockers.add);
  await collectSensitivePayloadBlockers({
    applyment,
    repository,
    rootSecret: dependencies.encryptionRootSecretFactory?.() ??
      process.env.APP_CONFIG_ENCRYPTION_KEY,
    add: blockers.add,
  });
  await collectRuntimeProfileBlockers(
    dependencies.loadRuntimeProfile ?? (() => loadApplymentRuntimeProfile({
      repository: platformPaymentConfigRepository,
      secretBundleService: wechatPaySecretBundleService,
    })),
    blockers.add,
  );

  return blockers.report();
}

function collectSubmissionStatusBlockers(
  applyment: WechatPayApplymentRecord,
  now: string,
  add: (blocker: WechatPayApplymentPreflightBlocker) => void,
) {
  if (SUBMITTABLE_STATUSES.has(applyment.status)) return;
  if (applyment.status !== "applying") {
    add({ code: "APPLYMENT_STATUS_NOT_SUBMITTABLE" });
    return;
  }
  if (!applyment.submission_claimed_at) return;
  const claimedAt = Date.parse(applyment.submission_claimed_at);
  const nowTime = Date.parse(now);
  if (!Number.isFinite(claimedAt) || !Number.isFinite(nowTime)) {
    add({ code: "APPLYMENT_SUBMISSION_LEASE_INVALID" });
    return;
  }
  if (claimedAt > nowTime - SUBMISSION_LEASE_MS) {
    add({ code: "APPLYMENT_SUBMISSION_IN_PROGRESS" });
  }
}

function collectRequiredFieldBlockers(
  applyment: WechatPayApplymentRecord,
  add: (blocker: WechatPayApplymentPreflightBlocker) => void,
) {
  for (const missing of getApplymentSubmitReadinessMissingFields(applyment)) {
    if (missing === "sensitive_payload") {
      add({ code: "APPLYMENT_SENSITIVE_PAYLOAD_MISSING" });
      continue;
    }
    if (missing.startsWith("attachments.")) {
      const category = missing.slice("attachments.".length);
      const parsed = WechatPayApplymentAttachmentCategorySchema.safeParse(category);
      add({
        code: "APPLYMENT_REQUIRED_ATTACHMENT_MISSING",
        ...(parsed.success ? { category: parsed.data } : {}),
      });
      continue;
    }
    add({
      code: "APPLYMENT_REQUIRED_FIELD_MISSING",
      ...(SAFE_FIELD_PATTERN.test(missing) ? { field: missing } : {}),
    });
  }
}

function collectAttachmentBlockers(
  applyment: WechatPayApplymentRecord,
  add: (blocker: WechatPayApplymentPreflightBlocker) => void,
) {
  if (!Array.isArray(applyment.attachments)) return;
  const seen = new Set<string>();
  for (const value of applyment.attachments) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      add({ code: "APPLYMENT_MEDIA_METADATA_INVALID" });
      continue;
    }
    const attachment = value as Record<string, unknown>;
    const parsedCategory = WechatPayApplymentAttachmentCategorySchema.safeParse(
      attachment.category,
    );
    if (!parsedCategory.success) {
      add({ code: "APPLYMENT_MEDIA_CATEGORY_INVALID" });
      continue;
    }
    const category = parsedCategory.data;
    if (SINGLETON_MEDIA_CATEGORIES.has(category) && seen.has(category)) {
      add({ code: "APPLYMENT_MEDIA_CATEGORY_DUPLICATE", category });
    }
    seen.add(category);
    if (!isOwnedObjectKey(attachment.object_key, applyment.tenant_id)) {
      add({ code: "APPLYMENT_OBJECT_KEY_INVALID", category });
    }
    if (!ALLOWED_MEDIA_TYPES.has(String(attachment.content_type ?? ""))) {
      add({ code: "APPLYMENT_MEDIA_TYPE_UNSUPPORTED", category });
    }
    const size = attachment.size;
    if (!Number.isSafeInteger(size) || Number(size) <= 0) {
      add({ code: "APPLYMENT_MEDIA_SIZE_INVALID", category });
    } else if (Number(size) > MAX_MEDIA_SIZE_BYTES) {
      add({ code: "APPLYMENT_MEDIA_TOO_LARGE", category });
    }
  }
}

async function collectSensitivePayloadBlockers(input: {
  applyment: WechatPayApplymentRecord;
  repository: PreflightRepository;
  rootSecret: string | null | undefined;
  add: (blocker: WechatPayApplymentPreflightBlocker) => void;
}) {
  if (
    !input.applyment.has_sensitive_payload ||
    !input.applyment.sensitive_payload_version
  ) return;
  let sensitive: WechatPayApplymentSensitiveRecord | null;
  try {
    sensitive = await input.repository.findSensitivePayloadById({
      id: input.applyment.id,
      tenantId: input.applyment.tenant_id,
    });
  } catch {
    input.add({ code: "PREFLIGHT_DATA_ACCESS_FAILED" });
    return;
  }
  if (
    !sensitive?.has_sensitive_payload ||
    !sensitive.sensitive_payload_ciphertext ||
    !sensitive.sensitive_payload_version
  ) {
    input.add({ code: "APPLYMENT_SENSITIVE_PAYLOAD_MISSING" });
    return;
  }
  if (
    sensitive.sensitive_payload_version !==
      input.applyment.sensitive_payload_version
  ) {
    input.add({ code: "APPLYMENT_SENSITIVE_PAYLOAD_VERSION_MISMATCH" });
    return;
  }
  try {
    decryptApplymentSensitivePayload({
      context: {
        tenantId: input.applyment.tenant_id,
        applymentId: input.applyment.id,
        version: sensitive.sensitive_payload_version,
      },
      ciphertext: sensitive.sensitive_payload_ciphertext,
      rootSecret: input.rootSecret,
    });
  } catch {
    input.add({ code: "APPLYMENT_SENSITIVE_PAYLOAD_UNREADABLE" });
  }
}

async function collectRuntimeProfileBlockers(
  loadRuntimeProfile: () => Promise<unknown>,
  add: (blocker: WechatPayApplymentPreflightBlocker) => void,
) {
  try {
    await loadRuntimeProfile();
  } catch (error) {
    if (!(error instanceof AppError)) {
      add({ code: "PREFLIGHT_INTERNAL_ERROR" });
      return;
    }
    const details = safeRecord(error.details);
    const blockerCodes = Array.isArray(details.blocker_codes)
      ? details.blocker_codes
      : [];
    const safeCodes = blockerCodes.filter((code): code is string =>
      typeof code === "string" && SAFE_CODE_PATTERN.test(code) &&
      code.startsWith("PLATFORM_PAYMENT_")
    );
    if (safeCodes.length > 0) {
      for (const code of safeCodes) add({ code });
      return;
    }
    add({
      code: isSafeRuntimeErrorCode(error.code)
        ? error.code
        : "PREFLIGHT_INTERNAL_ERROR",
    });
  }
}

function createBlockerCollector() {
  const blockers: WechatPayApplymentPreflightBlocker[] = [];
  const seen = new Set<string>();
  const add = (blocker: WechatPayApplymentPreflightBlocker) => {
    const key = JSON.stringify(blocker);
    if (seen.has(key)) return;
    seen.add(key);
    blockers.push(blocker);
  };
  return {
    add,
    report: (): WechatPayApplymentPreflightReport => ({
      ready: blockers.length === 0,
      blockers,
    }),
  };
}

function isOwnedObjectKey(value: unknown, tenantId: string): boolean {
  if (typeof value !== "string") return false;
  const expectedPrefix = `tenants/${tenantId}/wechat-pay-applyment/`;
  const segments = value.split("/");
  return value === value.trim() && value.startsWith(expectedPrefix) &&
    !/^https?:\/\//i.test(value) && !value.includes("\\") &&
    !segments.some((segment) => segment === "." || segment === "..");
}

function safeRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function isSafeRuntimeErrorCode(code: string): boolean {
  return SAFE_CODE_PATTERN.test(code) &&
    (code.startsWith("PLATFORM_PAYMENT_") || code.startsWith("WECHAT_PAY_"));
}
