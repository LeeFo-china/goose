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
import type {
  BrandingAddonProductPatchInput,
  BrandingVirtualProductPatchInput,
} from "@/schema/branding-addon";
import {
  tenantEntitlementsRepository,
  type TenantEntitlementRecord,
} from "@/repositories/tenant-entitlements";
import { accessPolicyService } from "@/services/access-policy";
import type { AuthContext } from "@/services/authorization";
import { toTenantBrandingAddonProductView } from "@/services/branding-addon-order-views";
import {
  MAX_WECHAT_VIRTUAL_PAYMENT_SECRET_LENGTH,
} from "@/services/branding-virtual-payment-contracts";
import { systemSettingsService } from "@/services/system-settings";
import { BRANDING_VIRTUAL_MINIMUM_AMOUNT_FEN } from "@gooes/domain";

const PURCHASE_PERMISSION = "brand.entitlement.purchase";
const TENANT_ADMIN_ROLE = "system_admin";
const PAYMENT_CAPABILITY = "wx.requestVirtualPayment" as const;
const PAYMENT_CHANNEL = "wechat_virtual" as const;

export const WECHAT_VIRTUAL_PAYMENT_SECRET_KEYS = {
  sandbox: "WECHAT_VIRTUAL_PAYMENT_SANDBOX_SECRET_BUNDLE",
  production: "WECHAT_VIRTUAL_PAYMENT_PRODUCTION_SECRET_BUNDLE",
} as const satisfies Record<
  BrandingVirtualProductRecord["environment"],
  BrandingVirtualPaymentSecretSettingKey
>;

export type BrandingVirtualProductUnavailableReason =
  | "PURCHASE_MAINTENANCE"
  | "PURCHASE_MODE_DIRECT_LEGACY"
  | "VIRTUAL_PRODUCT_DISABLED"
  | "VIRTUAL_PRODUCT_INVALID"
  | "VIRTUAL_PRODUCT_AMOUNT_TOO_LOW"
  | "VIRTUAL_PRODUCT_AMOUNT_MISMATCH"
  | "VIRTUAL_PRODUCT_SECRET_INVALID";

type ProductRepositoryPort = Pick<
  typeof brandingAddonProductRepository,
  "getProduct"
>;
type VirtualProductRepositoryPort = Pick<
  typeof brandingVirtualProductRepository,
  "findByProductAndEnvironment"
>;
type EntitlementRepositoryPort = Pick<
  typeof tenantEntitlementsRepository,
  "findByCode"
>;
type SettingsServicePort = Pick<
  typeof systemSettingsService,
  "getSecretString"
>;
type AccessPolicyPort = Pick<
  typeof accessPolicyService,
  "assertTenantContext" | "hasPermission"
>;

export type BrandingVirtualProductServiceDependencies = {
  productRepository?: ProductRepositoryPort;
  virtualProductRepository?: VirtualProductRepositoryPort;
  entitlementRepository?: EntitlementRepositoryPort;
  settingsService?: SettingsServicePort;
  accessPolicy?: AccessPolicyPort;
  nowFactory?: () => Date;
};

export class BrandingVirtualProductService {
  private readonly productRepository: ProductRepositoryPort;
  private readonly virtualProductRepository: VirtualProductRepositoryPort;
  private readonly entitlementRepository: EntitlementRepositoryPort;
  private readonly settingsService: SettingsServicePort;
  private readonly accessPolicy: AccessPolicyPort;
  private readonly nowFactory: () => Date;

  constructor(dependencies: BrandingVirtualProductServiceDependencies = {}) {
    this.productRepository = dependencies.productRepository ??
      brandingAddonProductRepository;
    this.virtualProductRepository = dependencies.virtualProductRepository ??
      brandingVirtualProductRepository;
    this.entitlementRepository = dependencies.entitlementRepository ??
      tenantEntitlementsRepository;
    this.settingsService = dependencies.settingsService ?? systemSettingsService;
    this.accessPolicy = dependencies.accessPolicy ?? accessPolicyService;
    this.nowFactory = dependencies.nowFactory ?? (() => new Date());
  }

