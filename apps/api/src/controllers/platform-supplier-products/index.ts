import { PlatformBaseController } from "@/controllers/PlatformBaseController";
import { Errors } from "@/errors/error-factory";
import {
  PlatformSupplierProductListQuerySchema,
  PlatformSupplierProductScopeQuerySchema,
  SupplierProductParamSchema,
} from "@/schema/supplier-products";
import { platformSupplierProductsService } from "@/services/platform-supplier-products";
import { Get } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import type { FastifyRequest } from "fastify";
import type { z } from "zod";

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
