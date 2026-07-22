import { createHash } from "node:crypto";

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
  decryptOcrResult,
  encryptOcrResult,
  type OcrNormalizedResult,
} from "./crypto";
import {
  normalizeOcrResponse,
  type NormalizedOcrProviderResult,
} from "./normalizers";
import {
  tencentOcrGateway,
  type TencentOcrGatewayInput,
} from "./tencent-gateway";

type OcrRecognitionRecord =
  Database["public"]["Tables"]["ocr_recognitions"]["Row"];

type RecognitionRepositoryPort = Pick<
  typeof ocrRecognitionRepository,
  | "findByTenantAndIdempotencyKey"
  | "findActiveByDedupeKey"
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
  gateway?: { recognize(input: TencentOcrGatewayInput): Promise<unknown> };
  settings?: Pick<typeof systemSettingsService, "getNumber">;
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

  listCapabilities(authContext: AuthContext, scene?: OcrScene) {
    this.requireTenantEmployee(authContext);
    this.assertPermission(authContext, "ocr.recognize");
    return listPublicOcrCapabilities(scene);
  }

  async recognize(authContext: AuthContext, input: RecognizeInput) {
    const tenantId = this.requireTenantEmployee(authContext);
    this.assertPermission(authContext, "ocr.recognize");
    this.assertPermission(authContext, "wechat_pay.applyment.submit");
    const capability = getOcrCapability(input.scene, input.document_type);
    if (!capability) {
      throw Errors.business(400, "当前场景不支持该识别类型", ErrorCodes.OCR_CAPABILITY_UNAVAILABLE);
    }

    const file = await this.fileRepository.findActiveById({
      id: input.file_object_id,
      tenantId,
    });
    if (!file) {
      throw Errors.business(404, "OCR文件不存在", ErrorCodes.OCR_FILE_NOT_FOUND);
    }
    this.validateFile(file, input.scene, capability.supported_mime_types, capability.max_size_bytes);
    await this.validateSubjectAndAttachment(tenantId, input, file, capability.attachment_categories);

    const idempotent = await this.repository.findByTenantAndIdempotencyKey(
      tenantId,
      input.idempotency_key,
    );
    if (idempotent) return this.response(idempotent, true, false);

    const dedupeKey = buildDedupeKey({
      tenantId,
      fileIdentity: file.checksum || file.object_key,
      documentType: input.document_type,
      providerAction: capability.providerAction,
    });
    const cached = await this.repository.findActiveByDedupeKey(tenantId, dedupeKey);
    if (cached) return this.response(cached, false, true);

    const dailyLimit = Math.max(1, await this.settings.getNumber(
      "TENCENT_OCR_DEFAULT_TENANT_DAILY_LIMIT",
      100,
    ));
    const now = this.nowFactory();
    if (await this.repository.countTenantSince(tenantId, startOfUtcDay(now)) >= dailyLimit) {
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
      const resultCiphertext = this.encrypt({
        context: { tenantId, recognitionId: recognition.id },
        result: normalized,
        rootSecret: this.encryptionKeyFactory(),
      });
      const succeeded = await this.repository.markSucceeded({
        id: recognition.id,
        tenantId,
        resultCiphertext,
        resultSummary: buildResultSummary(normalized),
        warnings: normalized.warnings,
        quality: normalized.quality,
        providerRequestId: normalized.providerRequestId,
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
    this.assertPermission(authContext, "ocr.recognize");
    const recognition = await this.repository.findByIdForTenant(id, tenantId);
    if (!recognition) {
      throw Errors.business(404, "OCR识别记录不存在", ErrorCodes.OCR_RECOGNITION_NOT_FOUND);
    }
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

  private validateFile(
    file: OcrPlatformFileObjectRecord,
    scene: OcrScene,
    mimeTypes: readonly string[],
    maxSize: number,
  ) {
    if (file.scene !== scene) {
      throw Errors.business(400, "文件业务场景不匹配", ErrorCodes.OCR_FILE_ACCESS_DENIED);
    }
    if (!mimeTypes.includes(file.mime_type)) {
      throw Errors.business(400, "OCR文件格式不支持", ErrorCodes.OCR_FILE_FORMAT_UNSUPPORTED);
    }
    if (file.size_bytes > maxSize) {
      throw Errors.business(400, "OCR文件过大", ErrorCodes.OCR_FILE_TOO_LARGE);
    }
  }

  private async validateSubjectAndAttachment(
    tenantId: string,
    input: RecognizeInput,
    file: OcrPlatformFileObjectRecord,
    categories: readonly string[],
  ) {
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
    const matched = Array.isArray(applyment.attachments) && applyment.attachments.some((value) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) return false;
      const attachment = value as Record<string, unknown>;
      return attachment.object_key === file.object_key &&
        typeof attachment.category === "string" &&
        categories.includes(attachment.category);
    });
    if (!matched) {
      throw Errors.business(403, "附件类型与识别类型不匹配", ErrorCodes.OCR_FILE_ACCESS_DENIED);
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

function buildDedupeKey(input: {
  tenantId: string;
  fileIdentity: string;
  documentType: OcrDocumentType;
  providerAction: string;
}) {
  return createHash("sha256").update([
    input.tenantId,
    input.fileIdentity,
    input.documentType,
    input.providerAction,
  ].join(":"), "utf8").digest("hex");
}

function buildResultSummary(result: NormalizedOcrProviderResult) {
  return {
    field_keys: result.fields.map((field) => field.key),
    sensitive_field_count: result.fields.filter((field) => field.sensitive).length,
    warning_codes: result.warnings.map((warning) => warning.code),
  };
}

function safeProviderFailure(error: unknown) {
  const details = error && typeof error === "object" && "details" in error &&
      error.details && typeof error.details === "object"
    ? error.details as Record<string, unknown>
    : {};
  return {
    providerRequestId: typeof details.requestId === "string" ? details.requestId : null,
    providerErrorCode: typeof details.providerCode === "string" ? details.providerCode : null,
    providerErrorMessageSafe: "腾讯云OCR调用失败",
  };
}

function isUniqueConflict(error: unknown) {
  if (!error || typeof error !== "object" || !("details" in error)) return false;
  return JSON.stringify(error.details).includes("23505");
}

function startOfUtcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())).toISOString();
}

function elapsed(now: number, startedAt: number) {
  return Math.max(0, Math.floor(now - startedAt));
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.floor(value)));
}

export const ocrService = new OcrService();
