import { mock } from "bun:test";

import type { OcrPlatformFileObjectRecord } from "@/repositories/platform-file-objects";
import type { AuthContext } from "@/services/authorization";
import type { OcrServiceDependencies } from "./service";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const serviceModulePromise = import("./service");
export const NOW = "2026-07-22T10:00:00.000Z";
const EXPIRES_AT = "2026-07-23T10:00:00.000Z";

export const authContext = {
  employeeId: "employee-1",
  tenantId: "tenant-1",
  isPlatformAdmin: false,
  permissions: [
    { code: "ocr.recognize", scope: "all" },
    { code: "wechat_pay.applyment.submit", scope: "all" },
  ],
} as AuthContext;

export const file = {
  id: "file-1",
  tenant_id: "tenant-1",
  owner_type: "wechat_pay_applyment",
  owner_id: "applyment-1",
  scene: "wechat_pay_applyment",
  provider: "tencent_cos",
  bucket: "bucket",
  region: "ap-guangzhou",
  object_key: "tenants/tenant-1/wechat-pay-applyment/applyment-1/license.jpg",
  mime_type: "image/jpeg",
  size_bytes: 1000,
  checksum: "checksum-1",
  visibility: "private",
  status: "active",
  deleted_at: null,
  created_by_employee_id: "employee-1",
} satisfies OcrPlatformFileObjectRecord;

const applyment = {
  id: "applyment-1",
  tenant_id: "tenant-1",
  attachments: [{ category: "license_copy", object_key: file.object_key }],
};

export const normalizedResult = {
  fields: [{
    key: "license_name",
    label: "营业执照主体名称",
    value: "示例公司",
    normalized: true,
    sensitive: false,
    confidence: null,
  }],
  warnings: [],
  quality: {},
};
const normalized = { ...normalizedResult, providerRequestId: "provider-request-1" };

export function buildRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "recognition-1",
    tenant_id: "tenant-1",
    actor_employee_id: "employee-1",
    scene: "wechat_pay_applyment",
    document_type: "business_license",
    provider: "tencent_cloud",
    provider_action: "BizLicenseOCR",
    file_object_id: "file-1",
    file_checksum: "checksum-1",
    subject_type: "wechat_pay_applyment",
    subject_id: "applyment-1",
    status: "processing",
    idempotency_key: "11111111-1111-4111-8111-111111111111",
    dedupe_key: "dedupe-1",
    result_ciphertext: null,
    result_summary: {},
    warnings: [],
    quality: {},
    provider_request_id: null,
    provider_error_code: null,
    provider_error_message_safe: null,
    billable_units: 0,
    duration_ms: null,
    processed_at: null,
    expires_at: EXPIRES_AT,
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  };
}

type HarnessInput = {
  fileRecord?: OcrPlatformFileObjectRecord | null;
  permissions?: AuthContext["permissions"];
  idempotentRecord?: ReturnType<typeof buildRecord> | null;
  dedupeRecord?: ReturnType<typeof buildRecord> | null;
  dailyCount?: number;
  gatewayError?: unknown;
  applymentRecord?: typeof applyment | null;
  createError?: unknown;
  ocrEnabled?: boolean;
  encryptedIdEnabled?: boolean;
  resultEncryptionKey?: string;
  tenantPolicy?: {
    enabled: boolean;
    allowedDocumentTypes: Array<
      "business_license" | "id_card_front" | "id_card_back" | "bank_card"
    >;
    dailyLimit: number;
  };
};

const DEFAULT_TENANT_POLICY: NonNullable<HarnessInput["tenantPolicy"]> = {
  enabled: true,
  allowedDocumentTypes: [
    "business_license",
    "id_card_front",
    "id_card_back",
    "bank_card",
  ],
  dailyLimit: 100,
};

export async function createHarness(input: HarnessInput = {}) {
  const { OcrService } = await serviceModulePromise;
  const processing = buildRecord();
  const succeeded = buildRecord({
    status: "succeeded",
    result_ciphertext: "encrypted-result",
    result_summary: { field_keys: ["license_name"] },
    provider_request_id: "provider-request-1",
    duration_ms: 25,
    processed_at: NOW,
  });
  const repository = {
    findByTenantAndIdempotencyKey: mock(async () => input.idempotentRecord ?? null),
    findActiveByDedupeKey: mock(async () => input.dedupeRecord ?? null),
    expireStaleByDedupeKey: mock(async () => undefined),
    countTenantSince: mock(async () => input.dailyCount ?? 0),
    createProcessing: mock(async () => {
      if (input.createError) throw input.createError;
      return processing;
    }),
    markSucceeded: mock(async () => succeeded),
    markFailed: mock(async () => processing),
    findByIdForTenant: mock(async () => succeeded),
    listPlatform: mock(async () => ({
      list: [],
      pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
    })),
  };
  const gateway = {
    recognize: mock(async () => {
      if (input.gatewayError) throw input.gatewayError;
      return { Name: "示例公司", RequestId: "provider-request-1" };
    }),
  };
  const dependencies = {
    repository,
    fileRepository: {
      findActiveById: mock(async () =>
        input.fileRecord === undefined ? file : input.fileRecord),
    },
    applymentRepository: {
      findById: mock(async () =>
        input.applymentRecord === undefined ? applyment : input.applymentRecord),
    },
    accessPolicy: {
      assertTenantContext: mock(() => "tenant-1"),
      hasPermission: mock((context: AuthContext, code: string) =>
        context.permissions.some((item) => item.code === code)),
    },
    tenantPolicy: {
      getRuntimePolicy: mock(async () =>
        input.tenantPolicy ?? DEFAULT_TENANT_POLICY),
    },
    gateway,
    settings: {
      getSecretString: mock(async (_key: string, fallback = "") => fallback),
      getNumber: mock(async (key: string, fallback: number) =>
        key === "TENCENT_OCR_DEFAULT_TENANT_DAILY_LIMIT" ? 100 : fallback),
      getBoolean: mock(async (key: string, fallback: boolean) => {
        if (key === "TENCENT_OCR_ENABLED") return input.ocrEnabled ?? true;
        if (key === "TENCENT_OCR_ID_CARD_ENCRYPTED_ENABLED") {
          return input.encryptedIdEnabled ?? true;
        }
        return fallback;
      }),
    },
    signedUrlResolver: mock(async () => "https://signed/license.jpg"),
    normalize: mock(() => normalized),
    encrypt: mock((_input: Parameters<NonNullable<OcrServiceDependencies["encrypt"]>>[0]) =>
      "encrypted-result"),
    decrypt: mock(() => ({
      fields: normalized.fields,
      warnings: normalized.warnings,
      quality: normalized.quality,
    })),
    encryptionKeyFactory: () => input.resultEncryptionKey ?? "root-key",
    nowFactory: () => new Date(NOW),
  } satisfies OcrServiceDependencies;
  return {
    service: new OcrService(dependencies),
    dependencies,
    auth: { ...authContext, permissions: input.permissions ?? authContext.permissions },
  };
}

export const request = {
  scene: "wechat_pay_applyment" as const,
  document_type: "business_license" as const,
  file_object_id: "file-1",
  subject_type: "wechat_pay_applyment",
  subject_id: "applyment-1",
  idempotency_key: "11111111-1111-4111-8111-111111111111",
};
