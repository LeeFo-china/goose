import { Errors } from "@/errors/error-factory";
import type { SupplierCatalogRepositoryPort } from "@/repositories/supplier-catalog";
import type {
  CatalogSpecDefinitionCreateInput,
  CatalogSpecDefinitionListQuery,
  CatalogSpecDefinitionUpdateInput,
  CatalogUnitSuggestionReviewInput,
  PlatformCatalogUnitSuggestionListQuery,
} from "@/schema/supplier-catalog";
import type { AuthContext } from "@/services/authorization";
import type { SupplierCatalogCommandIdFactory } from "./supplier-catalog-command-id";
import { validateCatalogSpecFinalState } from "./supplier-catalog-spec-state";
import { resolveSpecUpdateReplay } from "./supplier-catalog-update-replay";

type PlatformActor = {
  authUserId: string;
  employeeId: string;
};

type PlatformWorkflowDependencies = {
  repository: SupplierCatalogRepositoryPort;
  commandIdFactory: SupplierCatalogCommandIdFactory;
  requirePlatform: (authContext: AuthContext) => void;
  requirePlatformActor: (authContext: AuthContext) => PlatformActor;
  mapCatalogConflict: <T>(operation: () => Promise<T>) => Promise<T>;
};

export class SupplierCatalogPlatformWorkflows {
  constructor(private readonly dependencies: PlatformWorkflowDependencies) {}

  listSpecDefinitions(
    authContext: AuthContext,
    categoryId: string,
    query: CatalogSpecDefinitionListQuery,
  ) {
    this.dependencies.requirePlatform(authContext);
    return this.dependencies.repository.listSpecDefinitions(
      categoryId,
      query,
      { kind: "platform" },
    );
  }

  createSpecDefinition(
    authContext: AuthContext,
    categoryId: string,
    input: CatalogSpecDefinitionCreateInput,
    idempotencyKey: string,
  ) {
    const actor = this.dependencies.requirePlatformActor(authContext);
    return this.dependencies.mapCatalogConflict(() =>
      this.dependencies.repository.createSpecDefinition({
        ...input,
        spec_definition_id: this.dependencies.commandIdFactory(
          "platform.catalog.spec-definition.create",
          actor.authUserId,
          idempotencyKey,
        ),
        category_id: categoryId,
        tenant_id: null,
        ...createContext(actor, idempotencyKey),
      })
    );
  }

  async updateSpecDefinition(
    authContext: AuthContext,
    categoryId: string,
    definitionId: string,
    input: CatalogSpecDefinitionUpdateInput,
    idempotencyKey: string,
  ) {
    const actor = this.dependencies.requirePlatformActor(authContext);
    const replay = await resolveSpecUpdateReplay(
      this.dependencies.repository,
      { ...actor, tenantId: null },
      categoryId,
      definitionId,
      input,
      idempotencyKey,
    );
    if (replay) {
      validateCatalogSpecFinalState(replay);
      return this.dependencies.mapCatalogConflict(() =>
        this.dependencies.repository.updateSpecDefinition(replay)
      );
    }
    const current = await this.dependencies.repository.findVisibleSpecDefinition(
      categoryId,
      definitionId,
      { kind: "platform" },
    );
    if (!current) {
      throw Errors.business(
        404,
        "平台规格定义不存在",
        "SUPPLIER_CATALOG_NOT_FOUND",
      );
    }
    const command = {
      spec_definition_id: definitionId,
      category_id: categoryId,
      code: input.code ?? current.code,
      name: input.name ?? current.name,
      value_type: input.value_type ?? current.value_type,
      enum_options: input.enum_options ?? current.enum_options,
      unit_dimension: input.unit_dimension === undefined
        ? current.unit_dimension
        : input.unit_dimension,
      is_required: input.is_required ?? current.is_required,
      participates_in_sku_name: input.participates_in_sku_name ??
        current.participates_in_sku_name,
      is_filterable: input.is_filterable ?? current.is_filterable,
      sort_order: input.sort_order ?? current.sort_order,
      status: input.status ?? current.status,
      expected_version: input.expected_version,
      tenant_id: null,
      ...createContext(actor, idempotencyKey),
    };
    validateCatalogSpecFinalState(command);
    return this.dependencies.mapCatalogConflict(() =>
      this.dependencies.repository.updateSpecDefinition(command)
    );
  }

  listUnitSuggestions(
    authContext: AuthContext,
    query: PlatformCatalogUnitSuggestionListQuery,
  ) {
    const actor = this.dependencies.requirePlatformActor(authContext);
    return this.dependencies.repository.listUnitSuggestions({
      ...query,
      tenant_id: query.tenant_id ?? null,
      actor_user_id: actor.authUserId,
      actor_employee_id: actor.employeeId,
    });
  }

  reviewUnitSuggestion(
    authContext: AuthContext,
    suggestionId: string,
    input: CatalogUnitSuggestionReviewInput,
    idempotencyKey: string,
  ) {
    const actor = this.dependencies.requirePlatformActor(authContext);
    return this.dependencies.mapCatalogConflict(() =>
      this.dependencies.repository.reviewUnitSuggestion({
        ...input,
        suggestion_id: suggestionId,
        ...createContext(actor, idempotencyKey),
      })
    );
  }
}

function createContext(actor: PlatformActor, idempotencyKey: string) {
  return {
    actor_user_id: actor.authUserId,
    actor_employee_id: actor.employeeId,
    idempotency_key: idempotencyKey,
  };
}
