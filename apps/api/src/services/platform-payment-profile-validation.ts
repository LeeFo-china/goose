import { AppError } from "@/errors/app-error";
import { Errors } from "@/errors/error-factory";
import {
  platformPaymentConfigRepository,
  type PlatformPaymentConfigRecord,
  type PlatformPaymentProfileCode,
} from "@/repositories/platform-payment-configs";
import {
  wechatPayProfileValidator,
  type WechatPayProfileValidator,
} from "@/services/wechat-pay-profile-validator";

const SAFE_VALIDATION_FAILURE_MESSAGE =
  "微信支付配置验证失败，请检查配置后重试";
const GENERIC_VALIDATION_FAILURE_CODE =
  "WECHAT_PAY_PROFILE_VALIDATION_FAILED";

type RepositoryPort = Pick<
  typeof platformPaymentConfigRepository,
  "findWechatPayConfigByProfile" | "updateWechatPayValidation"
>;
type ValidatorPort = Pick<WechatPayProfileValidator, "validate">;

export type PlatformPaymentProfileValidationInput = {
  profileCode: PlatformPaymentProfileCode;
  employeeId: string;
};

export type PlatformPaymentProfileValidationResult = {
  config: PlatformPaymentConfigRecord;
  validation:
    | {
      ok: true;
      probe_mode: "platform_certificate" | "wechat_pay_public_key";
      api_v3_key_probe: "decrypted" | "format_only";
      request_id: string | null;
      validated_at: string;
    }
    | {
      ok: false;
      error_code: string;
      message: string;
      request_id: string | null;
      validated_at: string;
    };
};

type PlatformPaymentProfileValidationServiceDependencies = {
  repository?: RepositoryPort;
  validator?: ValidatorPort;
  nowFactory?: () => Date;
};

export class PlatformPaymentProfileValidationService {
  private readonly repository: RepositoryPort;
  private readonly validator: ValidatorPort;
  private readonly nowFactory: () => Date;

  constructor(
    dependencies: PlatformPaymentProfileValidationServiceDependencies = {},
  ) {
    this.repository = dependencies.repository ?? platformPaymentConfigRepository;
    this.validator = dependencies.validator ?? wechatPayProfileValidator;
    this.nowFactory = dependencies.nowFactory ?? (() => new Date());
  }

  async validate(
    input: PlatformPaymentProfileValidationInput,
  ): Promise<PlatformPaymentProfileValidationResult> {
    const config = await this.repository.findWechatPayConfigByProfile(
      input.profileCode,
    );
    if (!config) {
      throw Errors.business(
        404,
        "平台微信支付配置不存在",
        "PLATFORM_PAYMENT_PROFILE_NOT_FOUND",
      );
    }

    const validatedAt = this.nowFactory().toISOString();
    let probe;
    try {
      probe = await this.validator.validate(config);
    } catch (error) {
      return this.persistFailure({ config, input, validatedAt, error });
    }

    const requestId = sanitizeRequestId(probe.request_id);
    const saved = await this.repository.updateWechatPayValidation({
      configId: config.id,
      validationStatus: "valid",
      lastValidatedAt: validatedAt,
      lastValidationErrorCode: null,
      lastValidationErrorMessage: null,
      lastValidationRequestId: requestId,
      updatedByEmployeeId: input.employeeId,
    });
    return {
      config: saved,
      validation: {
        ...probe,
        request_id: requestId,
        validated_at: validatedAt,
      },
    };
  }

  private async persistFailure(args: {
    config: PlatformPaymentConfigRecord;
    input: PlatformPaymentProfileValidationInput;
    validatedAt: string;
    error: unknown;
  }): Promise<PlatformPaymentProfileValidationResult> {
    const errorCode = sanitizeErrorCode(
      args.error instanceof AppError ? args.error.code : null,
    );
    const requestId = args.error instanceof AppError
      ? requestIdFromDetails(args.error.details)
      : null;
    const saved = await this.repository.updateWechatPayValidation({
      configId: args.config.id,
      validationStatus: "invalid",
      lastValidatedAt: args.validatedAt,
      lastValidationErrorCode: errorCode,
      lastValidationErrorMessage: SAFE_VALIDATION_FAILURE_MESSAGE,
      lastValidationRequestId: requestId,
      updatedByEmployeeId: args.input.employeeId,
    });
    return {
      config: saved,
      validation: {
        ok: false,
        error_code: errorCode,
        message: SAFE_VALIDATION_FAILURE_MESSAGE,
        request_id: requestId,
        validated_at: args.validatedAt,
      },
    };
  }
}

function sanitizeErrorCode(value: string | null) {
  return value && /^[A-Z][A-Z0-9_]{2,99}$/.test(value)
    ? value
    : GENERIC_VALIDATION_FAILURE_CODE;
}

function requestIdFromDetails(details: unknown) {
  if (!details || typeof details !== "object" || Array.isArray(details)) {
    return null;
  }
  const record = details as Record<string, unknown>;
  return sanitizeRequestId(record.requestId ?? record.request_id);
}

function sanitizeRequestId(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return /^[A-Za-z0-9._:-]{1,128}$/.test(normalized) ? normalized : null;
}

export const platformPaymentProfileValidationService =
  new PlatformPaymentProfileValidationService();
