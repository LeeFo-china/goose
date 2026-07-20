import { beforeEach, describe, expect, mock, test } from "bun:test";
import { AppError } from "@/errors/app-error";
import type {
  PlatformPaymentConfigRecord,
  PlatformPaymentValidationUpdateInput,
} from "@/repositories/platform-payment-configs";
import type { WechatPayProfileProbeResult } from "@/services/wechat-pay-profile-validation-gateway";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const config = {
  id: "platform-config-1",
  provider: "wechat_pay",
  profile_code: "platform_direct_recharge",
  principal_type: "platform",
  merchant_mode: "direct_merchant",
  merchant_name: "平台商户",
  merchant_id: "1112582521",
  sub_merchant_id: null,
  app_id: "wxbac3b1e168fd968a",
  sub_app_id: null,
  encrypted_config_ref: "setting://PLATFORM_WECHAT_PAY_SECRET_BUNDLE",
  secret_bundle_revision: "bundle-revision-1",
  serial_no: "MERCHANT_CERT_SERIAL",
  notify_url: "https://api.example.com/pay/wechat/callback",
  enabled_channels: ["tenant_recharge"],
  status: "active",
  validation_status: "unchecked",
  last_validated_at: null,
  last_validation_error_code: null,
  last_validation_error_message: null,
  last_validation_request_id: null,
  risk_switches: {},
  created_by_employee_id: "employee-platform",
  updated_by_employee_id: "employee-platform",
  created_at: "2026-07-20T14:00:00.000Z",
  updated_at: "2026-07-20T14:00:00.000Z",
} satisfies PlatformPaymentConfigRecord;

const findWechatPayConfigByProfile = mock(
  async (): Promise<PlatformPaymentConfigRecord | null> => config,
);
const updateWechatPayValidation = mock(
  async (input: PlatformPaymentValidationUpdateInput) => ({
    ...config,
    validation_status: input.validationStatus,
    last_validated_at: input.lastValidatedAt,
    last_validation_error_code: input.lastValidationErrorCode,
    last_validation_error_message: input.lastValidationErrorMessage,
    last_validation_request_id: input.lastValidationRequestId,
    updated_by_employee_id: input.updatedByEmployeeId,
  }),
);
const validate = mock(async (): Promise<WechatPayProfileProbeResult> => ({
  ok: true as const,
  probe_mode: "platform_certificate" as const,
  api_v3_key_probe: "decrypted" as const,
  request_id: "wechat-success-request-id",
}));

async function createService() {
  const { PlatformPaymentProfileValidationService } = await import(
    "./platform-payment-profile-validation"
  );
  return new PlatformPaymentProfileValidationService({
    repository: {
      findWechatPayConfigByProfile,
      updateWechatPayValidation,
    },
    validator: { validate },
    nowFactory: () => new Date("2026-07-20T15:10:00.000Z"),
  });
}

