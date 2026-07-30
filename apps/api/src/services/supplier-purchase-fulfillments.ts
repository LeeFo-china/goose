import { Errors } from "@/errors/error-factory";
import { supplierPurchaseFulfillmentsRepository } from "@/repositories/supplier-purchase-fulfillments";
import { supplierPurchaseOrdersRepository } from "@/repositories/supplier-purchase-orders";
import type {
  SupplierPurchaseOrderFulfillmentConfirmInput,
  SupplierPurchaseOrderFulfillmentEventListQuery,
  SupplierPurchaseOrderReceiptCreateInput,
  SupplierPurchaseOrderShipmentCreateInput,
} from "@/schema/supplier-purchase-orders";
import type { AuthContext } from "@/services/authorization";
import { supplierPurchaseOrderAccessService } from "@/services/supplier-purchase-order-access";

type PurchaseOrderAccessPort = Pick<
  typeof supplierPurchaseOrderAccessService,
  | "requireRead"
  | "requireManage"
  | "assertProjectRead"
  | "assertProjectUpdate"
>;
type PurchaseOrderRepositoryPort = Pick<
  typeof supplierPurchaseOrdersRepository,
  "findOrder"
>;
type FulfillmentRepositoryPort = Pick<
  typeof supplierPurchaseFulfillmentsRepository,
  | "getDetail"
  | "listShipments"
  | "listReceipts"
  | "confirm"
  | "createShipment"
  | "createReceipt"
>;

export type SupplierPurchaseFulfillmentsServiceDependencies = {
  access?: PurchaseOrderAccessPort;
  orders?: PurchaseOrderRepositoryPort;
  fulfillment?: FulfillmentRepositoryPort;
};

export class SupplierPurchaseFulfillmentsService {
  private readonly access: PurchaseOrderAccessPort;
  private readonly orders: PurchaseOrderRepositoryPort;
  private readonly fulfillment: FulfillmentRepositoryPort;

  constructor(
    dependencies: SupplierPurchaseFulfillmentsServiceDependencies = {},
  ) {
    this.access = dependencies.access ?? supplierPurchaseOrderAccessService;
    this.orders = dependencies.orders ?? supplierPurchaseOrdersRepository;
    this.fulfillment = dependencies.fulfillment ??
      supplierPurchaseFulfillmentsRepository;
  }

  async getDetail(auth: AuthContext, orderId: string) {
    const tenantId = await this.authorizeRead(auth, orderId);
    return this.fulfillment.getDetail({
      tenant_id: tenantId,
      order_id: orderId,
    });
  }

  async listShipments(
    auth: AuthContext,
    orderId: string,
    query: SupplierPurchaseOrderFulfillmentEventListQuery,
  ) {
    const tenantId = await this.authorizeRead(auth, orderId);
    return this.fulfillment.listShipments({
      tenant_id: tenantId,
      order_id: orderId,
      page: query.page,
      pageSize: query.pageSize,
    });
  }

  async listReceipts(
    auth: AuthContext,
    orderId: string,
    query: SupplierPurchaseOrderFulfillmentEventListQuery,
  ) {
    const tenantId = await this.authorizeRead(auth, orderId);
    return this.fulfillment.listReceipts({
      tenant_id: tenantId,
      order_id: orderId,
      page: query.page,
      pageSize: query.pageSize,
    });
  }

  async confirm(
    auth: AuthContext,
    orderId: string,
    input: SupplierPurchaseOrderFulfillmentConfirmInput,
    idempotencyKey: string,
  ) {
    const scope = await this.authorizeManage(auth, orderId);
    return this.fulfillment.confirm({
      tenant_id: scope.tenantId,
      order_id: orderId,
      ...input,
      actor_user_id: scope.authUserId,
      actor_employee_id: scope.employeeId,
      idempotency_key: idempotencyKey,
    });
  }

  async createShipment(
    auth: AuthContext,
    orderId: string,
    input: SupplierPurchaseOrderShipmentCreateInput,
    idempotencyKey: string,
  ) {
    const scope = await this.authorizeManage(auth, orderId);
    return this.fulfillment.createShipment({
      tenant_id: scope.tenantId,
      order_id: orderId,
      ...input,
      actor_user_id: scope.authUserId,
      actor_employee_id: scope.employeeId,
      idempotency_key: idempotencyKey,
    });
  }

  async createReceipt(
    auth: AuthContext,
    orderId: string,
    input: SupplierPurchaseOrderReceiptCreateInput,
    idempotencyKey: string,
  ) {
    const scope = await this.authorizeManage(auth, orderId);
    return this.fulfillment.createReceipt({
      tenant_id: scope.tenantId,
      order_id: orderId,
      ...input,
      actor_user_id: scope.authUserId,
      actor_employee_id: scope.employeeId,
      idempotency_key: idempotencyKey,
    });
  }

  private async authorizeRead(auth: AuthContext, orderId: string) {
    const scope = await this.access.requireRead(auth);
    const order = await this.requireOrder(scope.tenantId, orderId);
    await this.access.assertProjectRead(auth, order.project_id);
    return scope.tenantId;
  }

  private async authorizeManage(auth: AuthContext, orderId: string) {
    const scope = await this.access.requireManage(auth);
    const order = await this.requireOrder(scope.tenantId, orderId);
    await this.access.assertProjectUpdate(auth, order.project_id);
    return scope;
  }

  private async requireOrder(tenantId: string, orderId: string) {
    const order = await this.orders.findOrder(tenantId, orderId);
    if (order) return order;
    throw Errors.business(
      404,
      "供应商采购单不存在",
      "SUPPLIER_PURCHASE_ORDER_NOT_FOUND",
    );
  }
}

export const supplierPurchaseFulfillmentsService =
  new SupplierPurchaseFulfillmentsService();
