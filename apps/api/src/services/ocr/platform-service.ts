import { createHash } from "node:crypto";
import type { OcrDocumentType, OcrRecognitionStatus, OcrScene } from "@gooes/domain";
import { ErrorCodes } from "@/errors/error-codes";
import { Errors } from "@/errors/error-factory";
import {
  platformOcrRecognitionRepository,
  type PlatformOcrRecognitionRecord,
} from "@/repositories/platform-ocr-recognitions";
import {
  platformFileObjectRepository,
  type SupplierBusinessLicensePreviewFileRecord,
} from "@/repositories/platform-file-objects";
import { accessPolicyService } from "@/services/access-policy";
import type { AuthContext } from "@/services/authorization";
import { resolveOcrStoredFileUrl } from "@/services/files/file-url-resolver";
import { systemSettingsService } from "@/services/system-settings";
import { ocrActionSemaphore, type OcrActionSemaphore } from "./action-semaphore";
import { getOcrCapability, listPlatformOcrCapabilities } from "./capabilities";
import {
  assertOcrResultEncryptionKey,
  decryptOcrResult,
  encryptOcrResult,
  hasOcrResultEncryptionKey,
  type OcrNormalizedResult,
} from "./crypto";
import { normalizeOcrResponse } from "./normalizers";
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

type PlatformRecognizeInput = {
  scene: OcrScene;
  document_type: OcrDocumentType;
  file_object_id: string;
  idempotency_key: string;
};

type PlatformOcrRepositoryPort = Pick<
  typeof platformOcrRecognitionRepository,
  | "findByIdempotencyKey"
  | "findActiveByDedupeKey"
  | "expireStaleByDedupeKey"
  | "countPlatformSince"
  | "createProcessing"
  | "markSucceeded"
  | "markFailed"
  | "findByIdForEmployee"
>;

export type PlatformOcrServiceDependencies = {
  repository?: PlatformOcrRepositoryPort;
  fileRepository?: Pick<
    typeof platformFileObjectRepository,
    "findSupplierBusinessLicensePreviewById"
  >;
  accessPolicy?: Pick<typeof accessPolicyService, "hasPermission">;
  gateway?: { recognize(input: TencentOcrGatewayInput): Promise<unknown> };
  settings?: Pick<typeof systemSettingsService, "getBoolean" | "getNumber">;
  signedUrlResolver?: typeof resolveOcrStoredFileUrl;
  normalize?: typeof normalizeOcrResponse;
  encrypt?: typeof encryptOcrResult;
  decrypt?: typeof decryptOcrResult;
  semaphore?: Pick<OcrActionSemaphore, "run">;
  encryptionKeyFactory?: () => string | null | undefined;
  nowFactory?: () => Date;
  clockMsFactory?: () => number;
};

const SUPPLIER_MANAGE_PERMISSION = "platform.supplier.manage";
const PLATFORM_OCR_PERMISSION = "platform.ocr.recognize";

export class PlatformOcrService {
  private readonly repository: PlatformOcrRepositoryPort;
  private readonly fileRepository: NonNullable<PlatformOcrServiceDependencies["fileRepository"]>;
  private readonly accessPolicy: NonNullable<PlatformOcrServiceDependencies["accessPolicy"]>;
  private readonly gateway: NonNullable<PlatformOcrServiceDependencies["gateway"]>;
  private readonly settings: NonNullable<PlatformOcrServiceDependencies["settings"]>;
  private readonly signedUrlResolver: typeof resolveOcrStoredFileUrl;
  private readonly normalize: typeof normalizeOcrResponse;
  private readonly encrypt: typeof encryptOcrResult;
  private readonly decrypt: typeof decryptOcrResult;
  private readonly semaphore: Pick<OcrActionSemaphore, "run">;
  private readonly encryptionKeyFactory: () => string | null | undefined;
  private readonly nowFactory: () => Date;
  private readonly clockMsFactory: () => number;

