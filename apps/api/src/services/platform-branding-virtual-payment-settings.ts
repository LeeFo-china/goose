import { Errors } from "@/errors/error-factory";
import type { BrandingAddonProductRecord } from
  "@/repositories/branding-addon-products";
import type { BrandingVirtualProductRecord } from
  "@/repositories/branding-virtual-products";
import type {
  PlatformWechatVirtualEnvironmentInput,
  PlatformWechatVirtualProductValidationInput,
  UpdatePlatformWechatVirtualSettingsInput,
} from "@/schema/platform-payment-configs";
import { accessPolicyService } from "@/services/access-policy";
import type { AuthContext } from "@/services/authorization";
import {
  brandingVirtualProductCatalogCompatibilityService,
} from "@/services/branding-virtual-product-compatibility";
import {
  brandingVirtualProductVersionConflict,
  hasVirtualProductValidationInputChanged,
  isApplicationErrorLike,
  mergeBrandingVirtualProduct,
  parseWechatVirtualPaymentSecretBundle,
  serializeBrandingVirtualProduct,
  WECHAT_VIRTUAL_PAYMENT_SECRET_KEYS,
} from "@/services/branding-virtual-products";
import { platformAuditLogService } from "@/services/platform-audit-logs";
import { serializeCatalogConfiguration } from
  "@/services/platform-branding-virtual-payment-compatibility-view";
import {
  assertBrandingVirtualPaymentModeTransition,
  assertPlatformBrandingVirtualPaymentReady,
  evaluatePlatformBrandingVirtualPaymentReadiness,
} from "@/services/platform-branding-virtual-payment-readiness";
import {
  platformBrandingVirtualPaymentSecretService,
} from "@/services/platform-branding-virtual-payment-secrets";
import { systemSettingsService } from "@/services/system-settings";
import { BRANDING_VIRTUAL_MINIMUM_AMOUNT_FEN } from "@gooes/domain";

const READ_PERMISSION = "platform.payment.config.read";
const MANAGE_PERMISSION = "platform.payment.config.manage";

type SettingsServicePort = Pick<
  typeof systemSettingsService,
  "getPlatformSecretString" | "getPlatformSecretStrings"
>;
type AccessPolicyPort = Pick<typeof accessPolicyService, "hasPermission">;
type AuditPort = Pick<typeof platformAuditLogService, "recordBestEffort">;
type CatalogCompatibilityPort = Pick<
  typeof brandingVirtualProductCatalogCompatibilityService,
  "getSnapshot" | "updateConfiguration" | "validate"
>;
type SecretStatusReaderPort = Pick<
  typeof platformBrandingVirtualPaymentSecretService,
  "getStatuses"
>;
type VirtualProductInput = NonNullable<
  UpdatePlatformWechatVirtualSettingsInput["virtual_product"]
>;
type EnrichedVirtualProductInput = VirtualProductInput & {
  encrypted_secret_ref: typeof WECHAT_VIRTUAL_PAYMENT_SECRET_KEYS[
    VirtualProductInput["environment"]
  ];
};

export type PlatformBrandingVirtualPaymentSettingsDependencies = {
  settingsService?: SettingsServicePort;
  accessPolicy?: AccessPolicyPort;
  audit?: AuditPort;
  catalogCompatibility?: CatalogCompatibilityPort;
  secretStatusReader?: SecretStatusReaderPort;
};

export class PlatformBrandingVirtualPaymentSettingsService {
  private readonly settingsService: SettingsServicePort;
  private readonly accessPolicy: AccessPolicyPort;
  private readonly audit: AuditPort;
  private readonly catalogCompatibility: CatalogCompatibilityPort;
  private readonly secretStatusReader: SecretStatusReaderPort;

  constructor(
    dependencies: PlatformBrandingVirtualPaymentSettingsDependencies = {},
  ) {
    this.settingsService = dependencies.settingsService ?? systemSettingsService;
    this.accessPolicy = dependencies.accessPolicy ?? accessPolicyService;
    this.audit = dependencies.audit ?? platformAuditLogService;
    this.catalogCompatibility = dependencies.catalogCompatibility ??
      brandingVirtualProductCatalogCompatibilityService;
    this.secretStatusReader = dependencies.secretStatusReader ??
      platformBrandingVirtualPaymentSecretService;
  }

