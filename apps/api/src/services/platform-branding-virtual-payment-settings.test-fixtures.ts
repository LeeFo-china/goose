import { mock } from "bun:test";

import type { BrandingAddonProductRecord } from "@/repositories/branding-addon-products";
import type { BrandingVirtualProductRecord } from "@/repositories/branding-virtual-products";
import type { UpdatePlatformWechatVirtualSettingsInput } from "@/schema/platform-payment-configs";
import type { AuthContext } from "@/services/authorization";
import type {
  PlatformBrandingVirtualPaymentSettingsDependencies,
  PlatformBrandingVirtualPaymentSettingsService,
} from "@/services/platform-branding-virtual-payment-settings";

export const EMPLOYEE_ID = "11111111-1111-4111-8111-111111111111";
const AUTH_USER_ID = "22222222-2222-4222-8222-222222222222";
const PRODUCT_ID = "33333333-3333-4333-8333-333333333333";
export const TENANT_ID = "44444444-4444-4444-8444-444444444444";

export const product = {
  id: PRODUCT_ID,
  code: "custom_support_branding_annual",
  entitlement_code: "custom_support_branding",
  name: "年度品牌技术支持",
  amount_fen: 9_900,
  term_years: 1,
  purchase_notes: "支付成功后自动开通一年",
  refund_policy: "数字权益支付成功并开通后不支持退款",
  enabled: true,
  purchase_mode: "maintenance",
  version: 4,
  updated_by_employee_id: null,
  created_at: "2026-07-28T00:00:00.000Z",
  updated_at: "2026-07-28T00:00:00.000Z",
} satisfies BrandingAddonProductRecord;

export const productionMapping = {
  id: "55555555-5555-4555-8555-555555555555",
  addon_product_id: PRODUCT_ID,
  provider: "wechat_virtual",
  environment: "production",
  app_id: "wx-app",
  virtual_merchant_id: "virtual-merchant",
  offer_id: "offer-annual",
  provider_product_id: "branding-annual",
  goods_quantity: 1,
  expected_amount_fen: 9_900,
  encrypted_secret_ref: "WECHAT_VIRTUAL_PAYMENT_PRODUCTION_SECRET_BUNDLE",
  secret_revision: 2,
  status: "active",
  validation_status: "valid",
  validated_at: "2026-07-31T00:00:00.000Z",
  version: 3,
  created_by: EMPLOYEE_ID,
  updated_by: EMPLOYEE_ID,
  created_at: "2026-07-31T00:00:00.000Z",
  updated_at: "2026-07-31T00:00:00.000Z",
} satisfies BrandingVirtualProductRecord;

export const managementConfiguration = {
  product: {
    code: product.code,
    entitlement_code: product.entitlement_code,
    name: product.name,
    amount_fen: product.amount_fen,
    term_years: product.term_years,
    purchase_notes: product.purchase_notes,
    enabled: product.enabled,
    purchase_mode: product.purchase_mode,
    version: product.version,
  },
  virtual_products: [{
    environment: "production" as const,
    mapping: productionMapping,
    secret: {
      key: "WECHAT_VIRTUAL_PAYMENT_PRODUCTION_SECRET_BUNDLE" as const,
      revision: 2,
      configured: true,
    },
  }],
};

export const secretStatuses = {
  virtual_secret_sources: {
    sandbox: {
      configured: true,
      source: "database" as const,
    },
    production: {
      configured: false,
      source: "empty" as const,
    },
  },
  message_auth: {
    message_token: {
      configured: true,
      source: "database" as const,
      valid: true,
    },
    original_id: {
      configured: true,
      source: "env" as const,
      valid: true,
      settings_href: "/settings?group=wechat",
    },
  },
};

export function auth(
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

export const manageAuth = auth("platform.payment.config.manage");

export function virtualPatch(
  overrides: Partial<NonNullable<
    UpdatePlatformWechatVirtualSettingsInput["virtual_product"]
  >> = {},
) {
  return {
    environment: "production" as const,
    app_id: "wx-app",
    virtual_merchant_id: "virtual-merchant",
    offer_id: "offer-annual",
    provider_product_id: "branding-annual",
    expected_amount_fen: 9_900,
    secret_revision: 2,
    status: "active" as const,
    version: 3,
    ...overrides,
  };
}

export type FixtureOptions = {
  current?: BrandingAddonProductRecord | null;
  mapping?: BrandingVirtualProductRecord | null;
  savedProduct?: BrandingAddonProductRecord;
  savedMapping?: BrandingVirtualProductRecord | null;
  productError?: unknown;
  mappingError?: unknown;
  saveError?: unknown;
  secretBundle?: string;
  secretError?: unknown;
  secretStatusError?: unknown;
};

type ServiceConstructor = new (
  dependencies?: PlatformBrandingVirtualPaymentSettingsDependencies,
) => PlatformBrandingVirtualPaymentSettingsService;

export function buildFixture(
  Service: ServiceConstructor,
  options: FixtureOptions = {},
) {
  const current = options.current === undefined ? product : options.current;
  const mapping = options.mapping === undefined ? productionMapping : options.mapping;
  const getProduct = mock(async () => {
    if (options.productError) throw options.productError;
    return current;
  });
  const findByProductAndEnvironment = mock(async () => {
    if (options.mappingError) throw options.mappingError;
    return mapping;
  });
  const manageConfiguration = mock(async (input: {
    productPatch: { purchase_mode?: BrandingAddonProductRecord["purchase_mode"] };
  }) => {
    if (options.saveError) throw options.saveError;
    const baseProduct = current ?? product;
    return {
      product: options.savedProduct ?? {
        ...baseProduct,
        ...input.productPatch,
        version: baseProduct.version + 1,
      },
      virtual_product: options.savedMapping === undefined
        ? mapping
        : options.savedMapping,
    };
  });
  const getPlatformSecretString = mock(async () => {
    if (options.secretError) throw options.secretError;
    return options.secretBundle ?? JSON.stringify({
      appKey: "never-expose-this-app-key",
      revision: 2,
    });
  });
  const getSecretString = mock(async () => options.secretBundle ?? JSON.stringify({
    appKey: "legacy-cached-app-key",
    revision: 2,
  }));
  const getConfiguration = mock(async () => managementConfiguration);
  const getStatuses = mock(async () => {
    if (options.secretStatusError) throw options.secretStatusError;
    return secretStatuses;
  });
  const validateConfiguration = mock(async () => ({
    virtual_product: productionMapping,
    validation: {
      kind: "server_configuration" as const,
      validated_at: "2026-08-01T01:02:03.000Z",
    },
  }));
  const hasPermission = mock((context: AuthContext, permission: string) =>
    context.permissions.some(({ code }) => code === permission)
  );
  const recordBestEffort = mock(async () => null);
  const settingsService = { getPlatformSecretString, getSecretString };
  const service = new Service({
    productRepository: { getProduct },
    virtualProductRepository: {
      findByProductAndEnvironment,
      manageConfiguration,
    },
    settingsService,
    accessPolicy: { hasPermission },
    audit: { recordBestEffort },
    managementService: { getConfiguration, validateConfiguration },
    secretStatusReader: { getStatuses },
  });
  return {
    service,
    getProduct,
    findByProductAndEnvironment,
    manageConfiguration,
    getPlatformSecretString,
    getSecretString,
    getConfiguration,
    getStatuses,
    validateConfiguration,
    recordBestEffort,
  };
}
