import type {
  OcrDocumentType,
  OcrRecognitionStatus,
  OcrScene,
} from "@gooes/domain";
import { ErrorCodes } from "@/errors/error-codes";
import { Errors } from "@/errors/error-factory";
import {
  ocrRecognitionRepository,
  type OcrPlatformListInput,
} from "@/repositories/ocr-recognitions";
import {
  platformFileObjectRepository,
  type OcrPlatformFileObjectRecord,
} from "@/repositories/platform-file-objects";
import { wechatPayApplymentRepository } from "@/repositories/wechat-pay-applyments";
import type { AuthContext } from "@/services/authorization";
import { accessPolicyService } from "@/services/access-policy";
import { resolveOcrStoredFileUrl } from "@/services/files/file-url-resolver";
import { systemSettingsService } from "@/services/system-settings";
import type { Database } from "@/types/database";
import { ocrActionSemaphore, type OcrActionSemaphore } from "./action-semaphore";
import {
  getOcrCapability,
  listPublicOcrCapabilities,
} from "./capabilities";
import {
  assertOcrResultEncryptionKey,
  decryptOcrResult,
  encryptOcrResult,
  hasOcrResultEncryptionKey,
  type OcrNormalizedResult,
} from "./crypto";
import { filterConfiguredOcrCapabilities } from "./configured-capabilities";
import { normalizeOcrResponse } from "./normalizers";
import {
  assertOcrIdempotencyMatches,
  assertOcrRecognitionReadAccess,
  buildOcrDedupeKey,
  validateOcrFile,
} from "./request-guards";
import { allowsOcrDocument, loadOcrRuntimePolicy } from "./runtime-policy";
import {
  buildResultSummary,
  clamp,
  elapsed,
  isUniqueConflict,
  safeProviderFailure,
  startOfUtcDay,
} from "./service-helpers";
import {
  tencentOcrGateway,
  type TencentOcrGatewayInput,
} from "./tencent-gateway";
import { ocrTenantPolicyService } from "./tenant-policy";
type OcrRecognitionRecord =
  Database["public"]["Tables"]["ocr_recognitions"]["Row"];

type RecognitionRepositoryPort = Pick<
  typeof ocrRecognitionRepository,
  | "findByTenantAndIdempotencyKey"
  | "findActiveByDedupeKey"
  | "expireStaleByDedupeKey"
  | "countTenantSince"
  | "createProcessing"
  | "markSucceeded"
  | "markFailed"
  | "findByIdForTenant"
  | "listPlatform"
>;

type ApplymentRecord = {
  id: string;
  tenant_id: string;
  attachments: unknown;
};

type RecognizeInput = {
  scene: OcrScene;
  document_type: OcrDocumentType;
  file_object_id: string;
  subject_type?: string | null;
  subject_id?: string | null;
  idempotency_key: string;
};

export type OcrServiceDependencies = {
  repository?: RecognitionRepositoryPort;
  fileRepository?: Pick<typeof platformFileObjectRepository, "findActiveById">;
  applymentRepository?: {
    findById(input: { id: string; tenantId?: string }): Promise<ApplymentRecord | null>;
  };
  accessPolicy?: Pick<typeof accessPolicyService, "assertTenantContext" | "hasPermission">;
  tenantPolicy?: Pick<typeof ocrTenantPolicyService, "getRuntimePolicy">;
  gateway?: { recognize(input: TencentOcrGatewayInput): Promise<unknown> };
  settings?: Pick<typeof systemSettingsService, "getBoolean" | "getNumber" | "getSecretString">;
  signedUrlResolver?: typeof resolveOcrStoredFileUrl;
  normalize?: typeof normalizeOcrResponse;
  encrypt?: typeof encryptOcrResult;
  decrypt?: typeof decryptOcrResult;
  semaphore?: Pick<OcrActionSemaphore, "run">;
  encryptionKeyFactory?: () => string | null | undefined;
  nowFactory?: () => Date;
  clockMsFactory?: () => number;
};

