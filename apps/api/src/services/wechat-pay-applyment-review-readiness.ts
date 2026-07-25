import { ocrRecognitionRepository } from "@/repositories/ocr-recognitions";
import {
  wechatPayApplymentRepository,
  type WechatPayApplymentRecord,
  type WechatPayApplymentSensitiveRecord,
} from "@/repositories/wechat-pay-applyments";
import { WechatPayApplymentAttachmentCategorySchema } from "@/schema/wechat-pay-applyments";
import {
  getApplymentSubmissionContentBlockers,
  loadApplymentSensitiveDraftPayload,
} from "@/services/wechat-pay-applyment-content-validation";
import { getApplymentSubmitReadinessMissingFields } from "@/services/wechat-pay-applyment-readiness";
import { getMissingApplymentSensitiveFields } from "@/services/wechat-pay-applyment-sensitive-payload";
import type {
  WechatPayApplymentOcrRecognitionRepositoryPort,
  WechatPayApplymentPreflightBlocker,
  WechatPayApplymentSubmissionReadiness,
  WechatPayApplymentTenantReviewReadinessPort,
} from "@/services/wechat-pay-applyments-types";
import type {
  WechatPaySettlementRuleService,
} from "@/services/wechat-pay-settlement-rules";

const MAX_MEDIA_SIZE_BYTES = 2 * 1024 * 1024;
const ALLOWED_MEDIA_TYPES = new Set(["image/jpeg", "image/png", "image/bmp"]);
const SAFE_FIELD_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;
type SettlementRuleValidationPort = Pick<
  WechatPaySettlementRuleService,
  "assertActiveRule"
>;
const SINGLETON_MEDIA_CATEGORIES = new Set([
  "license_copy",
  "legal_representative_id_card_front",
  "legal_representative_id_card_back",
  "contact_id_card_front",
  "contact_id_card_back",
  "settlement_account_proof",
]);

type TenantReviewRepository = {
  findSensitivePayloadById: (input: {
    id: string;
    tenantId: string;
  }) => Promise<WechatPayApplymentSensitiveRecord | null>;
};

export type TenantReviewReadinessDependencies = {
  repository?: TenantReviewRepository;
  ocrRecognitionRepository?: WechatPayApplymentOcrRecognitionRepositoryPort;
  encryptionRootSecretFactory?: () => string | null | undefined;
  settlementRuleService?: SettlementRuleValidationPort;
};

export function createWechatPayApplymentTenantReviewReadinessService(
  dependencies: TenantReviewReadinessDependencies = {},
): WechatPayApplymentTenantReviewReadinessPort {
  return {
    runForApplyment: (applyment) =>
      runWechatPayApplymentTenantReviewReadiness(applyment, dependencies),
  };
}

export async function runWechatPayApplymentTenantReviewReadiness(
  applyment: WechatPayApplymentRecord,
  dependencies: TenantReviewReadinessDependencies = {},
): Promise<WechatPayApplymentSubmissionReadiness> {
  const blockers = createBlockerCollector();
  const repository = dependencies.repository ?? wechatPayApplymentRepository;
  collectRequiredFieldBlockers(applyment, blockers.add);
  collectAttachmentBlockers(applyment, blockers.add);
  await collectSubmissionContentBlockers({
    applyment,
    ocrRecognitionRepository: dependencies.ocrRecognitionRepository ??
      ocrRecognitionRepository,
    settlementRuleService: dependencies.settlementRuleService,
    add: blockers.add,
  });
  await collectSensitivePayloadBlockers({
    applyment,
    repository,
    rootSecret: dependencies.encryptionRootSecretFactory?.() ??
      process.env.APP_CONFIG_ENCRYPTION_KEY,
    add: blockers.add,
  });
  return blockers.report();
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

async function collectSubmissionContentBlockers(input: {
  applyment: WechatPayApplymentRecord;
  ocrRecognitionRepository: WechatPayApplymentOcrRecognitionRepositoryPort;
  settlementRuleService?: SettlementRuleValidationPort;
  add: (blocker: WechatPayApplymentPreflightBlocker) => void;
}) {
  try {
    for (const blocker of await getApplymentSubmissionContentBlockers(input)) {
      input.add(blocker);
    }
  } catch {
    input.add({ code: "PREFLIGHT_DATA_ACCESS_FAILED" });
  }
}

async function collectSensitivePayloadBlockers(input: {
  applyment: WechatPayApplymentRecord;
  repository: TenantReviewRepository;
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
    const payload = await loadApplymentSensitiveDraftPayload({
      applyment: input.applyment,
      repository: { findSensitivePayloadById: async () => sensitive },
      rootSecret: input.rootSecret,
    });
    for (
      const field of getMissingApplymentSensitiveFields(
        payload,
        input.applyment.contact_type,
      )
    ) {
      input.add({
        code: "APPLYMENT_REQUIRED_FIELD_MISSING",
        field: `sensitive.${field}`,
      });
    }
  } catch {
    input.add({ code: "APPLYMENT_SENSITIVE_PAYLOAD_UNREADABLE" });
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
    report: (): WechatPayApplymentSubmissionReadiness => {
      const ready = blockers.length === 0;
      return { ready, review_ready: ready, blockers };
    },
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
