import { Errors } from "@/errors/error-factory";
import type { BrandingAddonProductRecord } from "@/repositories/branding-addon-products";
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
  wechatMiniProgramAccessTokenProvider,
  type WechatMiniProgramAccessTokenPort,
} from "@/services/wechat-miniprogram-access-token";
import { wechatMiniSessionCredentialService } from
  "@/services/wechat-mini-session-credentials";
import { WechatVirtualPaymentGateway } from
  "@/services/wechat-virtual-payment-gateway";
import type {
  WechatVirtualPaymentGatewayPort,
} from "@/services/wechat-virtual-payment-gateway-contracts";
import { isValidVirtualGoodsUploadItem } from
  "@/services/wechat-virtual-payment-goods-input";
import {
  BrandingVirtualProductWechatValidator,
  classifyWechatGoodsFailure,
  type BrandingVirtualProductWechatValidatorPort,
  type WechatGoodsValidationResult,
} from "@/services/branding-virtual-product-wechat-validation";
import {
  BRANDING_VIRTUAL_MINIMUM_AMOUNT_FEN,
  VIRTUAL_PAYMENT_ENVIRONMENTS,
  type BrandingVirtualPaymentEnvironment,
} from "@gooes/domain";

const MANAGE_PERMISSION = "platform.payment.config.manage";
const SECRET_KEYS = [
  WECHAT_VIRTUAL_PAYMENT_SECRET_KEYS.sandbox,
  WECHAT_VIRTUAL_PAYMENT_SECRET_KEYS.production,
] as const;

type VirtualProductRepositoryPort = Pick<
  typeof brandingVirtualProductRepository,
  "getManagementSnapshot" | "setConfigurationValidation"
>;
type SettingsServicePort = Pick<
  typeof systemSettingsService,
  "getPlatformSecretStrings"
>;
type AccessPolicyPort = Pick<typeof accessPolicyService, "assertPermission">;
type AuditPort = Pick<typeof platformAuditLogService, "recordBestEffort">;
type GatewayPort = Pick<
  WechatVirtualPaymentGatewayPort,
  "queryUploadGoods" | "queryPublishGoods"
>;

export type BrandingVirtualProductManagementDependencies = {
  virtualProductRepository?: VirtualProductRepositoryPort;
  settingsService?: SettingsServicePort;
  accessPolicy?: AccessPolicyPort;
  audit?: AuditPort;
  gateway?: GatewayPort;
  accessTokenProvider?: WechatMiniProgramAccessTokenPort;
  wechatValidator?: BrandingVirtualProductWechatValidatorPort;
  nowFactory?: () => Date;
};

export class BrandingVirtualProductManagementService {
  private readonly virtualProductRepository: VirtualProductRepositoryPort;
  private readonly settingsService: SettingsServicePort;
  private readonly accessPolicy: AccessPolicyPort;
  private readonly audit: AuditPort;
  private readonly wechatValidator: BrandingVirtualProductWechatValidatorPort;
  private readonly nowFactory: () => Date;

  constructor(dependencies: BrandingVirtualProductManagementDependencies = {}) {
    this.virtualProductRepository = dependencies.virtualProductRepository ??
      brandingVirtualProductRepository;
    this.settingsService = dependencies.settingsService ?? systemSettingsService;
    this.accessPolicy = dependencies.accessPolicy ?? accessPolicyService;
    this.audit = dependencies.audit ?? platformAuditLogService;
    this.wechatValidator = dependencies.wechatValidator ??
      new BrandingVirtualProductWechatValidator({
        gateway: dependencies.gateway ?? new WechatVirtualPaymentGateway({
          credentialInvalidation: wechatMiniSessionCredentialService,
        }),
        accessTokenProvider: dependencies.accessTokenProvider ??
          wechatMiniProgramAccessTokenProvider,
      });
    this.nowFactory = dependencies.nowFactory ?? (() => new Date());
  }

  async getConfiguration() {
    const [snapshot, secretValues] = await Promise.all([
      this.readSnapshot(),
      this.readSecretValues(),
    ]);
    return {
      product: serializeProduct(snapshot.product),
      virtual_products: buildSummaries(snapshot.mappings, secretValues),
    };
  }

