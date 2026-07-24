import { describe, expect, mock, test } from "bun:test";
import type { PlatformOcrRecognitionRecord } from "@/repositories/platform-ocr-recognitions";
import type { SupplierBusinessLicensePreviewFileRecord } from "@/repositories/platform-file-objects";
import type { AuthContext } from "@/services/authorization";

const NOW = "2026-07-24T10:00:00.000Z";

const platformAuth = {
  employeeId: "platform-employee-1",
  tenantId: null,
  isPlatformAdmin: true,
  permissions: [
    { code: "platform.supplier.manage", scope: "all" },
    { code: "platform.ocr.recognize", scope: "all" },
  ],
} as AuthContext;

const file: SupplierBusinessLicensePreviewFileRecord = {
  id: "file-1",
  tenant_id: null,
  owner_type: "supplier_business_license",
  owner_id: null,
  scene: "supplier_business_license",
  provider: "tencent_cos",
  object_key: "private/supplier-business-license/employees/hash/license.jpg",
  mime_type: "image/jpeg",
  size_bytes: 1000,
  checksum: "checksum-1",
  visibility: "private",
  status: "active",
  deleted_at: null,
  created_by_employee_id: "platform-employee-1",
};

const request = {
  scene: "supplier_onboarding" as const,
  document_type: "business_license" as const,
  file_object_id: "file-1",
  idempotency_key: "11111111-1111-4111-8111-111111111111",
};

const normalizedResult = {
  fields: [{
    key: "license_name",
    label: "营业执照主体名称",
    value: "示例供应商",
    normalized: true,
    sensitive: false,
    confidence: null,
  }],
  warnings: [],
  quality: {},
};

function record(
  overrides: Partial<PlatformOcrRecognitionRecord> = {},
): PlatformOcrRecognitionRecord {
  return {
    id: "recognition-1",
    tenant_id: null,
    scope_type: "platform",
    actor_employee_id: "platform-employee-1",
    scene: "supplier_onboarding",
    document_type: "business_license",
    provider: "tencent_cloud",
    provider_action: "BizLicenseOCR",
    file_object_id: "file-1",
    file_checksum: "checksum-1",
    subject_type: null,
    subject_id: null,
    status: "processing",
    idempotency_key: request.idempotency_key,
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
    expires_at: "2026-07-25T10:00:00.000Z",
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  } satisfies PlatformOcrRecognitionRecord;
}

async function harness(input: {
  permissions?: AuthContext["permissions"];
  fileRecord?: typeof file | null;
  dailyCount?: number;
  ocrEnabled?: boolean;
  resultEncryptionKey?: string;
  idempotentRecord?: ReturnType<typeof record> | null;
} = {}) {
  const { PlatformOcrService } = await import("./platform-service");
  const processing = record();
  const succeeded = record({
    status: "succeeded",
    result_ciphertext: "encrypted-result",
    provider_request_id: "provider-request-1",
    processed_at: NOW,
    duration_ms: 20,
  });
  const dependencies = {
    repository: {
      findByIdempotencyKey: mock(async () => input.idempotentRecord ?? null),
      findActiveByDedupeKey: mock(async () => null),
      expireStaleByDedupeKey: mock(async () => undefined),
      countPlatformSince: mock(async () => input.dailyCount ?? 0),
      createProcessing: mock(async () => processing),
      markSucceeded: mock(async () => succeeded),
      markFailed: mock(async () => processing),
      findByIdForEmployee: mock(async () => succeeded),
    },
    fileRepository: {
      findSupplierBusinessLicensePreviewById: mock(async () =>
        input.fileRecord === undefined ? file : input.fileRecord),
    },
    accessPolicy: {
      hasPermission: mock((context: AuthContext, code: string) =>
        context.permissions.some((item) => item.code === code)),
    },
    gateway: {
      recognize: mock(async () => ({ Name: "示例供应商" })),
    },
    settings: {
      getBoolean: mock(async () => input.ocrEnabled ?? true),
      getNumber: mock(async (key: string, fallback: number) =>
        key === "TENCENT_OCR_PLATFORM_DAILY_LIMIT" ? 100 : fallback),
    },
    signedUrlResolver: mock(async () => "https://signed/license.jpg"),
    normalize: mock(() => ({
      ...normalizedResult,
      providerRequestId: "provider-request-1",
    })),
    encrypt: mock(() => "encrypted-result"),
    decrypt: mock(() => normalizedResult),
    encryptionKeyFactory: () => input.resultEncryptionKey ?? "root-key",
    nowFactory: () => new Date(NOW),
    clockMsFactory: () => 100,
    semaphore: { run: mock((_action, _limit, task) => task()) },
  };
  return {
    service: new PlatformOcrService(dependencies),
    dependencies,
    auth: { ...platformAuth, permissions: input.permissions ?? platformAuth.permissions },
  };
}

describe("PlatformOcrService", () => {
  test("requires platform supplier manage and platform OCR permissions", async () => {
    for (const permissions of [
      [{ code: "platform.supplier.manage", scope: "all" as const }],
      [{ code: "platform.ocr.recognize", scope: "all" as const }],
    ]) {
      const { service, auth, dependencies } = await harness({ permissions });
      await expect(service.recognize(auth, request))
        .rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(dependencies.gateway.recognize).not.toHaveBeenCalled();
    }
  });

  test("recognizes the current employee supplier license with BizLicenseOCR", async () => {
    const { service, dependencies, auth } = await harness();

    const result = await service.recognize(auth, request);

    expect(result).toMatchObject({ idempotent: false, cached: false });
    expect(dependencies.gateway.recognize).toHaveBeenCalledWith({
      providerAction: "BizLicenseOCR",
      imageUrl: "https://signed/license.jpg",
      cardSide: undefined,
    });
    expect(dependencies.encrypt).toHaveBeenCalledWith(expect.objectContaining({
      context: { scopeType: "platform", recognitionId: "recognition-1" },
      result: normalizedResult,
    }));
    expect(dependencies.repository.markSucceeded).toHaveBeenCalledWith(
      expect.objectContaining({ resultCiphertext: "encrypted-result" }),
    );
  });

  test("rejects another employee's unbound supplier license before provider call", async () => {
    const { service, dependencies, auth } = await harness({
      fileRecord: { ...file, created_by_employee_id: "platform-employee-2" },
    });

    await expect(service.recognize(auth, request))
      .rejects.toMatchObject({ code: "OCR_FILE_ACCESS_DENIED" });
    expect(dependencies.gateway.recognize).not.toHaveBeenCalled();
  });

  test("enforces platform daily quota before provider call", async () => {
    const { service, dependencies, auth } = await harness({ dailyCount: 100 });

    await expect(service.recognize(auth, request))
      .rejects.toMatchObject({ code: "OCR_DAILY_LIMIT_EXCEEDED" });
    expect(dependencies.gateway.recognize).not.toHaveBeenCalled();
  });

  test("decrypts owner-readable platform results with platform AAD", async () => {
    const { service, dependencies, auth } = await harness();

    const result = await service.getRecognitionResult(auth, "recognition-1");

    expect(dependencies.decrypt).toHaveBeenCalledWith(expect.objectContaining({
      context: { scopeType: "platform", recognitionId: "recognition-1" },
    }));
    expect(result).toMatchObject({
      id: "recognition-1",
      status: "succeeded",
      fields: normalizedResult.fields,
    });
  });
});
