import { Errors } from "@/errors/error-factory";
import {
  supplierProductsRepository,
  type SupplierProductListInput,
} from "@/repositories/supplier-products";
import { accessPolicyService } from "@/services/access-policy";
import type { AuthContext } from "@/services/authorization";
import { SupabaseDB } from "@/utils/supabase";

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

  async createProduct(
    authContext: AuthContext,
    supplierId: string,
    productId: string,
    input: {
      product_code: string;
      name: string;
      category_id: string;
      brand_id: string;
      description?: string | null;
    },
    idempotencyKey: string,
  ) {
    const actor = this.requirePlatformActor(authContext);
    const { data, error } = await SupabaseDB.getAdminClient().rpc(
      "create_platform_supplier_product",
      {
        p_product_id: productId,
        p_supplier_id: supplierId,
        p_product_code: input.product_code,
        p_name: input.name,
        p_category_id: input.category_id,
        p_brand_id: input.brand_id,
        p_description: input.description ?? null,
        p_actor_user_id: actor.authUserId,
        p_actor_employee_id: actor.employeeId,
        p_idempotency_key: idempotencyKey,
      },
    );
    if (error) throw Errors.dbError("创建平台供应商商品失败", error);
    return data;
  }

  private requirePlatform(authContext: AuthContext): void {
    const isPlatformIdentity =
      authContext.isPlatformStaff || authContext.isPlatformAdmin;
    if (authContext.tenantId !== null || !isPlatformIdentity) {
      throw Errors.forbidden();
    }
    this.accessPolicy.assertPermission(authContext, PLATFORM_PERMISSION);
  }

  private requirePlatformActor(authContext: AuthContext) {
    this.requirePlatform(authContext);
    if (!authContext.employeeId || !authContext.authUserId) {
      throw Errors.forbidden();
    }
    return {
      authUserId: authContext.authUserId,
      employeeId: authContext.employeeId,
    };
  }
}

export const platformSupplierProductsService =
  new PlatformSupplierProductsService();
