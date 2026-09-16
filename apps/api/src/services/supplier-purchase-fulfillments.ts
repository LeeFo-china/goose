import { Errors } from "@/errors/error-factory";
import { assertProcurementDestinationAccess } from "./procurement-destination-access";
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
import { resolveSignedStoredFileUrl } from "@/services/files/file-url-resolver";

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
  | "findReceiptAttachmentPreview"
>;

export type SupplierPurchaseFulfillmentsServiceDependencies = {
  access?: PurchaseOrderAccessPort;
  orders?: PurchaseOrderRepositoryPort;
  fulfillment?: FulfillmentRepositoryPort;
  signedUrlResolver?: typeof resolveSignedStoredFileUrl;
};

export class SupplierPurchaseFulfillmentsService {
  private readonly access: PurchaseOrderAccessPort;
  private readonly orders: PurchaseOrderRepositoryPort;
  private readonly fulfillment: FulfillmentRepositoryPort;
  private readonly signedUrlResolver: typeof resolveSignedStoredFileUrl;

  constructor(
    dependencies: SupplierPurchaseFulfillmentsServiceDependencies = {},
  ) {
    this.access = dependencies.access ?? supplierPurchaseOrderAccessService;
    this.orders = dependencies.orders ?? supplierPurchaseOrdersRepository;
    this.fulfillment = dependencies.fulfillment ??
      supplierPurchaseFulfillmentsRepository;
    this.signedUrlResolver = dependencies.signedUrlResolver ??
      resolveSignedStoredFileUrl;
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

  async authorizeDeliveryNoteUpload(auth: AuthContext, orderId: string) {
    return this.authorizeManage(auth, orderId);
  }

  async getReceiptAttachmentPreview(
    auth: AuthContext,
    orderId: string,
    receiptId: string,
    attachmentId: string,
  ) {
    const tenantId = await this.authorizeRead(auth, orderId);
    const attachment = await this.fulfillment.findReceiptAttachmentPreview({
      tenant_id: tenantId,
      order_id: orderId,
      receipt_id: receiptId,
      attachment_id: attachmentId,
    });
    if (!attachment) {
      throw Errors.business(
        404,
        "送货单据附件不存在",
        "SUPPLIER_PURCHASE_RECEIPT_ATTACHMENT_NOT_FOUND",
      );
    }
    const ttlSeconds = 600;
    return {
      url: await this.signedUrlResolver(
        attachment.file.object_key,
        { ttlSeconds },
      ),
      expires_at: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
      file: {
        file_id: attachment.file_id,
        file_name: attachment.file_name,
        mime_type: attachment.mime_type,
        size_bytes: attachment.size_bytes,
      },
    };
  }

  private async authorizeRead(auth: AuthContext, orderId: string) {
    const scope = await this.access.requireRead(auth);
    const order = await this.requireOrder(scope.tenantId, orderId);
    await assertProcurementDestinationAccess(auth, order, "read", this.access.assertProjectRead.bind(this.access));
    return scope.tenantId;
  }

  private async authorizeManage(auth: AuthContext, orderId: string) {
    const scope = await this.access.requireManage(auth);
    const order = await this.requireOrder(scope.tenantId, orderId);
    await assertProcurementDestinationAccess(auth, order, "manage", this.access.assertProjectUpdate.bind(this.access));
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
