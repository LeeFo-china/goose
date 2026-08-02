import { beforeAll, describe, expect, mock, test } from "bun:test";

import { Errors } from "@/errors/error-factory";
import type { AuthContext } from "@/services/authorization";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const MESSAGE_TOKEN_KEY = "WECHAT_VIRTUAL_PAYMENT_MESSAGE_TOKEN";
const ORIGINAL_ID_KEY = "WECHAT_MINIPROGRAM_ORIGINAL_ID";
const WECHAT_VIRTUAL_PAYMENT_SECRET_KEYS = {
  sandbox: "WECHAT_VIRTUAL_PAYMENT_SANDBOX_SECRET_BUNDLE",
  production: "WECHAT_VIRTUAL_PAYMENT_PRODUCTION_SECRET_BUNDLE",
} as const;
const APP_KEY = "app-key-must-never-leak";
const MESSAGE_TOKEN = "message-token-must-never-leak";
const EMPLOYEE_ID = "11111111-1111-4111-8111-111111111111";
const AUTH_USER_ID = "22222222-2222-4222-8222-222222222222";
const TENANT_ID = "33333333-3333-4333-8333-333333333333";

type ServiceConstructor = typeof import(
  "./platform-branding-virtual-payment-secrets"
)["PlatformBrandingVirtualPaymentSecretService"];
let PlatformBrandingVirtualPaymentSecretService: ServiceConstructor;

beforeAll(async () => {
  ({ PlatformBrandingVirtualPaymentSecretService } = await import(
    "./platform-branding-virtual-payment-secrets"
  ));
});

function auth(
  permission: string,
  overrides: Partial<AuthContext> = {},
): AuthContext {
  return {
    authUserId: AUTH_USER_ID,
    employeeId: EMPLOYEE_ID,
    tenantId: null,
    tenantName: null,
    tenantSlug: null,
    tenantStatus: null,
    isPlatformAdmin: true,
    employeeName: "平台管理员",
    employeeStatus: "active",
    departmentId: null,
    tenantDepartmentId: null,
    departmentCode: null,
    departmentName: null,
    postId: null,
    postName: null,
    avatar: null,
    roleCodes: ["platform_admin"],
    roles: [],
    permissions: [{ code: permission, scope: "all" }],
    ...overrides,
  };
}

type FixtureOptions = {
  statusError?: unknown;
  rawError?: unknown;
  writeError?: unknown;
  token?: string;
  originalId?: string;
};

function createFixture(options: FixtureOptions = {}) {
  const getPlatformSettingStatus = mock(async (key: string) => {
    if (options.statusError) throw options.statusError;
    if (key === WECHAT_VIRTUAL_PAYMENT_SECRET_KEYS.sandbox) {
      return { configured: true, source: "database" as const };
    }
    if (key === WECHAT_VIRTUAL_PAYMENT_SECRET_KEYS.production) {
      return { configured: true, source: "env" as const };
    }
    if (key === MESSAGE_TOKEN_KEY) {
      return { configured: true, source: "database" as const };
    }
    return { configured: Boolean(options.originalId ?? "gh_original"), source: "default" as const };
  });
  const getPlatformSecretString = mock(async (key: string) => {
    if (options.rawError) throw options.rawError;
    if (key === MESSAGE_TOKEN_KEY) return options.token ?? "valid-token";
    if (key === ORIGINAL_ID_KEY) return options.originalId ?? "gh_original";
    throw new TypeError(`unexpected raw read: ${key}`);
  });
  const updatePlatformPaymentSecretSetting = mock(async () => {
    if (options.writeError) throw options.writeError;
    return {};
  });
  const hasPermission = mock((context: AuthContext, permission: string) =>
    context.permissions.some((item) => item.code === permission)
  );
  const recordBestEffort = mock(async () => null);
  const service = new PlatformBrandingVirtualPaymentSecretService({
    settingsService: {
      getPlatformSettingStatus,
      getPlatformSecretString,
      updatePlatformPaymentSecretSetting,
    },
    accessPolicy: { hasPermission },
    audit: { recordBestEffort },
  });
  return {
    service,
    getPlatformSettingStatus,
    getPlatformSecretString,
    updatePlatformPaymentSecretSetting,
    recordBestEffort,
  };
}

