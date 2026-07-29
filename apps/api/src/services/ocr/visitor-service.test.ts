import { beforeEach, describe, expect, mock, test } from "bun:test";

import type {
  VisitorOcrClaimResult,
  VisitorOcrRecognitionRecord,
} from "@/repositories/visitor-ocr-recognitions";
import type {
  VisitorOcrPlatformFileObjectRecord,
} from "@/repositories/visitor-onboarding-file-objects";

import type { TenantOnboardingOcrService } from "./visitor-service";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const serviceModulePromise = import("./visitor-service");

const VISITOR_ID = "visitor-1";
const FILE_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_FILE_ID = "22222222-2222-4222-8222-222222222222";
const IDEMPOTENCY_KEY = "33333333-3333-4333-8333-333333333333";
const RECOGNITION_ID = "44444444-4444-4444-8444-444444444444";
const NOW = new Date("2026-07-29T04:00:00.000Z");
const ENCRYPTION_KEY = "visitor-result-encryption-key-for-tests";

const normalized = {
  fields: [{
    key: "license_name",
    label: "营业执照主体名称",
    value: "示例装饰公司",
    normalized: true,
    sensitive: false,
    confidence: null,
  }],
  warnings: [],
  quality: {},
  providerRequestId: "provider-request-1",
};

function recognition(
  overrides: Partial<VisitorOcrRecognitionRecord> = {},
): VisitorOcrRecognitionRecord {
  return {
    id: RECOGNITION_ID,
    scope_type: "visitor",
    tenant_id: null,
    actor_employee_id: null,
    actor_visitor_id: VISITOR_ID,
    scene: "tenant_onboarding_license",
    document_type: "business_license",
    provider: "tencent_cloud",
    provider_action: "BizLicenseOCR",
    file_object_id: FILE_ID,
    file_checksum: "etag-1",
    subject_type: null,
    subject_id: null,
    status: "processing",
    idempotency_key: IDEMPOTENCY_KEY,
    dedupe_key: `visitor:${IDEMPOTENCY_KEY}`,
    result_ciphertext: null,
    result_summary: {},
    warnings: [],
    quality: {},
    provider_request_id: null,
    provider_error_code: null,
    provider_error_message_safe: null,
    billable_units: 0,
    duration_ms: null,
    provider_started_at: NOW.toISOString(),
    processing_deadline_at: new Date(NOW.getTime() + 30_000).toISOString(),
    processed_at: null,
    expires_at: new Date(NOW.getTime() + 86_400_000).toISOString(),
    created_at: NOW.toISOString(),
    updated_at: NOW.toISOString(),
    ...overrides,
  };
}

function file(
  overrides: Partial<VisitorOcrPlatformFileObjectRecord> = {},
): VisitorOcrPlatformFileObjectRecord {
  return {
    id: FILE_ID,
    tenant_id: null,
    owner_type: "visitor",
    owner_visitor_id: VISITOR_ID,
    scene: "tenant_onboarding_license",
    provider: "tencent_cos",
    bucket: "private",
    region: "ap-guangzhou",
    object_key: "visitors/license.png",
    mime_type: "image/png",
    size_bytes: 1024,
    checksum: "etag-1",
    visibility: "private",
    public_url: null,
    status: "active",
    deleted_at: null,
    ...overrides,
  };
}

async function createHarness(
  options: { encryptionKey?: string | null } = {},
) {
  const { TenantOnboardingOcrService } = await serviceModulePromise;
  const settingsValues: Record<string, boolean | number | string> = {
    TENCENT_OCR_ENABLED: true,
    TENCENT_OCR_TENANT_ONBOARDING_ENABLED: true,
    TENCENT_OCR_SECRET_ID: "secret-id",
    TENCENT_OCR_SECRET_KEY: "secret-key",
    TENCENT_OCR_VISITOR_DAILY_LIMIT: 5,
    TENCENT_OCR_VISITOR_IP_WINDOW_SECONDS: 60,
    TENCENT_OCR_VISITOR_IP_WINDOW_LIMIT: 20,
    TENCENT_OCR_VISITOR_PROCESSING_LEASE_SECONDS: 30,
    TENCENT_OCR_VISITOR_CONCURRENCY_LIMIT: 1,
    TENCENT_OCR_VISITOR_GLOBAL_CONCURRENCY_LIMIT: 8,
    TENCENT_OCR_RESULT_TTL_HOURS: 24,
  };
  const currentFile = file();
  const processing = recognition();
  const succeeded = recognition({
    status: "succeeded",
    result_ciphertext: "ciphertext",
    provider_request_id: normalized.providerRequestId,
    processed_at: NOW.toISOString(),
  });
  const repository = {
    claim: mock(async (): Promise<VisitorOcrClaimResult> => ({
      outcome: "created" as const,
      recognition: processing,
    })),
    markSucceeded: mock(async () => succeeded),
    markFailed: mock(async () => recognition({ status: "failed" })),
    findByIdForVisitor: mock(async () => null as VisitorOcrRecognitionRecord | null),
    expireProcessingLease: mock(async () =>
      recognition({ status: "failed" })
    ),
  };
  const fileRepository = {
    findActiveLicenseById: mock(async () =>
      currentFile as VisitorOcrPlatformFileObjectRecord | null
    ),
  };
  const gateway = {
    recognize: mock(async () => ({ Name: "示例装饰公司" })),
  };
  const verifyImage = mock(async () => ({
    signedUrl: "https://signed.example.test/license",
    mimeType: "image/png" as const,
    sizeBytes: 1024,
    width: 32,
    height: 24,
  }));
  const service = new TenantOnboardingOcrService({
    repository,
    fileRepository,
    gateway,
    settings: {
      getBoolean: async (key, fallback) =>
        Boolean(settingsValues[key] ?? fallback),
      getNumber: async (key, fallback) =>
        Number(settingsValues[key] ?? fallback),
      getSecretString: async (key) => String(settingsValues[key] ?? ""),
    },
    verifyImage,
    normalize: mock(() => normalized),
    encrypt: mock(() => "ciphertext"),
    decrypt: mock(() => ({
      fields: normalized.fields,
      warnings: normalized.warnings,
      quality: normalized.quality,
    })),
    encryptionKeyFactory: () =>
      options.encryptionKey === undefined
        ? ENCRYPTION_KEY
        : options.encryptionKey,
    nowFactory: () => new Date(NOW),
    clockMsFactory: () => NOW.getTime(),
  });
  return {
    service,
    repository,
    fileRepository,
    gateway,
    verifyImage,
    settingsValues,
    currentFile,
    processing,
    succeeded,
  };
}

