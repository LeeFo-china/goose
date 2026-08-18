import { TenantBaseController } from "@/controllers/TenantBaseController";
import { Errors } from "@/errors/error-factory";
import {
  CatalogBrandListQuerySchema,
  CatalogCategoryListQuerySchema,
  CatalogUnitListQuerySchema,
} from "@/schema/supplier-catalog";
import { supplierCatalogService } from "@/services/supplier-catalog";
import { Get } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import type { FastifyRequest } from "fastify";
import type { z } from "zod";

class SupplierCatalogController extends TenantBaseController {
  constructor() {
    super("supplier-catalog");
  }

  @Get("/catalog/categories")
  async listCategories(request: FastifyRequest) {
    const auth = await this.getRequiredTenantContext(request);
    const query = this.parse(CatalogCategoryListQuerySchema, request.query);
    return ResponseHandler.success(
      await supplierCatalogService.listTenantCategories(auth, query),
    );
  }

  @Get("/catalog/brands")
  async listBrands(request: FastifyRequest) {
    const auth = await this.getRequiredTenantContext(request);
    const query = this.parse(CatalogBrandListQuerySchema, request.query);
    return ResponseHandler.success(
      await supplierCatalogService.listTenantBrands(auth, query),
    );
  }

  @Get("/catalog/units")
  async listUnits(request: FastifyRequest) {
    const auth = await this.getRequiredTenantContext(request);
    const query = this.parse(CatalogUnitListQuerySchema, request.query);
    return ResponseHandler.success(
      await supplierCatalogService.listTenantUnits(auth, query),
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

export default new SupplierCatalogController();
