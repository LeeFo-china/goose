import type {
  CatalogBrandListQuery,
  CatalogBrandUpdateRecord,
  CatalogCategoryListQuery,
  CatalogCategoryUpdateRecord,
  CatalogSpecDefinitionListQuery,
  CatalogUnitListQuery,
  CatalogUnitSuggestionListQuery,
  CatalogUnitUpdateRecord,
} from "@/schema/supplier-catalog";
import type {
  CatalogBrandCreateCommand,
  CatalogCategoryCreateCommand,
  CatalogUnitCreateCommand,
} from "@/schema/supplier-create-commands";
import { SupabaseDB } from "@/utils/supabase";
import {
  SupplierCatalogCommandRepository,
  type TenantBrandCreateCommand,
  type TenantBrandUpdateCommand,
  type TenantCategoryCreateCommand,
  type TenantCategoryUpdateCommand,
} from "./supplier-catalog-commands";
import type {
  CatalogBrand,
  CatalogCategory,
  CatalogPage,
  CatalogSpecDefinition,
  CatalogUnit,
  CatalogVisibility,
} from "./supplier-catalog-models";
import { SupplierCatalogReadRepository } from "./supplier-catalog-read";
import {
  type CatalogUpdateReplay,
  SupplierCatalogReplayRepository,
} from "./supplier-catalog-replay";
import {
  SupplierCatalogWorkflowRepository,
  type CopyPlatformSpecDefinitionsCommand,
  type ListUnitSuggestionsCommand,
  type ReviewUnitSuggestionCommand,
  type SpecDefinitionCreateCommand,
  type SpecDefinitionUpdateCommand,
  type SubmitUnitSuggestionCommand,
} from "./supplier-catalog-workflows";

export type {
  CatalogBrand,
  CatalogCategory,
  CatalogPage,
  CatalogSpecDefinition,
  CatalogUnit,
  CatalogUnitRecord,
  CatalogUnitSuggestion,
  CatalogVisibility,
  PlatformBrand,
  PlatformCategory,
} from "./supplier-catalog-models";
export type {
  CopyPlatformSpecDefinitionsCommand,
  ListUnitSuggestionsCommand,
  ReviewUnitSuggestionCommand,
  SpecDefinitionCreateCommand,
  SpecDefinitionUpdateCommand,
  SubmitUnitSuggestionCommand,
} from "./supplier-catalog-workflows";
export type {
  TenantBrandCreateCommand,
  TenantBrandUpdateCommand,
  TenantCategoryCreateCommand,
  TenantCategoryUpdateCommand,
} from "./supplier-catalog-commands";
export type { CatalogUpdateReplay } from "./supplier-catalog-replay";

export interface SupplierCatalogRepositoryPort {
  listCategories(
    query: CatalogCategoryListQuery,
    visibility?: CatalogVisibility,
  ): Promise<CatalogPage<CatalogCategory>>;
  listBrands(
    query: CatalogBrandListQuery,
    visibility?: CatalogVisibility,
  ): Promise<CatalogPage<CatalogBrand>>;
  listUnits(query: CatalogUnitListQuery): Promise<CatalogPage<CatalogUnit>>;
  listSpecDefinitions(
    categoryId: string,
    query: CatalogSpecDefinitionListQuery,
    visibility: CatalogVisibility,
  ): Promise<CatalogPage<CatalogSpecDefinition>>;
  findVisibleCategory(id: string, visibility: CatalogVisibility): Promise<CatalogCategory | null>;
  findVisibleBrand(id: string, visibility: CatalogVisibility): Promise<CatalogBrand | null>;
  findVisibleSpecDefinition(
    categoryId: string,
    definitionId: string,
    visibility: CatalogVisibility,
  ): Promise<CatalogSpecDefinition | null>;
  createCategory(input: CatalogCategoryCreateCommand): Promise<unknown>;
  updateCategory(input: CatalogCategoryUpdateRecord): Promise<unknown>;
  createBrand(input: CatalogBrandCreateCommand): Promise<unknown>;
  updateBrand(input: CatalogBrandUpdateRecord): Promise<unknown>;
  createUnit(input: CatalogUnitCreateCommand): Promise<unknown>;
  updateUnit(input: CatalogUnitUpdateRecord): Promise<unknown>;
  createTenantCategory(input: TenantCategoryCreateCommand): Promise<unknown>;
  updateTenantCategory(input: TenantCategoryUpdateCommand): Promise<unknown>;
  createTenantBrand(input: TenantBrandCreateCommand): Promise<unknown>;
  updateTenantBrand(input: TenantBrandUpdateCommand): Promise<unknown>;
  createSpecDefinition(input: SpecDefinitionCreateCommand): Promise<unknown>;
  updateSpecDefinition(input: SpecDefinitionUpdateCommand): Promise<unknown>;
  copyPlatformSpecDefinitions(input: CopyPlatformSpecDefinitionsCommand): Promise<unknown>;
  listUnitSuggestions(input: ListUnitSuggestionsCommand): Promise<unknown>;
  submitUnitSuggestion(input: SubmitUnitSuggestionCommand): Promise<unknown>;
  reviewUnitSuggestion(input: ReviewUnitSuggestionCommand): Promise<unknown>;
  findCatalogUpdateReplay(
    actorUserId: string,
    idempotencyKey: string,
  ): Promise<CatalogUpdateReplay | null>;
}