function recognize(service: TenantOnboardingOcrService, fileObjectId = FILE_ID) {
  return service.recognize(
    { visitorId: VISITOR_ID, requestIp: "203.0.113.10" },
    { file_object_id: fileObjectId, idempotency_key: IDEMPOTENCY_KEY },
  );
}

beforeEach(() => {
  mock.restore();
});

describe("TenantOnboardingOcrService capabilities", () => {
  test("returns only the fixed visitor business-license capability", async () => {
    const { service } = await createHarness();
    await expect(service.listCapabilities()).resolves.toEqual([
      expect.objectContaining({
        scene: "tenant_onboarding_license",
        document_type: "business_license",
      }),
    ]);
  });

  test.each([
    ["global disabled", "TENCENT_OCR_ENABLED", false],
    ["visitor disabled", "TENCENT_OCR_TENANT_ONBOARDING_ENABLED", false],
    ["secret missing", "TENCENT_OCR_SECRET_KEY", ""],
  ])("hides capability when %s", async (_label, key, value) => {
    const { service, settingsValues } = await createHarness();
    settingsValues[key] = value;
    await expect(service.listCapabilities()).resolves.toEqual([]);
  });
});

describe("TenantOnboardingOcrService recognition", () => {
  test("maps the visitor switch to capability unavailable", async () => {
    const { service, settingsValues } = await createHarness();
    settingsValues.TENCENT_OCR_TENANT_ONBOARDING_ENABLED = false;

    await expect(recognize(service)).rejects.toMatchObject({
      code: "OCR_CAPABILITY_UNAVAILABLE",
      statusCode: 503,
    });
  });

  test("checks result encryption before provider credentials", async () => {
    const { service, settingsValues } = await createHarness({
      encryptionKey: null,
    });
    settingsValues.TENCENT_OCR_SECRET_ID = "";
    settingsValues.TENCENT_OCR_SECRET_KEY = "";

    await expect(recognize(service)).rejects.toMatchObject({
      code: "OCR_RESULT_ENCRYPTION_KEY_MISSING",
      statusCode: 503,
    });
  });

  test("returns 404 for missing or cross-visitor files", async () => {
    const { service, fileRepository, repository } = await createHarness();
    fileRepository.findActiveLicenseById.mockImplementationOnce(async () => null);
    await expect(recognize(service)).rejects.toMatchObject({
      code: "OCR_FILE_NOT_FOUND",
      statusCode: 404,
    });
    expect(repository.claim).not.toHaveBeenCalled();
  });

  test.each([
    ["WebP", { mime_type: "image/webp" }],
    ["oversize", { size_bytes: 5 * 1024 * 1024 + 1 }],
  ])("rejects recorded %s before claim", async (_label, override) => {
    const { service, currentFile, repository, verifyImage } =
      await createHarness();
    Object.assign(currentFile, override);
    await expect(recognize(service)).rejects.toMatchObject({
      code: expect.stringMatching(/^OCR_FILE_/),
    });
    expect(verifyImage).not.toHaveBeenCalled();
    expect(repository.claim).not.toHaveBeenCalled();
  });

  test("claims once, calls BizLicenseOCR and stores encrypted success", async () => {
    const { service, repository, gateway } = await createHarness();
    const result = await recognize(service);

    expect(gateway.recognize).toHaveBeenCalledWith({
      providerAction: "BizLicenseOCR",
      imageUrl: "https://signed.example.test/license",
    });
    expect(repository.markSucceeded).toHaveBeenCalledWith(
      expect.objectContaining({
        id: RECOGNITION_ID,
        resultCiphertext: "ciphertext",
        billableUnits: 1,
      }),
    );
    expect(result).toMatchObject({
      idempotent: false,
      recognition: { status: "succeeded", fields: normalized.fields },
    });
  });

  test.each(["succeeded", "failed"] as const)(
    "replays terminal %s without calling provider",
    async (status) => {
      const { service, repository, gateway } = await createHarness();
      repository.claim.mockImplementationOnce(async () => ({
        outcome: "existing" as const,
        recognition: recognition({
          status,
          result_ciphertext: status === "succeeded" ? "ciphertext" : null,
        }),
      }));
      const result = await recognize(service);
      expect(result).toMatchObject({
        idempotent: true,
        recognition: { status },
      });
      expect(gateway.recognize).not.toHaveBeenCalled();
    },
  );

  test.each([
    ["in_progress", "OCR_RECOGNITION_IN_PROGRESS", 409],
    ["idempotency_conflict", "OCR_IDEMPOTENCY_CONFLICT", 409],
    ["daily_limited", "OCR_DAILY_LIMIT_EXCEEDED", 429],
    ["rate_limited", "OCR_PROVIDER_RATE_LIMITED", 429],
  ] as const)("maps claim outcome %s", async (outcome, code, statusCode) => {
    const { service, repository } = await createHarness();
    repository.claim.mockImplementationOnce(async () => ({
      outcome,
      recognition: outcome === "in_progress" ? recognition() : undefined,
      retry_after_seconds: outcome.endsWith("limited") ? 17 : undefined,
    }));
    const expected = {
      code,
      statusCode,
      ...(outcome === "in_progress"
        ? { details: { recognition_id: RECOGNITION_ID } }
        : outcome.endsWith("limited")
        ? { details: { retry_after_seconds: 17 } }
        : {}),
    };
    await expect(recognize(service)).rejects.toMatchObject(expected);
  });

  test.each(["provider", "normalizer"] as const)(
    "persists failed and sanitizes %s errors",
    async (failureAt) => {
      const { service, gateway, repository } = await createHarness();
      if (failureAt === "provider") {
        gateway.recognize.mockImplementationOnce(async () => {
          throw {
            statusCode: 502,
            code: "OCR_PROVIDER_FAILED",
            message: "provider secret response",
            details: { requestId: "request-1", providerCode: "InternalError" },
          };
        });
      } else {
        (service as unknown as { normalize: () => never }).normalize = () => {
          throw {
            statusCode: 502,
            code: "OCR_RESULT_INVALID",
            message: "raw invalid response",
          };
        };
      }
      let caught: unknown;
      try {
        await recognize(service);
      } catch (error) {
        caught = error;
      }
      expect(caught).toMatchObject({
        statusCode: 502,
        details: { recognition_id: RECOGNITION_ID },
      });
      expect(repository.markFailed).toHaveBeenCalled();
      expect(String((caught as Error).message)).not.toContain("secret");
      expect(String((caught as Error).message)).not.toContain("raw");
    },
  );
});

