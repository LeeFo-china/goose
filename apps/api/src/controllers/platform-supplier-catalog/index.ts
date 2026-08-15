import { PlatformBaseController } from "@/controllers/PlatformBaseController";
import { ErrorCodes } from "@/errors/error-codes";
import { Errors } from "@/errors/error-factory";
import {
  CatalogBrandCreateSchema,
  CatalogBrandListQuerySchema,
  CatalogBrandParamSchema,
  CatalogBrandUpdateSchema,
  CatalogCategoryCreateSchema,
  CatalogCategoryListQuerySchema,
  CatalogCategoryParamSchema,
  CatalogCategoryUpdateSchema,
  CatalogSpecDefinitionCreateSchema,
  CatalogSpecDefinitionIdParamSchema,
  CatalogSpecDefinitionListQuerySchema,
  CatalogSpecDefinitionUpdateSchema,
  CatalogUnitCreateSchema,
  CatalogUnitListQuerySchema,
  CatalogUnitParamSchema,
  CatalogUnitSuggestionListQuerySchema,
  CatalogUnitSuggestionParamSchema,
  CatalogUnitSuggestionProcessSchema,
  CatalogUnitUpdateSchema,
} from "@/schema/supplier-catalog";
import { supplierCatalogService } from "@/services/supplier-catalog";
import { supplierCatalogSpecService } from "@/services/supplier-catalog-spec";
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

class PlatformSupplierCatalogController extends PlatformBaseController {
  constructor() {
    super("platform-supplier-catalog");
  }

  @Get("/platform/catalog/categories")
  async listCategories(request: FastifyRequest) {
    const auth = await this.getCatalogManageContext(request);
    const query = this.parse(CatalogCategoryListQuerySchema, request.query);
    return ResponseHandler.success(
      await supplierCatalogService.listPlatformCategories(auth, query),
    );
  }

  @Post("/platform/catalog/categories")
  async createCategory(request: FastifyRequest) {
    const auth = await this.getCatalogManageContext(request);
    const key = requireIdempotencyKey(request);
    const input = this.parse(CatalogCategoryCreateSchema, request.body);
    return ResponseHandler.success(
      await supplierCatalogService.createCategory(auth, input, key),
    );
  }

  @Patch("/platform/catalog/categories/:id")
  async updateCategory(request: FastifyRequest) {
    const auth = await this.getCatalogManageContext(request);
    const { id } = this.parse(CatalogCategoryParamSchema, request.params);
    const input = this.parse(CatalogCategoryUpdateSchema, request.body);
    return ResponseHandler.success(
      await supplierCatalogService.updateCategory(auth, id, input),
    );
  }

  @Get("/platform/catalog/brands")
  async listBrands(request: FastifyRequest) {
    const auth = await this.getCatalogManageContext(request);
    const query = this.parse(CatalogBrandListQuerySchema, request.query);
    return ResponseHandler.success(
      await supplierCatalogService.listPlatformBrands(auth, query),
    );
  }

  @Post("/platform/catalog/brands")
  async createBrand(request: FastifyRequest) {
    const auth = await this.getCatalogManageContext(request);
    const key = requireIdempotencyKey(request);
    const input = this.parse(CatalogBrandCreateSchema, request.body);
    return ResponseHandler.success(
      await supplierCatalogService.createBrand(auth, input, key),
    );
  }

  @Patch("/platform/catalog/brands/:id")
  async updateBrand(request: FastifyRequest) {
    const auth = await this.getCatalogManageContext(request);
    const { id } = this.parse(CatalogBrandParamSchema, request.params);
    const input = this.parse(CatalogBrandUpdateSchema, request.body);
    return ResponseHandler.success(
      await supplierCatalogService.updateBrand(auth, id, input),
    );
  }

  @Get("/platform/catalog/units")
  async listUnits(request: FastifyRequest) {
    const auth = await this.getCatalogManageContext(request);
    const query = this.parse(CatalogUnitListQuerySchema, request.query);
    return ResponseHandler.success(
      await supplierCatalogService.listPlatformUnits(auth, query),
    );
  }

  @Post("/platform/catalog/units")
  async createUnit(request: FastifyRequest) {
    const auth = await this.getCatalogManageContext(request);
    const key = requireIdempotencyKey(request);
    const input = this.parse(CatalogUnitCreateSchema, request.body);
    return ResponseHandler.success(
      await supplierCatalogService.createUnit(auth, input, key),
    );
  }

  @Patch("/platform/catalog/units/:id")
  async updateUnit(request: FastifyRequest) {
    const auth = await this.getCatalogManageContext(request);
    const { id } = this.parse(CatalogUnitParamSchema, request.params);
    const input = this.parse(CatalogUnitUpdateSchema, request.body);
    return ResponseHandler.success(
      await supplierCatalogService.updateUnit(auth, id, input),
    );
  }

  @Get("/platform/catalog/categories/:id/spec-definitions")
  async listSpecDefinitions(request: FastifyRequest) {
    const auth = await this.getCatalogManageContext(request);
    const { id } = this.parse(CatalogCategoryParamSchema, request.params);
    const query = this.parse(
      CatalogSpecDefinitionListQuerySchema,
      request.query,
    );
    return ResponseHandler.success(
      await supplierCatalogSpecService.listPlatformSpecDefinitions(
        auth,
        id,
        query,
      ),
    );
  }

  @Post("/platform/catalog/categories/:id/spec-definitions")
  async createSpecDefinition(request: FastifyRequest) {
    const auth = await this.getCatalogManageContext(request);
    const { id } = this.parse(CatalogCategoryParamSchema, request.params);
    const key = requireIdempotencyKey(request);
    const input = this.parse(
      CatalogSpecDefinitionCreateSchema,
      request.body,
    );
    return ResponseHandler.success(
      await supplierCatalogSpecService.createPlatformSpecDefinition(
        auth,
        id,
        input,
        key,
      ),
    );
  }

  @Patch("/platform/catalog/categories/:id/spec-definitions/:specId")
  async updateSpecDefinition(request: FastifyRequest) {
    const auth = await this.getCatalogManageContext(request);
    const { specId } = this.parse(
      CatalogSpecDefinitionIdParamSchema,
      request.params,
    );
    const input = this.parse(
      CatalogSpecDefinitionUpdateSchema,
      request.body,
    );
    return ResponseHandler.success(
      await supplierCatalogSpecService.updatePlatformSpecDefinition(
        auth,
        specId,
        input,
      ),
    );
  }

  @Get("/platform/catalog/unit-suggestions")
  async listUnitSuggestions(request: FastifyRequest) {
    const auth = await this.getCatalogManageContext(request);
    const query = this.parse(
      CatalogUnitSuggestionListQuerySchema,
      request.query,
    );
    return ResponseHandler.success(
      await supplierCatalogSpecService.listPlatformUnitSuggestions(auth, query),
    );
  }

  @Patch("/platform/catalog/unit-suggestions/:id")
  async processUnitSuggestion(request: FastifyRequest) {
    const auth = await this.getCatalogManageContext(request);
    const { id } = this.parse(
      CatalogUnitSuggestionParamSchema,
      request.params,
    );
    const input = this.parse(
      CatalogUnitSuggestionProcessSchema,
      request.body,
    );
    return ResponseHandler.success(
      await supplierCatalogSpecService.processUnitSuggestion(auth, id, input),
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

  private getCatalogManageContext(request: FastifyRequest) {
    return this.getRequiredPlatformPermissionContext(
      request,
      "platform.catalog.manage",
    );
  }
}

export default new PlatformSupplierCatalogController();