describe("PlatformBrandingVirtualPaymentSecretService permissions", () => {
  test.each([
    ["payment read", auth("platform.payment.config.read")],
    ["full payment manage", auth("platform.payment.config.manage")],
    ["payment manage without a write actor", auth(
      "platform.payment.config.manage",
      { employeeId: null, authUserId: "" },
    )],
  ] satisfies Array<[string, AuthContext]>) (
    "allows %s to read safe statuses",
    async (_name, context) => {
      await expect(createFixture().service.getStatuses(context)).resolves
        .toBeDefined();
    },
  );

  test.each([
    ["branding manage", auth("platform.branding_product.manage")],
    ["tenant context", auth("platform.payment.config.read", { tenantId: TENANT_ID })],
    ["non-platform context", auth("platform.payment.config.read", { isPlatformAdmin: false })],
  ] satisfies Array<[string, AuthContext]>) (
    "rejects %s status reads before accessing settings",
    async (_name, context) => {
      const fixture = createFixture();
      await expect(fixture.service.getStatuses(context)).rejects.toMatchObject({
        statusCode: 403,
        code: "FORBIDDEN",
      });
      expect(fixture.getPlatformSettingStatus).not.toHaveBeenCalled();
    },
  );

  test.each([
    ["read-only", auth("platform.payment.config.read")],
    ["branding-only", auth("platform.branding_product.manage")],
    ["tenant manager", auth("platform.payment.config.manage", { tenantId: TENANT_ID })],
    ["missing employee", auth("platform.payment.config.manage", { employeeId: null })],
    ["missing auth user", auth("platform.payment.config.manage", { authUserId: "" })],
  ] satisfies Array<[string, AuthContext]>) (
    "rejects %s for both secret writes",
    async (_name, context) => {
      const fixture = createFixture();
      await expect(fixture.service.saveSecretBundle(context, "sandbox", {
        app_key: APP_KEY,
        revision: 3,
      })).rejects.toMatchObject({ statusCode: 403, code: "FORBIDDEN" });
      await expect(fixture.service.saveMessageToken(context, {
        message_token: MESSAGE_TOKEN,
      })).rejects.toMatchObject({ statusCode: 403, code: "FORBIDDEN" });
      expect(fixture.updatePlatformPaymentSecretSetting).not.toHaveBeenCalled();
    },
  );
});

describe("PlatformBrandingVirtualPaymentSecretService safe statuses", () => {
  test("uses exact metadata for four keys and raw reads only for token format checks", async () => {
    const fixture = createFixture({ originalId: "invalid-app-id" });

    const result = await fixture.service.getStatuses(
      auth("platform.payment.config.read"),
    );

    expect(fixture.getPlatformSettingStatus.mock.calls.map(([key]) => key))
      .toEqual([
        WECHAT_VIRTUAL_PAYMENT_SECRET_KEYS.sandbox,
        WECHAT_VIRTUAL_PAYMENT_SECRET_KEYS.production,
        MESSAGE_TOKEN_KEY,
        ORIGINAL_ID_KEY,
      ]);
    expect(fixture.getPlatformSecretString.mock.calls.map(([key]) => key))
      .toEqual([MESSAGE_TOKEN_KEY, ORIGINAL_ID_KEY]);
    expect(result).toEqual({
      virtual_secret_sources: {
        sandbox: { configured: true, source: "database" },
        production: { configured: true, source: "env" },
      },
      message_auth: {
        message_token: {
          configured: true,
          source: "database",
          valid: true,
        },
        original_id: {
          configured: true,
          source: "default",
          valid: false,
          settings_href: "/settings?group=wechat",
        },
      },
    });
    expect(JSON.stringify(result)).not.toContain("valid-token");
    expect(JSON.stringify(result)).not.toContain("invalid-app-id");
  });
});

