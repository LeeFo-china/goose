import { Errors } from "@/errors/error-factory";
import {
  supplierProductsRepository,
  type SupplierProductListInput,
} from "@/repositories/supplier-products";
import { accessPolicyService } from "@/services/access-policy";
import type { AuthContext } from "@/services/authorization";

const PLATFORM_PERMISSION = "platform.supplier-product.manage";

type ProductRepositoryPort = Pick<
  typeof supplierProductsRepository,
  "listPlatformProducts" | "findProduct"
>;

type AccessPolicyPort = Pick<
  typeof accessPolicyService,
  "assertPermission"
>;

export type PlatformSupplierProductsServiceDependencies = {
  repository?: ProductRepositoryPort;
  accessPolicy?: AccessPolicyPort;
};

export class PlatformSupplierProductsService {
  private readonly repository: ProductRepositoryPort;
  private readonly accessPolicy: AccessPolicyPort;

  constructor(
    dependencies: PlatformSupplierProductsServiceDependencies = {},
  ) {
    this.repository = dependencies.repository ?? supplierProductsRepository;
    this.accessPolicy = dependencies.accessPolicy ?? accessPolicyService;
  }

  listProducts(
    authContext: AuthContext,
    supplierId: string,
    query: Omit<SupplierProductListInput, "supplier_id" | "tenant_id">,
  ) {
    this.requirePlatform(authContext);
    return this.repository.listPlatformProducts({
      ...query,
      supplier_id: supplierId,
      tenant_id: "",
    });
  }

  async getProduct(
    authContext: AuthContext,
    supplierId: string,
    productId: string,
  ) {
    this.requirePlatform(authContext);
    const product = await this.repository.findProduct(supplierId, productId);
    if (!product) {
      throw Errors.business(
        404,
        "供应商商品不存在",
        "SUPPLIER_PRODUCT_NOT_FOUND",
      );
    }
    return product;
  }

  private requirePlatform(authContext: AuthContext): void {
    const isPlatformIdentity =
      authContext.isPlatformStaff || authContext.isPlatformAdmin;
    if (authContext.tenantId !== null || !isPlatformIdentity) {
      throw Errors.forbidden();
    }
    this.accessPolicy.assertPermission(authContext, PLATFORM_PERMISSION);
  }
}

export const platformSupplierProductsService =
  new PlatformSupplierProductsService();
