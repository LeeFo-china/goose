import { Errors } from "@/errors/error-factory";
import {
  platformBillingRechargeRepository,
  type PlatformRechargeProductCreateRecordInput,
  type PlatformRechargeProductUpdateRecordInput,
} from "@/repositories/platform-billing-recharge";
import type {
  PlatformRechargeOrderQuery,
  PlatformRechargeProductCreateInput,
  PlatformRechargeProductQuery,
  PlatformRechargeProductUpdateInput,
} from "@/schema/platform-billing-recharge";
import type { AuthContext } from "@/services/authorization";

type PlatformBillingRechargeRepositoryPort = Pick<
  typeof platformBillingRechargeRepository,
  "listProducts" | "createProduct" | "updateProduct" | "listOrders"
>;

type PlatformBillingRechargeServiceDependencies = {
  repository?: PlatformBillingRechargeRepositoryPort;
};

const PRODUCT_MANAGE_PERMISSION = "platform.billing.recharge_product.manage";

export class PlatformBillingRechargeService {
  private readonly repository: PlatformBillingRechargeRepositoryPort;

  constructor(dependencies: PlatformBillingRechargeServiceDependencies = {}) {
    this.repository = dependencies.repository ?? platformBillingRechargeRepository;
  }

  async listProducts(
    authContext: AuthContext,
    query: PlatformRechargeProductQuery,
  ) {
    this.assertPlatformAdmin(authContext);
    return this.repository.listProducts({
      page: query.page,
      pageSize: query.pageSize,
      enabled: query.enabled,
    });
  }

  async createProduct(
    authContext: AuthContext,
    input: PlatformRechargeProductCreateInput,
  ) {
    this.assertCanManageProducts(authContext);
    if (!authContext.employeeId) {
      throw Errors.forbidden();
    }

    return this.repository.createProduct({
      ...input,
      created_by_employee_id: authContext.employeeId,
      updated_by_employee_id: authContext.employeeId,
    } satisfies PlatformRechargeProductCreateRecordInput);
  }

  async updateProduct(
    authContext: AuthContext,
    productId: string,
    input: PlatformRechargeProductUpdateInput,
  ) {
    this.assertCanManageProducts(authContext);
    if (!authContext.employeeId) {
      throw Errors.forbidden();
    }

    return this.repository.updateProduct(productId, {
      ...input,
      updated_by_employee_id: authContext.employeeId,
    } satisfies PlatformRechargeProductUpdateRecordInput);
  }

  async listOrders(
    authContext: AuthContext,
    query: PlatformRechargeOrderQuery,
  ) {
    this.assertPlatformAdmin(authContext);
    return this.repository.listOrders({
      page: query.page,
      pageSize: query.pageSize,
      status: query.status,
      keyword: query.keyword,
    });
  }

  private assertCanManageProducts(authContext: AuthContext) {
    this.assertPlatformAdmin(authContext);
    if (!this.hasPermission(authContext, PRODUCT_MANAGE_PERMISSION)) {
      throw Errors.forbidden();
    }
  }

  private assertPlatformAdmin(authContext: AuthContext) {
    if (!authContext.isPlatformAdmin) {
      throw Errors.forbidden();
    }
  }

  private hasPermission(authContext: AuthContext, permissionCode: string) {
    return authContext.permissions.some((permission) =>
      permission.code === permissionCode
    );
  }
}

export const platformBillingRechargeService =
  new PlatformBillingRechargeService();
