import { Errors } from "@/errors/error-factory";
import {
  brandingAddonProductRepository,
  type BrandingAddonProductRecord,
  type UpdateBrandingAddonProductInput,
} from "@/repositories/branding-addon-products";
import type { BrandingAddonProductPatchInput } from "@/schema/branding-addon";
import { accessPolicyService } from "@/services/access-policy";
import type { AuthContext } from "@/services/authorization";
import { platformAuditLogService } from "@/services/platform-audit-logs";

const MANAGE_PERMISSION = "platform.branding_product.manage";

type ProductRepositoryPort = Pick<
  typeof brandingAddonProductRepository,
  "getProduct" | "updateProduct"
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
  accessPolicy?: AccessPolicyPort;
  audit?: AuditPort;
};

export class PlatformBrandingAddonProductService {
  private readonly repository: ProductRepositoryPort;
  private readonly accessPolicy: AccessPolicyPort;
  private readonly audit: AuditPort;

  constructor(
    dependencies: PlatformBrandingAddonProductServiceDependencies = {},
  ) {
    this.repository = dependencies.repository ??
      brandingAddonProductRepository;
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
    const updated = await this.updateProduct(
      buildUpdateInput(input, actor.employeeId),
    );
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
      metadata: { from: before, to: after },
    });

    return { product: after };
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

  private assertFinalPrice(
    current: BrandingAddonProductRecord,
    input: BrandingAddonProductPatchInput,
  ): void {
    const isEnabled = input.enabled ?? current.enabled;
    const amountFen = input.amount_fen ?? current.amount_fen;
    if (
      isEnabled &&
      (
        amountFen === null ||
        !Number.isSafeInteger(amountFen) ||
        amountFen <= 0
      )
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
