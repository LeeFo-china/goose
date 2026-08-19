import { PlatformBaseController } from "@/controllers/PlatformBaseController";
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
  CatalogSpecDefinitionListQuerySchema,
  CatalogSpecDefinitionParamSchema,
  CatalogSpecDefinitionUpdateSchema,
  CatalogUnitCreateSchema,
  CatalogUnitListQuerySchema,
  CatalogUnitParamSchema,
  CatalogUnitSuggestionParamSchema,
  CatalogUnitSuggestionReviewSchema,
  CatalogUnitUpdateSchema,
  PlatformCatalogUnitSuggestionListQuerySchema,
} from "@/schema/supplier-catalog";
import { supplierCatalogService } from "@/services/supplier-catalog";
import { Get, Patch, Post } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import type { FastifyRequest } from "fastify";
import {
  parseCatalogRequest,
  requireIdempotencyKey,
} from "@/controllers/supplier-catalog/http";

class PlatformSupplierCatalogController extends PlatformBaseController {
  constructor() {
    super("platform-supplier-catalog");
  }

  @Get("/platform/catalog/categories")
  async listCategories(request: FastifyRequest) {
    const auth = await this.getCatalogManageContext(request);
    const query = parseCatalogRequest(CatalogCategoryListQuerySchema, request.query);
    return ResponseHandler.success(
      await supplierCatalogService.listPlatformCategories(auth, query),
    );
  }

  @Post("/platform/catalog/categories")
  async createCategory(request: FastifyRequest) {
    const auth = await this.getCatalogManageContext(request);
    const key = requireIdempotencyKey(request);
    const input = parseCatalogRequest(CatalogCategoryCreateSchema, request.body);
    return ResponseHandler.success(
      await supplierCatalogService.createCategory(auth, input, key),
    );
  }

  @Patch("/platform/catalog/categories/:id")
  async updateCategory(request: FastifyRequest) {
    const auth = await this.getCatalogManageContext(request);
    const { id } = parseCatalogRequest(CatalogCategoryParamSchema, request.params);
    const input = parseCatalogRequest(CatalogCategoryUpdateSchema, request.body);
    return ResponseHandler.success(
      await supplierCatalogService.updateCategory(auth, id, input),
    );
  }

  @Get("/platform/catalog/brands")
  async listBrands(request: FastifyRequest) {
    const auth = await this.getCatalogManageContext(request);
    const query = parseCatalogRequest(CatalogBrandListQuerySchema, request.query);
    return ResponseHandler.success(
      await supplierCatalogService.listPlatformBrands(auth, query),
    );
  }

  @Post("/platform/catalog/brands")
  async createBrand(request: FastifyRequest) {
    const auth = await this.getCatalogManageContext(request);
    const key = requireIdempotencyKey(request);
    const input = parseCatalogRequest(CatalogBrandCreateSchema, request.body);
    return ResponseHandler.success(
      await supplierCatalogService.createBrand(auth, input, key),
    );
  }

  @Patch("/platform/catalog/brands/:id")
  async updateBrand(request: FastifyRequest) {
    const auth = await this.getCatalogManageContext(request);
    const { id } = parseCatalogRequest(CatalogBrandParamSchema, request.params);
    const input = parseCatalogRequest(CatalogBrandUpdateSchema, request.body);
    return ResponseHandler.success(
      await supplierCatalogService.updateBrand(auth, id, input),
    );
  }

  @Get("/platform/catalog/units")
  async listUnits(request: FastifyRequest) {
    const auth = await this.getCatalogManageContext(request);
    const query = parseCatalogRequest(CatalogUnitListQuerySchema, request.query);
    return ResponseHandler.success(
      await supplierCatalogService.listPlatformUnits(auth, query),
    );
  }

  @Post("/platform/catalog/units")
  async createUnit(request: FastifyRequest) {
    const auth = await this.getCatalogManageContext(request);
    const key = requireIdempotencyKey(request);
    const input = parseCatalogRequest(CatalogUnitCreateSchema, request.body);
    return ResponseHandler.success(
      await supplierCatalogService.createUnit(auth, input, key),
    );
  }

  @Patch("/platform/catalog/units/:id")
  async updateUnit(request: FastifyRequest) {
    const auth = await this.getCatalogManageContext(request);
    const { id } = parseCatalogRequest(CatalogUnitParamSchema, request.params);
    const input = parseCatalogRequest(CatalogUnitUpdateSchema, request.body);
    return ResponseHandler.success(
      await supplierCatalogService.updateUnit(auth, id, input),
    );
  }

  @Get("/platform/catalog/categories/:id/spec-definitions")
  async listSpecDefinitions(request: FastifyRequest) {
    const auth = await this.getCatalogManageContext(request);
    const { id } = parseCatalogRequest(CatalogCategoryParamSchema, request.params);
    const query = parseCatalogRequest(
      CatalogSpecDefinitionListQuerySchema,
      request.query,
    );
    return ResponseHandler.success(
      await supplierCatalogService.listPlatformSpecDefinitions(auth, id, query),
    );
  }

  @Post("/platform/catalog/categories/:id/spec-definitions")
  async createSpecDefinition(request: FastifyRequest) {
    const auth = await this.getCatalogManageContext(request);
    const key = requireIdempotencyKey(request);
    const { id } = parseCatalogRequest(CatalogCategoryParamSchema, request.params);
    const input = parseCatalogRequest(
      CatalogSpecDefinitionCreateSchema,
      request.body,
    );
    return ResponseHandler.success(
      await supplierCatalogService.createPlatformSpecDefinition(
        auth,
        id,
        input,
        key,
      ),
    );
  }

  @Patch("/platform/catalog/categories/:id/spec-definitions/:definitionId")
  async updateSpecDefinition(request: FastifyRequest) {
    const auth = await this.getCatalogManageContext(request);
    const key = requireIdempotencyKey(request);
    const { id, definitionId } = parseCatalogRequest(
      CatalogSpecDefinitionParamSchema,
      request.params,
    );
    const input = parseCatalogRequest(
      CatalogSpecDefinitionUpdateSchema,
      request.body,
    );
    return ResponseHandler.success(
      await supplierCatalogService.updatePlatformSpecDefinition(
        auth,
        id,
        definitionId,
        input,
        key,
      ),
    );
  }

  @Get("/platform/catalog/unit-suggestions")
  async listUnitSuggestions(request: FastifyRequest) {
    const auth = await this.getCatalogManageContext(request);
    const query = parseCatalogRequest(
      PlatformCatalogUnitSuggestionListQuerySchema,
      request.query,
    );
    return ResponseHandler.success(
      await supplierCatalogService.listPlatformUnitSuggestions(auth, query),
    );
  }

  @Patch("/platform/catalog/unit-suggestions/:id")
  async reviewUnitSuggestion(request: FastifyRequest) {
    const auth = await this.getCatalogManageContext(request);
    const key = requireIdempotencyKey(request);
    const { id } = parseCatalogRequest(
      CatalogUnitSuggestionParamSchema,
      request.params,
    );
    const input = parseCatalogRequest(
      CatalogUnitSuggestionReviewSchema,
      request.body,
    );
    return ResponseHandler.success(
      await supplierCatalogService.reviewPlatformUnitSuggestion(
        auth,
        id,
        input,
        key,
      ),
    );
  }

  private getCatalogManageContext(request: FastifyRequest) {
    return this.getRequiredPlatformPermissionContext(
      request,
      "platform.catalog.manage",
    );
  }
}

export default new PlatformSupplierCatalogController();