export class OcrService {
  private readonly repository: RecognitionRepositoryPort;
  private readonly fileRepository: Pick<typeof platformFileObjectRepository, "findActiveById">;
  private readonly applymentRepository: NonNullable<OcrServiceDependencies["applymentRepository"]>;
  private readonly accessPolicy: NonNullable<OcrServiceDependencies["accessPolicy"]>;
  private readonly tenantPolicy: NonNullable<OcrServiceDependencies["tenantPolicy"]>;
  private readonly gateway: NonNullable<OcrServiceDependencies["gateway"]>;
  private readonly settings: NonNullable<OcrServiceDependencies["settings"]>;
  private readonly signedUrlResolver: typeof resolveOcrStoredFileUrl;
  private readonly normalize: typeof normalizeOcrResponse;
  private readonly encrypt: typeof encryptOcrResult;
  private readonly decrypt: typeof decryptOcrResult;
  private readonly semaphore: Pick<OcrActionSemaphore, "run">;
  private readonly encryptionKeyFactory: () => string | null | undefined;
  private readonly nowFactory: () => Date;
  private readonly clockMsFactory: () => number;
  constructor(dependencies: OcrServiceDependencies = {}) {
    this.repository = dependencies.repository ?? ocrRecognitionRepository;
    this.fileRepository = dependencies.fileRepository ?? platformFileObjectRepository;
    this.applymentRepository = dependencies.applymentRepository ?? wechatPayApplymentRepository;
    this.accessPolicy = dependencies.accessPolicy ?? accessPolicyService;
    this.tenantPolicy = dependencies.tenantPolicy ?? ocrTenantPolicyService;
    this.gateway = dependencies.gateway ?? tencentOcrGateway;
    this.settings = dependencies.settings ?? systemSettingsService;
    this.signedUrlResolver = dependencies.signedUrlResolver ?? resolveOcrStoredFileUrl;
    this.normalize = dependencies.normalize ?? normalizeOcrResponse;
    this.encrypt = dependencies.encrypt ?? encryptOcrResult;
    this.decrypt = dependencies.decrypt ?? decryptOcrResult;
    this.semaphore = dependencies.semaphore ?? ocrActionSemaphore;
    this.encryptionKeyFactory = dependencies.encryptionKeyFactory ??
      (() => process.env.OCR_RESULT_ENCRYPTION_KEY);
    this.nowFactory = dependencies.nowFactory ?? (() => new Date());
    this.clockMsFactory = dependencies.clockMsFactory ?? Date.now;
  }

  async listCapabilities(authContext: AuthContext, scene?: OcrScene) {
    const tenantId = this.requireTenantEmployee(authContext);
    this.assertPermission(authContext, "ocr.recognize");
    if (!await this.settings.getBoolean("TENCENT_OCR_ENABLED", false)) {
      return [];
    }
    const tenantPolicy = await loadOcrRuntimePolicy({
      settings: this.settings,
      tenantPolicy: this.tenantPolicy,
      tenantId,
    });
    if (!tenantPolicy.enabled) return [];
    if (!hasOcrResultEncryptionKey(this.encryptionKeyFactory())) return [];
    const capabilities = listPublicOcrCapabilities(scene);
    const encryptedIdEnabled = await this.settings.getBoolean(
      "TENCENT_OCR_ID_CARD_ENCRYPTED_ENABLED",
      false,
    );
    const configured = filterConfiguredOcrCapabilities(
      capabilities,
      encryptedIdEnabled,
      encryptedIdEnabled
        ? await this.settings.getSecretString("TENCENT_OCR_ENCRYPTION_PUBLIC_KEY_PEM")
        : "",
    );
    return configured.filter((capability) =>
      allowsOcrDocument(tenantPolicy, capability.document_type)
    );
  }