describe("TenantOnboardingOcrService reads", () => {
  test("returns only current visitor result and decrypts visitor success", async () => {
    const { service, repository, succeeded } = await createHarness();
    repository.findByIdForVisitor.mockImplementationOnce(async () => succeeded);
    await expect(
      service.getRecognitionResult(VISITOR_ID, RECOGNITION_ID),
    ).resolves.toMatchObject({
      status: "succeeded",
      fields: normalized.fields,
    });
    expect(repository.findByIdForVisitor).toHaveBeenCalledWith(
      RECOGNITION_ID,
      VISITOR_ID,
    );
  });

  test.each([
    ["missing", null, 404, "OCR_RECOGNITION_NOT_FOUND"],
    [
      "expired",
      recognition({ status: "expired" }),
      410,
      "OCR_RECOGNITION_EXPIRED",
    ],
  ])("maps %s read", async (_label, record, statusCode, code) => {
    const { service, repository } = await createHarness();
    repository.findByIdForVisitor.mockImplementationOnce(async () => record);
    await expect(
      service.getRecognitionResult(VISITOR_ID, RECOGNITION_ID),
    ).rejects.toMatchObject({ statusCode, code });
  });

  test("recovers an expired processing lease as failed", async () => {
    const { service, repository } = await createHarness();
    repository.findByIdForVisitor.mockImplementationOnce(async () =>
      recognition({
        processing_deadline_at: new Date(NOW.getTime() - 1).toISOString(),
      })
    );
    await expect(
      service.getRecognitionResult(VISITOR_ID, RECOGNITION_ID),
    ).resolves.toMatchObject({ status: "failed", fields: [] });
    expect(repository.expireProcessingLease).toHaveBeenCalled();
  });
});
