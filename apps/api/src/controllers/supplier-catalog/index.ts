import type { FastifyRequest } from "fastify";

import { TenantBaseController } from "@/controllers/TenantBaseController";
import {
  CatalogBrandParamSchema,
  CatalogCategoryParamSchema,
  CatalogSpecDefinitionCreateSchema,
  CatalogSpecDefinitionListQuerySchema,
  CatalogSpecDefinitionParamSchema,
  CatalogSpecDefinitionUpdateSchema,
  CatalogUnitListQuerySchema,
  CatalogUnitSuggestionCreateSchema,
  CatalogUnitSuggestionListQuerySchema,
  CopyPlatformSpecDefinitionsSchema,
  TenantCatalogBrandCreateSchema,
  TenantCatalogBrandListQuerySchema,
  TenantCatalogBrandUpdateSchema,
  TenantCatalogCategoryCreateSchema,
  TenantCatalogCategoryListQuerySchema,
  TenantCatalogCategoryUpdateSchema,
} from "@/schema/supplier-catalog";
import { supplierCatalogService } from "@/services/supplier-catalog";
import { Get, Patch, Post } from "@/utils/decorators/route";
import { ResponseHandler } from "@/utils/response";
import { parseCatalogRequest, requireIdempotencyKey } from "./http";

class SupplierCatalogController extends TenantBaseController {
  constructor() {
    super("supplier-catalog");
  }

  @Get("/catalog/categories")
  async listCategories(request: FastifyRequest) {
    const auth = await this.getRequiredTenantContext(request);
    const query = parseCatalogRequest(
      TenantCatalogCategoryListQuerySchema,
      request.query,
    );
    return ResponseHandler.success(
      await supplierCatalogService.listTenantCategories(auth, query),
    );
  }

  @Post("/catalog/categories")
  async createCategory(request: FastifyRequest) {
    const auth = await this.getRequiredTenantContext(request);
    const key = requireIdempotencyKey(request);
    const input = parseCatalogRequest(
      TenantCatalogCategoryCreateSchema,
      request.body,
    );
    return ResponseHandler.success(
      await supplierCatalogService.createTenantCategory(auth, input, key),
    );
  }

  @Patch("/catalog/categories/:id")
  async updateCategory(request: FastifyRequest) {
    const auth = await this.getRequiredTenantContext(request);
    const key = requireIdempotencyKey(request);
    const { id } = parseCatalogRequest(CatalogCategoryParamSchema, request.params);
    const input = parseCatalogRequest(
      TenantCatalogCategoryUpdateSchema,
      request.body,
    );
    return ResponseHandler.success(
      await supplierCatalogService.updateTenantCategory(auth, id, input, key),
    );
  }

  @Get("/catalog/brands")
  async listBrands(request: FastifyRequest) {
    const auth = await this.getRequiredTenantContext(request);
    const query = parseCatalogRequest(
      TenantCatalogBrandListQuerySchema,
      request.query,
    );
    return ResponseHandler.success(
      await supplierCatalogService.listTenantBrands(auth, query),
    );
  }

  @Post("/catalog/brands")
  async createBrand(request: FastifyRequest) {
    const auth = await this.getRequiredTenantContext(request);
    const key = requireIdempotencyKey(request);
    const input = parseCatalogRequest(
      TenantCatalogBrandCreateSchema,
      request.body,
    );
    return ResponseHandler.success(
      await supplierCatalogService.createTenantBrand(auth, input, key),
    );
  }

  @Patch("/catalog/brands/:id")
  async updateBrand(request: FastifyRequest) {
    const auth = await this.getRequiredTenantContext(request);
    const key = requireIdempotencyKey(request);
    const { id } = parseCatalogRequest(CatalogBrandParamSchema, request.params);
    const input = parseCatalogRequest(
      TenantCatalogBrandUpdateSchema,
      request.body,
    );
    return ResponseHandler.success(
      await supplierCatalogService.updateTenantBrand(auth, id, input, key),
    );
  }

  @Get("/catalog/units")
  async listUnits(request: FastifyRequest) {
    const auth = await this.getRequiredTenantContext(request);
    const query = parseCatalogRequest(CatalogUnitListQuerySchema, request.query);
    return ResponseHandler.success(
      await supplierCatalogService.listTenantUnits(auth, query),
    );
  }

  @Get("/catalog/categories/:id/spec-definitions")
  async listSpecDefinitions(request: FastifyRequest) {
    const auth = await this.getRequiredTenantContext(request);
    const { id } = parseCatalogRequest(CatalogCategoryParamSchema, request.params);
    const query = parseCatalogRequest(
      CatalogSpecDefinitionListQuerySchema,
      request.query,
    );
    return ResponseHandler.success(
      await supplierCatalogService.listTenantSpecDefinitions(auth, id, query),
    );
  }

  @Post("/catalog/categories/:id/spec-definitions")
  async createSpecDefinition(request: FastifyRequest) {
    const auth = await this.getRequiredTenantContext(request);
    const key = requireIdempotencyKey(request);
    const { id } = parseCatalogRequest(CatalogCategoryParamSchema, request.params);
    const input = parseCatalogRequest(
      CatalogSpecDefinitionCreateSchema,
      request.body,
    );
    return ResponseHandler.success(
      await supplierCatalogService.createTenantSpecDefinition(
        auth,
        id,
        input,
        key,
      ),
    );
  }

  @Patch("/catalog/categories/:id/spec-definitions/:definitionId")
  async updateSpecDefinition(request: FastifyRequest) {
    const auth = await this.getRequiredTenantContext(request);
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
      await supplierCatalogService.updateTenantSpecDefinition(
        auth,
        id,
        definitionId,
        input,
        key,
      ),
    );
  }

  @Post("/catalog/categories/:id/spec-definitions:copy-platform")
  async copyPlatformSpecDefinitions(request: FastifyRequest) {
    const auth = await this.getRequiredTenantContext(request);
    const key = requireIdempotencyKey(request);
    const { id } = parseCatalogRequest(CatalogCategoryParamSchema, request.params);
    const input = parseCatalogRequest(
      CopyPlatformSpecDefinitionsSchema,
      request.body,
    );
    return ResponseHandler.success(
      await supplierCatalogService.copyPlatformSpecDefinitions(
        auth,
        id,
        input,
        key,
      ),
    );
  }

  @Get("/catalog/unit-suggestions")
  async listUnitSuggestions(request: FastifyRequest) {
    const auth = await this.getRequiredTenantContext(request);
    const query = parseCatalogRequest(
      CatalogUnitSuggestionListQuerySchema,
      request.query,
    );
    return ResponseHandler.success(
      await supplierCatalogService.listTenantUnitSuggestions(auth, query),
    );
  }

  @Post("/catalog/unit-suggestions")
  async submitUnitSuggestion(request: FastifyRequest) {
    const auth = await this.getRequiredTenantContext(request);
    const key = requireIdempotencyKey(request);
    const input = parseCatalogRequest(
      CatalogUnitSuggestionCreateSchema,
      request.body,
    );
    return ResponseHandler.success(
      await supplierCatalogService.submitTenantUnitSuggestion(auth, input, key),
    );
  }
}

export default new SupplierCatalogController();