  async recognize(authContext: AuthContext, input: RecognizeInput) {
    const tenantId = this.requireTenantEmployee(authContext);
    const employeeId = authContext.employeeId;
    if (!employeeId) throw Errors.forbidden();
    this.assertPermission(authContext, "ocr.recognize");
    this.assertPermission(authContext, "wechat_pay.applyment.submit");
    if (!await this.settings.getBoolean("TENCENT_OCR_ENABLED", false)) {
      throw Errors.business(503, "腾讯云OCR尚未启用", ErrorCodes.OCR_DISABLED);
    }
    const tenantPolicy = await loadOcrRuntimePolicy({
      settings: this.settings,
      tenantPolicy: this.tenantPolicy,
      tenantId,
    });
    if (!tenantPolicy.enabled) {
      throw Errors.business(
        503,
        "当前租户尚未启用证照识别",
        ErrorCodes.OCR_TENANT_NOT_ENABLED,
      );
    }
    const capability = getOcrCapability(input.scene, input.document_type);
    if (!capability || !allowsOcrDocument(tenantPolicy, input.document_type)) {
      throw Errors.business(400, "当前场景不支持该识别类型", ErrorCodes.OCR_CAPABILITY_UNAVAILABLE);
    }
    const resultEncryptionKey = this.encryptionKeyFactory();
    assertOcrResultEncryptionKey(resultEncryptionKey);
    const now = this.nowFactory();

    const file = await this.fileRepository.findActiveById({
      id: input.file_object_id,
      tenantId,
    });
    if (!file) {
      throw Errors.business(404, "OCR文件不存在", ErrorCodes.OCR_FILE_NOT_FOUND);
    }
    validateOcrFile(file, input.scene, capability.supported_mime_types, capability.max_size_bytes);
    await this.validateSubjectAndAttachment(
      tenantId,
      employeeId,
      input,
      file,
      capability.attachment_categories,
    );

    const idempotent = await this.repository.findByTenantAndIdempotencyKey(
      tenantId,
      input.idempotency_key,
    );
    if (idempotent) {
      assertOcrIdempotencyMatches(idempotent, input);
      return this.response(idempotent, true, false);
    }

    const dedupeKey = buildOcrDedupeKey({
      tenantId,
      fileIdentity: file.checksum || file.object_key,
      documentType: input.document_type,
      providerAction: capability.providerAction,
      scene: input.scene,
      subjectType: input.subject_type,
      subjectId: input.subject_id,
    });
    await this.repository.expireStaleByDedupeKey({
      tenantId,
      dedupeKey,
      before: now.toISOString(),
    });
    const cached = await this.repository.findActiveByDedupeKey(tenantId, dedupeKey);
    if (cached) return this.response(cached, false, true);

    if (await this.repository.countTenantSince(tenantId, startOfUtcDay(now)) >=
      tenantPolicy.dailyLimit) {
      throw Errors.business(429, "今日OCR识别额度已用完", ErrorCodes.OCR_DAILY_LIMIT_EXCEEDED);
    }
    const ttlHours = clamp(await this.settings.getNumber("TENCENT_OCR_RESULT_TTL_HOURS", 24), 1, 168);
    const expiresAt = new Date(now.getTime() + ttlHours * 3_600_000).toISOString();
    const creation = await this.createProcessingOrReadWinner({
      tenantId,
      employeeId: authContext.employeeId!,
      input,
      providerAction: capability.providerAction,
      file,
      dedupeKey,
      expiresAt,
    });
    const recognition = creation.record;
    if (creation.reuseReason) {
      if (creation.reuseReason === "idempotent") {
        assertOcrIdempotencyMatches(recognition, input);
      }
      return this.response(
        recognition,
        creation.reuseReason === "idempotent",
        creation.reuseReason === "dedupe",
      );
    }

    const startedAt = this.clockMsFactory();
    try {
      const imageUrl = await this.signedUrlResolver(file);
      const providerResponse = await this.semaphore.run(
        capability.providerAction,
        capability.concurrencyLimit,
        () => this.gateway.recognize({
          providerAction: capability.providerAction,
          imageUrl,
          cardSide: capability.cardSide,
        }),
      );
      const normalized = this.normalize(input.document_type, providerResponse);
      const { providerRequestId, ...normalizedResult } = normalized;
      const resultCiphertext = this.encrypt({
        context: { tenantId, recognitionId: recognition.id },
        result: normalizedResult,
        rootSecret: resultEncryptionKey,
      });
      const succeeded = await this.repository.markSucceeded({
        id: recognition.id,
        tenantId,
        resultCiphertext,
        resultSummary: buildResultSummary(normalizedResult),
        warnings: normalizedResult.warnings,
        quality: normalizedResult.quality,
        providerRequestId,
        billableUnits: 1,
        durationMs: elapsed(this.clockMsFactory(), startedAt),
        processedAt: this.nowFactory().toISOString(),
      });
      return this.response(succeeded, false, false);
    } catch (error) {
      await this.repository.markFailed({
        id: recognition.id,
        tenantId,
        ...safeProviderFailure(error),
        durationMs: elapsed(this.clockMsFactory(), startedAt),
        processedAt: this.nowFactory().toISOString(),
      });
      throw error;
    }
  }

