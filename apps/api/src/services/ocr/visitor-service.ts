import type {
  OcrDocumentType,
  OcrRecognitionStatus,
  OcrScene,
} from "@gooes/domain";

import { ErrorCodes } from "@/errors/error-codes";
import { Errors } from "@/errors/error-factory";
import {
  visitorOcrRecognitionRepository,
  type VisitorOcrClaimResult,
  type VisitorOcrRecognitionRecord,
} from "@/repositories/visitor-ocr-recognitions";
import {
  visitorOnboardingFileObjectsRepository,
  type VisitorOcrPlatformFileObjectRecord,
} from "@/repositories/visitor-onboarding-file-objects";
import { systemSettingsService } from "@/services/system-settings";

import { getOcrCapability, listVisitorOcrCapabilities } from "./capabilities";
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
  safeProviderFailure,
} from "./service-helpers";
import {
  tencentOcrGateway,
  type TencentOcrGatewayInput,
} from "./tencent-gateway";
import {
  verifyVisitorOcrImage,
  type VerifiedVisitorOcrImage,
} from "./visitor-image-verifier";
import {
  hashVisitorOcrRequestIp,
  sanitizeVisitorOcrFailure,
  throwVisitorOcrQuotaExceeded,
  visitorOcrFileNotFound,
  visitorOcrRecognitionExpired,
  visitorOcrRecognitionNotFound,
} from "./visitor-service-helpers";

type VisitorRecognizeInput = {
  file_object_id: string;
  idempotency_key: string;
};

type VisitorRequestContext = {
  visitorId: string;
  requestIp: string;
};

type RepositoryPort = Pick<
  typeof visitorOcrRecognitionRepository,
  | "claim"
  | "markSucceeded"
  | "markFailed"
  | "findByIdForVisitor"
  | "expireProcessingLease"
>;

type SettingsPort = Pick<
  typeof systemSettingsService,
  "getBoolean" | "getNumber" | "getSecretString"
>;

export type TenantOnboardingOcrServiceDependencies = {
  repository?: RepositoryPort;
  fileRepository?: Pick<
    typeof visitorOnboardingFileObjectsRepository,
    "findActiveLicenseById"
  >;
  gateway?: { recognize(input: TencentOcrGatewayInput): Promise<unknown> };
  settings?: SettingsPort;
  verifyImage?: typeof verifyVisitorOcrImage;
  normalize?: typeof normalizeOcrResponse;
  encrypt?: typeof encryptOcrResult;
  decrypt?: typeof decryptOcrResult;
  encryptionKeyFactory?: () => string | null | undefined;
  nowFactory?: () => Date;
  clockMsFactory?: () => number;
};

const SCENE = "tenant_onboarding_license" as const;
const DOCUMENT_TYPE = "business_license" as const;

export class TenantOnboardingOcrService {
  private readonly repository: RepositoryPort;
  private readonly fileRepository: NonNullable<
    TenantOnboardingOcrServiceDependencies["fileRepository"]
  >;
  private readonly gateway: NonNullable<
    TenantOnboardingOcrServiceDependencies["gateway"]
  >;
  private readonly settings: SettingsPort;
  private readonly verifyImage: typeof verifyVisitorOcrImage;
  private readonly normalize: typeof normalizeOcrResponse;
  private readonly encrypt: typeof encryptOcrResult;
  private readonly decrypt: typeof decryptOcrResult;
  private readonly encryptionKeyFactory: () => string | null | undefined;
  private readonly nowFactory: () => Date;
  private readonly clockMsFactory: () => number;

  constructor(dependencies: TenantOnboardingOcrServiceDependencies = {}) {
    this.repository = dependencies.repository ?? visitorOcrRecognitionRepository;
    this.fileRepository = dependencies.fileRepository ??
      visitorOnboardingFileObjectsRepository;
    this.gateway = dependencies.gateway ?? tencentOcrGateway;
    this.settings = dependencies.settings ?? systemSettingsService;
    this.verifyImage = dependencies.verifyImage ?? verifyVisitorOcrImage;
    this.normalize = dependencies.normalize ?? normalizeOcrResponse;
    this.encrypt = dependencies.encrypt ?? encryptOcrResult;
    this.decrypt = dependencies.decrypt ?? decryptOcrResult;
    this.encryptionKeyFactory = dependencies.encryptionKeyFactory ??
      (() => process.env.OCR_RESULT_ENCRYPTION_KEY);
    this.nowFactory = dependencies.nowFactory ?? (() => new Date());
    this.clockMsFactory = dependencies.clockMsFactory ?? Date.now;
  }