describe("PlatformBrandingVirtualPaymentSecretService writes", () => {
  test("saves a fixed camelCase AppKey bundle and returns no secret", async () => {
    const fixture = createFixture();

    const result = await fixture.service.saveSecretBundle(
      auth("platform.payment.config.manage"),
      "production",
      { app_key: APP_KEY, revision: 3 },
    );

    expect(fixture.updatePlatformPaymentSecretSetting).toHaveBeenCalledWith(
      auth("platform.payment.config.manage"),
      WECHAT_VIRTUAL_PAYMENT_SECRET_KEYS.production,
      JSON.stringify({ appKey: APP_KEY, revision: 3 }),
    );
    expect(result).toEqual({
      environment: "production",
      configured: true,
      source: "database",
      revision: 3,
    });
    const exposed = JSON.stringify({ result, audit: fixture.recordBestEffort.mock.calls });
    expect(exposed).not.toContain(APP_KEY);
    expect(exposed).not.toContain("appKey");
    expect(fixture.recordBestEffort).toHaveBeenCalledWith(expect.objectContaining({
      action: "platform_config_update",
      actorEmployeeId: EMPLOYEE_ID,
      actorUserId: AUTH_USER_ID,
      metadata: {
        key: WECHAT_VIRTUAL_PAYMENT_SECRET_KEYS.production,
        environment: "production",
        revision: 3,
        configured: true,
      },
    }));
  });

  test("saves the message token to its fixed key and exposes only valid status", async () => {
    const fixture = createFixture();

    const result = await fixture.service.saveMessageToken(
      auth("platform.payment.config.manage"),
      { message_token: MESSAGE_TOKEN },
    );

    expect(fixture.updatePlatformPaymentSecretSetting).toHaveBeenCalledWith(
      auth("platform.payment.config.manage"),
      MESSAGE_TOKEN_KEY,
      MESSAGE_TOKEN,
    );
    expect(result).toEqual({ configured: true, valid: true, source: "database" });
    const exposed = JSON.stringify({ result, audit: fixture.recordBestEffort.mock.calls });
    expect(exposed).not.toContain(MESSAGE_TOKEN);
    expect(fixture.recordBestEffort).toHaveBeenCalledWith(expect.objectContaining({
      metadata: { key: MESSAGE_TOKEN_KEY, configured: true },
    }));
  });

  test("preserves sanitized business errors and never audits failed writes", async () => {
    const fixture = createFixture({
      writeError: Errors.business(
        409,
        "存在待签发、签发中或待核对的虚拟支付订单，请完成处理后再变更密钥",
        "BRANDING_VIRTUAL_PAYMENT_SECRET_ROTATION_PENDING_ORDERS",
        { appKey: APP_KEY },
      ),
    });

    const error = await fixture.service.saveSecretBundle(
      auth("platform.payment.config.manage"),
      "sandbox",
      { app_key: APP_KEY, revision: 4 },
    ).catch((caught) => caught);

    expect(error).toMatchObject({
      statusCode: 409,
      code: "BRANDING_VIRTUAL_PAYMENT_SECRET_ROTATION_PENDING_ORDERS",
      message: "存在待签发、签发中或待核对的虚拟支付订单，请完成处理后再变更密钥",
      details: undefined,
    });
    expect(JSON.stringify(error)).not.toContain(APP_KEY);
    expect(fixture.recordBestEffort).not.toHaveBeenCalled();
  });

  test("wraps unknown writes without diagnostics and never audits", async () => {
    const fixture = createFixture({ writeError: { detail: APP_KEY } });

    await expect(fixture.service.saveMessageToken(
      auth("platform.payment.config.manage"),
      { message_token: MESSAGE_TOKEN },
    )).rejects.toMatchObject({
      statusCode: 500,
      code: "DB_ERROR",
      details: undefined,
    });
    expect(fixture.recordBestEffort).not.toHaveBeenCalled();
  });

  test("replaces an unsafe application write message and never audits", async () => {
    const fixture = createFixture({
      writeError: Errors.business(
        422,
        `upstream rejected ${MESSAGE_TOKEN}`,
        "UPSTREAM_SETTING_REJECTED",
      ),
    });

    const error = await fixture.service.saveMessageToken(
      auth("platform.payment.config.manage"),
      { message_token: MESSAGE_TOKEN },
    ).catch((caught) => caught);

    expect(error).toMatchObject({
      statusCode: 422,
      code: "UPSTREAM_SETTING_REJECTED",
      message: "保存虚拟支付消息令牌失败",
      details: undefined,
    });
    expect(JSON.stringify(error)).not.toContain(MESSAGE_TOKEN);
    expect(fixture.recordBestEffort).not.toHaveBeenCalled();
  });
});

describe("PlatformBrandingVirtualPaymentSecretService read errors", () => {
  test("sanitizes application-like and unknown status read failures", async () => {
    const businessFixture = createFixture({
      rawError: Errors.business(
        503,
        `配置暂不可用: ${MESSAGE_TOKEN}`,
        "CONFIG_UNAVAILABLE",
        { token: MESSAGE_TOKEN },
      ),
    });
    const businessError = await businessFixture.service.getStatuses(
      auth("platform.payment.config.read"),
    ).catch((caught) => caught);
    expect(businessError).toMatchObject({
      statusCode: 503,
      code: "CONFIG_UNAVAILABLE",
      message: "读取虚拟支付密钥状态失败",
      details: undefined,
    });
    expect(JSON.stringify(businessError)).not.toContain(MESSAGE_TOKEN);

    const unknownFixture = createFixture({ statusError: { detail: APP_KEY } });
    await expect(unknownFixture.service.getStatuses(
      auth("platform.payment.config.read"),
    )).rejects.toMatchObject({
      statusCode: 500,
      code: "DB_ERROR",
      details: undefined,
    });
  });
});