  async get(authContext: AuthContext) {
    this.requireReadable(authContext);
    const [snapshot, secretStatuses, secretValues] = await Promise.all([
      this.catalogCompatibility.getSnapshot(),
      this.secretStatusReader.getStatuses(authContext),
      this.settingsService.getPlatformSecretStrings([
        WECHAT_VIRTUAL_PAYMENT_SECRET_KEYS.sandbox,
        WECHAT_VIRTUAL_PAYMENT_SECRET_KEYS.production,
      ]),
    ]);
    const configuration = serializeCatalogConfiguration(
      snapshot,
      secretValues,
    );
    return {
      ...configuration,
      ...secretStatuses,
      readiness: evaluatePlatformBrandingVirtualPaymentReadiness(
        configuration,
        secretStatuses,
      ),
      can_manage: this.canManage(authContext),
    };
  }

  async update(
    authContext: AuthContext,
    input: UpdatePlatformWechatVirtualSettingsInput,
  ) {
    const actor = this.requireManageable(authContext);
    const snapshot = await this.requireCatalogSnapshot();
    const current = snapshot.product;
    if (current.version !== input.version) throw productVersionConflict();

    const finalPurchaseMode = input.purchase_mode ?? current.purchase_mode;
    assertBrandingVirtualPaymentModeTransition(
      current.purchase_mode,
      finalPurchaseMode,
    );

    const enrichedInput = input.virtual_product
      ? enrichVirtualProductInput(input.virtual_product)
      : null;
    const requestedMapping = enrichedInput
      ? snapshot.mappings.find(
        (mapping) => mapping.environment === enrichedInput.environment,
      ) ?? null
      : null;
    let secretConfigured: boolean | null = null;
    if (enrichedInput) {
      secretConfigured = await this.assertMappingCanBeSaved(
        requestedMapping,
        enrichedInput,
        current.amount_fen,
      );
    }

    if (finalPurchaseMode === "wechat_virtual") {
      const production = enrichedInput?.environment === "production"
        ? mergeBrandingVirtualProduct(current.id, requestedMapping, enrichedInput)
        : snapshot.mappings.find(
          (mapping) => mapping.environment === "production",
        ) ?? null;
      const productionSecretConfigured = enrichedInput?.environment === "production" &&
          secretConfigured !== null
        ? secretConfigured
        : production
        ? await this.hasConfiguredSecretBundle(
          WECHAT_VIRTUAL_PAYMENT_SECRET_KEYS.production,
          production.secret_revision,
        )
        : false;
      const messageStatuses = await this.secretStatusReader.getStatuses(authContext);
      assertPlatformBrandingVirtualPaymentReady({
        product: current,
        production,
        productionSecretConfigured,
        secretStatuses: messageStatuses,
      });
    }

    const result = await this.saveConfiguration({
      expectedProductVersion: input.version,
      productPatch: input.purchase_mode === undefined
        ? {}
        : { purchase_mode: input.purchase_mode },
      virtualProductPatch: enrichedInput ?? {},
      actorEmployeeId: actor.employeeId,
    });
    await this.auditChange({
      actor,
      current,
      savedProduct: result.product,
      currentMapping: requestedMapping,
      savedMapping: result.virtual_product,
      enrichedInput,
      secretConfigured,
    });
    return {
      product: serializeProduct(result.product),
      ...(result.virtual_product
        ? { virtual_product: serializeBrandingVirtualProduct(result.virtual_product) }
        : {}),
      can_manage: true,
    };
  }

  async validate(
    authContext: AuthContext,
    environment: PlatformWechatVirtualEnvironmentInput,
    input: PlatformWechatVirtualProductValidationInput,
  ) {
    this.requireManageable(authContext);
    return await this.catalogCompatibility.validate(
      authContext,
      environment,
      input,
    );
  }

  private requireReadable(authContext: AuthContext) {
    this.requirePlatformContext(authContext);
    if (!this.hasManagePermission(authContext) &&
      !this.accessPolicy.hasPermission(authContext, READ_PERMISSION)) {
      throw Errors.forbidden();
    }
  }

  private requireManageable(authContext: AuthContext) {
    if (!this.canManage(authContext)) {
      throw Errors.forbidden();
    }
    return {
      employeeId: authContext.employeeId,
      authUserId: authContext.authUserId,
    };
  }