  async listCapabilities() {
    const availability = await this.loadAvailability();
    if (
      !availability.globalEnabled ||
      !availability.visitorEnabled ||
      !availability.secretId ||
      !availability.secretKey ||
      !hasOcrResultEncryptionKey(this.encryptionKeyFactory())
    ) return [];
    return listVisitorOcrCapabilities(SCENE);
  }

  async recognize(
    context: VisitorRequestContext,
    input: VisitorRecognizeInput,
  ) {
    const resultEncryptionKey = await this.requireAvailable();
    const capability = getOcrCapability(SCENE, DOCUMENT_TYPE);
    if (!capability || capability.audience !== "visitor") {
      throw Errors.business(
        503,
        "装企入驻OCR暂不可用",
        ErrorCodes.OCR_CAPABILITY_UNAVAILABLE,
      );
    }

    const file = await this.fileRepository.findActiveLicenseById({
      id: input.file_object_id,
      visitorId: context.visitorId,
    });
    this.validateFile(file, context.visitorId, capability);
    const verifiedImage = await this.verifyImage({
      file,
      maxSizeBytes: capability.max_size_bytes,
    });

    const now = this.nowFactory();
    const limits = await this.loadLimits();
    const claim = await this.repository.claim({
      actorVisitorId: context.visitorId,
      fileObjectId: file.id,
      fileChecksum: file.checksum,
      idempotencyKey: input.idempotency_key,
      requestIpHash: hashVisitorOcrRequestIp(
        context.requestIp,
        resultEncryptionKey,
      ),
      now: now.toISOString(),
      expiresAt: new Date(
        now.getTime() + limits.ttlHours * 3_600_000,
      ).toISOString(),
      processingDeadlineAt: new Date(
        now.getTime() + limits.processingLeaseSeconds * 1_000,
      ).toISOString(),
      dailyLimit: limits.dailyLimit,
      ipWindowSeconds: limits.ipWindowSeconds,
      ipWindowLimit: limits.ipWindowLimit,
      visitorConcurrencyLimit: limits.visitorConcurrencyLimit,
      globalConcurrencyLimit: limits.globalConcurrencyLimit,
    });

    if (claim.outcome !== "created") {
      return this.handleReusedClaim(claim, context.visitorId);
    }
    const recognition = requireClaimRecognition(claim);
    this.assertClaimOwnership(recognition, context.visitorId, file.id);
    return this.invokeProvider({
      recognition,
      visitorId: context.visitorId,
      verifiedImage,
      resultEncryptionKey,
    });
  }

  async getRecognitionResult(visitorId: string, id: string) {
    let recognition = await this.repository.findByIdForVisitor(id, visitorId);
    if (!recognition) return visitorOcrRecognitionNotFound();
    if (
      recognition.status === "processing" &&
      recognition.processing_deadline_at &&
      new Date(recognition.processing_deadline_at) <= this.nowFactory()
    ) {
      recognition = await this.repository.expireProcessingLease(
        id,
        visitorId,
        this.nowFactory().toISOString(),
      ) ?? recognition;
    }
    return this.toRecognition(recognition);
  }

