import { PlatformBaseController } from "@/controllers/PlatformBaseController";
import { requireSupplierIdempotencyKey } from "@/controllers/supplier-command-http";
import { Errors } from "@/errors/error-factory";
import {
  PlatformSupplierProductCreateSchema,
  PlatformSupplierProductCommandSchema,
  PlatformSupplierProductListQuerySchema,
  PlatformSupplierScopeQuerySchema,
  PlatformSupplierSkuCreateSchema,
  PlatformSupplierSkuHttpListQuerySchema,
  SupplierProductParamSchema,
  SupplierProductUpdateSchema,
  SupplierSkuParamSchema,
  SupplierSkuUnitConversionsReplaceSchema,
  SupplierSkuUpdateSchema,
} from "@/schema/supplier-products";
import { platformSupplierProductsService } from "@/services/platform-supplier-products";
import { Get, Patch, Post, Put } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import type { FastifyRequest } from "fastify";
import type { z } from "zod";

const MANAGE_PERMISSION = "platform.supplier-product.manage" as const;

class PlatformSupplierProductsController extends PlatformBaseController {
  constructor() {
    super("platform-supplier-products");
  }

  @Get("/platform/supplier-products")
  async listProducts(request: FastifyRequest) {
    const auth = await this.getManageContext(request);
    const query = this.parse(PlatformSupplierProductListQuerySchema, request.query);
    return ResponseHandler.success(
      await platformSupplierProductsService.listProducts(auth, query),
    );
  }

  @Get("/platform/supplier-products/:id")
  async getProduct(request: FastifyRequest) {
    const auth = await this.getManageContext(request);
    const { id } = this.parse(SupplierProductParamSchema, request.params);
    const { supplierId } = this.parse(PlatformSupplierScopeQuerySchema, request.query);
    return ResponseHandler.success(
      await platformSupplierProductsService.getProduct(auth, supplierId, id),
    );
  }

  @Post("/platform/supplier-products/:id")
  async createProduct(request: FastifyRequest) {
    const auth = await this.getManageContext(request);
    const key = requireSupplierIdempotencyKey(request);
    const { id } = this.parse(SupplierProductParamSchema, request.params);
    const { supplierId } = this.parse(PlatformSupplierScopeQuerySchema, request.query);
    const input = this.parse(PlatformSupplierProductCreateSchema, request.body);
    return ResponseHandler.success(
      await platformSupplierProductsService.createProduct(
        auth,
        supplierId,
        id,
        input,
        key,
      ),
    );
  }

  @Patch("/platform/supplier-products/:id")
  async updateProduct(request: FastifyRequest) {
    const auth = await this.getManageContext(request);
    const key = requireSupplierIdempotencyKey(request);
    const { id } = this.parse(SupplierProductParamSchema, request.params);
    const { supplierId } = this.parse(PlatformSupplierScopeQuerySchema, request.query);
    const input = this.parse(SupplierProductUpdateSchema, request.body);
    return ResponseHandler.success(
      await platformSupplierProductsService.updateProduct(
        auth,
        supplierId,
        id,
        input,
        key,
      ),
    );
  }

  @Post("/platform/supplier-products/:id/activate")
  activateProduct(request: FastifyRequest) {
    return this.mutateProduct(request, "activate");
  }

  @Post("/platform/supplier-products/:id/deactivate")
  deactivateProduct(request: FastifyRequest) {
    return this.mutateProduct(request, "deactivate");
  }

  @Get("/platform/supplier-products/:id/skus")
  async listSkus(request: FastifyRequest) {
    const auth = await this.getManageContext(request);
    const { id } = this.parse(SupplierProductParamSchema, request.params);
    const query = this.parse(
      PlatformSupplierSkuHttpListQuerySchema,
      request.query,
    );
    const { supplierId, ...filters } = query;
    return ResponseHandler.success(
      await platformSupplierProductsService.listSkus(
        auth,
        supplierId,
        id,
        filters,
      ),
    );
  }