  async validateConfiguration(
    authContext: AuthContext,
    input: { environment: BrandingVirtualPaymentEnvironment; version: number },
  ) {
    const actor = this.requirePlatformOperator(authContext);
    const [snapshot, secretValues] = await Promise.all([
      this.readSnapshot(),
      this.readSecretValues(),
    ]);
    const product = snapshot.product;
    const mapping = snapshot.mappings.find(
      (candidate) => candidate.environment === input.environment,
    );
    if (!mapping) {
      throw Errors.business(
        404,
        "虚拟商品映射不存在",
        "BRANDING_VIRTUAL_PRODUCT_NOT_FOUND",
      );
    }
    if (mapping.version !== input.version) {
      throw Errors.business(
        409,
        "虚拟商品映射版本已变化，请刷新后重试",
        "BRANDING_VIRTUAL_PRODUCT_VERSION_CONFLICT",
      );
    }

    const key = WECHAT_VIRTUAL_PAYMENT_SECRET_KEYS[input.environment];
    const bundle = parseWechatVirtualPaymentSecretBundle(secretValues[key] ?? "");
    const localError = localValidationError(product, mapping, key, bundle);
    if (localError) {
      await this.persistOutcome({
        actor,
        product,
        mapping,
        environment: input.environment,
        validationStatus: "invalid",
        errorCode: localError.code,
        secret: { key, revision: bundle?.revision ?? null, configured: bundle !== null },
      });
      throw Errors.business(409, localError.message, localError.code);
    }
    if (!bundle) throw Errors.dbError("读取平台支付密钥配置失败");

    let remoteResult: WechatGoodsValidationResult;
    try {
      remoteResult = await this.wechatValidator.validate({
        environment: input.environment,
        providerProductId: mapping.provider_product_id,
        expectedAmountFen: mapping.expected_amount_fen,
        expectedName: product.name,
        expectedRemark: product.purchase_notes,
        expectedItemUrl: mapping.item_url ?? "",
        appKey: bundle.appKey,
      });
    } catch (error) {
      const failure = classifyWechatGoodsFailure(error);
      await this.persistOutcome({
        actor,
        product,
        mapping,
        environment: input.environment,
        validationStatus: failure.confirmedInvalid ? "invalid" : "pending",
        errorCode: failure.error.code,
        secret: { key, revision: bundle.revision, configured: true },
      });
      throw failure.error;
    }

    const validatedAt = this.nowFactory().toISOString();
    const saved = await this.persistOutcome({
      actor,
      product,
      mapping,
      environment: input.environment,
      validationStatus: "valid",
      errorCode: null,
      secret: { key, revision: bundle.revision, configured: true },
      validatedAt,
    });
    return {
      virtual_product: serializeBrandingVirtualProduct(saved),
      validation: {
        kind: "wechat_goods" as const,
        validated_at: validatedAt,
        request_ids: {
          upload: remoteResult.uploadRequestId,
          publish: remoteResult.publishRequestId,
        },
      },
    };
  }

  private async persistOutcome(input: {
    actor: { employeeId: string; authUserId: string };
    product: BrandingAddonProductRecord;
    mapping: BrandingVirtualProductRecord;
    environment: BrandingVirtualPaymentEnvironment;
    validationStatus: "pending" | "valid" | "invalid";
    validatedAt?: string;
    errorCode: string | null;
    secret: {
      key: BrandingVirtualPaymentSecretSettingKey;
      revision: number | null;
      configured: boolean;
    };
  }) {
    const saved = await this.persistValidation({
      addonProductId: input.product.id,
      environment: input.environment,
      expectedProductVersion: input.product.version,
      expectedMappingVersion: input.mapping.version,
      validationStatus: input.validationStatus,
      validatedAt: input.validationStatus === "pending"
        ? null
        : input.validatedAt ?? this.nowFactory().toISOString(),
      updatedByEmployeeId: input.actor.employeeId,
    });
    await this.audit.recordBestEffort({
      action: "branding_virtual_product.validate",
      actorEmployeeId: input.actor.employeeId,
      actorUserId: input.actor.authUserId,
      resourceType: "branding_virtual_product",
      resourceId: saved.id,
      resourceLabel: `${input.product.name}-${input.environment}`,
      status: input.validationStatus === "valid" ? "success" : "failure",
      summary: input.validationStatus === "valid"
        ? "品牌权益虚拟商品微信侧状态验证通过"
        : input.validationStatus === "pending"
        ? "品牌权益虚拟商品微信侧状态暂未确认"
        : "品牌权益虚拟商品微信侧状态验证失败",
      metadata: {
        environment: input.environment,
        validation: "wechat_goods",
        error_code: input.errorCode,
        secret: input.secret,
      },
    });
    return saved;
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

  private async readSnapshot() {
    try {
      return await this.virtualProductRepository.getManagementSnapshot();
    } catch (error) {
      throw sanitizedInfrastructureError(
        error,
        "查询品牌权益虚拟商品管理配置失败",
      );
    }
  }

  private async readSecretValues() {
    try {
      return await this.settingsService.getPlatformSecretStrings(SECRET_KEYS);
    } catch (error) {
      throw sanitizedInfrastructureError(error, "读取平台支付密钥配置失败");
    }
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
}

function buildSummaries(
  mappings: BrandingVirtualProductRecord[],
  secretValues: Record<string, string>,
) {
  const byEnvironment = new Map(
    mappings.map((mapping) => [mapping.environment, mapping]),
  );
  return VIRTUAL_PAYMENT_ENVIRONMENTS.map((environment) => {
    const mapping = byEnvironment.get(environment) ?? null;
    const key = WECHAT_VIRTUAL_PAYMENT_SECRET_KEYS[environment];
    const bundle = parseWechatVirtualPaymentSecretBundle(secretValues[key] ?? "");
    return {
      environment,
      mapping: mapping ? serializeBrandingVirtualProduct(mapping) : null,
      secret: {
        key,
        revision: bundle?.revision ?? null,
        configured: bundle !== null,
      },
    };
  });
}

function sanitizedInfrastructureError(error: unknown, fallback: string) {
  if (isApplicationErrorLike(error)) {
    const appError = error as {
      statusCode: number;
      message: string;
      code: string;
    };
    return Errors.business(
      appError.statusCode,
      appError.message,
      appError.code,
    );
  }
  return Errors.dbError(fallback);
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
  if (!isValidVirtualGoodsUploadItem({
    id: mapping.provider_product_id,
    name: product.name,
    price: mapping.expected_amount_fen,
    remark: product.purchase_notes,
    itemUrl: mapping.item_url,
  })) {
    return {
      code: "BRANDING_VIRTUAL_PRODUCT_WECHAT_GOODS_INVALID",
      message: "微信虚拟商品 ID、名称、备注或图片地址不符合上传要求",
    };
  }
  return null;
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

export const brandingVirtualProductManagementService =
  new BrandingVirtualProductManagementService();
