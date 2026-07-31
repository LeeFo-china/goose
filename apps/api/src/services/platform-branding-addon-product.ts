import { Errors } from "@/errors/error-factory";
import {
  brandingAddonProductRepository,
  type BrandingAddonProductRecord,
} from "@/repositories/branding-addon-products";
import {
  brandingVirtualProductRepository,
  type BrandingVirtualProductRecord,
} from "@/repositories/branding-virtual-products";
import type { BrandingAddonProductPatchInput } from "@/schema/branding-addon";
import { accessPolicyService } from "@/services/access-policy";
import type { AuthContext } from "@/services/authorization";
import { MAX_POSTGRES_INTEGER_FEN } from "@/services/branding-addon-contracts";
import {
  brandingVirtualProductManagementService,
} from "@/services/branding-virtual-product-management";
import {
  hasBrandingAddonProductMutation,
  hasVirtualProductValidationInputChanged,
  isApplicationErrorLike,
  mergeBrandingVirtualProduct,
  parseWechatVirtualPaymentSecretBundle,
  serializeBrandingVirtualProduct,
  WECHAT_VIRTUAL_PAYMENT_SECRET_KEYS,
} from "@/services/branding-virtual-products";
import { platformAuditLogService } from "@/services/platform-audit-logs";
import { systemSettingsService } from "@/services/system-settings";
import {
  BRANDING_VIRTUAL_MINIMUM_AMOUNT_FEN,
  type BrandingPurchaseMode,
} from "@gooes/domain";

const MANAGE_PERMISSION = "platform.branding_product.manage";

type ProductRepositoryPort = Pick<
  typeof brandingAddonProductRepository,
  "getProduct"
>;
type VirtualProductRepositoryPort = Pick<
  typeof brandingVirtualProductRepository,
  "findByProductAndEnvironment" | "manageConfiguration"
>;
type SettingsServicePort = Pick<typeof systemSettingsService, "getSecretString">;
type AccessPolicyPort = Pick<typeof accessPolicyService, "assertPermission">;
type AuditPort = Pick<typeof platformAuditLogService, "recordBestEffort">;
type ManagementServicePort = Pick<
  typeof brandingVirtualProductManagementService,
  "getConfiguration" | "validateConfiguration"
>;

export type PlatformBrandingAddonProductServiceDependencies = {
  repository?: ProductRepositoryPort;
  virtualProductRepository?: VirtualProductRepositoryPort;
  settingsService?: SettingsServicePort;
  accessPolicy?: AccessPolicyPort;
  audit?: AuditPort;
  managementService?: ManagementServicePort;
};

export class PlatformBrandingAddonProductService {
  private readonly repository: ProductRepositoryPort;
  private readonly virtualProductRepository: VirtualProductRepositoryPort;
  private readonly settingsService: SettingsServicePort;
  private readonly accessPolicy: AccessPolicyPort;
  private readonly audit: AuditPort;
  private readonly managementService: ManagementServicePort;

  constructor(dependencies: PlatformBrandingAddonProductServiceDependencies = {}) {
    this.repository = dependencies.repository ?? brandingAddonProductRepository;
    this.virtualProductRepository = dependencies.virtualProductRepository ??
      brandingVirtualProductRepository;
    this.settingsService = dependencies.settingsService ?? systemSettingsService;
    this.accessPolicy = dependencies.accessPolicy ?? accessPolicyService;
    this.audit = dependencies.audit ?? platformAuditLogService;
    this.managementService = dependencies.managementService ??
      brandingVirtualProductManagementService;
  }

  async get(authContext: AuthContext) {
    this.requirePlatformOperator(authContext);
    return this.managementService.getConfiguration();
  }

  validateVirtualProduct(
    authContext: AuthContext,
    input: { environment: "sandbox" | "production"; version: number },
  ) {
    return this.managementService.validateConfiguration(authContext, input);
  }

  async update(authContext: AuthContext, input: BrandingAddonProductPatchInput) {
    const actor = this.requirePlatformOperator(authContext);
    const current = await this.requireProduct();
    if (current.version !== input.version) throw productVersionConflict();

    this.assertFinalPrice(current, input);
    const finalAmountFen = input.amount_fen ?? current.amount_fen;
    const finalPurchaseMode = input.purchase_mode ?? current.purchase_mode;
    assertPurchaseModeTransition(current.purchase_mode, finalPurchaseMode);

    const requestedMapping = input.virtual_product
      ? await this.findMapping(current.id, input.virtual_product.environment)
      : null;
    if (
      input.virtual_product?.environment === "production" &&
      input.virtual_product.expected_amount_fen <
        BRANDING_VIRTUAL_MINIMUM_AMOUNT_FEN
    ) throw amountTooLow();

    const secretConfigured = input.virtual_product
      ? await this.assertMappingCanBeSaved(
        requestedMapping,
        input.virtual_product,
        finalAmountFen,
      )
      : null;

    if (finalPurchaseMode === "wechat_virtual") {
      const production = input.virtual_product?.environment === "production"
        ? mergeBrandingVirtualProduct(
          current.id,
          requestedMapping,
          input.virtual_product,
        )
        : await this.findMapping(current.id, "production");
      await this.assertProductionMappingReady(production, finalAmountFen);
    }

    let result: Awaited<ReturnType<VirtualProductRepositoryPort["manageConfiguration"]>>;
    try {
      result = await this.virtualProductRepository.manageConfiguration({
        expectedProductVersion: input.version,
        productPatch: buildProductPatch(input),
        virtualProductPatch: input.virtual_product ?? {},
        actorEmployeeId: actor.employeeId,
      });
    } catch (error) {
      if (isApplicationErrorLike(error)) throw error;
      throw Errors.dbError("保存品牌权益商品配置失败");
    }

    const before = serializeProduct(current);
    const after = serializeProduct(result.product);
    await this.audit.recordBestEffort({
      action: "branding_addon_product.update",
      actorEmployeeId: actor.employeeId,
      actorUserId: actor.authUserId,
      resourceType: "branding_addon_product",
      resourceId: result.product.id,
      resourceLabel: result.product.name,
      status: "success",
      summary: "更新年度品牌权益商品",
      metadata: {
        from: before,
        to: after,
        ...(input.virtual_product
          ? {
            virtual_product: {
              from: requestedMapping
                ? serializeBrandingVirtualProduct(requestedMapping)
                : null,
              to: result.virtual_product
                ? serializeBrandingVirtualProduct(result.virtual_product)
                : null,
            },
            secret: {
              key: input.virtual_product.encrypted_secret_ref,
              revision: input.virtual_product.secret_revision,
              configured: secretConfigured ?? false,
            },
          }
          : {}),
      },
    });
    return {
      product: after,
      ...(result.virtual_product
        ? { virtual_product: serializeBrandingVirtualProduct(result.virtual_product) }
        : {}),
    };
  }