describe("PlatformPaymentProfileValidationService", () => {
  beforeEach(() => {
    findWechatPayConfigByProfile.mockClear();
    updateWechatPayValidation.mockClear();
    validate.mockClear();
    findWechatPayConfigByProfile.mockImplementation(async () => config);
    validate.mockImplementation(async () => ({
      ok: true,
      probe_mode: "platform_certificate",
      api_v3_key_probe: "decrypted",
      request_id: "wechat-success-request-id",
    }));
  });

  test("persists valid status and clears prior failure evidence", async () => {
    const service = await createService();

    const result = await service.validate({
      profileCode: "platform_direct_recharge",
      employeeId: "employee-platform",
    });

    expect(updateWechatPayValidation).toHaveBeenCalledWith({
      configId: "platform-config-1",
      expectedUpdatedAt: "2026-07-20T14:00:00.000Z",
      validationStatus: "valid",
      lastValidatedAt: "2026-07-20T15:10:00.000Z",
      lastValidationErrorCode: null,
      lastValidationErrorMessage: null,
      lastValidationRequestId: "wechat-success-request-id",
      updatedByEmployeeId: "employee-platform",
    });
    expect(result.validation).toEqual({
      ok: true,
      probe_mode: "platform_certificate",
      api_v3_key_probe: "decrypted",
      request_id: "wechat-success-request-id",
      validated_at: "2026-07-20T15:10:00.000Z",
    });
  });

  test("persists only a stable code and fixed sanitized message on failure", async () => {
    validate.mockImplementationOnce(async () => {
      throw new AppError(
        502,
        "raw upstream message with private key",
        "WECHAT_PAY_PROFILE_PROBE_REJECTED",
        {
          requestId: "wechat-failed-request-id",
          body: "raw response body",
          privateKeyPem: "-----BEGIN PRIVATE KEY-----",
        },
      );
    });
    const service = await createService();

    const result = await service.validate({
      profileCode: "platform_direct_recharge",
      employeeId: "employee-platform",
    });

    expect(updateWechatPayValidation).toHaveBeenCalledWith({
      configId: "platform-config-1",
      expectedUpdatedAt: "2026-07-20T14:00:00.000Z",
      validationStatus: "invalid",
      lastValidatedAt: "2026-07-20T15:10:00.000Z",
      lastValidationErrorCode: "WECHAT_PAY_PROFILE_PROBE_REJECTED",
      lastValidationErrorMessage: "微信支付配置验证失败，请检查配置后重试",
      lastValidationRequestId: "wechat-failed-request-id",
      updatedByEmployeeId: "employee-platform",
    });
    expect(result.validation).toEqual({
      ok: false,
      error_code: "WECHAT_PAY_PROFILE_PROBE_REJECTED",
      message: "微信支付配置验证失败，请检查配置后重试",
      request_id: "wechat-failed-request-id",
      validated_at: "2026-07-20T15:10:00.000Z",
    });
    expect(JSON.stringify(result)).not.toContain("raw upstream message");
    expect(JSON.stringify(result)).not.toContain("raw response body");
    expect(JSON.stringify(result)).not.toContain("BEGIN PRIVATE KEY");
  });

  test("wraps unknown validator failures and preserves prior validation status", async () => {
    validate.mockImplementationOnce(async () => {
      throw new TypeError("unexpected secret detail");
    });
    const service = await createService();

    const error = await service.validate({
      profileCode: "platform_direct_recharge",
      employeeId: "employee-platform",
    }).catch((caught) => caught);

    expect(error).toMatchObject({
      statusCode: 502,
      code: "WECHAT_PAY_PROFILE_VALIDATION_FAILED",
      message: "微信支付配置验证暂时不可用，请稍后重试",
    });
    expect(JSON.stringify(error)).not.toContain("unexpected secret detail");
    expect(updateWechatPayValidation).not.toHaveBeenCalled();
    expect(config.validation_status).toBe("unchecked");
  });

  test.each([
    [504, "WECHAT_PAY_PROFILE_PROBE_TIMEOUT"],
    [502, "WECHAT_PAY_PROFILE_PROBE_TRANSPORT_FAILED"],
    [503, "WECHAT_PAY_PROFILE_PROBE_UNAVAILABLE"],
    [502, "WECHAT_PAY_RESPONSE_TIMESTAMP_INVALID"],
    [502, "WECHAT_PAY_RESPONSE_BODY_INVALID"],
    [502, "WECHAT_PAY_TRANSPORT_FAILED"],
    [500, "DB_ERROR"],
  ] as const)(
    "propagates unavailable error %s/%s without marking the profile invalid",
    async (statusCode, code) => {
      validate.mockImplementationOnce(async () => {
        throw new AppError(statusCode, "raw infrastructure detail", code, {
          requestId: "wechat-unavailable-request-id",
          body: "raw upstream body",
        });
      });
      const service = await createService();

      const error = await service.validate({
        profileCode: "platform_direct_recharge",
        employeeId: "employee-platform",
      }).catch((caught) => caught);

      expect(error).toMatchObject({
        statusCode,
        code,
        message: "微信支付配置验证暂时不可用，请稍后重试",
        details: { requestId: "wechat-unavailable-request-id" },
      });
      expect(JSON.stringify(error)).not.toContain("raw infrastructure detail");
      expect(JSON.stringify(error)).not.toContain("raw upstream body");
      expect(updateWechatPayValidation).not.toHaveBeenCalled();
      expect(config.validation_status).toBe("unchecked");
    },
  );

  test("returns 404 before probing when the profile is not configured", async () => {
    findWechatPayConfigByProfile.mockImplementationOnce(async () => null);
    const service = await createService();

    await expect(service.validate({
      profileCode: "tenant_service_provider",
      employeeId: "employee-platform",
    })).rejects.toMatchObject({
      statusCode: 404,
      code: "PLATFORM_PAYMENT_PROFILE_NOT_FOUND",
    });
    expect(validate).not.toHaveBeenCalled();
    expect(updateWechatPayValidation).not.toHaveBeenCalled();
  });

  test("does not convert validation persistence failures into a safe business result", async () => {
    updateWechatPayValidation.mockImplementationOnce(async () => {
      throw new AppError(500, "保存验证结果失败", "DB_ERROR");
    });
    const service = await createService();

    await expect(service.validate({
      profileCode: "platform_direct_recharge",
      employeeId: "employee-platform",
    })).rejects.toMatchObject({ statusCode: 500, code: "DB_ERROR" });
    expect(updateWechatPayValidation).toHaveBeenCalledTimes(1);
  });

  test.each([
    ["successful validation", false, "valid"],
    ["deterministic failure", true, "invalid"],
  ] as const)(
    "maps a wrapped pending-order conflict during %s persistence",
    async (_label, validationFails, expectedStatus) => {
      if (validationFails) {
        validate.mockImplementationOnce(async () => {
          throw new AppError(
            502,
            "微信支付拒绝了配置验证请求",
            "WECHAT_PAY_PROFILE_PROBE_REJECTED",
          );
        });
      }
      updateWechatPayValidation.mockImplementationOnce(async () => {
        throw new AppError(500, "保存平台微信支付配置验证结果失败", "DB_ERROR", {
          code: "23514",
          message: "PLATFORM_PAYMENT_CONFIG_PENDING_RECHARGE_ORDERS",
        });
      });
      const service = await createService();

      await expect(service.validate({
        profileCode: "platform_direct_recharge",
        employeeId: "employee-platform",
      })).rejects.toMatchObject({
        statusCode: 409,
        code: "PLATFORM_PAYMENT_CONFIG_PENDING_RECHARGE_ORDERS",
      });
      expect(updateWechatPayValidation).toHaveBeenCalledWith(
        expect.objectContaining({ validationStatus: expectedStatus }),
      );
    },
  );

  test("rejects a successful probe when profile metadata changed concurrently", async () => {
    updateWechatPayValidation.mockImplementationOnce(async () => {
      throw new AppError(
        409,
        "支付配置已更新，请重新验证",
        "PLATFORM_PAYMENT_PROFILE_CHANGED",
      );
    });
    const service = await createService();

    await expect(service.validate({
      profileCode: "platform_direct_recharge",
      employeeId: "employee-platform",
    })).rejects.toMatchObject({
      statusCode: 409,
      code: "PLATFORM_PAYMENT_PROFILE_CHANGED",
    });
    expect(updateWechatPayValidation).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedUpdatedAt: "2026-07-20T14:00:00.000Z",
        validationStatus: "valid",
      }),
    );
    expect(config.validation_status).toBe("unchecked");
  });

  test("rejects a failed probe when profile metadata changed concurrently", async () => {
    validate.mockImplementationOnce(async () => {
      throw new AppError(
        502,
        "微信支付拒绝了配置验证请求",
        "WECHAT_PAY_PROFILE_PROBE_REJECTED",
      );
    });
    updateWechatPayValidation.mockImplementationOnce(async () => {
      throw new AppError(
        409,
        "支付配置已更新，请重新验证",
        "PLATFORM_PAYMENT_PROFILE_CHANGED",
      );
    });
    const service = await createService();

    await expect(service.validate({
      profileCode: "platform_direct_recharge",
      employeeId: "employee-platform",
    })).rejects.toMatchObject({
      statusCode: 409,
      code: "PLATFORM_PAYMENT_PROFILE_CHANGED",
    });
    expect(updateWechatPayValidation).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedUpdatedAt: "2026-07-20T14:00:00.000Z",
        validationStatus: "invalid",
      }),
    );
    expect(config.validation_status).toBe("unchecked");
  });

  test("keeps signed public-key mode success valid with format-only APIv3 key evidence", async () => {
    validate.mockImplementationOnce(async () => ({
      ok: true,
      probe_mode: "wechat_pay_public_key",
      api_v3_key_probe: "format_only",
      request_id: "public-key-request-id",
    }));
    const service = await createService();

    const result = await service.validate({
      profileCode: "platform_direct_recharge",
      employeeId: "employee-platform",
    });

    expect(result.validation).toMatchObject({
      ok: true,
      probe_mode: "wechat_pay_public_key",
      api_v3_key_probe: "format_only",
    });
    expect(updateWechatPayValidation).toHaveBeenCalledWith(
      expect.objectContaining({ validationStatus: "valid" }),
    );
  });
});
