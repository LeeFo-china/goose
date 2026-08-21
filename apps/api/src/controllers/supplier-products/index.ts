import { TenantBaseController } from "@/controllers/TenantBaseController";
import { requireSupplierIdempotencyKey } from "@/controllers/supplier-command-http";
import { Errors } from "@/errors/error-factory";
import {
  SupplierProductCommandSchema,
  SupplierProductCreateSchema,
  SupplierProductListQuerySchema,
  SupplierProductParamSchema,
  SupplierProductUpdateSchema,
  SupplierScopeQuerySchema,
  SupplierSkuCreateSchema,
  SupplierSkuHttpListQuerySchema,
  SupplierSkuParamSchema,
  SupplierSkuUnitConversionsReplaceSchema,
  SupplierSkuUpdateSchema,
} from "@/schema/supplier-products";
import { supplierProductsService } from "@/services/supplier-products";
import { Get, Patch, Post, Put } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import type { FastifyRequest } from "fastify";
import type { z } from "zod";

class SupplierProductsController extends TenantBaseController {
  constructor() {
    super("supplier-products");
  }

  @Get("/supplier-products")
  async listProducts(request: FastifyRequest) {
    const auth = await this.getRequiredTenantContext(request);
    const query = this.parse(SupplierProductListQuerySchema, request.query);
    return ResponseHandler.success(
      await supplierProductsService.listProducts(auth, query),
    );
  }

  @Get("/supplier-products/:id")
  async getProduct(request: FastifyRequest) {
    const auth = await this.getRequiredTenantContext(request);
    const { id } = this.parse(SupplierProductParamSchema, request.params);
    const { tenantSupplierId } = this.parse(
      SupplierScopeQuerySchema,
      request.query,
    );
    return ResponseHandler.success(
      await supplierProductsService.getProduct(auth, tenantSupplierId, id),
    );
  }

  @Post("/supplier-products/:id")
  async createProduct(request: FastifyRequest) {
    const auth = await this.getRequiredTenantContext(request);
    const key = requireSupplierIdempotencyKey(request);
    const { id } = this.parse(SupplierProductParamSchema, request.params);
    const { tenantSupplierId } = this.parse(
      SupplierScopeQuerySchema,
      request.query,
    );
    const input = this.parse(SupplierProductCreateSchema, request.body);
    return ResponseHandler.success(
      await supplierProductsService.createProduct(
        auth,
        tenantSupplierId,
        id,
        input,
        key,
      ),
    );
  }

  @Patch("/supplier-products/:id")
  async updateProduct(request: FastifyRequest) {
    const auth = await this.getRequiredTenantContext(request);
    const key = requireSupplierIdempotencyKey(request);
    const { id } = this.parse(SupplierProductParamSchema, request.params);
    const { tenantSupplierId } = this.parse(
      SupplierScopeQuerySchema,
      request.query,
    );
    const input = this.parse(SupplierProductUpdateSchema, request.body);
    return ResponseHandler.success(
      await supplierProductsService.updateProduct(
        auth,
        tenantSupplierId,
        id,
        input,
        key,
      ),
    );
  }

  @Post("/supplier-products/:id/activate")
  activateProduct(request: FastifyRequest) {
    return this.mutateProduct(request, "activate");
  }

  @Post("/supplier-products/:id/deactivate")
  deactivateProduct(request: FastifyRequest) {
    return this.mutateProduct(request, "deactivate");
  }

  @Get("/supplier-products/:id/skus")
  async listSkus(request: FastifyRequest) {
    const auth = await this.getRequiredTenantContext(request);
    const { id } = this.parse(SupplierProductParamSchema, request.params);
    const query = this.parse(SupplierSkuHttpListQuerySchema, request.query);
    const { tenantSupplierId, ...filters } = query;
    return ResponseHandler.success(
      await supplierProductsService.listSkus(
        auth,
        tenantSupplierId,
        id,
        filters,
      ),
    );
  }

