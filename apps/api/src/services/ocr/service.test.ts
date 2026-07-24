import { describe, expect, test } from "bun:test";

import { buildOcrDedupeKey } from "./request-guards";
import {
  authContext,
  buildRecord,
  createHarness,
  file,
  NOW,
  normalizedResult,
  request,
} from "./service.test-fixtures";

describe("OcrService", () => {
  test("isolates dedupe keys by scene and applyment ownership", () => {
    const base = {
      tenantId: "tenant-1",
      fileIdentity: "checksum-1",
      documentType: "business_license" as const,
      providerAction: "BizLicenseOCR",
      scene: "wechat_pay_applyment" as const,
    };

    const unbound = buildOcrDedupeKey({
      ...base,
      subjectType: null,
      subjectId: null,
    });
    const applymentA = buildOcrDedupeKey({
      ...base,
      subjectType: "wechat_pay_applyment",
      subjectId: "11111111-1111-4111-8111-111111111111",
    });
    const applymentB = buildOcrDedupeKey({
      ...base,
      subjectType: "wechat_pay_applyment",
      subjectId: "22222222-2222-4222-8222-222222222222",
    });

    expect(new Set([unbound, applymentA, applymentB]).size).toBe(3);
  });

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

  test("returns a same-key concurrent processing replay without provider call", async () => {
    const existing = buildRecord({ status: "processing" });
    const { service, dependencies } = await createHarness({ idempotentRecord: existing });

    const result = await service.recognize(authContext, request);

    expect(result).toMatchObject({
      idempotent: true,
      cached: false,
      recognition: { status: "processing", fields: [] },
    });
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

  test("returns a different-key concurrent processing dedupe as cached", async () => {
    const existing = buildRecord({ status: "processing" });
    const { service, dependencies } = await createHarness({ dedupeRecord: existing });

    const result = await service.recognize(authContext, request);

    expect(result).toMatchObject({
      idempotent: false,
      cached: true,
      recognition: { status: "processing", fields: [] },
    });
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

    expect(result).toMatchObject({
      cached: true,
      recognition: { status: "processing", fields: [] },
    });
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