  async getTenantRecognition(authContext: AuthContext, id: string) {
    const tenantId = this.requireTenantEmployee(authContext);
    const employeeId = authContext.employeeId;
    if (!employeeId) throw Errors.forbidden();
    this.assertPermission(authContext, "ocr.recognize");
    this.assertPermission(authContext, "wechat_pay.applyment.submit");
    const recognition = await this.repository.findByIdForTenant(id, tenantId);
    if (!recognition) {
      throw Errors.business(404, "OCR识别记录不存在", ErrorCodes.OCR_RECOGNITION_NOT_FOUND);
    }
    await assertOcrRecognitionReadAccess({
      recognition,
      tenantId,
      employeeId,
      findApplyment: (input) => this.applymentRepository.findById(input),
    });
    return this.toTenantRecognition(recognition);
  }

  async listPlatformRecognitions(authContext: AuthContext, input: OcrPlatformListInput) {
    if (!authContext.isPlatformAdmin || !this.accessPolicy.hasPermission(
      authContext,
      "platform.ocr.recognition.read",
    )) throw Errors.forbidden();
    return this.repository.listPlatform(input);
  }

  async testPlatformConfig(
    authContext: AuthContext,
    input: { imageBase64: string },
  ) {
    if (!authContext.isPlatformAdmin) throw Errors.forbidden();
    const startedAt = this.clockMsFactory();
    const response = await this.gateway.recognize({
      providerAction: "BizLicenseOCR",
      imageBase64: input.imageBase64,
    });
    const normalized = this.normalize("business_license", response);
    return {
      ok: true,
      warning_codes: normalized.warnings.map((warning) => warning.code),
      provider_request_id: normalized.providerRequestId,
      duration_ms: elapsed(this.clockMsFactory(), startedAt),
    };
  }

  private requireTenantEmployee(authContext: AuthContext) {
    const tenantId = this.accessPolicy.assertTenantContext(authContext);
    if (!authContext.employeeId) throw Errors.forbidden();
    return tenantId;
  }

  private assertPermission(authContext: AuthContext, permission: string) {
    if (!this.accessPolicy.hasPermission(authContext, permission)) throw Errors.forbidden();
  }

