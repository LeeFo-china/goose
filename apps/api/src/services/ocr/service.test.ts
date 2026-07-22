import { describe, expect, mock, test } from "bun:test";
import type { OcrPlatformFileObjectRecord } from "@/repositories/platform-file-objects";
import type { AuthContext } from "@/services/authorization";
import type { OcrServiceDependencies } from "./service";
process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const serviceModulePromise = import("./service");
const NOW = "2026-07-22T10:00:00.000Z";
const EXPIRES_AT = "2026-07-23T10:00:00.000Z";
const authContext = {
  employeeId: "employee-1",
  tenantId: "tenant-1",
  isPlatformAdmin: false,
  permissions: [
    { code: "ocr.recognize", scope: "all" },
    { code: "wechat_pay.applyment.submit", scope: "all" },
  ],
} as AuthContext;
const file = {
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
  attachments: [{
    category: "license_copy",
    object_key: file.object_key,
  }],
};

const normalizedResult = {
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

function buildRecord(overrides: Record<string, unknown> = {}) {
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

async function createHarness(input: {
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
} = {}) {
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

const request = {
  scene: "wechat_pay_applyment" as const, document_type: "business_license" as const,
  file_object_id: "file-1", subject_type: "wechat_pay_applyment",
  subject_id: "applyment-1", idempotency_key: "11111111-1111-4111-8111-111111111111",
};

describe("OcrService", () => {
  test("hides capabilities while OCR is disabled", async () => {
    const { service } = await createHarness({ ocrEnabled: false });

    expect(await service.listCapabilities(authContext, "wechat_pay_applyment"))
      .toEqual([]);
  });

  test("rejects recognition while OCR is disabled before cache or provider", async () => {
    const { service, dependencies } = await createHarness({
      ocrEnabled: false,
      idempotentRecord: buildRecord({
        status: "succeeded",
        result_ciphertext: "encrypted-result",
      }),
    });

    await expect(service.recognize(authContext, request)).rejects.toMatchObject({
      statusCode: 503,
      code: "OCR_DISABLED",
    });
    expect(dependencies.fileRepository.findActiveById).not.toHaveBeenCalled();
    expect(dependencies.repository.findByTenantAndIdempotencyKey)
      .not.toHaveBeenCalled();
    expect(dependencies.gateway.recognize).not.toHaveBeenCalled();
  });

  test("hides capabilities while result encryption is unavailable", async () => {
    const { service } = await createHarness({ resultEncryptionKey: "" });

    expect(await service.listCapabilities(authContext, "wechat_pay_applyment"))
      .toEqual([]);
  });

  test("rejects missing result encryption before reading files or calling provider", async () => {
    const { service, dependencies } = await createHarness({
      resultEncryptionKey: "",
    });

    await expect(service.recognize(authContext, request)).rejects.toMatchObject({
      statusCode: 503,
      code: "OCR_RESULT_ENCRYPTION_KEY_MISSING",
    });
    expect(dependencies.fileRepository.findActiveById).not.toHaveBeenCalled();
    expect(dependencies.repository.createProcessing).not.toHaveBeenCalled();
    expect(dependencies.gateway.recognize).not.toHaveBeenCalled();
  });

  test("hides ID-card capabilities while encrypted recognition is disabled", async () => {
    const { service } = await createHarness({ encryptedIdEnabled: false });

    expect((await service.listCapabilities(
      authContext,
      "wechat_pay_applyment",
    )).map((item) => item.document_type)).toEqual([
      "business_license",
      "bank_card",
    ]);
  });

  test("stores encrypted success after validating an applyment file", async () => {
    const { service, dependencies } = await createHarness();

    const result = await service.recognize(authContext, request);

    expect(result).toMatchObject({ idempotent: false, cached: false });
    expect(dependencies.repository.createProcessing).toHaveBeenCalledTimes(1);
    expect(dependencies.gateway.recognize).toHaveBeenCalledTimes(1);
    expect(dependencies.encrypt.mock.calls[0]?.[0]?.result).toEqual(normalizedResult);
    expect(dependencies.repository.markSucceeded).toHaveBeenCalledWith(
      expect.objectContaining({ resultCiphertext: "encrypted-result" }),
    );
  });

  test("allows the uploader to recognize an unattached file before an applyment exists", async () => {
    const { service, dependencies } = await createHarness({
      fileRecord: { ...file, owner_id: null },
    });

    await service.recognize(authContext, {
      ...request,
      subject_type: undefined,
      subject_id: undefined,
    });

    expect(dependencies.applymentRepository.findById).not.toHaveBeenCalled();
    expect(dependencies.gateway.recognize).toHaveBeenCalledTimes(1);
  });

  test("rejects another employee's unattached file before provider call", async () => {
    const { service, dependencies } = await createHarness({
      fileRecord: {
        ...file,
        owner_id: null,
        created_by_employee_id: "employee-2",
      },
    });

    await expect(service.recognize(authContext, {
      ...request,
      subject_type: undefined,
      subject_id: undefined,
    })).rejects.toMatchObject({ code: "OCR_FILE_ACCESS_DENIED" });
    expect(dependencies.gateway.recognize).not.toHaveBeenCalled();
  });

  test("rejects a cross-tenant or missing file before provider call", async () => {
    const { service, dependencies } = await createHarness({ fileRecord: null });

    await expect(service.recognize(authContext, request)).rejects.toMatchObject({
      code: "OCR_FILE_NOT_FOUND",
    });
    expect(dependencies.gateway.recognize).not.toHaveBeenCalled();
  });

  test("rejects file scene, MIME and size mismatches before provider call", async () => {
    for (const changed of [
      { scene: "project_log" },
      { mime_type: "application/pdf" },
      { size_bytes: 6 * 1024 * 1024 },
    ]) {
      const harness = await createHarness({ fileRecord: { ...file, ...changed } });
      await expect(harness.service.recognize(authContext, request)).rejects.toMatchObject({
        code: expect.stringMatching(/^OCR_FILE_/),
      });
      expect(harness.dependencies.gateway.recognize).not.toHaveBeenCalled();
    }
  });

  test("requires both OCR and applyment submit permissions", async () => {
    for (const permissions of [
      [{ code: "ocr.recognize", scope: "all" as const }],
      [{ code: "wechat_pay.applyment.submit", scope: "all" as const }],
    ]) {
      const { service, auth } = await createHarness({ permissions });
      await expect(service.recognize(auth, request)).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
    }
  });

  test("returns idempotency replay without provider call", async () => {
    const existing = buildRecord({ status: "succeeded", result_ciphertext: "encrypted-result" });
    const { service, dependencies } = await createHarness({ idempotentRecord: existing });

    const result = await service.recognize(authContext, request);

    expect(result).toMatchObject({ idempotent: true, cached: false });
    expect(dependencies.gateway.recognize).not.toHaveBeenCalled();
  });

  test("rejects an idempotency key reused for a different request", async () => {
    const existing = buildRecord({
      status: "succeeded",
      result_ciphertext: "encrypted-result",
      file_object_id: "different-file",
    });
    const { service, dependencies } = await createHarness({
      idempotentRecord: existing,
    });

    await expect(service.recognize(authContext, request)).rejects.toMatchObject({
      statusCode: 409,
      code: "OCR_IDEMPOTENCY_CONFLICT",
    });
    expect(dependencies.gateway.recognize).not.toHaveBeenCalled();
  });

  test("returns active dedupe result as cached", async () => {
    const existing = buildRecord({ status: "succeeded", result_ciphertext: "encrypted-result" });
    const { service, dependencies } = await createHarness({ dedupeRecord: existing });

    const result = await service.recognize(authContext, request);

    expect(result).toMatchObject({ idempotent: false, cached: true });
    expect(dependencies.gateway.recognize).not.toHaveBeenCalled();
  });

  test("expires stale dedupe records before looking for a reusable result", async () => {
    const { service, dependencies } = await createHarness();

    await service.recognize(authContext, request);

    expect(dependencies.repository.expireStaleByDedupeKey).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      dedupeKey: expect.any(String),
      before: NOW,
    });
  });

  test("does not call provider after losing the unique creation race", async () => {
    const conflict = Object.assign(new Error("unique conflict"), {
      details: { code: "23505" },
    });
    const winner = buildRecord({ status: "processing" });
    const { service, dependencies } = await createHarness({
      createError: conflict,
      idempotentRecord: null,
      dedupeRecord: winner,
    });
    dependencies.repository.findActiveByDedupeKey
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(winner);

    const result = await service.recognize(authContext, request);

    expect(result).toMatchObject({ cached: true });
    expect(dependencies.gateway.recognize).not.toHaveBeenCalled();
  });

  test("enforces daily quota before creating or calling provider", async () => {
    const { service, dependencies } = await createHarness({ dailyCount: 100 });

    await expect(service.recognize(authContext, request)).rejects.toMatchObject({
      statusCode: 429,
      code: "OCR_DAILY_LIMIT_EXCEEDED",
    });
    expect(dependencies.repository.createProcessing).not.toHaveBeenCalled();
    expect(dependencies.gateway.recognize).not.toHaveBeenCalled();
  });

  test("stores only safe failure metadata when provider fails", async () => {
    const providerError = Object.assign(new Error("private image URL"), {
      code: "OCR_PROVIDER_FAILED",
      details: { providerCode: "InternalError", requestId: "request-safe" },
    });
    const { service, dependencies } = await createHarness({ gatewayError: providerError });

    await expect(service.recognize(authContext, request)).rejects.toBe(providerError);
    expect(dependencies.repository.markFailed).toHaveBeenCalledWith(
      expect.objectContaining({
        providerErrorCode: "InternalError",
        providerRequestId: "request-safe",
        providerErrorMessageSafe: "腾讯云OCR调用失败",
      }),
    );
  });

  test("does not decrypt an expired recognition", async () => {
    const { service, dependencies } = await createHarness();
    dependencies.repository.findByIdForTenant.mockResolvedValue(buildRecord({
      status: "succeeded",
      expires_at: "2026-07-22T09:59:59.000Z",
      result_ciphertext: "encrypted-result",
    }));

    await expect(service.getTenantRecognition(authContext, "recognition-1"))
      .rejects.toMatchObject({ statusCode: 410, code: "OCR_RECOGNITION_EXPIRED" });
    expect(dependencies.decrypt).not.toHaveBeenCalled();
  });

  test("requires applyment permission before reading a recognition", async () => {
    const { service, dependencies, auth } = await createHarness({
      permissions: [{ code: "ocr.recognize", scope: "all" }],
    });

    await expect(service.getTenantRecognition(auth, "recognition-1"))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(dependencies.repository.findByIdForTenant).not.toHaveBeenCalled();
  });

  test("allows only the original employee to read an unattached recognition", async () => {
    const { service, dependencies } = await createHarness();
    dependencies.repository.findByIdForTenant.mockResolvedValue(buildRecord({
      actor_employee_id: "employee-2",
      subject_type: null,
      subject_id: null,
      status: "succeeded",
      result_ciphertext: "encrypted-result",
    }));

    await expect(service.getTenantRecognition(authContext, "recognition-1"))
      .rejects.toMatchObject({ code: "OCR_FILE_ACCESS_DENIED" });
    expect(dependencies.decrypt).not.toHaveBeenCalled();
  });

  test("rejects a recognition whose applyment is no longer accessible", async () => {
    const { service, dependencies } = await createHarness({
      applymentRecord: null,
    });

    await expect(service.getTenantRecognition(authContext, "recognition-1"))
      .rejects.toMatchObject({ code: "OCR_FILE_ACCESS_DENIED" });
    expect(dependencies.decrypt).not.toHaveBeenCalled();
  });

  test("platform config test discards fields and does not persist a record", async () => {
    const { service, dependencies } = await createHarness();
    const platformContext = { ...authContext, tenantId: null, isPlatformAdmin: true };

    const result = await service.testPlatformConfig(platformContext, {
      imageBase64: "c3ludGhldGlj",
    });

    expect(result).toEqual({
      ok: true,
      warning_codes: [],
      provider_request_id: "provider-request-1",
      duration_ms: 0,
    });
    expect(JSON.stringify(result)).not.toContain("示例公司");
    expect(dependencies.repository.createProcessing).not.toHaveBeenCalled();
    expect(dependencies.repository.markSucceeded).not.toHaveBeenCalled();
  });
});