  private requirePlatformContext(authContext: AuthContext) {
    if (!authContext.isPlatformAdmin || authContext.tenantId !== null) {
      throw Errors.forbidden();
    }
  }

  private canManage(authContext: AuthContext): authContext is AuthContext & {
    authUserId: string;
    employeeId: string;
    tenantId: null;
    isPlatformAdmin: true;
  } {
    return authContext.isPlatformAdmin &&
      authContext.tenantId === null &&
      Boolean(authContext.employeeId) &&
      Boolean(authContext.authUserId) &&
      this.hasManagePermission(authContext);
  }

  private hasManagePermission(authContext: AuthContext) {
    return this.accessPolicy.hasPermission(authContext, MANAGE_PERMISSION);
  }

  private async requireCatalogSnapshot() {
    try {
      const snapshot = await this.catalogCompatibility.getSnapshot();
      if (snapshot?.product) return snapshot;
    } catch (error) {
      if (isApplicationErrorLike(error)) throw error;
      throw Errors.dbError("查询年度品牌权益商品失败");
    }
    throw Errors.business(
      404,
      "年度品牌权益商品不存在",
      "BRANDING_ADDON_PRODUCT_NOT_FOUND",
    );
  }

  private async assertMappingCanBeSaved(
    current: BrandingVirtualProductRecord | null,
    input: EnrichedVirtualProductInput,
    amountFen: number | null,
  ) {
    if ((current?.version ?? 1) !== input.version) {
      throw brandingVirtualProductVersionConflict();
    }
    if (current && current.provider_product_id !== input.provider_product_id) {
      throw Errors.business(
        409,
        "渠道商品 ID 已生成后不可手动变更",
        "VIRTUAL_PRODUCT_CHANNEL_ID_IMMUTABLE",
      );
    }
    if (input.environment === "production" &&
      input.expected_amount_fen < BRANDING_VIRTUAL_MINIMUM_AMOUNT_FEN) {
      throw amountTooLow();
    }
    const configured = await this.hasConfiguredSecretBundle(
      input.encrypted_secret_ref,
      input.secret_revision,
    );
    if (input.status !== "active") return configured;
    if (!configured) throw secretInvalid();
    if (current && hasVirtualProductValidationInputChanged(current, input)) {
      throw Errors.business(
        409,
        "虚拟商品映射参数变化后必须重新验证",
        "BRANDING_VIRTUAL_PRODUCT_REVALIDATION_REQUIRED",
      );
    }
    const merged = mergeBrandingVirtualProduct("", current, input);
    if (merged.validation_status !== "valid") {
      throw Errors.business(
        409,
        "虚拟商品映射尚未通过验证",
        "BRANDING_VIRTUAL_PRODUCT_INVALID",
      );
    }
    if (input.environment === "production") {
      await this.assertProductionMappingReady(merged, amountFen);
    }
    return true;
  }

  private async assertProductionMappingReady(
    mapping: BrandingVirtualProductRecord | null,
    amountFen: number | null,
  ) {
    if (!mapping || mapping.environment !== "production") {
      throw Errors.business(
        409,
        "切换虚拟支付前必须配置生产环境映射",
        "BRANDING_VIRTUAL_PRODUCT_PRODUCTION_REQUIRED",
      );
    }
    if (mapping.expected_amount_fen < BRANDING_VIRTUAL_MINIMUM_AMOUNT_FEN ||
      amountFen === null || amountFen < BRANDING_VIRTUAL_MINIMUM_AMOUNT_FEN) {
      throw amountTooLow();
    }
    if (mapping.status !== "active") {
      throw Errors.business(
        409,
        "生产虚拟商品映射未启用",
        "BRANDING_VIRTUAL_PRODUCT_DISABLED",
      );
    }
    if (mapping.validation_status !== "valid") {
      throw Errors.business(
        409,
        "生产虚拟商品映射未通过验证",
        "BRANDING_VIRTUAL_PRODUCT_INVALID",
      );
    }
    if (mapping.expected_amount_fen !== amountFen) {
      throw Errors.business(
        409,
        "生产虚拟商品映射价格与业务商品不一致",
        "BRANDING_VIRTUAL_PRODUCT_AMOUNT_MISMATCH",
      );
    }
    const key = WECHAT_VIRTUAL_PAYMENT_SECRET_KEYS.production;
    if (mapping.encrypted_secret_ref !== key) {
      throw Errors.business(
        409,
        "生产虚拟商品必须使用生产密钥",
        "BRANDING_VIRTUAL_PRODUCT_SECRET_ENVIRONMENT_MISMATCH",
      );
    }
    if (!await this.hasConfiguredSecretBundle(key, mapping.secret_revision)) {
      throw secretInvalid();
    }
  }

