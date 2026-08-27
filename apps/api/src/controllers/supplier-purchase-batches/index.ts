import { TenantBaseController } from "@/controllers/TenantBaseController";
import { requireSupplierIdempotencyKey } from "@/controllers/supplier-command-http";
import { Errors } from "@/errors/error-factory";
import {
  SupplierPurchaseBatchCancelSchema,
  SupplierPurchaseBatchCatalogQuerySchema,
  SupplierPurchaseBatchCostCategoryQuerySchema,
  SupplierPurchaseBatchDraftSchema,
  SupplierPurchaseBatchItemListQuerySchema,
  SupplierPurchaseBatchListQuerySchema,
  SupplierPurchaseBatchOrderListQuerySchema,
  SupplierPurchaseBatchParamSchema,
  SupplierPurchaseBatchProjectOptionQuerySchema,
  SupplierPurchaseBatchRequisitionListQuerySchema,
  SupplierPurchaseBatchReviewSchema,
  SupplierPurchaseBatchSubmitSchema,
} from "@/schema/supplier-purchase-batches";
import { supplierPurchaseBatchesService } from "@/services/supplier-purchase-batches";
import { Get, Post } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import type { FastifyRequest } from "fastify";
import type { z } from "zod";

class SupplierPurchaseBatchesController extends TenantBaseController {
  constructor() {
    super("supplier-purchase-batches");
  }

  @Get("/supplier-purchase-batch-project-options")
  async listProjectOptions(request: FastifyRequest) {
    const auth = await this.getRequiredTenantContext(request);
    const query = this.parse(
      SupplierPurchaseBatchProjectOptionQuerySchema,
      request.query,
    );
    return ResponseHandler.success(
      await supplierPurchaseBatchesService.listProjectOptions(auth, query),
    );
  }

  @Get("/supplier-purchase-batch-cost-categories")
  async listCostCategories(request: FastifyRequest) {
    const auth = await this.getRequiredTenantContext(request);
    const query = this.parse(
      SupplierPurchaseBatchCostCategoryQuerySchema,
      request.query,
    );
    return ResponseHandler.success(
      await supplierPurchaseBatchesService.listCostCategories(auth, query),
    );
  }

  @Get("/supplier-purchase-batch-catalog")
  async listCatalog(request: FastifyRequest) {
    const auth = await this.getRequiredTenantContext(request);
    const query = this.parse(
      SupplierPurchaseBatchCatalogQuerySchema,
      request.query,
    );
    return ResponseHandler.success(
      await supplierPurchaseBatchesService.listCatalog(auth, query),
    );
  }

  @Get("/supplier-purchase-batches")
  async listBatches(request: FastifyRequest) {
    const auth = await this.getRequiredTenantContext(request);
    const query = this.parse(
      SupplierPurchaseBatchListQuerySchema,
      request.query,
    );
    return ResponseHandler.success(
      await supplierPurchaseBatchesService.listBatches(auth, query),
    );
  }

  @Get("/supplier-purchase-batches/:id")
  async getBatch(request: FastifyRequest) {
    const auth = await this.getRequiredTenantContext(request);
    const { id } = this.parse(SupplierPurchaseBatchParamSchema, request.params);
    return ResponseHandler.success(
      await supplierPurchaseBatchesService.getBatch(auth, id),
    );
  }

  @Get("/supplier-purchase-batches/:id/items")
  async listItems(request: FastifyRequest) {
    return this.listChild(request, SupplierPurchaseBatchItemListQuerySchema,
      "listItems");
  }

  @Get("/supplier-purchase-batches/:id/requisitions")
  async listRequisitions(request: FastifyRequest) {
    return this.listChild(
      request,
      SupplierPurchaseBatchRequisitionListQuerySchema,
      "listRequisitions",
    );
  }

  @Get("/supplier-purchase-batches/:id/orders")
  async listOrders(request: FastifyRequest) {
    return this.listChild(request, SupplierPurchaseBatchOrderListQuerySchema,
      "listOrders");
  }

  @Post("/supplier-purchase-batches/:id/save-draft")
  async saveDraft(request: FastifyRequest) {
    const auth = await this.getRequiredTenantContext(request);
    const key = requireSupplierIdempotencyKey(request);
    const { id } = this.parse(SupplierPurchaseBatchParamSchema, request.params);
    const input = this.parse(SupplierPurchaseBatchDraftSchema, request.body);
    return ResponseHandler.success(
      await supplierPurchaseBatchesService.saveDraft(auth, id, input, key),
    );
  }

  @Post("/supplier-purchase-batches/:id/submit")
  async submit(request: FastifyRequest) {
    const auth = await this.getRequiredTenantContext(request);
    const key = requireSupplierIdempotencyKey(request);
    const { id } = this.parse(SupplierPurchaseBatchParamSchema, request.params);
    const input = this.parse(SupplierPurchaseBatchSubmitSchema, request.body);
    return ResponseHandler.success(
      await supplierPurchaseBatchesService.submit(auth, id, input, key),
    );
  }

  @Post("/supplier-purchase-batches/:id/review")
  async review(request: FastifyRequest) {
    const auth = await this.getRequiredTenantContext(request);
    const key = requireSupplierIdempotencyKey(request);
    const { id } = this.parse(SupplierPurchaseBatchParamSchema, request.params);
    const input = this.parse(SupplierPurchaseBatchReviewSchema, request.body);
    return ResponseHandler.success(
      await supplierPurchaseBatchesService.review(auth, id, input, key),
    );
  }

  @Post("/supplier-purchase-batches/:id/cancel")
  async cancel(request: FastifyRequest) {
    const auth = await this.getRequiredTenantContext(request);
    const key = requireSupplierIdempotencyKey(request);
    const { id } = this.parse(SupplierPurchaseBatchParamSchema, request.params);
    const input = this.parse(SupplierPurchaseBatchCancelSchema, request.body);
    return ResponseHandler.success(
      await supplierPurchaseBatchesService.cancel(auth, id, input, key),
    );
  }

  private async listChild(
    request: FastifyRequest,
    schema: z.ZodType<{ page: number; pageSize: number }>,
    method: "listItems" | "listRequisitions" | "listOrders",
  ) {
    const auth = await this.getRequiredTenantContext(request);
    const { id } = this.parse(SupplierPurchaseBatchParamSchema, request.params);
    const query = this.parse(schema, request.query);
    return ResponseHandler.success(
      await supplierPurchaseBatchesService[method](auth, id, query),
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

export default new SupplierPurchaseBatchesController();
