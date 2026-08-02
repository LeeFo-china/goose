import { Errors } from "@/errors/error-factory";
import {
  brandingAddonProductRepository,
  type BrandingAddonProductRecord,
} from "@/repositories/branding-addon-products";
import {
  brandingVirtualProductRepository,
} from "@/repositories/branding-virtual-products";
import type { BrandingAddonProductPatchInput } from "@/schema/branding-addon";
import { accessPolicyService } from "@/services/access-policy";
import type { AuthContext } from "@/services/authorization";
import { MAX_POSTGRES_INTEGER_FEN } from "@/services/branding-addon-contracts";
import {
  brandingVirtualProductManagementService,
} from "@/services/branding-virtual-product-management";
import {
  isApplicationErrorLike,
} from "@/services/branding-virtual-products";
import { platformAuditLogService } from "@/services/platform-audit-logs";

const MANAGE_PERMISSION = "platform.branding_product.manage";

type ProductRepositoryPort = Pick<
  typeof brandingAddonProductRepository,
  "getProduct"
>;
type VirtualProductRepositoryPort = Pick<
  typeof brandingVirtualProductRepository,
  "manageConfiguration"
>;
type AccessPolicyPort = Pick<typeof accessPolicyService, "assertPermission">;
type AuditPort = Pick<typeof platformAuditLogService, "recordBestEffort">;
type ManagementServicePort = Pick<
  typeof brandingVirtualProductManagementService,
  "getConfiguration" | "validateConfiguration"
>;

export type PlatformBrandingAddonProductServiceDependencies = {
  repository?: ProductRepositoryPort;
  virtualProductRepository?: VirtualProductRepositoryPort;
  accessPolicy?: AccessPolicyPort;
  audit?: AuditPort;
  managementService?: ManagementServicePort;
};

export class PlatformBrandingAddonProductService {
  private readonly repository: ProductRepositoryPort;
  private readonly virtualProductRepository: VirtualProductRepositoryPort;
  private readonly accessPolicy: AccessPolicyPort;
  private readonly audit: AuditPort;
  private readonly managementService: ManagementServicePort;

  constructor(dependencies: PlatformBrandingAddonProductServiceDependencies = {}) {
    this.repository = dependencies.repository ?? brandingAddonProductRepository;
    this.virtualProductRepository = dependencies.virtualProductRepository ??
      brandingVirtualProductRepository;
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

    let result: Awaited<ReturnType<VirtualProductRepositoryPort["manageConfiguration"]>>;
    try {
      result = await this.virtualProductRepository.manageConfiguration({
        expectedProductVersion: input.version,
        productPatch: buildProductPatch(input),
        virtualProductPatch: {},
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
      },
    });
    return {
      product: after,
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
  return {
    ...(input.name === undefined ? {} : { name: input.name }),
    ...(input.amount_fen === undefined ? {} : { amount_fen: input.amount_fen }),
    ...(input.purchase_notes === undefined ? {} : { purchase_notes: input.purchase_notes }),
    ...(input.enabled === undefined ? {} : { enabled: input.enabled }),
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