  private requirePlatformOperator(authContext: AuthContext) {
    if (
      !authContext.isPlatformAdmin || authContext.tenantId !== null ||
      !authContext.employeeId || !authContext.authUserId
    ) throw Errors.forbidden();
    this.accessPolicy.assertPermission(authContext, MANAGE_PERMISSION);
    return { employeeId: authContext.employeeId, authUserId: authContext.authUserId };
  }

  private async requireProduct() {
    try {
      const product = await this.repository.getProduct();
      if (product) return product;
    } catch {
      throw Errors.dbError("查询年度品牌权益商品失败");
    }
    throw Errors.business(
      404,
      "年度品牌权益商品不存在",
      "BRANDING_ADDON_PRODUCT_NOT_FOUND",
    );
  }

  private async findMapping(
    addonProductId: string,
    environment: "sandbox" | "production",
  ) {
    try {
      return await this.virtualProductRepository.findByProductAndEnvironment({
        addonProductId,
        environment,
      });
    } catch (error) {
      if (isApplicationErrorLike(error)) throw error;
      throw Errors.dbError("查询品牌权益虚拟商品映射失败");
    }
  }

  private async assertMappingCanBeSaved(
    current: BrandingVirtualProductRecord | null,
    input: NonNullable<BrandingAddonProductPatchInput["virtual_product"]>,
    amountFen: number | null,
  ) {
    if ((current?.version ?? 1) !== input.version) {
      throw Errors.business(
        409,
        "虚拟商品映射版本已变化，请刷新后重试",
        "BRANDING_VIRTUAL_PRODUCT_VERSION_CONFLICT",
      );
    }
    const key = WECHAT_VIRTUAL_PAYMENT_SECRET_KEYS[input.environment];
    const configured = await this.hasConfiguredSecretBundle(
      key,
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
      throw Errors.business(409, "生产虚拟商品映射未启用", "BRANDING_VIRTUAL_PRODUCT_DISABLED");
    }
    if (mapping.validation_status !== "valid") {
      throw Errors.business(409, "生产虚拟商品映射未通过验证", "BRANDING_VIRTUAL_PRODUCT_INVALID");
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
      const bundle = parseWechatVirtualPaymentSecretBundle(
        await this.settingsService.getSecretString(key),
      );
      return bundle?.revision === revision;
    } catch {
      return false;
    }
  }

  private assertFinalPrice(
    current: BrandingAddonProductRecord,
    input: BrandingAddonProductPatchInput,
  ) {
    const amountFen = input.amount_fen ?? current.amount_fen;
    if (amountFen !== null && (
      !Number.isSafeInteger(amountFen) || amountFen <= 0 ||
      amountFen > MAX_POSTGRES_INTEGER_FEN
    )) throw Errors.badRequest("商品价格必须是支持范围内的正整数分");
    if ((input.enabled ?? current.enabled) && amountFen === null) {
      throw Errors.business(
        409,
        "启用商品前必须配置正整数分价格",
        "BRANDING_ADDON_PRODUCT_PRICE_REQUIRED",
      );
    }
  }
}

function buildProductPatch(input: BrandingAddonProductPatchInput) {
  if (!hasBrandingAddonProductMutation(input)) return {};
  return {
    ...(input.name === undefined ? {} : { name: input.name }),
    ...(input.amount_fen === undefined ? {} : { amount_fen: input.amount_fen }),
    ...(input.purchase_notes === undefined ? {} : { purchase_notes: input.purchase_notes }),
    ...(input.enabled === undefined ? {} : { enabled: input.enabled }),
    ...(input.purchase_mode === undefined ? {} : { purchase_mode: input.purchase_mode }),
  };
}

function assertPurchaseModeTransition(from: BrandingPurchaseMode, to: BrandingPurchaseMode) {
  if (from === to ||
    (from === "direct_legacy" && to === "maintenance") ||
    (from === "maintenance" && to === "wechat_virtual") ||
    (from === "wechat_virtual" && to === "maintenance")) return;
  throw Errors.business(
    409,
    "不支持当前商品购买模式切换",
    "BRANDING_ADDON_PURCHASE_MODE_TRANSITION_INVALID",
  );
}

function serializeProduct(product: BrandingAddonProductRecord) {
  return {
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

export const platformBrandingAddonProductService =
  new PlatformBrandingAddonProductService();