  private async invokeProvider(input: {
    recognition: VisitorOcrRecognitionRecord;
    visitorId: string;
    verifiedImage: VerifiedVisitorOcrImage;
    resultEncryptionKey: string;
  }) {
    const startedAt = this.clockMsFactory();
    try {
      const providerResponse = await this.gateway.recognize({
        providerAction: "BizLicenseOCR",
        imageUrl: input.verifiedImage.signedUrl,
      });
      const normalized = this.normalize(DOCUMENT_TYPE, providerResponse);
      const { providerRequestId, ...normalizedResult } = normalized;
      const resultCiphertext = this.encrypt({
        context: {
          scopeType: "visitor",
          actorVisitorId: input.visitorId,
          recognitionId: input.recognition.id,
        },
        result: normalizedResult,
        rootSecret: input.resultEncryptionKey,
      });
      const succeeded = await this.repository.markSucceeded({
        id: input.recognition.id,
        actorVisitorId: input.visitorId,
        resultCiphertext,
        resultSummary: buildResultSummary(normalizedResult),
        warnings: normalizedResult.warnings,
        quality: normalizedResult.quality,
        providerRequestId,
        billableUnits: 1,
        durationMs: elapsed(this.clockMsFactory(), startedAt),
        processedAt: this.nowFactory().toISOString(),
      });
      return {
        recognition: this.toRecognition(succeeded),
        idempotent: false,
        cached: false,
      };
    } catch (error) {
      await this.repository.markFailed({
        id: input.recognition.id,
        actorVisitorId: input.visitorId,
        ...safeProviderFailure(error),
        providerErrorMessageSafe: "腾讯云OCR调用失败",
        durationMs: elapsed(this.clockMsFactory(), startedAt),
        processedAt: this.nowFactory().toISOString(),
      });
      throw sanitizeVisitorOcrFailure(error, input.recognition.id);
    }
  }

  private handleReusedClaim(
    claim: VisitorOcrClaimResult,
    visitorId: string,
  ) {
    if (claim.outcome === "idempotency_conflict") {
      throw Errors.business(
        409,
        "幂等键已用于其他OCR请求",
        ErrorCodes.OCR_IDEMPOTENCY_CONFLICT,
      );
    }
    if (claim.outcome === "daily_limited") {
      return throwVisitorOcrQuotaExceeded(
        "今日OCR识别额度已用完",
        ErrorCodes.OCR_DAILY_LIMIT_EXCEEDED,
        claim.retry_after_seconds,
      );
    }
    if (claim.outcome === "rate_limited") {
      return throwVisitorOcrQuotaExceeded(
        "OCR服务繁忙，请稍后重试",
        ErrorCodes.OCR_PROVIDER_RATE_LIMITED,
        claim.retry_after_seconds,
      );
    }

    const recognition = requireClaimRecognition(claim);
    if (recognition.actor_visitor_id !== visitorId) {
      return visitorOcrRecognitionNotFound();
    }
    if (claim.outcome === "in_progress") {
      throw Errors.business(
        409,
        "OCR识别正在处理中",
        ErrorCodes.OCR_RECOGNITION_IN_PROGRESS,
        { recognition_id: recognition.id },
      );
    }
    if (claim.outcome === "expired") return visitorOcrRecognitionExpired();
    return {
      recognition: this.toRecognition(recognition),
      idempotent: true,
      cached: false,
    };
  }

  private validateFile(
    file: VisitorOcrPlatformFileObjectRecord | null,
    visitorId: string,
    capability: {
      supported_mime_types: readonly string[];
      max_size_bytes: number;
    },
  ): asserts file is VisitorOcrPlatformFileObjectRecord {
    if (
      !file ||
      file.tenant_id !== null ||
      file.owner_type !== "visitor" ||
      file.owner_visitor_id !== visitorId ||
      file.scene !== SCENE ||
      file.provider !== "tencent_cos" ||
      file.visibility !== "private" ||
      file.public_url !== null ||
      file.status !== "active" ||
      file.deleted_at !== null
    ) return visitorOcrFileNotFound();
    if (!capability.supported_mime_types.includes(file.mime_type)) {
      throw Errors.business(
        400,
        "OCR文件格式不支持",
        ErrorCodes.OCR_FILE_FORMAT_UNSUPPORTED,
      );
    }
    if (file.size_bytes > capability.max_size_bytes) {
      throw Errors.business(
        400,
        "OCR文件过大",
        ErrorCodes.OCR_FILE_TOO_LARGE,
      );
    }
  }

