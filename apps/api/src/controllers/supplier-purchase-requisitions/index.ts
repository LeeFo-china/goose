import { TenantBaseController } from "@/controllers/TenantBaseController";
import { requireSupplierIdempotencyKey } from "@/controllers/supplier-command-http";
import { Errors } from "@/errors/error-factory";
import {
  SupplierPurchaseRequisitionCancelSchema,
  SupplierPurchaseRequisitionCatalogQuerySchema,
  SupplierPurchaseRequisitionConvertSchema,
  SupplierPurchaseRequisitionCostCategoryListQuerySchema,
  SupplierPurchaseRequisitionDraftSchema,
  SupplierPurchaseRequisitionItemListQuerySchema,
  SupplierPurchaseRequisitionListQuerySchema,
  SupplierPurchaseRequisitionOptionQuerySchema,
  SupplierPurchaseRequisitionParamSchema,
  SupplierPurchaseRequisitionReviewSchema,
  SupplierPurchaseRequisitionSubmitSchema,
} from "@/schema/supplier-purchase-requisitions";
import {
  supplierPurchaseRequisitionsService,
} from "@/services/supplier-purchase-requisitions";
import { Get, Post } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import type { FastifyRequest } from "fastify";
import type { z } from "zod";

class SupplierPurchaseRequisitionsController extends TenantBaseController {
  constructor() {
    super("supplier-purchase-requisitions");
  }

  @Get("/supplier-purchase-requisitions")
  async listRequisitions(request: FastifyRequest) {
    const auth = await this.getRequiredTenantContext(request);
    const query = this.parse(
      SupplierPurchaseRequisitionListQuerySchema,
      request.query,
    );
    return ResponseHandler.success(
      await supplierPurchaseRequisitionsService.listRequisitions(
        auth,
        query,
      ),
    );
  }

  @Get("/supplier-purchase-requisitions/:id")
  async getRequisition(request: FastifyRequest) {
    const auth = await this.getRequiredTenantContext(request);
    const { id } = this.parse(
      SupplierPurchaseRequisitionParamSchema,
      request.params,
    );
    return ResponseHandler.success(
      await supplierPurchaseRequisitionsService.getRequisition(auth, id),
    );
  }

  @Get("/supplier-purchase-requisitions/:id/items")
  async listItems(request: FastifyRequest) {
    const auth = await this.getRequiredTenantContext(request);
    const { id } = this.parse(
      SupplierPurchaseRequisitionParamSchema,
      request.params,
    );
    const query = this.parse(
      SupplierPurchaseRequisitionItemListQuerySchema,
      request.query,
    );
    return ResponseHandler.success(
      await supplierPurchaseRequisitionsService.listItems(auth, id, query),
    );
  }

  @Get("/supplier-purchase-requisition-project-options")
  async listProjectOptions(request: FastifyRequest) {
    const auth = await this.getRequiredTenantContext(request);
    const query = this.parse(
      SupplierPurchaseRequisitionOptionQuerySchema,
      request.query,
    );
    return ResponseHandler.success(
      await supplierPurchaseRequisitionsService.listProjectOptions(
        auth,
        query,
      ),
    );
  }

  @Get("/supplier-purchase-requisition-supplier-options")
  async listSupplierOptions(request: FastifyRequest) {
    const auth = await this.getRequiredTenantContext(request);
    const query = this.parse(
      SupplierPurchaseRequisitionOptionQuerySchema,
      request.query,
    );
    return ResponseHandler.success(
      await supplierPurchaseRequisitionsService.listSupplierOptions(
        auth,
        query,
      ),
    );
  }

  @Get("/supplier-purchase-requisition-catalog")
  async listCatalog(request: FastifyRequest) {
    const auth = await this.getRequiredTenantContext(request);
    const query = this.parse(
      SupplierPurchaseRequisitionCatalogQuerySchema,
      request.query,
    );
    return ResponseHandler.success(
      await supplierPurchaseRequisitionsService.listCatalog(auth, query),
    );
  }

  @Get("/supplier-purchase-requisition-cost-categories")
  async listCostCategories(request: FastifyRequest) {
    const auth = await this.getRequiredTenantContext(request);
    const query = this.parse(
      SupplierPurchaseRequisitionCostCategoryListQuerySchema,
      request.query,
    );
    return ResponseHandler.success(
      await supplierPurchaseRequisitionsService.listCostCategories(
        auth,
        query,
      ),
    );
  }

  @Post("/supplier-purchase-requisitions/:id/save-draft")
  async saveDraft(request: FastifyRequest) {
    const auth = await this.getRequiredTenantContext(request);
    const key = requireSupplierIdempotencyKey(request);
    const { id } = this.parse(
      SupplierPurchaseRequisitionParamSchema,
      request.params,
    );
    const input = this.parse(
      SupplierPurchaseRequisitionDraftSchema,
      request.body,
    );
    return ResponseHandler.success(
      await supplierPurchaseRequisitionsService.saveDraft(
        auth,
        id,
        input,
        key,
      ),
    );
  }

  @Post("/supplier-purchase-requisitions/:id/submit")
  async submit(request: FastifyRequest) {
    const auth = await this.getRequiredTenantContext(request);
    const key = requireSupplierIdempotencyKey(request);
    const { id } = this.parse(
      SupplierPurchaseRequisitionParamSchema,
      request.params,
    );
    const input = this.parse(
      SupplierPurchaseRequisitionSubmitSchema,
      request.body,
    );
    return ResponseHandler.success(
      await supplierPurchaseRequisitionsService.submit(
        auth,
        id,
        input,
        key,
      ),
    );
  }

  @Post("/supplier-purchase-requisitions/:id/review")
  async review(request: FastifyRequest) {
    const auth = await this.getRequiredTenantContext(request);
    const key = requireSupplierIdempotencyKey(request);
    const { id } = this.parse(
      SupplierPurchaseRequisitionParamSchema,
      request.params,
    );
    const input = this.parse(
      SupplierPurchaseRequisitionReviewSchema,
      request.body,
    );
    return ResponseHandler.success(
      await supplierPurchaseRequisitionsService.review(
        auth,
        id,
        input,
        key,
      ),
    );
  }

  @Post("/supplier-purchase-requisitions/:id/cancel")
  async cancel(request: FastifyRequest) {
    const auth = await this.getRequiredTenantContext(request);
    const key = requireSupplierIdempotencyKey(request);
    const { id } = this.parse(
      SupplierPurchaseRequisitionParamSchema,
      request.params,
    );
    const input = this.parse(
      SupplierPurchaseRequisitionCancelSchema,
      request.body,
    );
    return ResponseHandler.success(
      await supplierPurchaseRequisitionsService.cancel(
        auth,
        id,
        input,
        key,
      ),
    );
  }

  @Post("/supplier-purchase-requisitions/:id/convert")
  async convert(request: FastifyRequest) {
    const auth = await this.getRequiredTenantContext(request);
    const key = requireSupplierIdempotencyKey(request);
    const { id } = this.parse(
      SupplierPurchaseRequisitionParamSchema,
      request.params,
    );
    const input = this.parse(
      SupplierPurchaseRequisitionConvertSchema,
      request.body,
    );
    return ResponseHandler.success(
      await supplierPurchaseRequisitionsService.convert(
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

export default new SupplierPurchaseRequisitionsController();
