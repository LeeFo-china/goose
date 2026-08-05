import { Errors } from "@/errors/error-factory";
import {
  platformBillingRechargeRepository,
  type PlatformRechargeProductCreateRecordInput,
  type PlatformRechargeProductUpdateRecordInput,
} from "@/repositories/platform-billing-recharge";
import type {
  PlatformRechargeOrderCompensateInput,
  PlatformRechargeOrderQuery,
  PlatformRechargeProductCreateInput,
  PlatformRechargeProductQuery,
  PlatformRechargeProductUpdateInput,
} from "@/schema/platform-billing-recharge";
import type { AuthContext } from "@/services/authorization";
import {
  PlatformBillingRechargeCompensationService,
  type PlatformBillingRechargeCompensationServiceDependencies,
} from "@/services/platform-billing-recharge-compensation";

type PlatformBillingRechargeRepositoryPort = Pick<
  typeof platformBillingRechargeRepository,
  | "listProducts"
  | "createProduct"
  | "updateProduct"
  | "upsertProducts"
  | "listOrders"
  | "findOrderById"
  | "listNotificationsByOrderId"
  | "listAuditLogsByOrderId"
>;

type CompensationServicePort = Pick<
  PlatformBillingRechargeCompensationService,
  "compensateWechatOrder"
>;

type PlatformBillingRechargeServiceDependencies =
  PlatformBillingRechargeCompensationServiceDependencies & {
    repository?: PlatformBillingRechargeRepositoryPort;
    compensationService?: CompensationServicePort;
  };

const PRODUCT_MANAGE_PERMISSION = "platform.billing.recharge_product.manage";
const BILLING_READ_PERMISSION = "platform.billing.read";
const RECOMMENDED_PRODUCT_TEMPLATE = "recommended_v1";
const RECOMMENDED_RECHARGE_PRODUCTS = [
  {
    code: "credit_1000",
    title: "体验包",
    amount_fen: 10000,
    credits: 1000,
    bonus_credits: 0,
    sort_order: 10,
    metadata: { template: RECOMMENDED_PRODUCT_TEMPLATE },
  },
  {
    code: "credit_3000",
    title: "标准包",
    amount_fen: 30000,
    credits: 3000,
    bonus_credits: 300,
    sort_order: 20,
    metadata: { badge: "推荐", template: RECOMMENDED_PRODUCT_TEMPLATE },
  },
  {
    code: "credit_5000",
    title: "成长包",
    amount_fen: 50000,
    credits: 5000,
    bonus_credits: 800,
    sort_order: 30,
    metadata: { template: RECOMMENDED_PRODUCT_TEMPLATE },
  },
  {
    code: "credit_10000",
    title: "专业包",
    amount_fen: 100000,
    credits: 10000,
    bonus_credits: 2000,
    sort_order: 40,
    metadata: { template: RECOMMENDED_PRODUCT_TEMPLATE },
  },
  {
    code: "credit_30000",
    title: "企业包",
    amount_fen: 300000,
    credits: 30000,
    bonus_credits: 8000,
    sort_order: 50,
    metadata: { template: RECOMMENDED_PRODUCT_TEMPLATE },
  },
] as const;

export class PlatformBillingRechargeService {
  private readonly repository: PlatformBillingRechargeRepositoryPort;
  private readonly compensationService: CompensationServicePort;

  constructor(dependencies: PlatformBillingRechargeServiceDependencies = {}) {
    this.repository = dependencies.repository ?? platformBillingRechargeRepository;
    this.compensationService = dependencies.compensationService ??
      new PlatformBillingRechargeCompensationService({
        ...dependencies,
        repository: this.repository,
      });
  }

  async listProducts(
    authContext: AuthContext,
    query: PlatformRechargeProductQuery,
  ) {
    this.assertPlatformPermission(authContext, BILLING_READ_PERMISSION);
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

  async applyRecommendedProducts(authContext: AuthContext) {
    this.assertCanManageProducts(authContext);
    const employeeId = authContext.employeeId;
    if (!employeeId) {
      throw Errors.forbidden();
    }

    const list = await this.repository.upsertProducts(
      RECOMMENDED_RECHARGE_PRODUCTS.map((item) => ({
        ...item,
        enabled: true,
        created_by_employee_id: employeeId,
        updated_by_employee_id: employeeId,
      } satisfies PlatformRechargeProductCreateRecordInput)),
    );

    return {
      template: RECOMMENDED_PRODUCT_TEMPLATE,
      applied_count: list.length,
      list,
    };
  }

  async listOrders(
    authContext: AuthContext,
    query: PlatformRechargeOrderQuery,
  ) {
    this.assertPlatformPermission(authContext, BILLING_READ_PERMISSION);
    return this.repository.listOrders({
      page: query.page,
      pageSize: query.pageSize,
      status: query.status,
      keyword: query.keyword,
    });
  }

  async getOrderDetail(authContext: AuthContext, orderId: string) {
    this.assertPlatformPermission(authContext, BILLING_READ_PERMISSION);
    const order = await this.repository.findOrderById(orderId);
    if (!order) {
      throw Errors.business(
        404,
        "积分充值订单不存在",
        "BILLING_RECHARGE_ORDER_NOT_FOUND",
      );
    }

    const [notifications, auditLogs] = await Promise.all([
      this.repository.listNotificationsByOrderId(orderId),
      this.repository.listAuditLogsByOrderId(orderId),
    ]);

    return {
      order,
      notifications,
      audit_logs: auditLogs,
    };
  }

  async compensateWechatOrder(
    authContext: AuthContext,
    orderId: string,
    input: PlatformRechargeOrderCompensateInput = {},
  ) {
    this.assertCanManageProducts(authContext);
    return this.compensationService.compensateWechatOrder(
      authContext,
      orderId,
      input,
    );
  }

  private assertCanManageProducts(authContext: AuthContext) {
    this.assertPlatformPermission(authContext, PRODUCT_MANAGE_PERMISSION);
  }

  private assertPlatformPermission(authContext: AuthContext, permissionCode: string) {
    const isPlatformIdentity =
      authContext.isPlatformStaff || authContext.isPlatformAdmin;
    if (authContext.tenantId !== null || !isPlatformIdentity) {
      throw Errors.forbidden();
    }
    if (!this.hasPermission(authContext, permissionCode)) {
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