  async getTenantProduct(authContext: AuthContext) {
    const tenantId = this.requirePurchaser(authContext);
    const product = await this.requireEnabledProduct();
    const [mapping, entitlement] = await Promise.all([
      product.purchase_mode === "wechat_virtual"
        ? this.findProductionMapping(product.id)
        : Promise.resolve(null),
      this.findEntitlement(tenantId),
    ]);
    const availability = await this.deriveAvailability(product, mapping);

    return {
      product: {
        ...toTenantBrandingAddonProductView(product, entitlement),
        purchase_mode: product.purchase_mode,
        payment_channel: PAYMENT_CHANNEL,
        virtual_payment_available: availability.available,
        unavailable_reason: availability.reason,
        minimum_amount_fen: BRANDING_VIRTUAL_MINIMUM_AMOUNT_FEN,
        capability: PAYMENT_CAPABILITY,
      },
      server_time: this.nowFactory().toISOString(),
    };
  }

  private requirePurchaser(authContext: AuthContext): string {
    const tenantId = this.accessPolicy.assertTenantContext(authContext);
    if (
      !authContext.employeeId ||
      !authContext.roleCodes.includes(TENANT_ADMIN_ROLE) ||
      !this.accessPolicy.hasPermission(authContext, PURCHASE_PERMISSION)
    ) {
      throw Errors.business(
        403,
        "仅当前租户管理员可以购买品牌权益",
        "BRANDING_ENTITLEMENT_PURCHASE_FORBIDDEN",
      );
    }
    return tenantId;
  }

  private async requireEnabledProduct(): Promise<BrandingAddonProductRecord> {
    let product: BrandingAddonProductRecord | null;
    try {
      product = await this.productRepository.getProduct();
    } catch {
      throw Errors.dbError("查询年度品牌权益商品失败");
    }
    if (!product || !product.enabled || !Number.isSafeInteger(product.amount_fen)) {
      throw Errors.business(
        404,
        "年度品牌权益商品不存在或未上架",
        "BRANDING_ADDON_PRODUCT_NOT_FOUND",
      );
    }
    return product;
  }

  private async findProductionMapping(addonProductId: string) {
    try {
      return await this.virtualProductRepository.findByProductAndEnvironment({
        addonProductId,
        environment: "production",
      });
    } catch {
      throw Errors.dbError("查询品牌权益虚拟商品映射失败");
    }
  }

  private async findEntitlement(tenantId: string) {
    try {
      return await this.entitlementRepository.findByCode(
        tenantId,
        "custom_support_branding",
      );
    } catch {
      throw Errors.dbError("查询租户品牌权益失败");
    }
  }

  private async deriveAvailability(
    product: BrandingAddonProductRecord,
    mapping: BrandingVirtualProductRecord | null,
  ): Promise<{
    available: boolean;
    reason: BrandingVirtualProductUnavailableReason | null;
  }> {
    if (product.purchase_mode === "maintenance") {
      return { available: false, reason: "PURCHASE_MAINTENANCE" };
    }
    if (product.purchase_mode === "direct_legacy") {
      return { available: false, reason: "PURCHASE_MODE_DIRECT_LEGACY" };
    }
    if (!mapping || mapping.status !== "active") {
      return { available: false, reason: "VIRTUAL_PRODUCT_DISABLED" };
    }
    if (mapping.validation_status !== "valid") {
      return { available: false, reason: "VIRTUAL_PRODUCT_INVALID" };
    }
    if (Number(product.amount_fen) < BRANDING_VIRTUAL_MINIMUM_AMOUNT_FEN) {
      return { available: false, reason: "VIRTUAL_PRODUCT_AMOUNT_TOO_LOW" };
    }
    if (mapping.expected_amount_fen !== product.amount_fen) {
      return { available: false, reason: "VIRTUAL_PRODUCT_AMOUNT_MISMATCH" };
    }
    if (!await this.hasValidSecretBundle(mapping)) {
      return { available: false, reason: "VIRTUAL_PRODUCT_SECRET_INVALID" };
    }
    return { available: true, reason: null };
  }

