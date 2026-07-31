import { Errors } from "@/errors/error-factory";
import {
  brandingAddonProductRepository,
  type BrandingAddonProductRecord,
} from "@/repositories/branding-addon-products";
import {
  brandingVirtualProductRepository,
  type BrandingVirtualPaymentSecretSettingKey,
  type BrandingVirtualProductRecord,
} from "@/repositories/branding-virtual-products";
import { accessPolicyService } from "@/services/access-policy";
import type { AuthContext } from "@/services/authorization";
import {
  isApplicationErrorLike,
  parseWechatVirtualPaymentSecretBundle,
  serializeBrandingVirtualProduct,
  WECHAT_VIRTUAL_PAYMENT_SECRET_KEYS,
} from "@/services/branding-virtual-products";
import { platformAuditLogService } from "@/services/platform-audit-logs";
import { systemSettingsService } from "@/services/system-settings";
import {
  BRANDING_VIRTUAL_MINIMUM_AMOUNT_FEN,
  VIRTUAL_PAYMENT_ENVIRONMENTS,
  type BrandingVirtualPaymentEnvironment,
} from "@gooes/domain";

const MANAGE_PERMISSION = "platform.branding_product.manage";

type ProductRepositoryPort = Pick<
  typeof brandingAddonProductRepository,
  "getProduct"
>;
type VirtualProductRepositoryPort = Pick<
  typeof brandingVirtualProductRepository,
  | "listByProduct"
  | "findByProductAndEnvironment"
  | "setConfigurationValidation"
>;
type SettingsServicePort = Pick<typeof systemSettingsService, "getSecretString">;
type AccessPolicyPort = Pick<typeof accessPolicyService, "assertPermission">;
type AuditPort = Pick<typeof platformAuditLogService, "recordBestEffort">;

export type BrandingVirtualProductManagementDependencies = {
  productRepository?: ProductRepositoryPort;
  virtualProductRepository?: VirtualProductRepositoryPort;
  settingsService?: SettingsServicePort;
  accessPolicy?: AccessPolicyPort;
  audit?: AuditPort;
  nowFactory?: () => Date;
};

export class BrandingVirtualProductManagementService {
  private readonly productRepository: ProductRepositoryPort;
  private readonly virtualProductRepository: VirtualProductRepositoryPort;
  private readonly settingsService: SettingsServicePort;
  private readonly accessPolicy: AccessPolicyPort;
  private readonly audit: AuditPort;
  private readonly nowFactory: () => Date;

  constructor(dependencies: BrandingVirtualProductManagementDependencies = {}) {
    this.productRepository = dependencies.productRepository ??
      brandingAddonProductRepository;
    this.virtualProductRepository = dependencies.virtualProductRepository ??
      brandingVirtualProductRepository;
    this.settingsService = dependencies.settingsService ?? systemSettingsService;
    this.accessPolicy = dependencies.accessPolicy ?? accessPolicyService;
    this.audit = dependencies.audit ?? platformAuditLogService;
    this.nowFactory = dependencies.nowFactory ?? (() => new Date());
  }

  async getSummaries(product: BrandingAddonProductRecord) {
    let mappings: BrandingVirtualProductRecord[];
    try {
      mappings = await this.virtualProductRepository.listByProduct(product.id);
    } catch (error) {
      if (isApplicationErrorLike(error)) throw error;
      throw Errors.dbError("查询品牌权益虚拟商品映射失败");
    }
    const byEnvironment = new Map(
      mappings.map((mapping) => [mapping.environment, mapping]),
    );

    return Promise.all(VIRTUAL_PAYMENT_ENVIRONMENTS.map(async (environment) => {
      const mapping = byEnvironment.get(environment) ?? null;
      const key = WECHAT_VIRTUAL_PAYMENT_SECRET_KEYS[environment];
      const bundle = await this.readBundle(key);
      return {
        environment,
        mapping: mapping ? serializeBrandingVirtualProduct(mapping) : null,
        secret: {
          key,
          revision: bundle?.revision ?? null,
          configured: bundle !== null,
        },
      };
    }));
  }