  private async hasConfiguredSecretBundle(key: string, revision: number) {
    try {
      const raw = await this.settingsService.getPlatformSecretString(key);
      return parseWechatVirtualPaymentSecretBundle(raw)?.revision === revision;
    } catch (error) {
      if (isApplicationErrorLike(error)) {
        const applicationError = error as {
          statusCode: number;
          message: string;
          code: string;
        };
        throw Errors.business(
          applicationError.statusCode,
          applicationError.message,
          applicationError.code,
        );
      }
      throw Errors.dbError("读取平台支付密钥配置失败");
    }
  }

  private async saveConfiguration(
    input: Parameters<CatalogCompatibilityPort["updateConfiguration"]>[0],
  ) {
    try {
      return await this.catalogCompatibility.updateConfiguration(input);
    } catch (error) {
      if (isApplicationErrorLike(error)) throw error;
      throw Errors.dbError("保存品牌权益虚拟支付配置失败");
    }
  }

  private auditChange(input: {
    actor: { employeeId: string; authUserId: string };
    current: BrandingAddonProductRecord;
    savedProduct: BrandingAddonProductRecord;
    currentMapping: BrandingVirtualProductRecord | null;
    savedMapping: BrandingVirtualProductRecord | null;
    enrichedInput: EnrichedVirtualProductInput | null;
    secretConfigured: boolean | null;
  }) {
    return this.audit.recordBestEffort({
      action: "branding_addon_product.update",
      actorEmployeeId: input.actor.employeeId,
      actorUserId: input.actor.authUserId,
      resourceType: "branding_virtual_product",
      resourceId: input.savedMapping?.id ?? input.savedProduct.id,
      resourceLabel: input.savedProduct.name,
      status: "success",
      summary: "更新品牌权益虚拟支付配置",
      metadata: {
        purchase_mode: {
          from: input.current.purchase_mode,
          to: input.savedProduct.purchase_mode,
        },
        ...(input.enrichedInput
          ? {
            virtual_product: {
              from: input.currentMapping
                ? serializeBrandingVirtualProduct(input.currentMapping)
                : null,
              to: input.savedMapping
                ? serializeBrandingVirtualProduct(input.savedMapping)
                : null,
            },
            secret: {
              key: input.enrichedInput.encrypted_secret_ref,
              revision: input.enrichedInput.secret_revision,
              configured: input.secretConfigured ?? false,
            },
          }
          : {}),
      },
    });
  }
}

function enrichVirtualProductInput(
  input: VirtualProductInput,
): EnrichedVirtualProductInput {
  return {
    ...input,
    encrypted_secret_ref: WECHAT_VIRTUAL_PAYMENT_SECRET_KEYS[input.environment],
  };
}

function serializeProduct(product: BrandingAddonProductRecord) {
  return {
    id: product.id,
    code: product.code,
    entitlement_code: product.entitlement_code,
    name: product.name,
    amount_fen: product.amount_fen,
    term_years: product.term_years,
    purchase_notes: product.purchase_notes,
    enabled: product.enabled,
    purchase_mode: product.purchase_mode,
    version: product.version,
  };
}

function productVersionConflict() {
  return Errors.business(
    409,
    "商品配置版本已变化，请刷新后重试",
    "BRANDING_ADDON_PRODUCT_VERSION_CONFLICT",
  );
}

function amountTooLow() {
  return Errors.business(
    409,
    "生产虚拟商品价格不得低于 100 分",
    "BRANDING_VIRTUAL_PRODUCT_AMOUNT_TOO_LOW",
  );
}

function secretInvalid() {
  return Errors.business(
    409,
    "虚拟支付密钥未配置或版本不匹配",
    "BRANDING_VIRTUAL_PRODUCT_SECRET_INVALID",
  );
}

export const platformBrandingVirtualPaymentSettingsService = new PlatformBrandingVirtualPaymentSettingsService();
