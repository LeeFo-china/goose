import { beforeEach, describe, expect, mock, test } from "bun:test";
import { AppError } from "@/errors/app-error";
import type {
  PlatformPaymentConfigRecord,
  PlatformPaymentValidationUpdateInput,
} from "@/repositories/platform-payment-configs";

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
const validate = mock(async () => ({
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

  test("maps unknown validator failures to a stable safe result", async () => {
    validate.mockImplementationOnce(async () => {
      throw new TypeError("unexpected secret detail");
    });
    const service = await createService();

    const result = await service.validate({
      profileCode: "platform_direct_recharge",
      employeeId: "employee-platform",
    });

    expect(result.validation).toMatchObject({
      ok: false,
      error_code: "WECHAT_PAY_PROFILE_VALIDATION_FAILED",
      message: "微信支付配置验证失败，请检查配置后重试",
      request_id: null,
    });
    expect(JSON.stringify(result)).not.toContain("unexpected secret detail");
  });

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
});
