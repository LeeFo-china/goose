import { beforeAll, describe, expect, test } from "bun:test";

import {
  buildFixture,
  type FixtureOptions,
  manageAuth,
  managementConfiguration,
  product,
  productionMapping,
  secretStatuses,
} from "@/services/platform-branding-virtual-payment-settings.test-fixtures";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

type Evaluator = typeof import(
  "./platform-branding-virtual-payment-readiness"
)["evaluatePlatformBrandingVirtualPaymentReadiness"];
let evaluateReadiness: Evaluator;
type ServiceConstructor = typeof import(
  "./platform-branding-virtual-payment-settings"
)["PlatformBrandingVirtualPaymentSettingsService"];
let SettingsService: ServiceConstructor;

beforeAll(async () => {
  ({ evaluatePlatformBrandingVirtualPaymentReadiness: evaluateReadiness } =
    await import("./platform-branding-virtual-payment-readiness"));
  ({ PlatformBrandingVirtualPaymentSettingsService: SettingsService } =
    await import("./platform-branding-virtual-payment-settings"));
});

const createSettingsFixture = (options: FixtureOptions = {}) =>
  buildFixture(SettingsService, options);

describe("platform branding virtual-payment readiness", () => {
  test("reports a fully configured production channel as ready", () => {
    expect(evaluateReadiness(managementConfiguration, secretStatuses)).toEqual({
      ready: true,
      blockers: [],
    });
  });

  test.each([
    [
      "disabled product",
      { product: { ...managementConfiguration.product, enabled: false } },
      {},
      "PRODUCT_DISABLED",
    ],
    [
      "invalid product amount",
      { product: { ...managementConfiguration.product, amount_fen: 99 } },
      {},
      "PRODUCT_AMOUNT",
    ],
    ["missing production mapping", { virtual_products: [] }, {}, "PRODUCTION_MAPPING_REQUIRED"],
    [
      "disabled production mapping",
      { virtual_products: [{
        ...managementConfiguration.virtual_products[0]!,
        mapping: { ...productionMapping, status: "disabled" as const },
      }] },
      {},
      "PRODUCTION_MAPPING_DISABLED",
    ],
    [
      "invalid production mapping",
      { virtual_products: [{
        ...managementConfiguration.virtual_products[0]!,
        mapping: { ...productionMapping, validation_status: "invalid" as const },
      }] },
      {},
      "PRODUCTION_MAPPING_INVALID",
    ],
    [
      "amount mismatch",
      { virtual_products: [{
        ...managementConfiguration.virtual_products[0]!,
        mapping: { ...productionMapping, expected_amount_fen: 9_800 },
      }] },
      {},
      "PRODUCTION_MAPPING_AMOUNT_MISMATCH",
    ],
    [
      "invalid production secret",
      { virtual_products: [{
        ...managementConfiguration.virtual_products[0]!,
        secret: { ...managementConfiguration.virtual_products[0]!.secret, revision: 9 },
      }] },
      {},
      "PRODUCTION_MAPPING_SECRET",
    ],
    [
      "missing message token",
      {},
      { message_auth: {
        ...secretStatuses.message_auth,
        message_token: { configured: false, source: "empty" as const, valid: false },
      } },
      "MESSAGE_TOKEN_MISSING",
    ],
    [
      "invalid message token",
      {},
      { message_auth: {
        ...secretStatuses.message_auth,
        message_token: { configured: true, source: "database" as const, valid: false },
      } },
      "MESSAGE_TOKEN_INVALID",
    ],
    [
      "missing original ID",
      {},
      { message_auth: {
        ...secretStatuses.message_auth,
        original_id: {
          configured: false,
          source: "empty" as const,
          valid: false,
          settings_href: "/settings?group=wechat",
        },
      } },
      "ORIGINAL_ID_MISSING",
    ],
    [
      "invalid original ID",
      {},
      { message_auth: {
        ...secretStatuses.message_auth,
        original_id: {
          configured: true,
          source: "database" as const,
          valid: false,
          settings_href: "/settings?group=wechat",
        },
      } },
      "ORIGINAL_ID_INVALID",
    ],
  ] as const)("reports %s with a stable safe blocker", (
    _name,
    configurationPatch,
    statusPatch,
    code,
  ) => {
    const result = evaluateReadiness(
      { ...managementConfiguration, ...configurationPatch } as typeof managementConfiguration,
      { ...secretStatuses, ...statusPatch } as typeof secretStatuses,
    );

    expect(result.ready).toBe(false);
    expect(result.blockers).toContainEqual(expect.objectContaining({ code }));
    expect(JSON.stringify(result)).not.toContain("never-expose-this-app-key");
  });
});

describe("platform branding virtual-payment enablement readiness", () => {
  test.each([
    ["disabled product", { current: { ...product, enabled: false } }, "PRODUCT_DISABLED"],
    [
      "missing message token",
      { statuses: {
        ...secretStatuses,
        message_auth: {
          ...secretStatuses.message_auth,
          message_token: { configured: false, source: "empty" as const, valid: false },
        },
      } },
      "MESSAGE_TOKEN_MISSING",
    ],
    [
      "invalid message token",
      { statuses: {
        ...secretStatuses,
        message_auth: {
          ...secretStatuses.message_auth,
          message_token: { configured: true, source: "database" as const, valid: false },
        },
      } },
      "MESSAGE_TOKEN_INVALID",
    ],
    [
      "missing original ID",
      { statuses: {
        ...secretStatuses,
        message_auth: {
          ...secretStatuses.message_auth,
          original_id: {
            configured: false,
            source: "empty" as const,
            valid: false,
            settings_href: "/settings?group=wechat",
          },
        },
      } },
      "ORIGINAL_ID_MISSING",
    ],
    [
      "invalid original ID",
      { statuses: {
        ...secretStatuses,
        message_auth: {
          ...secretStatuses.message_auth,
          original_id: {
            configured: true,
            source: "database" as const,
            valid: false,
            settings_href: "/settings?group=wechat",
          },
        },
      } },
      "ORIGINAL_ID_INVALID",
    ],
  ] as const)("rejects enabling with %s without writing", async (
    _name,
    options,
    blockerCode,
  ) => {
    const fixture = createSettingsFixture(options as FixtureOptions);
    await expect(fixture.service.update(manageAuth, {
      version: 4,
      purchase_mode: "wechat_virtual",
    })).rejects.toMatchObject({
      statusCode: 409,
      code: "BRANDING_VIRTUAL_PAYMENT_NOT_READY",
      details: { blocker_codes: expect.arrayContaining([blockerCode]) },
    });
    expect(fixture.updateConfiguration).not.toHaveBeenCalled();
  });

  test("does not require message authentication for maintenance drafts", async () => {
    const fixture = createSettingsFixture({
      statuses: {
        ...secretStatuses,
        message_auth: {
          message_token: { configured: false, source: "empty", valid: false },
          original_id: {
            configured: false,
            source: "empty",
            valid: false,
            settings_href: "/settings?group=wechat",
          },
        },
      },
    });
    await expect(fixture.service.update(manageAuth, {
      version: 4,
      purchase_mode: "maintenance",
    })).resolves.toBeDefined();
    expect(fixture.getStatuses).not.toHaveBeenCalled();
    expect(fixture.updateConfiguration).toHaveBeenCalledTimes(1);
  });
});
