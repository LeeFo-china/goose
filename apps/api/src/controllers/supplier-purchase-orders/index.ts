import { TenantBaseController } from "@/controllers/TenantBaseController";
import { requireSupplierIdempotencyKey } from "@/controllers/supplier-command-http";
import { Errors } from "@/errors/error-factory";
import {
  SupplierPurchaseOrderCancelSchema,
  SupplierPurchaseOrderCatalogQuerySchema,
  SupplierPurchaseOrderDraftSchema,
  SupplierPurchaseOrderFulfillmentConfirmSchema,
  SupplierPurchaseOrderFulfillmentEventListQuerySchema,
  SupplierPurchaseOrderItemListQuerySchema,
  SupplierPurchaseOrderListQuerySchema,
  SupplierPurchaseOrderOptionQuerySchema,
  SupplierPurchaseOrderParamSchema,
  SupplierPurchaseOrderReceiptCreateSchema,
  SupplierPurchaseOrderShipmentCreateSchema,
  SupplierPurchaseOrderSubmitSchema,
} from "@/schema/supplier-purchase-orders";
import {
  SupplierPurchaseOrderPublicConfirmViewSchema,
  SupplierPurchaseOrderPublicTokenParamSchema,
  SupplierPurchaseOrderShareLinkCreateSchema,
} from "@/schema/supplier-purchase-order-sharing";
import { supplierPurchaseFulfillmentsService } from "@/services/supplier-purchase-fulfillments";
import { supplierPurchaseOrderSharingService } from
  "@/services/supplier-purchase-order-sharing";
import { supplierPurchaseOrdersService } from "@/services/supplier-purchase-orders";
import { Get, Post } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { z } from "zod";

class SupplierPurchaseOrdersController extends TenantBaseController {
  constructor() {
    super("supplier-purchase-orders");
  }

  @Get("/supplier-purchase-orders")
  async listOrders(request: FastifyRequest) {
    const auth = await this.getRequiredTenantContext(request);
    const query = this.parse(
      SupplierPurchaseOrderListQuerySchema,
      request.query,
    );
    return ResponseHandler.success(
      await supplierPurchaseOrdersService.listOrders(auth, query),
    );
  }

  @Get("/supplier-purchase-orders/:id")
  async getOrder(request: FastifyRequest) {
    const auth = await this.getRequiredTenantContext(request);
    const { id } = this.parse(
      SupplierPurchaseOrderParamSchema,
      request.params,
    );
    return ResponseHandler.success(
      await supplierPurchaseOrdersService.getOrder(auth, id),
    );
  }

  @Get("/supplier-purchase-orders/:id/items")
  async listItems(request: FastifyRequest) {
    const auth = await this.getRequiredTenantContext(request);
    const { id } = this.parse(
      SupplierPurchaseOrderParamSchema,
      request.params,
    );
    const query = this.parse(
      SupplierPurchaseOrderItemListQuerySchema,
      request.query,
    );
    return ResponseHandler.success(
      await supplierPurchaseOrdersService.listItems(auth, id, query),
    );
  }

  @Get("/supplier-purchase-orders/:id/financial-summary")
  async getFinancialSummary(request: FastifyRequest) {
    const auth = await this.getRequiredTenantContext(request);
    const { id } = this.parse(
      SupplierPurchaseOrderParamSchema,
      request.params,
    );
    return ResponseHandler.success(
      await supplierPurchaseOrdersService.getFinancialSummary(auth, id),
    );
  }

  @Get("/supplier-purchase-orders/:id/print-preview")
  async getPrintPreview(request: FastifyRequest) {
    const auth = await this.getRequiredTenantContext(request);
    const { id } = this.parse(
      SupplierPurchaseOrderParamSchema,
      request.params,
    );
    return ResponseHandler.success(
      await supplierPurchaseOrderSharingService.getEmployeePrintPreview(
        auth,
        id,
      ),
    );
  }

  @Get("/supplier-purchase-orders/:id/export.pdf")
  async exportPdf(request: FastifyRequest, reply: FastifyReply) {
    const auth = await this.getRequiredTenantContext(request);
    const { id } = this.parse(
      SupplierPurchaseOrderParamSchema,
      request.params,
    );
    const file = await supplierPurchaseOrderSharingService
      .exportEmployeeOrderPdf(auth, id);
    return sendAttachment(reply, file);
  }

  @Get("/supplier-purchase-orders/:id/export.xlsx")
  async exportXlsx(request: FastifyRequest, reply: FastifyReply) {
    const auth = await this.getRequiredTenantContext(request);
    const { id } = this.parse(
      SupplierPurchaseOrderParamSchema,
      request.params,
    );
    const file = await supplierPurchaseOrderSharingService
      .exportEmployeeOrderXlsx(auth, id);
    return sendAttachment(reply, file);
  }