  private async hasValidSecretBundle(
    mapping: BrandingVirtualProductRecord,
  ): Promise<boolean> {
    const expectedKey = WECHAT_VIRTUAL_PAYMENT_SECRET_KEYS[mapping.environment];
    if (mapping.encrypted_secret_ref !== expectedKey) return false;
    let value: string;
    try {
      value = await this.settingsService.getSecretString(expectedKey);
    } catch {
      return false;
    }
    const bundle = parseWechatVirtualPaymentSecretBundle(value);
    return bundle?.revision === mapping.secret_revision;
  }
}

export function parseWechatVirtualPaymentSecretBundle(value: string): {
  appKey: string;
  revision: number;
} | null {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    const keys = Object.keys(parsed);
    if (keys.length !== 2 || !keys.includes("appKey") || !keys.includes("revision")) {
      return null;
    }
    const bundle = parsed as { appKey?: unknown; revision?: unknown };
    if (
      typeof bundle.appKey !== "string" ||
      !bundle.appKey.trim() ||
      bundle.appKey.length > MAX_WECHAT_VIRTUAL_PAYMENT_SECRET_LENGTH ||
      !Number.isSafeInteger(bundle.revision) ||
      Number(bundle.revision) <= 0
    ) {
      return null;
    }
    return { appKey: bundle.appKey, revision: Number(bundle.revision) };
  } catch {
    return null;
  }
}

export function serializeBrandingVirtualProduct(
  product: BrandingVirtualProductRecord,
) {
  return {
    environment: product.environment,
    app_id: product.app_id,
    virtual_merchant_id: product.virtual_merchant_id,
    offer_id: product.offer_id,
    provider_product_id: product.provider_product_id,
    expected_amount_fen: product.expected_amount_fen,
    encrypted_secret_ref: product.encrypted_secret_ref,
    secret_revision: product.secret_revision,
    status: product.status,
    validation_status: product.validation_status,
    validated_at: product.validated_at,
    version: product.version,
  };
}

export function mergeBrandingVirtualProduct(
  addonProductId: string,
  current: BrandingVirtualProductRecord | null,
  input: BrandingVirtualProductPatchInput,
): BrandingVirtualProductRecord {
  return {
    id: current?.id ?? "",
    addon_product_id: current?.addon_product_id ?? addonProductId,
    provider: "wechat_virtual",
    environment: input.environment,
    app_id: input.app_id,
    virtual_merchant_id: input.virtual_merchant_id,
    offer_id: input.offer_id,
    provider_product_id: input.provider_product_id,
    goods_quantity: 1,
    expected_amount_fen: input.expected_amount_fen,
    encrypted_secret_ref: input.encrypted_secret_ref,
    secret_revision: input.secret_revision,
    status: input.status,
    validation_status: current?.validation_status ?? "pending",
    validated_at: current?.validated_at ?? null,
    version: current?.version ?? 1,
    created_by: current?.created_by ?? null,
    updated_by: current?.updated_by ?? null,
    created_at: current?.created_at ?? "",
    updated_at: current?.updated_at ?? "",
  };
}

export function hasVirtualProductValidationInputChanged(
  current: BrandingVirtualProductRecord,
  input: BrandingVirtualProductPatchInput,
): boolean {
  return current.app_id !== input.app_id ||
    current.virtual_merchant_id !== input.virtual_merchant_id ||
    current.offer_id !== input.offer_id ||
    current.provider_product_id !== input.provider_product_id ||
    current.expected_amount_fen !== input.expected_amount_fen ||
    current.encrypted_secret_ref !== input.encrypted_secret_ref ||
    current.secret_revision !== input.secret_revision;
}

export function hasBrandingAddonProductMutation(
  input: BrandingAddonProductPatchInput,
): boolean {
  return input.name !== undefined ||
    input.amount_fen !== undefined ||
    input.purchase_notes !== undefined ||
    input.enabled !== undefined ||
    input.purchase_mode !== undefined;
}

export function brandingVirtualProductVersionConflict() {
  return Errors.business(
    409,
    "虚拟商品映射版本已变化，请刷新后重试",
    "BRANDING_VIRTUAL_PRODUCT_VERSION_CONFLICT",
  );
}

export function isApplicationErrorLike(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "statusCode" in error &&
      "code" in error,
  );
}

export const brandingVirtualProductService =
  new BrandingVirtualProductService();
