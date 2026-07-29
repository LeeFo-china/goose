import { TenantBaseController } from "@/controllers/TenantBaseController";
import { requireSupplierIdempotencyKey } from "@/controllers/supplier-command-http";
import { Errors } from "@/errors/error-factory";
import {
  SupplierPriceItemDeleteSchema,
  SupplierPriceItemHttpListQuerySchema,
  SupplierPriceItemParamSchema,
  SupplierPriceItemUpsertSchema,
  SupplierPriceListCommandSchema,
  SupplierPriceListCreateSchema,
  SupplierPriceListListQuerySchema,
  SupplierPriceListNewVersionSchema,
  SupplierPriceListParamSchema,
  SupplierPriceListUpdateSchema,
  SupplierPriceScopeQuerySchema,
} from "@/schema/supplier-price-lists";
import { supplierPriceListsService } from "@/services/supplier-price-lists";
import {
  Delete,
  Get,
  Patch,
  Post,
  Put,
} from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import type { FastifyRequest } from "fastify";
import type { z } from "zod";

class SupplierPriceListsController extends TenantBaseController {
  constructor() {
    super("supplier-price-lists");
  }

  @Get("/supplier-price-lists")
  async listPriceLists(request: FastifyRequest) {
    const auth = await this.getRequiredTenantContext(request);
    const query = this.parse(
      SupplierPriceListListQuerySchema,
      request.query,
    );
    return ResponseHandler.success(
      await supplierPriceListsService.listPriceLists(auth, query),
    );
  }

  @Get("/supplier-price-lists/:id")
  async getPriceList(request: FastifyRequest) {
    const auth = await this.getRequiredTenantContext(request);
    const { id } = this.parse(SupplierPriceListParamSchema, request.params);
    const { tenantSupplierId } = this.parse(
      SupplierPriceScopeQuerySchema,
      request.query,
    );
    return ResponseHandler.success(
      await supplierPriceListsService.getPriceList(
        auth,
        tenantSupplierId,
        id,
      ),
    );
  }

  @Post("/supplier-price-lists/:id")
  async createPriceList(request: FastifyRequest) {
    const auth = await this.getRequiredTenantContext(request);
    const key = requireSupplierIdempotencyKey(request);
    const { id } = this.parse(SupplierPriceListParamSchema, request.params);
    const { tenantSupplierId } = this.parse(
      SupplierPriceScopeQuerySchema,
      request.query,
    );
    const input = this.parse(SupplierPriceListCreateSchema, request.body);
    return ResponseHandler.success(
      await supplierPriceListsService.create(
        auth,
        tenantSupplierId,
        id,
        input,
        key,
      ),
    );
  }

  @Patch("/supplier-price-lists/:id")
  async updatePriceList(request: FastifyRequest) {
    const auth = await this.getRequiredTenantContext(request);
    const { id } = this.parse(SupplierPriceListParamSchema, request.params);
    const { tenantSupplierId } = this.parse(
      SupplierPriceScopeQuerySchema,
      request.query,
    );
    const input = this.parse(SupplierPriceListUpdateSchema, request.body);
    return ResponseHandler.success(
      await supplierPriceListsService.updateDraft(
        auth,
        tenantSupplierId,
        id,
        input,
      ),
    );
  }

  @Get("/supplier-price-lists/:id/items")
  async listItems(request: FastifyRequest) {
    const auth = await this.getRequiredTenantContext(request);
    const { id } = this.parse(SupplierPriceListParamSchema, request.params);
    const query = this.parse(
      SupplierPriceItemHttpListQuerySchema,
      request.query,
    );
    const { tenantSupplierId, ...filters } = query;
    return ResponseHandler.success(
      await supplierPriceListsService.listItems(
        auth,
        tenantSupplierId,
        id,
        filters,
      ),
    );
  }

  @Put("/supplier-price-lists/:id/items/:itemId")
  async upsertItem(request: FastifyRequest) {
    const auth = await this.getRequiredTenantContext(request);
    const key = requireSupplierIdempotencyKey(request);
    const { id, itemId } = this.parse(
      SupplierPriceItemParamSchema,
      request.params,
    );
    const { tenantSupplierId } = this.parse(
      SupplierPriceScopeQuerySchema,
      request.query,
    );
    const input = this.parse(SupplierPriceItemUpsertSchema, request.body);
    return ResponseHandler.success(
      await supplierPriceListsService.upsertItem(
        auth,
        tenantSupplierId,
        id,
        itemId,
        input,
        key,
      ),
    );
  }

  @Delete("/supplier-price-lists/:id/items/:itemId")
  async deleteItem(request: FastifyRequest) {
    const auth = await this.getRequiredTenantContext(request);
    const key = requireSupplierIdempotencyKey(request);
    const { id, itemId } = this.parse(
      SupplierPriceItemParamSchema,
      request.params,
    );
    const { tenantSupplierId } = this.parse(
      SupplierPriceScopeQuerySchema,
      request.query,
    );
    const input = this.parse(SupplierPriceItemDeleteSchema, request.body);
    return ResponseHandler.success(
      await supplierPriceListsService.deleteItem(
        auth,
        tenantSupplierId,
        id,
        itemId,
        input,
        key,
      ),
    );
  }

  @Post("/supplier-price-lists/:id/publish")
  publish(request: FastifyRequest) {
    return this.lifecycle(request, "publish");
  }

  @Post("/supplier-price-lists/:id/new-version")
  async createVersion(request: FastifyRequest) {
    const auth = await this.getRequiredTenantContext(request);
    const key = requireSupplierIdempotencyKey(request);
    const { id } = this.parse(SupplierPriceListParamSchema, request.params);
    const { tenantSupplierId } = this.parse(
      SupplierPriceScopeQuerySchema,
      request.query,
    );
    const input = this.parse(
      SupplierPriceListNewVersionSchema,
      request.body,
    );
    return ResponseHandler.success(
      await supplierPriceListsService.createVersion(
        auth,
        tenantSupplierId,
        id,
        input,
        key,
      ),
    );
  }

  @Post("/supplier-price-lists/:id/retire")
  retire(request: FastifyRequest) {
    return this.lifecycle(request, "retire");
  }

  private async lifecycle(
    request: FastifyRequest,
    action: "publish" | "retire",
  ) {
    const auth = await this.getRequiredTenantContext(request);
    const key = requireSupplierIdempotencyKey(request);
    const { id } = this.parse(SupplierPriceListParamSchema, request.params);
    const { tenantSupplierId } = this.parse(
      SupplierPriceScopeQuerySchema,
      request.query,
    );
    const input = this.parse(SupplierPriceListCommandSchema, request.body);
    const result = action === "publish"
      ? supplierPriceListsService.publish(
        auth,
        tenantSupplierId,
        id,
        input,
        key,
      )
      : supplierPriceListsService.retire(
        auth,
        tenantSupplierId,
        id,
        input,
        key,
      );
    return ResponseHandler.success(await result);
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

export default new SupplierPriceListsController();
