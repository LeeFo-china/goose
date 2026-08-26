import { TenantBaseController } from "@/controllers/TenantBaseController";
import { requireSupplierIdempotencyKey } from "@/controllers/supplier-command-http";
import { ErrorCodes } from "@/errors/error-codes";
import { Errors } from "@/errors/error-factory";
import {
  SupplierPurchasableProductCreateSchema,
  SupplierPurchasableProductParamSchema,
} from "@/schema/supplier-purchasable-products";
import { SupplierScopeQuerySchema } from "@/schema/supplier-products";
import {
  supplierPurchasableProductsService,
} from "@/services/supplier-purchasable-products";
import { Post } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import type { FastifyRequest } from "fastify";
import type { z } from "zod";

class SupplierPurchasableProductsController extends TenantBaseController {
  constructor() {
    super("supplier-purchasable-products");
  }

  @Post("/supplier-purchasable-products/:id")
  async createPurchasableProduct(request: FastifyRequest) {
    const auth = await this.getRequiredTenantContext(request);
    const key = requireSupplierIdempotencyKey(request);
    if (Array.isArray(request.headers["idempotency-key"])) {
      throw Errors.business(
        400,
        "缺少有效的 Idempotency-Key",
        ErrorCodes.VALIDATION_ERROR,
      );
    }
    const { id } = this.parse(
      SupplierPurchasableProductParamSchema,
      request.params,
    );
    const { tenantSupplierId } = this.parse(
      SupplierScopeQuerySchema,
      request.query,
    );
    const input = this.parse(
      SupplierPurchasableProductCreateSchema,
      request.body,
    );
    return ResponseHandler.success(
      await supplierPurchasableProductsService.create(
        auth,
        tenantSupplierId,
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

export default new SupplierPurchasableProductsController();