export class SupplierCatalogRepository implements SupplierCatalogRepositoryPort {
  private readonly reads: SupplierCatalogReadRepository;
  private readonly commands: SupplierCatalogCommandRepository;
  private readonly workflows: SupplierCatalogWorkflowRepository;
  private readonly replay: SupplierCatalogReplayRepository;

  constructor(clientFactory = () => SupabaseDB.getAdminClient()) {
    const client = clientFactory();
    this.reads = new SupplierCatalogReadRepository(client);
    this.commands = new SupplierCatalogCommandRepository(client);
    this.workflows = new SupplierCatalogWorkflowRepository(client);
    this.replay = new SupplierCatalogReplayRepository(client);
  }

  listCategories(
    query: CatalogCategoryListQuery,
    visibility?: CatalogVisibility,
  ) {
    return this.reads.listCategories(query, visibility);
  }

  listBrands(query: CatalogBrandListQuery, visibility?: CatalogVisibility) {
    return this.reads.listBrands(query, visibility);
  }

  listUnits(query: CatalogUnitListQuery) {
    return this.reads.listUnits(query);
  }

  listSpecDefinitions(
    categoryId: string,
    query: CatalogSpecDefinitionListQuery,
    visibility: CatalogVisibility,
  ) {
    return this.reads.listSpecDefinitions(categoryId, query, visibility);
  }

  findVisibleCategory(id: string, visibility: CatalogVisibility) {
    return this.reads.findVisibleCategory(id, visibility);
  }

  findVisibleBrand(id: string, visibility: CatalogVisibility) {
    return this.reads.findVisibleBrand(id, visibility);
  }

  findVisibleSpecDefinition(
    categoryId: string,
    definitionId: string,
    visibility: CatalogVisibility,
  ) {
    return this.reads.findVisibleSpecDefinition(
      categoryId,
      definitionId,
      visibility,
    );
  }

  createCategory(input: CatalogCategoryCreateCommand) {
    return this.commands.createCategory(input);
  }

  updateCategory(input: CatalogCategoryUpdateRecord) {
    return this.commands.updateCategory(input);
  }

  createBrand(input: CatalogBrandCreateCommand) {
    return this.commands.createBrand(input);
  }

  updateBrand(input: CatalogBrandUpdateRecord) {
    return this.commands.updateBrand(input);
  }

  createUnit(input: CatalogUnitCreateCommand) {
    return this.commands.createUnit(input);
  }

  updateUnit(input: CatalogUnitUpdateRecord) {
    return this.commands.updateUnit(input);
  }

  createTenantCategory(input: TenantCategoryCreateCommand) {
    return this.commands.createTenantCategory(input);
  }

  updateTenantCategory(input: TenantCategoryUpdateCommand) {
    return this.commands.updateTenantCategory(input);
  }

  createTenantBrand(input: TenantBrandCreateCommand) {
    return this.commands.createTenantBrand(input);
  }

  updateTenantBrand(input: TenantBrandUpdateCommand) {
    return this.commands.updateTenantBrand(input);
  }

  createSpecDefinition(input: SpecDefinitionCreateCommand) {
    return this.workflows.createSpecDefinition(input);
  }

  updateSpecDefinition(input: SpecDefinitionUpdateCommand) {
    return this.workflows.updateSpecDefinition(input);
  }

  copyPlatformSpecDefinitions(input: CopyPlatformSpecDefinitionsCommand) {
    return this.workflows.copyPlatformSpecDefinitions(input);
  }

  listUnitSuggestions(input: ListUnitSuggestionsCommand) {
    return this.workflows.listUnitSuggestions(input);
  }

  submitUnitSuggestion(input: SubmitUnitSuggestionCommand) {
    return this.workflows.submitUnitSuggestion(input);
  }

  reviewUnitSuggestion(input: ReviewUnitSuggestionCommand) {
    return this.workflows.reviewUnitSuggestion(input);
  }

  findCatalogUpdateReplay(actorUserId: string, idempotencyKey: string) {
    return this.replay.find(actorUserId, idempotencyKey);
  }
}

export const supplierCatalogRepository = new SupplierCatalogRepository();