  constructor(dependencies: PlatformOcrServiceDependencies = {}) {
    this.repository = dependencies.repository ?? platformOcrRecognitionRepository;
    this.fileRepository = dependencies.fileRepository ?? platformFileObjectRepository;
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

  async listCapabilities(authContext: AuthContext, scene?: OcrScene) {
    this.requirePlatformPermissions(authContext);
    if (!await this.settings.getBoolean("TENCENT_OCR_ENABLED", false)) return [];
    if (!hasOcrResultEncryptionKey(this.encryptionKeyFactory())) return [];
    return listPlatformOcrCapabilities(scene);
  }

  async recognize(authContext: AuthContext, input: PlatformRecognizeInput) {
    const employeeId = this.requirePlatformPermissions(authContext);
    if (!await this.settings.getBoolean("TENCENT_OCR_ENABLED", false)) {
      throw Errors.business(503, "腾讯云OCR尚未启用", ErrorCodes.OCR_DISABLED);
    }
    const capability = getOcrCapability(input.scene, input.document_type);
    if (!capability || capability.audience !== "platform") {
      throw Errors.business(400, "当前场景不支持该识别类型", ErrorCodes.OCR_CAPABILITY_UNAVAILABLE);
    }
    const resultEncryptionKey = this.encryptionKeyFactory();
    assertOcrResultEncryptionKey(resultEncryptionKey);
    const file = await this.fileRepository
      .findSupplierBusinessLicensePreviewById(input.file_object_id);
    this.validateSupplierLicenseFile(file, employeeId, capability);
    const idempotent = await this.repository
      .findByIdempotencyKey(input.idempotency_key);
    if (idempotent) {
      assertPlatformIdempotencyMatches(idempotent, input);
      return this.response(idempotent, true, false);
    }

    const now = this.nowFactory();
    const dedupeKey = buildPlatformOcrDedupeKey({
      scene: input.scene,
      fileIdentity: file.checksum || file.object_key,
      documentType: input.document_type,
      providerAction: capability.providerAction,
    });
    await this.repository.expireStaleByDedupeKey({
      dedupeKey,
      before: now.toISOString(),
    });
    const cached = await this.repository.findActiveByDedupeKey(dedupeKey);
    if (cached) return this.response(cached, false, true);

    const dailyLimit = clamp(
      await this.settings.getNumber("TENCENT_OCR_PLATFORM_DAILY_LIMIT", 100),
      1,
      10000,
    );
    if (await this.repository.countPlatformSince(startOfUtcDay(now)) >= dailyLimit) {
      throw Errors.business(429, "今日平台OCR识别额度已用完", ErrorCodes.OCR_DAILY_LIMIT_EXCEEDED);
    }
    const ttlHours = clamp(
      await this.settings.getNumber("TENCENT_OCR_RESULT_TTL_HOURS", 24),
      1,
      168,
    );
    const expiresAt = new Date(now.getTime() + ttlHours * 3_600_000).toISOString();
    const creation = await this.createProcessingOrReadWinner({
      employeeId,
      input,
      providerAction: capability.providerAction,
      file,
      dedupeKey,
      expiresAt,
    });
    const recognition = creation.record;
    if (creation.reuseReason) {
      if (creation.reuseReason === "idempotent") {
        assertPlatformIdempotencyMatches(recognition, input);
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
        context: { scopeType: "platform", recognitionId: recognition.id },
        result: normalizedResult,
        rootSecret: resultEncryptionKey,
      });
      const succeeded = await this.repository.markSucceeded({
        id: recognition.id,
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
        ...safeProviderFailure(error),
        durationMs: elapsed(this.clockMsFactory(), startedAt),
        processedAt: this.nowFactory().toISOString(),
      });
      throw error;
    }
  }

  async getRecognitionResult(authContext: AuthContext, id: string) {
    const employeeId = this.requirePlatformPermissions(authContext);
    const recognition = await this.repository.findByIdForEmployee(id, employeeId);
    if (!recognition) {
      throw Errors.business(404, "OCR识别记录不存在", ErrorCodes.OCR_RECOGNITION_NOT_FOUND);
    }
    return this.toRecognition(recognition);
  }

  private requirePlatformPermissions(authContext: AuthContext) {
    const isPlatformIdentity =
      authContext.isPlatformStaff === true || authContext.isPlatformAdmin === true;
    if (authContext.tenantId !== null || !isPlatformIdentity || !authContext.employeeId) {
      throw Errors.forbidden();
    }
    if (
      !this.accessPolicy.hasPermission(authContext, SUPPLIER_MANAGE_PERMISSION) ||
      !this.accessPolicy.hasPermission(authContext, PLATFORM_OCR_PERMISSION)
    ) throw Errors.forbidden();
    return authContext.employeeId;
  }

