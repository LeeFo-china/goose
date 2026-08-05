import { describe, expect, mock, test } from "bun:test";

import type { FastifyRequest } from "fastify";
import type { AuthContext } from "@/services/authorization";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const AUTH_USER_ID = "11111111-1111-4111-8111-111111111111";
const EMPLOYEE_ID = "22222222-2222-4222-8222-222222222222";

const platformAuth = {
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
  permissions: [{ code: "platform.payment.config.manage", scope: "all" }],
} satisfies AuthContext;

type RouteResponse = { data: unknown; message: string };
type RouteHandler = (
  request: FastifyRequest,
  reply: unknown,
) => Promise<RouteResponse>;

function registeredHandlers(controller: {
  registerExtraRoutes(fastify: unknown): void;
}) {
  const routes = new Map<string, RouteHandler>();
  const register = (method: string) =>
    (path: string, handler: RouteHandler) =>
      routes.set(`${method} ${path}`, handler);
  controller.registerExtraRoutes({
    get: register("GET"),
    patch: register("PATCH"),
    post: register("POST"),
    put: register("PUT"),
  });
  return routes;
}

function requiredHandler(
  controller: { registerExtraRoutes(fastify: unknown): void },
  route: string,
) {
  const handler = registeredHandlers(controller).get(route);
  if (!handler) throw new TypeError(`missing route handler: ${route}`);
  return handler;
}

function replaceMethod(
  target: object,
  method: string,
  implementation: unknown,
): void {
  Reflect.set(target, method, implementation);
}

