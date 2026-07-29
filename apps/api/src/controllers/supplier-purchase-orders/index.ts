import { TenantBaseController } from "@/controllers/TenantBaseController";
import { requireSupplierIdempotencyKey } from "@/controllers/supplier-command-http";
import { Errors } from "@/errors/error-factory";
import {
  SupplierPurchaseOrderCancelSchema,
  SupplierPurchaseOrderCatalogQuerySchema,
  SupplierPurchaseOrderDraftSchema,
  SupplierPurchaseOrderItemListQuerySchema,
  SupplierPurchaseOrderListQuerySchema,
  SupplierPurchaseOrderOptionQuerySchema,
  SupplierPurchaseOrderParamSchema,
  SupplierPurchaseOrderSubmitSchema,
} from "@/schema/supplier-purchase-orders";
import { supplierPurchaseOrdersService } from "@/services/supplier-purchase-orders";
import { Get, Post } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import type { FastifyRequest } from "fastify";
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

  private parse<Schema extends z.ZodTypeAny>(
    schema: Schema,
    input: unknown,
  ): z.infer<Schema> {
    const result = schema.safeParse(input || {});
    if (!result.success) throw Errors.fromZod(result.error);
    return result.data;
  }
}

export default new SupplierPurchaseOrdersController();