  @Get("/supplier-purchase-orders/:id/fulfillment")
  async getFulfillment(request: FastifyRequest) {
    const auth = await this.getRequiredTenantContext(request);
    const { id } = this.parse(
      SupplierPurchaseOrderParamSchema,
      request.params,
    );
    return ResponseHandler.success(
      await supplierPurchaseFulfillmentsService.getDetail(auth, id),
    );
  }

  @Get("/supplier-purchase-orders/:id/shipments")
  async listFulfillmentShipments(request: FastifyRequest) {
    const auth = await this.getRequiredTenantContext(request);
    const { id } = this.parse(
      SupplierPurchaseOrderParamSchema,
      request.params,
    );
    const query = this.parse(
      SupplierPurchaseOrderFulfillmentEventListQuerySchema,
      request.query,
    );
    return ResponseHandler.success(
      await supplierPurchaseFulfillmentsService.listShipments(
        auth,
        id,
        query,
      ),
    );
  }

  @Get("/supplier-purchase-orders/:id/receipts")
  async listFulfillmentReceipts(request: FastifyRequest) {
    const auth = await this.getRequiredTenantContext(request);
    const { id } = this.parse(
      SupplierPurchaseOrderParamSchema,
      request.params,
    );
    const query = this.parse(
      SupplierPurchaseOrderFulfillmentEventListQuerySchema,
      request.query,
    );
    return ResponseHandler.success(
      await supplierPurchaseFulfillmentsService.listReceipts(
        auth,
        id,
        query,
      ),
    );
  }

  @Get("/supplier-purchase-order-catalog")
  async listCatalog(request: FastifyRequest) {
    const auth = await this.getRequiredTenantContext(request);
    const query = this.parse(
      SupplierPurchaseOrderCatalogQuerySchema,
      request.query,
    );
    return ResponseHandler.success(
      await supplierPurchaseOrdersService.listCatalog(auth, query),
    );
  }

  @Get("/supplier-purchase-order-project-options")
  async listProjectOptions(request: FastifyRequest) {
    const auth = await this.getRequiredTenantContext(request);
    const query = this.parse(
      SupplierPurchaseOrderOptionQuerySchema,
      request.query,
    );
    return ResponseHandler.success(
      await supplierPurchaseOrdersService.listProjectOptions(auth, query),
    );
  }

  @Get("/supplier-purchase-order-supplier-options")
  async listSupplierOptions(request: FastifyRequest) {
    const auth = await this.getRequiredTenantContext(request);
    const query = this.parse(
      SupplierPurchaseOrderOptionQuerySchema,
      request.query,
    );
    return ResponseHandler.success(
      await supplierPurchaseOrdersService.listSupplierOptions(auth, query),
    );
  }

  @Post("/supplier-purchase-orders/:id/save-draft")
  async saveDraft(request: FastifyRequest) {
    const auth = await this.getRequiredTenantContext(request);
    const key = requireSupplierIdempotencyKey(request);
    const { id } = this.parse(
      SupplierPurchaseOrderParamSchema,
      request.params,
    );
    const input = this.parse(
      SupplierPurchaseOrderDraftSchema,
      request.body,
    );
    return ResponseHandler.success(
      await supplierPurchaseOrdersService.saveDraft(
        auth,
        id,
        input,
        key,
      ),
    );
  }

  @Post("/supplier-purchase-orders/:id/share-link")
  async createShareLink(request: FastifyRequest) {
    const auth = await this.getRequiredTenantContext(request);
    const key = requireSupplierIdempotencyKey(request);
    const { id } = this.parse(
      SupplierPurchaseOrderParamSchema,
      request.params,
    );
    const input = this.parse(
      SupplierPurchaseOrderShareLinkCreateSchema,
      request.body,
    );
    return ResponseHandler.success(
      await supplierPurchaseOrderSharingService.createShareLink(
        auth,
        id,
        input,
        key,
      ),
    );
  }

  @Get("/public/supplier-purchase-orders/:token", {
    tenantServiceAccess: "public_or_callback",
  })
  async getPublicOrder(request: FastifyRequest) {
    const { token } = this.parse(
      SupplierPurchaseOrderPublicTokenParamSchema,
      request.params,
    );
    return ResponseHandler.success(
      await supplierPurchaseOrderSharingService.getPublicOrder(token),
    );
  }

  @Post("/public/supplier-purchase-orders/:token/confirm-view", {
    tenantServiceAccess: "public_or_callback",
  })
  async confirmPublicView(request: FastifyRequest) {
    requireSupplierIdempotencyKey(request);
    const { token } = this.parse(
      SupplierPurchaseOrderPublicTokenParamSchema,
      request.params,
    );
    const input = this.parse(
      SupplierPurchaseOrderPublicConfirmViewSchema,
      request.body,
    );
    return ResponseHandler.success(
      await supplierPurchaseOrderSharingService.confirmPublicView(
        token,
        input,
      ),
    );
  }

