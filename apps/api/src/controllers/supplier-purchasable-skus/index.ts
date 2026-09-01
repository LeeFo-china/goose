import { TenantBaseController } from "@/controllers/TenantBaseController";
import { requireSupplierIdempotencyKey } from "@/controllers/supplier-command-http";
import { ErrorCodes } from "@/errors/error-codes";
import { Errors } from "@/errors/error-factory";
import {
  SupplierPurchasableSkuCreateSchema,
  SupplierPurchasableSkuPriceParamSchema,
  SupplierPurchasableSkuScopeQuerySchema,
  SupplierPurchasableSkuUpdateSchema,
} from "@/schema/supplier-purchasable-skus";
import { supplierPurchasableSkusService } from "@/services/supplier-purchasable-skus";
import { Get, Patch, Post } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import type { FastifyRequest } from "fastify";
import type { z } from "zod";

const SupplierPurchasableSkuProductParamSchema =
  SupplierPurchasableSkuPriceParamSchema.pick({ productId: true }).strict();

class SupplierPurchasableSkusController extends TenantBaseController {
  constructor() {
    super("supplier-purchasable-skus");
  }

  @Get("/supplier-products/:productId/purchasable-skus/price-defaults")
  async getPriceDefaults(request: FastifyRequest) {
    const auth = await this.getRequiredTenantContext(request);
    const { productId } = this.parse(
      SupplierPurchasableSkuProductParamSchema,
      request.params,
    );
    const { tenantSupplierId } = this.parse(
      SupplierPurchasableSkuScopeQuerySchema,
      request.query,
    );
    return ResponseHandler.success(
      await supplierPurchasableSkusService.getPriceDefaults(
        auth,
        tenantSupplierId,
        productId,
      ),
    );
  }

  @Get("/supplier-products/:productId/purchasable-skus/:skuId/price")
  async getCurrentPrice(request: FastifyRequest) {
    const auth = await this.getRequiredTenantContext(request);
    const { productId, skuId } = this.parse(
      SupplierPurchasableSkuPriceParamSchema,
      request.params,
    );
    const { tenantSupplierId } = this.parse(
      SupplierPurchasableSkuScopeQuerySchema,
      request.query,
    );
    return ResponseHandler.success(
      await supplierPurchasableSkusService.getCurrentPrice(
        auth,
        tenantSupplierId,
        productId,
        skuId,
      ),
    );
  }

  @Post("/supplier-products/:productId/purchasable-skus/:skuId")
  async createPurchasableSku(request: FastifyRequest) {
    const auth = await this.getRequiredTenantContext(request);
    const idempotencyKey = this.requireWriteKey(request);
    const { productId, skuId } = this.parse(
      SupplierPurchasableSkuPriceParamSchema,
      request.params,
    );
    const { tenantSupplierId } = this.parse(
      SupplierPurchasableSkuScopeQuerySchema,
      request.query,
    );
    const body = this.parse(SupplierPurchasableSkuCreateSchema, request.body);
    return ResponseHandler.success(
      await supplierPurchasableSkusService.create(auth, {
        tenantSupplierId,
        productId,
        skuId,
        body,
        idempotencyKey,
      }),
    );
  }

  @Patch("/supplier-products/:productId/purchasable-skus/:skuId")
  async updatePurchasableSku(request: FastifyRequest) {
    const auth = await this.getRequiredTenantContext(request);
    const idempotencyKey = this.requireWriteKey(request);
    const { productId, skuId } = this.parse(
      SupplierPurchasableSkuPriceParamSchema,
      request.params,
    );
    const { tenantSupplierId } = this.parse(
      SupplierPurchasableSkuScopeQuerySchema,
      request.query,
    );
    const body = this.parse(SupplierPurchasableSkuUpdateSchema, request.body);
    return ResponseHandler.success(
      await supplierPurchasableSkusService.update(auth, {
        tenantSupplierId,
        productId,
        skuId,
        body,
        idempotencyKey,
      }),
    );
  }

  private requireWriteKey(request: FastifyRequest): string {
    const header = request.headers["idempotency-key"];
    const rawHeaders = request.raw?.rawHeaders ?? [];
    let count = 0;
    for (let index = 0; index < rawHeaders.length; index += 2) {
      if (rawHeaders[index]?.toLowerCase() === "idempotency-key") count += 1;
    }
    if (Array.isArray(header) || count > 1 ||
      (typeof header === "string" && header.includes(","))) {
      throw Errors.business(
        400,
        "缺少有效的 Idempotency-Key",
        ErrorCodes.VALIDATION_ERROR,
      );
    }
    return requireSupplierIdempotencyKey(request);
  }

  private parse<Schema extends z.ZodTypeAny>(
    schema: Schema,
    input: unknown,
  ): z.infer<Schema> {
    const result = schema.safeParse(input ?? {});
    if (!result.success) throw Errors.fromZod(result.error);
    return result.data;
  }
}

export default new SupplierPurchasableSkusController();