describe("PlatformPaymentConfigsController routes", () => {
  test("registers ordinary and virtual WeChat payment routes", async () => {
    const { default: controller } = await import(".");

    expect([...registeredHandlers(controller).keys()]).toEqual([
      "GET /platform/payment/wechat-pay/config",
      "PUT /platform/payment/wechat-pay/config",
      "GET /platform/payment/wechat-pay/profiles",
      "GET /platform/payment/wechat-pay/readiness",
      "GET /platform/payment/wechat-pay/profiles/:profileCode/config",
      "PUT /platform/payment/wechat-pay/profiles/:profileCode/config",
      "PUT /platform/payment/wechat-pay/profiles/:profileCode/secret-bundle",
      "POST /platform/payment/wechat-pay/profiles/:profileCode/validate",
      "GET /platform/payment/wechat-virtual/branding-entitlement",
      "PATCH /platform/payment/wechat-virtual/branding-entitlement",
      "PUT /platform/payment/wechat-virtual/channels/:environment",
      "PUT /platform/payment/wechat-virtual/branding-entitlement/:environment/secret-bundle",
      "PUT /platform/payment/wechat-virtual/message-token",
      "GET /platform/payment/wechat-virtual/branding-entitlement/:environment/goods-status",
      "POST /platform/payment/wechat-virtual/branding-entitlement/:environment/goods/upload",
      "POST /platform/payment/wechat-virtual/branding-entitlement/:environment/goods/publish",
      "POST /platform/payment/wechat-virtual/branding-entitlement/:environment/validate",
    ]);
  });

  test("authenticates, validates, delegates, and wraps virtual-payment responses", async () => {
    const [
      { default: controller },
      { authorizationService },
      { platformBrandingVirtualPaymentSettingsService },
      { platformBrandingVirtualPaymentChannelService },
      { platformBrandingVirtualPaymentSecretService },
      { brandingVirtualProductCatalogCompatibilityService },
    ] = await Promise.all([
      import("."),
      import("@/services/authorization"),
      import("@/services/platform-branding-virtual-payment-settings"),
      import("@/services/platform-branding-virtual-payment-channels"),
      import("@/services/platform-branding-virtual-payment-secrets"),
      import("@/services/branding-virtual-product-compatibility"),
    ]);
    const originals = {
      auth: authorizationService.getRequiredAuthContext,
      get: platformBrandingVirtualPaymentSettingsService.get,
      update: platformBrandingVirtualPaymentSettingsService.update,
      updateChannel: platformBrandingVirtualPaymentChannelService.updateChannel,
      statuses: platformBrandingVirtualPaymentSecretService.getStatuses,
      bundle: platformBrandingVirtualPaymentSecretService.saveSecretBundle,
      token: platformBrandingVirtualPaymentSecretService.saveMessageToken,
      goodsStatus:
        brandingVirtualProductCatalogCompatibilityService.refreshChannel,
      upload: brandingVirtualProductCatalogCompatibilityService.startUpload,
      publish: brandingVirtualProductCatalogCompatibilityService.startPublish,
      validate: brandingVirtualProductCatalogCompatibilityService.validate,
    };
    const get = mock(async () => ({
      product: { version: 3 },
      can_manage: true,
      virtual_secret_sources: { sandbox: { configured: true } },
      message_auth: { message_token: { configured: true } },
    }));
    const getStatuses = mock(async () => ({
      virtual_secret_sources: { sandbox: { configured: true } },
      message_auth: { message_token: { configured: true } },
    }));
    const update = mock(async () => ({ product: { version: 4 } }));
    const updateChannel = mock(async () => ({
      environment: "sandbox",
      app_id: "wx-virtual-app",
      virtual_merchant_id: "virtual-merchant-1",
      offer_id: "offer-1",
      status: "active",
      version: 2,
    }));
    const saveSecretBundle = mock(async () => ({
      environment: "sandbox" as const,
      configured: true,
      revision: 2,
    }));
    const saveMessageToken = mock(async () => ({ configured: true }));
    const validate = mock(async () => ({
      virtual_product: { validation_status: "valid" },
    }));
    const getGoodsStatus = mock(async () => ({ next_action: "upload" as const }));
    const startUpload = mock(async () => ({ outcome: "accepted" as const }));
    const startPublish = mock(async () => ({ outcome: "accepted" as const }));
    authorizationService.getRequiredAuthContext = mock(async () => platformAuth);
    replaceMethod(platformBrandingVirtualPaymentSettingsService, "get", get);
    replaceMethod(platformBrandingVirtualPaymentSettingsService, "update", update);
    replaceMethod(
      platformBrandingVirtualPaymentChannelService,
      "updateChannel",
      updateChannel,
    );
    replaceMethod(
      brandingVirtualProductCatalogCompatibilityService,
      "validate",
      validate,
    );
    replaceMethod(
      platformBrandingVirtualPaymentSecretService,
      "getStatuses",
      getStatuses,
    );
    replaceMethod(
      platformBrandingVirtualPaymentSecretService,
      "saveSecretBundle",
      saveSecretBundle,
    );
    replaceMethod(
      platformBrandingVirtualPaymentSecretService,
      "saveMessageToken",
      saveMessageToken,
    );
    replaceMethod(
      brandingVirtualProductCatalogCompatibilityService,
      "refreshChannel",
      getGoodsStatus,
    );
    replaceMethod(
      brandingVirtualProductCatalogCompatibilityService,
      "startUpload",
      startUpload,
    );
    replaceMethod(
      brandingVirtualProductCatalogCompatibilityService,
      "startPublish",
      startPublish,
    );
    Object.defineProperty(controller, "getRequiredPlatformPermissionContext", {
      configurable: true,
      value: mock(async () => platformAuth),
    });

    try {
      const getResponse = await requiredHandler(
        controller,
        "GET /platform/payment/wechat-virtual/branding-entitlement",
      )({ query: {}, user: { sub: AUTH_USER_ID } } as FastifyRequest, {});
      expect(getResponse).toEqual({
        data: {
          product: { version: 3 },
          can_manage: true,
          virtual_secret_sources: { sandbox: { configured: true } },
          message_auth: { message_token: { configured: true } },
        },
        message: "success",
      });
      expect(get).toHaveBeenCalledWith(platformAuth);
      expect(getStatuses).not.toHaveBeenCalled();

      const patch = { version: 3, purchase_mode: "maintenance" } as const;
      await requiredHandler(
        controller,
        "PATCH /platform/payment/wechat-virtual/branding-entitlement",
      )({ body: patch, query: {}, user: { sub: AUTH_USER_ID } } as FastifyRequest, {});
      expect(update).toHaveBeenCalledWith(platformAuth, patch);

      const channel = {
        app_id: "wx-virtual-app",
        virtual_merchant_id: "virtual-merchant-1",
        offer_id: "offer-1",
        secret_revision: 2,
        status: "active",
        version: 1,
      } as const;
      await requiredHandler(
        controller,
        "PUT /platform/payment/wechat-virtual/channels/:environment",
      )({
        params: { environment: "sandbox" },
        body: channel,
        query: {},
        user: { sub: AUTH_USER_ID },
      } as FastifyRequest, {});
      expect(updateChannel).toHaveBeenCalledWith(platformAuth, "sandbox", channel);

      const secret = { app_key: "sandbox-key", revision: 2 };
      await requiredHandler(
        controller,
        "PUT /platform/payment/wechat-virtual/branding-entitlement/:environment/secret-bundle",
      )({
        params: { environment: "sandbox" },
        body: secret,
        query: {},
        user: { sub: AUTH_USER_ID },
      } as FastifyRequest, {});
      expect(saveSecretBundle).toHaveBeenCalledWith(
        platformAuth,
        "sandbox",
        secret,
      );

      const token = { message_token: "message-token" };
      await requiredHandler(
        controller,
        "PUT /platform/payment/wechat-virtual/message-token",
      )({ body: token, query: {}, user: { sub: AUTH_USER_ID } } as FastifyRequest, {});
      expect(saveMessageToken).toHaveBeenCalledWith(platformAuth, token);

      await requiredHandler(
        controller,
        "GET /platform/payment/wechat-virtual/branding-entitlement/:environment/goods-status",
      )({
        params: { environment: "production" },
        query: {},
        user: { sub: AUTH_USER_ID },
      } as FastifyRequest, {});
      expect(getGoodsStatus).toHaveBeenCalledWith(platformAuth, "production");

      await requiredHandler(
        controller,
        "POST /platform/payment/wechat-virtual/branding-entitlement/:environment/goods/upload",
      )({
        params: { environment: "production" },
        body: { version: 3 },
        query: {},
        user: { sub: AUTH_USER_ID },
      } as FastifyRequest, {});
      expect(startUpload).toHaveBeenCalledWith(
        platformAuth,
        "production",
        { version: 3 },
      );

      await requiredHandler(
        controller,
        "POST /platform/payment/wechat-virtual/branding-entitlement/:environment/goods/publish",
      )({
        params: { environment: "production" },
        body: { version: 3 },
        query: {},
        user: { sub: AUTH_USER_ID },
      } as FastifyRequest, {});
      expect(startPublish).toHaveBeenCalledWith(
        platformAuth,
        "production",
        { version: 3 },
      );

      await requiredHandler(
        controller,
        "POST /platform/payment/wechat-virtual/branding-entitlement/:environment/validate",
      )({
        params: { environment: "production" },
        body: { version: 3 },
        query: {},
        user: { sub: AUTH_USER_ID },
      } as FastifyRequest, {});
      expect(validate).toHaveBeenCalledWith(
        platformAuth,
        "production",
        { version: 3 },
      );
    } finally {
      authorizationService.getRequiredAuthContext = originals.auth;
      replaceMethod(platformBrandingVirtualPaymentSettingsService, "get", originals.get);
      replaceMethod(platformBrandingVirtualPaymentSettingsService, "update", originals.update);
      replaceMethod(platformBrandingVirtualPaymentChannelService, "updateChannel", originals.updateChannel);
      replaceMethod(platformBrandingVirtualPaymentSecretService, "getStatuses", originals.statuses);
      replaceMethod(platformBrandingVirtualPaymentSecretService, "saveSecretBundle", originals.bundle);
      replaceMethod(platformBrandingVirtualPaymentSecretService, "saveMessageToken", originals.token);
      replaceMethod(brandingVirtualProductCatalogCompatibilityService, "refreshChannel", originals.goodsStatus);
      replaceMethod(brandingVirtualProductCatalogCompatibilityService, "startUpload", originals.upload);
      replaceMethod(brandingVirtualProductCatalogCompatibilityService, "startPublish", originals.publish);
      replaceMethod(brandingVirtualProductCatalogCompatibilityService, "validate", originals.validate);
      Reflect.deleteProperty(controller, "getRequiredPlatformPermissionContext");
    }
  });

  test("rejects invalid environments and extra fields before delegation", async () => {
    const [
      { default: controller },
      { authorizationService },
      { platformBrandingVirtualPaymentSettingsService },
      { platformBrandingVirtualPaymentChannelService },
      { platformBrandingVirtualPaymentSecretService },
      { brandingVirtualProductCatalogCompatibilityService },
    ] = await Promise.all([
      import("."),
      import("@/services/authorization"),
      import("@/services/platform-branding-virtual-payment-settings"),
      import("@/services/platform-branding-virtual-payment-channels"),
      import("@/services/platform-branding-virtual-payment-secrets"),
      import("@/services/branding-virtual-product-compatibility"),
    ]);
    const originalAuth = authorizationService.getRequiredAuthContext;
    const originalUpdate = platformBrandingVirtualPaymentSettingsService.update;
    const originalUpdateChannel =
      platformBrandingVirtualPaymentChannelService.updateChannel;
    const originalValidate = brandingVirtualProductCatalogCompatibilityService.validate;
    const originalBundle = platformBrandingVirtualPaymentSecretService.saveSecretBundle;
    const originalToken = platformBrandingVirtualPaymentSecretService.saveMessageToken;
    const originalGoodsStatus =
      brandingVirtualProductCatalogCompatibilityService.refreshChannel;
    const originalUpload = brandingVirtualProductCatalogCompatibilityService.startUpload;
    const originalPublish = brandingVirtualProductCatalogCompatibilityService.startPublish;
    const update = mock(async () => ({}));
    const updateChannel = mock(async () => ({}));
    const validate = mock(async () => ({}));
    const saveSecretBundle = mock(async () => ({}));
    const saveMessageToken = mock(async () => ({}));
    const getGoodsStatus = mock(async () => ({}));
    const startUpload = mock(async () => ({}));
    const startPublish = mock(async () => ({}));
    authorizationService.getRequiredAuthContext = mock(async () => platformAuth);
    replaceMethod(platformBrandingVirtualPaymentSettingsService, "update", update);
    replaceMethod(platformBrandingVirtualPaymentChannelService, "updateChannel", updateChannel);
    replaceMethod(brandingVirtualProductCatalogCompatibilityService, "validate", validate);
    replaceMethod(platformBrandingVirtualPaymentSecretService, "saveSecretBundle", saveSecretBundle);
    replaceMethod(platformBrandingVirtualPaymentSecretService, "saveMessageToken", saveMessageToken);
    replaceMethod(brandingVirtualProductCatalogCompatibilityService, "refreshChannel", getGoodsStatus);
    replaceMethod(brandingVirtualProductCatalogCompatibilityService, "startUpload", startUpload);
    replaceMethod(brandingVirtualProductCatalogCompatibilityService, "startPublish", startPublish);
    Object.defineProperty(controller, "getRequiredPlatformPermissionContext", {
      configurable: true,
      value: mock(async () => platformAuth),
    });

    const invalidRequests: Array<[string, Partial<FastifyRequest>]> = [
      [
        "PATCH /platform/payment/wechat-virtual/branding-entitlement",
        { body: { version: 3, purchase_mode: "maintenance", forged: true }, query: {} },
      ],
      [
        "PUT /platform/payment/wechat-virtual/channels/:environment",
        {
          params: { environment: "sandbox" },
          body: {
            app_id: "wx-virtual-app",
            virtual_merchant_id: "virtual-merchant-1",
            offer_id: "offer-1",
            secret_revision: 2,
            status: "active",
            version: 1,
            provider_product_id: "forged",
          },
          query: {},
        },
      ],
      [
        "PUT /platform/payment/wechat-virtual/branding-entitlement/:environment/secret-bundle",
        { params: { environment: "staging" }, body: { app_key: "key", revision: 1 }, query: {} },
      ],
      [
        "PUT /platform/payment/wechat-virtual/branding-entitlement/:environment/secret-bundle",
        { params: { environment: "sandbox" }, body: { app_key: "key", revision: 1, encrypted_secret_ref: "forged" }, query: {} },
      ],
      [
        "PUT /platform/payment/wechat-virtual/message-token",
        { body: { message_token: "token", key: "forged" }, query: {} },
      ],
      [
        "GET /platform/payment/wechat-virtual/branding-entitlement/:environment/goods-status",
        { params: { environment: "sandbox" }, query: { forged: true } },
      ],
      [
        "POST /platform/payment/wechat-virtual/branding-entitlement/:environment/goods/upload",
        { params: { environment: "sandbox" }, body: { version: 1, forged: true }, query: {} },
      ],
      [
        "POST /platform/payment/wechat-virtual/branding-entitlement/:environment/goods/publish",
        { params: { environment: "staging" }, body: { version: 1 }, query: {} },
      ],
      [
        "POST /platform/payment/wechat-virtual/branding-entitlement/:environment/validate",
        { params: { environment: "sandbox" }, body: { version: 1, forged: true }, query: {} },
      ],
    ];

    try {
      for (const [route, request] of invalidRequests) {
        await expect(requiredHandler(controller, route)({
          ...request,
          user: { sub: AUTH_USER_ID },
        } as FastifyRequest, {})).rejects.toMatchObject({
          code: "VALIDATION_ERROR",
        });
      }
      expect(update).not.toHaveBeenCalled();
      expect(updateChannel).not.toHaveBeenCalled();
      expect(validate).not.toHaveBeenCalled();
      expect(saveSecretBundle).not.toHaveBeenCalled();
      expect(saveMessageToken).not.toHaveBeenCalled();
      expect(getGoodsStatus).not.toHaveBeenCalled();
      expect(startUpload).not.toHaveBeenCalled();
      expect(startPublish).not.toHaveBeenCalled();
    } finally {
      authorizationService.getRequiredAuthContext = originalAuth;
      replaceMethod(platformBrandingVirtualPaymentSettingsService, "update", originalUpdate);
      replaceMethod(platformBrandingVirtualPaymentChannelService, "updateChannel", originalUpdateChannel);
      replaceMethod(brandingVirtualProductCatalogCompatibilityService, "validate", originalValidate);
      replaceMethod(platformBrandingVirtualPaymentSecretService, "saveSecretBundle", originalBundle);
      replaceMethod(platformBrandingVirtualPaymentSecretService, "saveMessageToken", originalToken);
      replaceMethod(brandingVirtualProductCatalogCompatibilityService, "refreshChannel", originalGoodsStatus);
      replaceMethod(brandingVirtualProductCatalogCompatibilityService, "startUpload", originalUpload);
      replaceMethod(brandingVirtualProductCatalogCompatibilityService, "startPublish", originalPublish);
      Reflect.deleteProperty(controller, "getRequiredPlatformPermissionContext");
    }
  });
});