  async validateConfiguration(
    authContext: AuthContext,
    input: { environment: BrandingVirtualPaymentEnvironment; version: number },
  ) {
    const actor = this.requirePlatformOperator(authContext);
    const product = await this.requireProduct();
    const mapping = await this.requireMapping(product.id, input.environment);
    if (mapping.version !== input.version) {
      throw Errors.business(
        409,
        "虚拟商品映射版本已变化，请刷新后重试",
        "BRANDING_VIRTUAL_PRODUCT_VERSION_CONFLICT",
      );
    }

    const key = WECHAT_VIRTUAL_PAYMENT_SECRET_KEYS[input.environment];
    const bundle = await this.readBundle(key);
    const validationError = localValidationError(product, mapping, key, bundle);
    const validationStatus = validationError ? "invalid" : "valid";
    const validatedAt = this.nowFactory().toISOString();
    const saved = await this.persistValidation({
      addonProductId: product.id,
      environment: input.environment,
      expectedProductVersion: product.version,
      expectedMappingVersion: mapping.version,
      validationStatus,
      validatedAt,
      updatedByEmployeeId: actor.employeeId,
    });

    await this.audit.recordBestEffort({
      action: "branding_virtual_product.validate",
      actorEmployeeId: actor.employeeId,
      actorUserId: actor.authUserId,
      resourceType: "branding_virtual_product",
      resourceId: saved.id,
      resourceLabel: `${product.name}-${input.environment}`,
      status: validationError ? "failure" : "success",
      summary: validationError
        ? "品牌权益虚拟商品本地配置验证失败"
        : "品牌权益虚拟商品本地配置验证通过",
      metadata: {
        environment: input.environment,
        validation: "server_configuration",
        error_code: validationError?.code ?? null,
        secret: {
          key,
          revision: bundle?.revision ?? null,
          configured: bundle !== null,
        },
      },
    });

    if (validationError) {
      throw Errors.business(409, validationError.message, validationError.code);
    }
    return {
      virtual_product: serializeBrandingVirtualProduct(saved),
      validation: { kind: "server_configuration" as const, validated_at: validatedAt },
    };
  }

  private requirePlatformOperator(authContext: AuthContext) {
    if (
      !authContext.isPlatformAdmin || authContext.tenantId !== null ||
      !authContext.employeeId || !authContext.authUserId
    ) throw Errors.forbidden();
    this.accessPolicy.assertPermission(authContext, MANAGE_PERMISSION);
    return {
      employeeId: authContext.employeeId,
      authUserId: authContext.authUserId,
    };
  }

  private async requireProduct() {
    try {
      const product = await this.productRepository.getProduct();
      if (product) return product;
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

  private async requireMapping(
    addonProductId: string,
    environment: BrandingVirtualPaymentEnvironment,
  ) {
    try {
      const mapping = await this.virtualProductRepository
        .findByProductAndEnvironment({ addonProductId, environment });
      if (mapping) return mapping;
    } catch (error) {
      if (isApplicationErrorLike(error)) throw error;
      throw Errors.dbError("查询品牌权益虚拟商品映射失败");
    }
    throw Errors.business(
      404,
      "虚拟商品映射不存在",
      "BRANDING_VIRTUAL_PRODUCT_NOT_FOUND",
    );
  }

  private async persistValidation(
    input: Parameters<VirtualProductRepositoryPort["setConfigurationValidation"]>[0],
  ) {
    try {
      return await this.virtualProductRepository.setConfigurationValidation(input);
    } catch (error) {
      if (isApplicationErrorLike(error)) throw error;
      throw Errors.dbError("保存品牌权益虚拟商品验证结果失败");
    }
  }

  private async readBundle(key: BrandingVirtualPaymentSecretSettingKey) {
    try {
      return parseWechatVirtualPaymentSecretBundle(
        await this.settingsService.getSecretString(key),
      );
    } catch {
      return null;
    }
  }
}

function localValidationError(
  product: BrandingAddonProductRecord,
  mapping: BrandingVirtualProductRecord,
  expectedKey: BrandingVirtualPaymentSecretSettingKey,
  bundle: { appKey: string; revision: number } | null,
) {
  if (mapping.encrypted_secret_ref !== expectedKey) {
    return {
      code: "BRANDING_VIRTUAL_PRODUCT_SECRET_ENVIRONMENT_MISMATCH",
      message: "虚拟支付密钥引用与环境不匹配",
    };
  }
  if (!bundle || bundle.revision !== mapping.secret_revision) {
    return {
      code: "BRANDING_VIRTUAL_PRODUCT_SECRET_INVALID",
      message: "虚拟支付密钥未配置或版本不匹配",
    };
  }
  if (
    mapping.environment === "production" &&
    mapping.expected_amount_fen < BRANDING_VIRTUAL_MINIMUM_AMOUNT_FEN
  ) {
    return {
      code: "BRANDING_VIRTUAL_PRODUCT_AMOUNT_TOO_LOW",
      message: "生产虚拟商品价格不得低于 100 分",
    };
  }
  if (mapping.expected_amount_fen !== product.amount_fen) {
    return {
      code: "BRANDING_VIRTUAL_PRODUCT_AMOUNT_MISMATCH",
      message: "虚拟商品映射价格与业务商品不一致",
    };
  }
  return null;
}

export const brandingVirtualProductManagementService =
  new BrandingVirtualProductManagementService();
