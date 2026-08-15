import { TenantBaseController } from "@/controllers/TenantBaseController";
import { ErrorCodes } from "@/errors/error-codes";
import { Errors } from "@/errors/error-factory";
import {
  CatalogBrandListQuerySchema,
  CatalogCategoryListQuerySchema,
  CatalogUnitListQuerySchema,
  CatalogCategoryParamSchema,
  CatalogBrandParamSchema,
  TenantCatalogCategoryCreateSchema,
  TenantCatalogCategoryUpdateSchema,
  TenantCatalogBrandCreateSchema,
  TenantCatalogBrandUpdateSchema,
} from "@/schema/supplier-catalog";
import { supplierCatalogService } from "@/services/supplier-catalog";
import { Get, Patch, Post } from "@/utils/decorators/route";
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
      ErrorCodes.VALIDATION_ERROR,
    );
  }
  return key;
}

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

  @Post("/catalog/categories")
  async createCategory(request: FastifyRequest) {
    const auth = await this.getRequiredTenantContext(request);
    const key = requireIdempotencyKey(request);
    const input = this.parse(TenantCatalogCategoryCreateSchema, request.body);
    return ResponseHandler.success(
      await supplierCatalogService.createTenantCategory(auth, input, key),
    );
  }

  @Patch("/catalog/categories/:id")
  async updateCategory(request: FastifyRequest) {
    const auth = await this.getRequiredTenantContext(request);
    const { id } = this.parse(CatalogCategoryParamSchema, request.params);
    const input = this.parse(TenantCatalogCategoryUpdateSchema, request.body);
    return ResponseHandler.success(
      await supplierCatalogService.updateTenantCategory(auth, id, input),
    );
  }

  @Post("/catalog/brands")
  async createBrand(request: FastifyRequest) {
    const auth = await this.getRequiredTenantContext(request);
    const key = requireIdempotencyKey(request);
    const input = this.parse(TenantCatalogBrandCreateSchema, request.body);
    return ResponseHandler.success(
      await supplierCatalogService.createTenantBrand(auth, input, key),
    );
  }

  @Patch("/catalog/brands/:id")
  async updateBrand(request: FastifyRequest) {
    const auth = await this.getRequiredTenantContext(request);
    const { id } = this.parse(CatalogBrandParamSchema, request.params);
    const input = this.parse(TenantCatalogBrandUpdateSchema, request.body);
    return ResponseHandler.success(
      await supplierCatalogService.updateTenantBrand(auth, id, input),
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