  private async requireAvailable() {
    const availability = await this.loadAvailability();
    if (!availability.globalEnabled) {
      throw Errors.business(503, "腾讯云OCR尚未启用", ErrorCodes.OCR_DISABLED);
    }
    if (!availability.visitorEnabled) {
      throw Errors.business(
        503,
        "装企入驻OCR尚未启用",
        ErrorCodes.OCR_CAPABILITY_UNAVAILABLE,
      );
    }
    const resultEncryptionKey = this.encryptionKeyFactory();
    assertOcrResultEncryptionKey(resultEncryptionKey);
    if (!availability.secretId || !availability.secretKey) {
      throw Errors.business(
        503,
        "腾讯云OCR密钥未配置",
        ErrorCodes.OCR_CONFIG_MISSING,
      );
    }
    return resultEncryptionKey;
  }

  private async loadAvailability() {
    const [globalEnabled, visitorEnabled, secretId, secretKey] =
      await Promise.all([
        this.settings.getBoolean("TENCENT_OCR_ENABLED", false),
        this.settings.getBoolean(
          "TENCENT_OCR_TENANT_ONBOARDING_ENABLED",
          false,
        ),
        this.settings.getSecretString("TENCENT_OCR_SECRET_ID"),
        this.settings.getSecretString("TENCENT_OCR_SECRET_KEY"),
      ]);
    return {
      globalEnabled,
      visitorEnabled,
      secretId: secretId.trim(),
      secretKey: secretKey.trim(),
    };
  }

  private async loadLimits() {
    const [
      dailyLimit,
      ipWindowSeconds,
      ipWindowLimit,
      processingLeaseSeconds,
      visitorConcurrencyLimit,
      globalConcurrencyLimit,
      ttlHours,
    ] = await Promise.all([
      this.settings.getNumber("TENCENT_OCR_VISITOR_DAILY_LIMIT", 5),
      this.settings.getNumber("TENCENT_OCR_VISITOR_IP_WINDOW_SECONDS", 60),
      this.settings.getNumber("TENCENT_OCR_VISITOR_IP_WINDOW_LIMIT", 20),
      this.settings.getNumber(
        "TENCENT_OCR_VISITOR_PROCESSING_LEASE_SECONDS",
        30,
      ),
      this.settings.getNumber("TENCENT_OCR_VISITOR_CONCURRENCY_LIMIT", 1),
      this.settings.getNumber(
        "TENCENT_OCR_VISITOR_GLOBAL_CONCURRENCY_LIMIT",
        8,
      ),
      this.settings.getNumber("TENCENT_OCR_RESULT_TTL_HOURS", 24),
    ]);
    return {
      dailyLimit: clamp(dailyLimit, 1, 1_000),
      ipWindowSeconds: clamp(ipWindowSeconds, 1, 3_600),
      ipWindowLimit: clamp(ipWindowLimit, 1, 10_000),
      processingLeaseSeconds: clamp(processingLeaseSeconds, 5, 300),
      visitorConcurrencyLimit: clamp(visitorConcurrencyLimit, 1, 10),
      globalConcurrencyLimit: clamp(globalConcurrencyLimit, 1, 100),
      ttlHours: clamp(ttlHours, 1, 168),
    };
  }

  private assertClaimOwnership(
    recognition: VisitorOcrRecognitionRecord,
    visitorId: string,
    fileId: string,
  ) {
    if (
      recognition.actor_visitor_id !== visitorId ||
      recognition.file_object_id !== fileId
    ) throw Errors.dbError("访客OCR认领记录归属无效");
  }

  private toRecognition(record: VisitorOcrRecognitionRecord) {
    if (
      record.status === "expired" ||
      new Date(record.expires_at) <= this.nowFactory()
    ) return visitorOcrRecognitionExpired();
    let result: OcrNormalizedResult = { fields: [], warnings: [], quality: {} };
    if (record.status === "succeeded") {
      if (!record.result_ciphertext) {
        throw Errors.business(
          500,
          "OCR识别结果无效",
          ErrorCodes.OCR_RESULT_INVALID,
        );
      }
      result = this.decrypt({
        context: {
          scopeType: "visitor",
          actorVisitorId: record.actor_visitor_id,
          recognitionId: record.id,
        },
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

function requireClaimRecognition(claim: VisitorOcrClaimResult) {
  if (claim.recognition) return claim.recognition;
  throw Errors.dbError("访客OCR认领记录缺失");
}

export const tenantOnboardingOcrService =
  new TenantOnboardingOcrService();