  @Post("/supplier-products/:id/skus/:skuId")
  async createSku(request: FastifyRequest) {
    const auth = await this.getRequiredTenantContext(request);
    const key = requireSupplierIdempotencyKey(request);
    const { id, skuId } = this.parse(SupplierSkuParamSchema, request.params);
    const { tenantSupplierId } = this.parse(
      SupplierScopeQuerySchema,
      request.query,
    );
    const input = this.parse(SupplierSkuCreateSchema, request.body);
    return ResponseHandler.success(
      await supplierProductsService.createSku(
        auth,
        tenantSupplierId,
        id,
        skuId,
        input,
        key,
      ),
    );
  }

  @Patch("/supplier-products/:id/skus/:skuId")
  async updateSku(request: FastifyRequest) {
    const auth = await this.getRequiredTenantContext(request);
    const key = requireSupplierIdempotencyKey(request);
    const { id, skuId } = this.parse(SupplierSkuParamSchema, request.params);
    const { tenantSupplierId } = this.parse(
      SupplierScopeQuerySchema,
      request.query,
    );
    const input = this.parse(SupplierSkuUpdateSchema, request.body);
    return ResponseHandler.success(
      await supplierProductsService.updateSku(
        auth,
        tenantSupplierId,
        id,
        skuId,
        input,
        key,
      ),
    );
  }

  @Put("/supplier-products/:id/skus/:skuId/unit-conversions")
  async replaceSkuUnitConversions(request: FastifyRequest) {
    const auth = await this.getRequiredTenantContext(request);
    const key = requireSupplierIdempotencyKey(request);
    const { id, skuId } = this.parse(SupplierSkuParamSchema, request.params);
    const { tenantSupplierId } = this.parse(
      SupplierScopeQuerySchema,
      request.query,
    );
    const input = this.parse(
      SupplierSkuUnitConversionsReplaceSchema,
      request.body,
    );
    return ResponseHandler.success(
      await supplierProductsService.replaceSkuUnitConversions(
        auth,
        tenantSupplierId,
        id,
        skuId,
        input,
        key,
      ),
    );
  }

  @Get("/supplier-products/:id/skus/:skuId/unit-conversions")
  async listSkuUnitConversions(request: FastifyRequest) {
    const auth = await this.getRequiredTenantContext(request);
    const { id, skuId } = this.parse(SupplierSkuParamSchema, request.params);
    const { tenantSupplierId } = this.parse(
      SupplierScopeQuerySchema,
      request.query,
    );
    return ResponseHandler.success(
      await supplierProductsService.listSkuUnitConversions(
        auth,
        tenantSupplierId,
        id,
        skuId,
      ),
    );
  }

  @Post("/supplier-products/:id/skus/:skuId/activate")
  activateSku(request: FastifyRequest) {
    return this.mutateSku(request, "activate");
  }

  @Post("/supplier-products/:id/skus/:skuId/deactivate")
  deactivateSku(request: FastifyRequest) {
    return this.mutateSku(request, "deactivate");
  }

  private async mutateProduct(
    request: FastifyRequest,
    action: "activate" | "deactivate",
  ) {
    const auth = await this.getRequiredTenantContext(request);
    const key = requireSupplierIdempotencyKey(request);
    const { id } = this.parse(SupplierProductParamSchema, request.params);
    const { tenantSupplierId } = this.parse(
      SupplierScopeQuerySchema,
      request.query,
    );
    const input = this.parse(SupplierProductCommandSchema, request.body);
    return ResponseHandler.success(
      await supplierProductsService.mutateProduct(
        auth,
        tenantSupplierId,
        id,
        action,
        input,
        key,
      ),
    );
  }

  private async mutateSku(
    request: FastifyRequest,
    action: "activate" | "deactivate",
  ) {
    const auth = await this.getRequiredTenantContext(request);
    const key = requireSupplierIdempotencyKey(request);
    const { id, skuId } = this.parse(SupplierSkuParamSchema, request.params);
    const { tenantSupplierId } = this.parse(
      SupplierScopeQuerySchema,
      request.query,
    );
    const input = this.parse(SupplierProductCommandSchema, request.body);
    return ResponseHandler.success(
      await supplierProductsService.mutateSku(
        auth,
        tenantSupplierId,
        id,
        skuId,
        action,
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

export default new SupplierProductsController();
