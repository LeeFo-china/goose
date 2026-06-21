import { workflowRepository } from "@/repositories/workflows";
import type { WorkflowListQuery } from "@/schema/workflows";
import { accessPolicyService } from "@/services/access-policy";
import type { AuthContext } from "@/services/authorization";

const WORKFLOW_MANAGE_PERMISSION = "employee.permission_manage";

export async function listWorkflowDefinitions(
  authContext: AuthContext,
  query: WorkflowListQuery,
) {
  const tenantId = assertWorkflowManagePermission(authContext);
  const result = await workflowRepository.listDefinitions({
    tenantId,
    page: query.page,
    pageSize: query.pageSize,
    status: query.status,
    category: query.category,
    keyword: query.keyword?.trim() || undefined,
  });
  const constructionDefinitionIds = result.list
    .filter((definition) => definition.category === "construction")
    .map((definition) => definition.id);
  const bindings = await workflowRepository.listProjectConstructionBindingsByDefinitionIds({
    tenantId,
    definitionIds: constructionDefinitionIds,
  });
  const bindingMap = new Map(bindings.map((binding) => [
    binding.definition_id,
    binding,
  ]));

  return {
    ...result,
    list: result.list.map((definition) => ({
      ...definition,
      project_construction_binding: definition.category === "construction"
        ? bindingMap.get(definition.id) ?? null
        : null,
    })),
  };
}

function assertWorkflowManagePermission(authContext: AuthContext) {
  const tenantId = accessPolicyService.assertTenantContext(authContext);
  accessPolicyService.assertPermission(authContext, WORKFLOW_MANAGE_PERMISSION);
  return tenantId;
}