  private validateSupplierLicenseFile(
    file: SupplierBusinessLicensePreviewFileRecord | null,
    employeeId: string,
    capability: { supported_mime_types: readonly string[]; max_size_bytes: number },
  ): asserts file is SupplierBusinessLicensePreviewFileRecord {
    if (
      !file ||
      file.tenant_id !== null ||
      file.owner_type !== "supplier_business_license" ||
      file.owner_id !== null ||
      file.scene !== "supplier_business_license" ||
      file.provider !== "tencent_cos" ||
      file.visibility !== "private" ||
      file.status !== "active" ||
      file.deleted_at !== null ||
      file.created_by_employee_id !== employeeId
    ) throw Errors.business(403, "无权识别当前文件", ErrorCodes.OCR_FILE_ACCESS_DENIED);
    const typedFile = file as SupplierBusinessLicensePreviewFileRecord & {
      mime_type?: string;
      size_bytes?: number;
    };
    if (!capability.supported_mime_types.includes(String(typedFile.mime_type))) {
      throw Errors.business(400, "OCR文件格式不支持", ErrorCodes.OCR_FILE_FORMAT_UNSUPPORTED);
    }
    if (Number(typedFile.size_bytes) > capability.max_size_bytes) {
      throw Errors.business(400, "OCR文件过大", ErrorCodes.OCR_FILE_TOO_LARGE);
    }
  }

  private async createProcessingOrReadWinner(input: {
    employeeId: string;
    input: PlatformRecognizeInput;
    providerAction: string;
    file: SupplierBusinessLicensePreviewFileRecord & {
      checksum?: string | null;
      object_key: string;
    };
    dedupeKey: string;
    expiresAt: string;
  }) {
    try {
      const record = await this.repository.createProcessing({
        actorEmployeeId: input.employeeId,
        scene: input.input.scene,
        documentType: input.input.document_type,
        providerAction: input.providerAction,
        fileObjectId: input.file.id,
        fileChecksum: input.file.checksum ?? null,
        idempotencyKey: input.input.idempotency_key,
        dedupeKey: input.dedupeKey,
        expiresAt: input.expiresAt,
      });
      return { record, reuseReason: null as null };
    } catch (error) {
      if (!isUniqueConflict(error)) throw error;
      const idempotent = await this.repository
        .findByIdempotencyKey(input.input.idempotency_key);
      if (idempotent) {
        return { record: idempotent, reuseReason: "idempotent" as const };
      }
      const dedupe = await this.repository.findActiveByDedupeKey(input.dedupeKey);
      if (!dedupe) throw error;
      return { record: dedupe, reuseReason: "dedupe" as const };
    }
  }

  private response(record: PlatformOcrRecognitionRecord, idempotent: boolean, cached: boolean) {
    return { recognition: this.toRecognition(record), idempotent, cached };
  }

  private toRecognition(record: PlatformOcrRecognitionRecord) {
    if (record.status === "expired" || new Date(record.expires_at) <= this.nowFactory()) {
      throw Errors.business(410, "OCR识别结果已过期", ErrorCodes.OCR_RECOGNITION_EXPIRED);
    }
    let result: OcrNormalizedResult = { fields: [], warnings: [], quality: {} };
    if (record.status === "succeeded") {
      if (!record.result_ciphertext) {
        throw Errors.business(500, "OCR识别结果无效", ErrorCodes.OCR_RESULT_INVALID);
      }
      result = this.decrypt({
        context: { scopeType: "platform", recognitionId: record.id },
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

function assertPlatformIdempotencyMatches(
  recognition: PlatformOcrRecognitionRecord,
  input: PlatformRecognizeInput,
) {
  if (
    recognition.scene === input.scene &&
    recognition.document_type === input.document_type &&
    recognition.file_object_id === input.file_object_id &&
    !recognition.subject_type &&
    !recognition.subject_id
  ) return;
  throw Errors.business(
    409,
    "幂等键已用于其他OCR请求",
    ErrorCodes.OCR_IDEMPOTENCY_CONFLICT,
  );
}

function buildPlatformOcrDedupeKey(input: {
  fileIdentity: string;
  documentType: OcrDocumentType;
  providerAction: string;
  scene: OcrScene;
}) {
  return createHash("sha256").update([
    "platform",
    input.scene,
    input.fileIdentity,
    input.documentType,
    input.providerAction,
  ].join(":"), "utf8").digest("hex");
}

export const platformOcrService = new PlatformOcrService();