  @Get("/public/supplier-purchase-orders/:token/print-preview", {
    tenantServiceAccess: "public_or_callback",
  })
  async getPublicPrintPreview(request: FastifyRequest) {
    const { token } = this.parse(
      SupplierPurchaseOrderPublicTokenParamSchema,
      request.params,
    );
    return ResponseHandler.success(
      await supplierPurchaseOrderSharingService.getPublicPrintPreview(token),
    );
  }

  @Get("/public/supplier-purchase-orders/:token/export.pdf", {
    tenantServiceAccess: "public_or_callback",
  })
  async exportPublicPdf(request: FastifyRequest, reply: FastifyReply) {
    const { token } = this.parse(
      SupplierPurchaseOrderPublicTokenParamSchema,
      request.params,
    );
    const file = await supplierPurchaseOrderSharingService
      .exportPublicOrderPdf(token);
    return sendAttachment(reply, file);
  }

  @Get("/public/supplier-purchase-orders/:token/export.xlsx", {
    tenantServiceAccess: "public_or_callback",
  })
  async exportPublicXlsx(request: FastifyRequest, reply: FastifyReply) {
    const { token } = this.parse(
      SupplierPurchaseOrderPublicTokenParamSchema,
      request.params,
    );
    const file = await supplierPurchaseOrderSharingService
      .exportPublicOrderXlsx(token);
    return sendAttachment(reply, file);
  }

  @Post("/supplier-purchase-orders/:id/submit")
  async submit(request: FastifyRequest) {
    const auth = await this.getRequiredTenantContext(request);
    const key = requireSupplierIdempotencyKey(request);
    const { id } = this.parse(
      SupplierPurchaseOrderParamSchema,
      request.params,
    );
    const input = this.parse(
      SupplierPurchaseOrderSubmitSchema,
      request.body,
    );
    return ResponseHandler.success(
      await supplierPurchaseOrdersService.submit(auth, id, input, key),
    );
  }

  @Post("/supplier-purchase-orders/:id/cancel")
  async cancel(request: FastifyRequest) {
    const auth = await this.getRequiredTenantContext(request);
    const key = requireSupplierIdempotencyKey(request);
    const { id } = this.parse(
      SupplierPurchaseOrderParamSchema,
      request.params,
    );
    const input = this.parse(
      SupplierPurchaseOrderCancelSchema,
      request.body,
    );
    return ResponseHandler.success(
      await supplierPurchaseOrdersService.cancel(auth, id, input, key),
    );
  }

  @Post("/supplier-purchase-orders/:id/confirm-fulfillment")
  async confirmFulfillment(request: FastifyRequest) {
    const auth = await this.getRequiredTenantContext(request);
    const key = requireSupplierIdempotencyKey(request);
    const { id } = this.parse(
      SupplierPurchaseOrderParamSchema,
      request.params,
    );
    const input = this.parse(
      SupplierPurchaseOrderFulfillmentConfirmSchema,
      request.body,
    );
    return ResponseHandler.success(
      await supplierPurchaseFulfillmentsService.confirm(
        auth,
        id,
        input,
        key,
      ),
    );
  }

  @Post("/supplier-purchase-orders/:id/shipments")
  async createFulfillmentShipment(request: FastifyRequest) {
    const auth = await this.getRequiredTenantContext(request);
    const key = requireSupplierIdempotencyKey(request);
    const { id } = this.parse(
      SupplierPurchaseOrderParamSchema,
      request.params,
    );
    const input = this.parse(
      SupplierPurchaseOrderShipmentCreateSchema,
      request.body,
    );
    return ResponseHandler.success(
      await supplierPurchaseFulfillmentsService.createShipment(
        auth,
        id,
        input,
        key,
      ),
    );
  }

  @Post("/supplier-purchase-orders/:id/receipts")
  async createFulfillmentReceipt(request: FastifyRequest) {
    const auth = await this.getRequiredTenantContext(request);
    const key = requireSupplierIdempotencyKey(request);
    const { id } = this.parse(
      SupplierPurchaseOrderParamSchema,
      request.params,
    );
    const input = this.parse(
      SupplierPurchaseOrderReceiptCreateSchema,
      request.body,
    );
    return ResponseHandler.success(
      await supplierPurchaseFulfillmentsService.createReceipt(
        auth,
        id,
        input,
        key,
      ),
    );
  }

  private parse<Schema extends z.ZodTypeAny>(
    schema: Schema,
    input: unknown,
  ): z.infer<Schema> {
    const result = schema.safeParse(input || {});
    if (!result.success) throw Errors.fromZod(result.error);
    return result.data;
  }
}

function sendAttachment(
  reply: FastifyReply,
  file: { content_type: string; filename: string; content: Buffer },
) {
  return reply
    .header("content-type", file.content_type)
    .header(
      "content-disposition",
      `attachment; filename="${encodeURIComponent(file.filename)}"`,
    )
    .send(file.content);
}

export default new SupplierPurchaseOrdersController();
