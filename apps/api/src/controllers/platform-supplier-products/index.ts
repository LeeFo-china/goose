import { PlatformBaseController } from "@/controllers/PlatformBaseController";
import { Errors } from "@/errors/error-factory";
import {
  PlatformSupplierProductListQuerySchema,
  PlatformSupplierProductScopeQuerySchema,
  SupplierProductCreateSchema,
  SupplierProductParamSchema,
  SupplierSkuCreateSchema,
  SupplierSkuParamSchema,
} from "@/schema/supplier-products";
import { platformSupplierProductsService } from "@/services/platform-supplier-products";
import { Get, Post } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import type { FastifyRequest } from "fastify";
import type { z } from "zod";

const MAX_IDEMPOTENCY_KEY_LENGTH = 120;

function requireIdempotencyKey(request: FastifyRequest): string {
  const value = request.headers["idempotency-key"];
  const key = Array.isArray(value) ? value[0]?.trim() : value?.trim();
  if (!key || key.length > MAX_IDEMPOTENCY_KEY_LENGTH) {
    throw Errors.business(
      400,
      "缺少有效的 Idempotency-Key",
      "VALIDATION_ERROR",
    );
  }
  return key;
}

class PlatformSupplierProductsController extends PlatformBaseController {
  constructor() {
    super("platform-supplier-products");
  }

  @Get("/platform/supplier-products")
  async listProducts(request: FastifyRequest) {
    const auth = await this.getRequiredPlatformPermissionContext(
      request,
      "platform.supplier-product.manage",
    );
    const query = this.parse(
      PlatformSupplierProductListQuerySchema,
      request.query,
    );
    const { supplier_id, ...filters } = query;
    return ResponseHandler.success(
      await platformSupplierProductsService.listProducts(
        auth,
        supplier_id,
        filters,
      ),
    );
  }

  @Get("/platform/supplier-products/:id")
  async getProduct(request: FastifyRequest) {
    const auth = await this.getRequiredPlatformPermissionContext(
      request,
      "platform.supplier-product.manage",
    );
    const { id } = this.parse(SupplierProductParamSchema, request.params);
    const { supplierId } = this.parse(
      PlatformSupplierProductScopeQuerySchema,
      request.query,
    );
    return ResponseHandler.success(
      await platformSupplierProductsService.getProduct(auth, supplierId, id),
    );
  }

  @Post("/platform/supplier-products/:id")
  async createProduct(request: FastifyRequest) {
    const auth = await this.getRequiredPlatformPermissionContext(
      request,
      "platform.supplier-product.manage",
    );
    const { id } = this.parse(SupplierProductParamSchema, request.params);
    const { supplierId } = this.parse(
      PlatformSupplierProductScopeQuerySchema,
      request.query,
    );
    const key = requireIdempotencyKey(request);
    const input = this.parse(SupplierProductCreateSchema, request.body);
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

  @Post("/platform/supplier-products/:id/skus/:skuId")
  async createSku(request: FastifyRequest) {
    const auth = await this.getRequiredPlatformPermissionContext(
      request,
      "platform.supplier-product.manage",
    );
    const { id, skuId } = this.parse(SupplierSkuParamSchema, request.params);
    const { supplierId } = this.parse(
      PlatformSupplierProductScopeQuerySchema,
      request.query,
    );
    const key = requireIdempotencyKey(request);
    const input = this.parse(SupplierSkuCreateSchema, request.body);
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
