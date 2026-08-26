import type {
  CatalogSpecDefinitionCreateInput,
  CatalogUnitSuggestionCreateInput,
  CatalogUnitSuggestionListQuery,
  PlatformCatalogUnitSuggestionListQuery,
  CatalogUnitSuggestionReviewInput,
} from "@/schema/supplier-catalog";
import { Errors } from "@/errors/error-factory";
import { throwSupplierCommandDatabaseError } from "./supplier-command-errors";
import {
  CatalogSpecDefinitionSchema,
  CatalogUnitSuggestionPageSchema,
  CatalogUnitSuggestionSchema,
  parseRow,
} from "./supplier-catalog-models";
import type { CatalogClient } from "./supplier-catalog-read";
import {
  executeCatalogCommand,
  executeCatalogResourceCommand,
} from "./supplier-catalog-command-rpc";
import type {
  CatalogActorCommand,
  TenantCatalogCommand,
} from "./supplier-catalog-commands";

export type SpecDefinitionCreateCommand =
  Omit<CatalogSpecDefinitionCreateInput, "code"> & CatalogActorCommand & {
    code: string;
    spec_definition_id: string;
    category_id: string;
    tenant_id: string | null;
  };
export type SpecDefinitionUpdateCommand = SpecDefinitionCreateCommand & {
  expected_version: number;
};
export type CopyPlatformSpecDefinitionsCommand = TenantCatalogCommand & {
  tenant_category_id: string;
  platform_category_id: string;
  expected_version: number;
};
export type SubmitUnitSuggestionCommand =
  CatalogUnitSuggestionCreateInput & TenantCatalogCommand & {
    suggestion_id: string;
  };
export type ReviewUnitSuggestionCommand =
  CatalogUnitSuggestionReviewInput & CatalogActorCommand & {
    suggestion_id: string;
  };
export type ListUnitSuggestionsCommand =
  Pick<CatalogActorCommand, "actor_user_id" | "actor_employee_id"> &
  (CatalogUnitSuggestionListQuery | PlatformCatalogUnitSuggestionListQuery) &
  { tenant_id: string | null };

export class SupplierCatalogWorkflowRepository {
  constructor(private readonly client: CatalogClient) {}

  createSpecDefinition(input: SpecDefinitionCreateCommand) {
    return executeCatalogResourceCommand({
      client: this.client,
      functionName: "create_catalog_spec_definition",
      expectedStatus: "created",
      resourceKey: "spec_definition",
      resourceSchema: CatalogSpecDefinitionSchema,
      message: "新增目录规格定义失败",
      params: specParams(input),
    });
  }

  updateSpecDefinition(input: SpecDefinitionUpdateCommand) {
    return executeCatalogResourceCommand({
      client: this.client,
      functionName: "update_catalog_spec_definition",
      expectedStatus: "updated",
      resourceKey: "spec_definition",
      resourceSchema: CatalogSpecDefinitionSchema,
      message: "更新目录规格定义失败",
      params: {
        ...specParams(input),
        p_expected_version: input.expected_version,
      },
    });
  }

  async copyPlatformSpecDefinitions(input: CopyPlatformSpecDefinitionsCommand) {
    const result = await executeCatalogCommand({
      client: this.client,
      functionName: "copy_platform_category_specs",
      message: "复制平台规格定义失败",
      params: {
        p_tenant_category_id: input.tenant_category_id,
        p_platform_category_id: input.platform_category_id,
        p_expected_version: input.expected_version,
        ...tenantContext(input),
      },
    });
    if (result.status !== "copied") {
      throw Errors.business(
        409,
        "复制平台规格定义失败",
        "SPEC_TEMPLATE_VALIDATION_ERROR",
        result,
      );
    }
    return result;
  }

  async listUnitSuggestions(input: ListUnitSuggestionsCommand) {
    const { data, error } = await this.client.rpc(
      "list_catalog_unit_suggestions",
      {
        p_actor_user_id: input.actor_user_id,
        p_actor_employee_id: input.actor_employee_id,
        p_status: input.status ?? null,
        p_tenant_id: input.tenant_id,
        p_page: input.page,
        p_page_size: input.pageSize,
      },
    );
    if (error) {
      throwSupplierCommandDatabaseError(error, "查询目录单位建议失败");
    }
    return parseRow(
      CatalogUnitSuggestionPageSchema,
      data,
      "查询目录单位建议失败",
    );
  }

  submitUnitSuggestion(input: SubmitUnitSuggestionCommand) {
    return executeCatalogResourceCommand({
      client: this.client,
      functionName: "submit_tenant_catalog_unit_suggestion",
      expectedStatus: "submitted",
      resourceKey: "catalog_unit_suggestion",
      resourceSchema: CatalogUnitSuggestionSchema,
      message: "提交目录单位建议失败",
      params: {
        p_suggestion_id: input.suggestion_id,
        p_suggested_code: input.suggested_code,
        p_suggested_name: input.suggested_name,
        p_suggested_symbol: input.suggested_symbol,
        p_unit_dimension: input.unit_dimension,
        p_reason: input.reason ?? null,
        ...tenantContext(input),
      },
    });
  }

  reviewUnitSuggestion(input: ReviewUnitSuggestionCommand) {
    return executeCatalogResourceCommand({
      client: this.client,
      functionName: "review_catalog_unit_suggestion",
      expectedStatus: input.action,
      resourceKey: "catalog_unit_suggestion",
      resourceSchema: CatalogUnitSuggestionSchema,
      message: "审核目录单位建议失败",
      params: {
        p_suggestion_id: input.suggestion_id,
        p_action: input.action,
        p_approved_catalog_unit_id:
          input.approved_catalog_unit_id ?? null,
        p_review_remark: input.review_remark ?? null,
        p_expected_version: input.expected_version,
        p_actor_user_id: input.actor_user_id,
        p_actor_employee_id: input.actor_employee_id,
        p_idempotency_key: input.idempotency_key,
      },
    });
  }
}

function actorContext(input: CatalogActorCommand) {
  return {
    p_actor_user_id: input.actor_user_id,
    p_actor_employee_id: input.actor_employee_id,
    p_idempotency_key: input.idempotency_key,
  };
}

function tenantContext(input: TenantCatalogCommand) {
  return { p_tenant_id: input.tenant_id, ...actorContext(input) };
}

function specParams(input: SpecDefinitionCreateCommand) {
  return {
    p_spec_definition_id: input.spec_definition_id,
    p_category_id: input.category_id,
    p_code: input.code,
    p_name: input.name,
    p_value_type: input.value_type,
    p_enum_options: input.enum_options,
    p_unit_dimension: input.unit_dimension ?? null,
    p_is_required: input.is_required,
    p_participates_in_sku_name: input.participates_in_sku_name,
    p_is_filterable: input.is_filterable,
    p_sort_order: input.sort_order,
    p_status: input.status,
    p_tenant_id: input.tenant_id,
    ...actorContext(input),
  };
}
