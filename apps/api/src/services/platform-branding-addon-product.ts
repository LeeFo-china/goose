import { Errors } from "@/errors/error-factory";
import {
  brandingAddonProductRepository,
  type BrandingAddonProductRecord,
  type UpdateBrandingAddonProductInput,
} from "@/repositories/branding-addon-products";
import {
  brandingVirtualProductRepository,
  type BrandingVirtualProductRecord,
  type SaveBrandingVirtualProductInput,
} from "@/repositories/branding-virtual-products";
import type { BrandingAddonProductPatchInput } from "@/schema/branding-addon";
import { accessPolicyService } from "@/services/access-policy";
import type { AuthContext } from "@/services/authorization";
import { MAX_POSTGRES_INTEGER_FEN } from "@/services/branding-addon-contracts";
import {
  brandingVirtualProductVersionConflict,
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
import { BRANDING_VIRTUAL_MINIMUM_AMOUNT_FEN } from "@gooes/domain";

const MANAGE_PERMISSION = "platform.branding_product.manage";

type ProductRepositoryPort = Pick<
  typeof brandingAddonProductRepository,
  "getProduct" | "updateProduct"
>;

type VirtualProductRepositoryPort = Pick<
  typeof brandingVirtualProductRepository,
  "findByProductAndEnvironment" | "createMapping" | "updateMapping"
>;

type SettingsServicePort = Pick<
  typeof systemSettingsService,
  "getSecretString"
>;

type AccessPolicyPort = Pick<
  typeof accessPolicyService,
  "assertPermission"
>;

type AuditPort = Pick<
  typeof platformAuditLogService,
  "recordBestEffort"
>;

export type PlatformBrandingAddonProductServiceDependencies = {
  repository?: ProductRepositoryPort;
  virtualProductRepository?: VirtualProductRepositoryPort;
  settingsService?: SettingsServicePort;
  accessPolicy?: AccessPolicyPort;
  audit?: AuditPort;
};

export class PlatformBrandingAddonProductService {
  private readonly repository: ProductRepositoryPort;
  private readonly virtualProductRepository: VirtualProductRepositoryPort;
  private readonly settingsService: SettingsServicePort;
  private readonly accessPolicy: AccessPolicyPort;
  private readonly audit: AuditPort;

  constructor(
    dependencies: PlatformBrandingAddonProductServiceDependencies = {},
  ) {
    this.repository = dependencies.repository ??
      brandingAddonProductRepository;
    this.virtualProductRepository = dependencies.virtualProductRepository ??
      brandingVirtualProductRepository;
    this.settingsService = dependencies.settingsService ?? systemSettingsService;
    this.accessPolicy = dependencies.accessPolicy ?? accessPolicyService;
    this.audit = dependencies.audit ?? platformAuditLogService;
  }

  async get(authContext: AuthContext) {
    this.requirePlatformOperator(authContext);
    return { product: serializeProduct(await this.requireProduct()) };
  }

  async update(
    authContext: AuthContext,
    input: BrandingAddonProductPatchInput,
  ) {
    const actor = this.requirePlatformOperator(authContext);
    const current = await this.requireProduct();
    if (current.version !== input.version) {
      throw productVersionConflict();
    }

    this.assertFinalPrice(current, input);
    const finalAmountFen = input.amount_fen ?? current.amount_fen;
    const finalPurchaseMode = input.purchase_mode ?? current.purchase_mode;
    const requestedMapping = input.virtual_product
      ? await this.findMapping(current.id, input.virtual_product.environment)
      : null;
    const productionMapping = finalPurchaseMode === "wechat_virtual"
      ? input.virtual_product?.environment === "production"
        ? mergeBrandingVirtualProduct(
          current.id,
          requestedMapping,
          input.virtual_product,
        )
        : await this.findMapping(current.id, "production")
      : null;

    const secretConfigured = input.virtual_product
      ? await this.assertMappingCanBeSaved({
        current: requestedMapping,
        input: input.virtual_product,
        amountFen: finalAmountFen,
      })
      : null;
    if (
      finalPurchaseMode === "wechat_virtual" &&
      !(
        input.virtual_product?.environment === "production" &&
        input.virtual_product.status === "active"
      )
    ) {
      await this.assertProductionMappingReady(productionMapping, finalAmountFen);
    }

    const updatedMapping = input.virtual_product
      ? await this.saveMapping(
        current.id,
        requestedMapping,
        input.virtual_product,
        actor.employeeId,
      )
      : null;
    const updated = hasBrandingAddonProductMutation(input)
      ? await this.updateProduct(buildUpdateInput(input, actor.employeeId))
      : current;
    if (!updated) throw productVersionConflict();

    const before = serializeProduct(current);
    const after = serializeProduct(updated);
    await this.audit.recordBestEffort({
      action: "branding_addon_product.update",
      actorEmployeeId: actor.employeeId,
      actorUserId: actor.authUserId,
      resourceType: "branding_addon_product",
      resourceId: updated.id,
      resourceLabel: updated.name,
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
              to: updatedMapping
                ? serializeBrandingVirtualProduct(updatedMapping)
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
      ...(updatedMapping
        ? { virtual_product: serializeBrandingVirtualProduct(updatedMapping) }
        : {}),
    };
  }

  private requirePlatformOperator(authContext: AuthContext) {
    if (
      !authContext.isPlatformAdmin ||
      authContext.tenantId !== null ||
      !authContext.employeeId ||
      !authContext.authUserId
    ) {
      throw Errors.forbidden();
    }
    this.accessPolicy.assertPermission(authContext, MANAGE_PERMISSION);
    return {
      authUserId: authContext.authUserId,
      employeeId: authContext.employeeId,
    };
  }

  private async requireProduct() {
    let product: BrandingAddonProductRecord | null;
    try {
      product = await this.repository.getProduct();
    } catch {
      throw Errors.dbError("查询年度品牌权益商品失败");
    }
    if (!product) {
      throw Errors.business(
        404,
        "年度品牌权益商品不存在",
        "BRANDING_ADDON_PRODUCT_NOT_FOUND",
      );
    }
    return product;
  }

  private async updateProduct(input: UpdateBrandingAddonProductInput) {
    try {
      return await this.repository.updateProduct(input);
    } catch {
      throw Errors.dbError("更新年度品牌权益商品失败");
    }
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
    } catch {
      throw Errors.dbError("查询品牌权益虚拟商品映射失败");
    }
  }

  private async assertMappingCanBeSaved(input: {
    current: BrandingVirtualProductRecord | null;
    input: NonNullable<BrandingAddonProductPatchInput["virtual_product"]>;
    amountFen: number | null;
  }): Promise<boolean> {
    if (input.current && input.current.version !== input.input.version) {
      throw brandingVirtualProductVersionConflict();
    }
    if (!input.current && input.input.version !== 1) {
      throw brandingVirtualProductVersionConflict();
    }
    const expectedSecretKey =
      WECHAT_VIRTUAL_PAYMENT_SECRET_KEYS[input.input.environment];
    if (input.input.encrypted_secret_ref !== expectedSecretKey) {
      throw Errors.business(
        409,
        "虚拟支付密钥引用与环境不匹配",
        "BRANDING_VIRTUAL_PRODUCT_SECRET_ENVIRONMENT_MISMATCH",
      );
    }
    if (input.input.status !== "active") {
      return this.hasConfiguredSecretBundle(
        expectedSecretKey,
        input.input.secret_revision,
      );
    }
    await this.assertSecretBundle(
      expectedSecretKey,
      input.input.secret_revision,
    );
    if (
      input.current &&
      hasVirtualProductValidationInputChanged(input.current, input.input)
    ) {
      throw Errors.business(
        409,
        "虚拟商品映射参数变化后必须重新验证",
        "BRANDING_VIRTUAL_PRODUCT_REVALIDATION_REQUIRED",
      );
    }
    const merged = mergeBrandingVirtualProduct(
      "",
      input.current,
      input.input,
    );
    if (merged.validation_status !== "valid") {
      throw Errors.business(
        409,
        "虚拟商品映射尚未通过验证",
        "BRANDING_VIRTUAL_PRODUCT_INVALID",
      );
    }
    if (input.input.environment === "production") {
      await this.assertProductionMappingReady(merged, input.amountFen);
    }
    return true;
  }

  private async assertProductionMappingReady(
    mapping: BrandingVirtualProductRecord | null,
    amountFen: number | null,
  ): Promise<void> {
    if (!mapping || mapping.environment !== "production") {
      throw Errors.business(
        409,
        "切换虚拟支付前必须配置生产环境映射",
        "BRANDING_VIRTUAL_PRODUCT_PRODUCTION_REQUIRED",
      );
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
    if (
      amountFen === null ||
      amountFen < BRANDING_VIRTUAL_MINIMUM_AMOUNT_FEN
    ) {
      throw Errors.business(
        409,
        "生产虚拟商品价格不得低于 100 分",
        "BRANDING_VIRTUAL_PRODUCT_AMOUNT_TOO_LOW",
      );
    }
    if (mapping.expected_amount_fen !== amountFen) {
      throw Errors.business(
        409,
        "生产虚拟商品映射价格与业务商品不一致",
        "BRANDING_VIRTUAL_PRODUCT_AMOUNT_MISMATCH",
      );
    }
    const expectedKey = WECHAT_VIRTUAL_PAYMENT_SECRET_KEYS.production;
    if (mapping.encrypted_secret_ref !== expectedKey) {
      throw Errors.business(
        409,
        "生产虚拟商品必须使用生产密钥",
        "BRANDING_VIRTUAL_PRODUCT_SECRET_ENVIRONMENT_MISMATCH",
      );
    }
    await this.assertSecretBundle(expectedKey, mapping.secret_revision);
  }

  private async assertSecretBundle(
    key: string,
    revision: number,
  ): Promise<void> {
    if (!await this.hasConfiguredSecretBundle(key, revision)) {
      throw Errors.business(
        409,
        "虚拟支付密钥未配置或版本不匹配",
        "BRANDING_VIRTUAL_PRODUCT_SECRET_INVALID",
      );
    }
  }

  private async hasConfiguredSecretBundle(
    key: string,
    revision: number,
  ): Promise<boolean> {
    let value: string;
    try {
      value = await this.settingsService.getSecretString(key);
    } catch {
      value = "";
    }
    const bundle = parseWechatVirtualPaymentSecretBundle(value);
    return bundle?.revision === revision;
  }

  private async saveMapping(
    addonProductId: string,
    current: BrandingVirtualProductRecord | null,
    input: NonNullable<BrandingAddonProductPatchInput["virtual_product"]>,
    employeeId: string,
  ) {
    const saveInput: SaveBrandingVirtualProductInput = {
      addonProductId,
      environment: input.environment,
      appId: input.app_id,
      virtualMerchantId: input.virtual_merchant_id,
      offerId: input.offer_id,
      providerProductId: input.provider_product_id,
      expectedAmountFen: input.expected_amount_fen,
      encryptedSecretRef: input.encrypted_secret_ref,
      secretRevision: input.secret_revision,
      status: input.status,
      updatedByEmployeeId: employeeId,
    };
    try {
      if (!current) {
        return await this.virtualProductRepository.createMapping(saveInput);
      }
      const updated = await this.virtualProductRepository.updateMapping({
        ...saveInput,
        id: current.id,
        expectedVersion: input.version,
      });
      if (!updated) throw brandingVirtualProductVersionConflict();
      return updated;
    } catch (error) {
      if (isApplicationErrorLike(error)) throw error;
      throw Errors.dbError("保存品牌权益虚拟商品映射失败");
    }
  }

  private assertFinalPrice(
    current: BrandingAddonProductRecord,
    input: BrandingAddonProductPatchInput,
  ): void {
    const isEnabled = input.enabled ?? current.enabled;
    const amountFen = input.amount_fen ?? current.amount_fen;
    if (
      amountFen !== null &&
      (
        !Number.isSafeInteger(amountFen) ||
        amountFen <= 0 ||
        amountFen > MAX_POSTGRES_INTEGER_FEN
      )
    ) {
      throw Errors.badRequest("商品价格必须是支持范围内的正整数分");
    }
    if (
      isEnabled &&
      amountFen === null
    ) {
      throw Errors.business(
        409,
        "启用商品前必须配置正整数分价格",
        "BRANDING_ADDON_PRODUCT_PRICE_REQUIRED",
      );
    }
  }
}

function buildUpdateInput(
  input: BrandingAddonProductPatchInput,
  updatedByEmployeeId: string,
): UpdateBrandingAddonProductInput {
  return {
    expectedVersion: input.version,
    updatedByEmployeeId,
    ...(input.name === undefined ? {} : { name: input.name }),
    ...(input.amount_fen === undefined
      ? {}
      : { amountFen: input.amount_fen }),
    ...(input.purchase_notes === undefined
      ? {}
      : { purchaseNotes: input.purchase_notes }),
    ...(input.enabled === undefined ? {} : { enabled: input.enabled }),
    ...(input.purchase_mode === undefined
      ? {}
      : { purchaseMode: input.purchase_mode }),
  };
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

export const platformBrandingAddonProductService =
  new PlatformBrandingAddonProductService();