  @Post("/platform/supplier-products/:id/skus/:skuId")
  async createSku(request: FastifyRequest) {
    const auth = await this.getManageContext(request);
    const key = requireSupplierIdempotencyKey(request);
    const { id, skuId } = this.parse(SupplierSkuParamSchema, request.params);
    const { supplierId } = this.parse(PlatformSupplierScopeQuerySchema, request.query);
    const input = this.parse(PlatformSupplierSkuCreateSchema, request.body);
    return ResponseHandler.success(
      await platformSupplierProductsService.createSku(
        auth,
        supplierId,
        id,
        skuId,
        input,
        key,
      ),
    );
  }

  @Patch("/platform/supplier-products/:id/skus/:skuId")
  async updateSku(request: FastifyRequest) {
    const auth = await this.getManageContext(request);
    const key = requireSupplierIdempotencyKey(request);
    const { id, skuId } = this.parse(SupplierSkuParamSchema, request.params);
    const { supplierId } = this.parse(PlatformSupplierScopeQuerySchema, request.query);
    const input = this.parse(SupplierSkuUpdateSchema, request.body);
    return ResponseHandler.success(
      await platformSupplierProductsService.updateSku(
        auth,
        supplierId,
        id,
        skuId,
        input,
        key,
      ),
    );
  }

  @Post("/platform/supplier-products/:id/skus/:skuId/activate")
  activateSku(request: FastifyRequest) {
    return this.mutateSku(request, "activate");
  }

  @Post("/platform/supplier-products/:id/skus/:skuId/deactivate")
  deactivateSku(request: FastifyRequest) {
    return this.mutateSku(request, "deactivate");
  }

  @Put("/platform/supplier-products/:id/skus/:skuId/unit-conversions")
  async replaceSkuUnitConversions(request: FastifyRequest) {
    const auth = await this.getManageContext(request);
    const key = requireSupplierIdempotencyKey(request);
    const { id, skuId } = this.parse(SupplierSkuParamSchema, request.params);
    const { supplierId } = this.parse(PlatformSupplierScopeQuerySchema, request.query);
    const input = this.parse(
      SupplierSkuUnitConversionsReplaceSchema,
      request.body,
    );
    return ResponseHandler.success(
      await platformSupplierProductsService.replaceSkuUnitConversions(
        auth,
        supplierId,
        id,
        skuId,
        input,
        key,
      ),
    );
  }

  @Get("/platform/supplier-products/:id/skus/:skuId/unit-conversions")
  async listSkuUnitConversions(request: FastifyRequest) {
    const auth = await this.getManageContext(request);
    const { id, skuId } = this.parse(SupplierSkuParamSchema, request.params);
    const { supplierId } = this.parse(
      PlatformSupplierScopeQuerySchema,
      request.query,
    );
    return ResponseHandler.success(
      await platformSupplierProductsService.listSkuUnitConversions(
        auth,
        supplierId,
        id,
        skuId,
      ),
    );
  }

  private async mutateProduct(
    request: FastifyRequest,
    action: "activate" | "deactivate",
  ) {
    const auth = await this.getManageContext(request);
    const key = requireSupplierIdempotencyKey(request);
    const { id } = this.parse(SupplierProductParamSchema, request.params);
    const { supplierId } = this.parse(PlatformSupplierScopeQuerySchema, request.query);
    const input = this.parse(PlatformSupplierProductCommandSchema, request.body);
    return ResponseHandler.success(
      await platformSupplierProductsService.mutateProduct(
        auth,
        supplierId,
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
    const auth = await this.getManageContext(request);
    const key = requireSupplierIdempotencyKey(request);
    const { id, skuId } = this.parse(SupplierSkuParamSchema, request.params);
    const { supplierId } = this.parse(PlatformSupplierScopeQuerySchema, request.query);
    const input = this.parse(PlatformSupplierProductCommandSchema, request.body);
    return ResponseHandler.success(
      await platformSupplierProductsService.mutateSku(
        auth,
        supplierId,
        id,
        skuId,
        action,
        input,
        key,
      ),
    );
  }

  private getManageContext(request: FastifyRequest) {
    return this.getRequiredPlatformPermissionContext(request, MANAGE_PERMISSION);
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

export default new PlatformSupplierProductsController();