  private async validateSubjectAndAttachment(
    tenantId: string,
    employeeId: string,
    input: RecognizeInput,
    file: OcrPlatformFileObjectRecord,
    categories: readonly string[],
  ) {
    if (!input.subject_type && !input.subject_id) {
      if (file.owner_id || file.created_by_employee_id !== employeeId) {
        throw Errors.business(403, "无权识别当前文件", ErrorCodes.OCR_FILE_ACCESS_DENIED);
      }
      return;
    }
    if (input.subject_type !== "wechat_pay_applyment" || !input.subject_id) {
      throw Errors.business(400, "微信支付申请业务对象缺失", ErrorCodes.OCR_FILE_ACCESS_DENIED);
    }
    const applyment = await this.applymentRepository.findById({
      id: input.subject_id,
      tenantId,
    });
    if (!applyment || applyment.tenant_id !== tenantId) {
      throw Errors.business(403, "无权访问微信支付申请", ErrorCodes.OCR_FILE_ACCESS_DENIED);
    }
    if (file.owner_id && file.owner_id !== applyment.id) {
      throw Errors.business(403, "文件不属于当前微信支付申请", ErrorCodes.OCR_FILE_ACCESS_DENIED);
    }
    const attached = Array.isArray(applyment.attachments)
      ? applyment.attachments.find((value) => {
        if (!value || typeof value !== "object" || Array.isArray(value)) {
          return false;
        }
        const attachment = value as Record<string, unknown>;
        return attachment.object_key === file.object_key;
      })
      : undefined;
    if (attached) {
      const category = (attached as Record<string, unknown>).category;
      if (typeof category === "string" && categories.includes(category)) return;
      throw Errors.business(403, "附件类型与识别类型不匹配", ErrorCodes.OCR_FILE_ACCESS_DENIED);
    }
    if (file.created_by_employee_id !== employeeId) {
      throw Errors.business(403, "文件不属于当前操作人", ErrorCodes.OCR_FILE_ACCESS_DENIED);
    }
  }

  private async createProcessingOrReadWinner(input: {
    tenantId: string;
    employeeId: string;
    input: RecognizeInput;
    providerAction: string;
    file: OcrPlatformFileObjectRecord;
    dedupeKey: string;
    expiresAt: string;
  }) {
    try {
      const record = await this.repository.createProcessing({
        tenantId: input.tenantId,
        actorEmployeeId: input.employeeId,
        scene: input.input.scene,
        documentType: input.input.document_type,
        providerAction: input.providerAction,
        fileObjectId: input.file.id,
        fileChecksum: input.file.checksum,
        subjectType: input.input.subject_type,
        subjectId: input.input.subject_id,
        idempotencyKey: input.input.idempotency_key,
        dedupeKey: input.dedupeKey,
        expiresAt: input.expiresAt,
      });
      return { record, reuseReason: null as null };
    } catch (error) {
      if (!isUniqueConflict(error)) throw error;
      const idempotent = await this.repository.findByTenantAndIdempotencyKey(
        input.tenantId,
        input.input.idempotency_key,
      );
      if (idempotent) {
        return { record: idempotent, reuseReason: "idempotent" as const };
      }
      const dedupe = await this.repository.findActiveByDedupeKey(
        input.tenantId,
        input.dedupeKey,
      );
      if (!dedupe) throw error;
      return { record: dedupe, reuseReason: "dedupe" as const };
    }
  }

  private response(record: OcrRecognitionRecord, idempotent: boolean, cached: boolean) {
    return {
      recognition: this.toTenantRecognition(record),
      idempotent,
      cached,
    };
  }

  private toTenantRecognition(record: OcrRecognitionRecord) {
    if (record.scope_type !== "tenant" || !record.tenant_id) {
      throw Errors.business(500, "OCR识别记录租户信息无效", ErrorCodes.OCR_RESULT_INVALID);
    }
    if (record.status === "expired" || new Date(record.expires_at) <= this.nowFactory()) {
      throw Errors.business(410, "OCR识别结果已过期", ErrorCodes.OCR_RECOGNITION_EXPIRED);
    }
    let result: OcrNormalizedResult = { fields: [], warnings: [], quality: {} };
    if (record.status === "succeeded") {
      if (!record.result_ciphertext) {
        throw Errors.business(500, "OCR识别结果无效", ErrorCodes.OCR_RESULT_INVALID);
      }
      result = this.decrypt({
        context: { tenantId: record.tenant_id, recognitionId: record.id },
        ciphertext: record.result_ciphertext,
        rootSecret: this.encryptionKeyFactory(),
      });
    }
    return {
      id: record.id,
      status: record.status as OcrRecognitionStatus,
      scene: record.scene as OcrScene,
      document_type: record.document_type as OcrDocumentType,
      file_object_id: record.file_object_id,
      provider_request_id: record.provider_request_id,
      expires_at: record.expires_at,
      fields: result.fields,
      warnings: result.warnings,
      quality: result.quality,
    };
  }
}

export const ocrService = new OcrService();
