import { Errors } from "@/errors/error-factory";
import { workflowRepository } from "@/repositories/workflows";
import { accessPolicyService } from "@/services/access-policy";
import type { AuthContext } from "@/services/authorization";

const WORKFLOW_MANAGE_PERMISSION = "employee.permission_manage";

export async function setProjectConstructionDefaultWorkflow(
  authContext: AuthContext,
  definitionId: string,
) {
  const tenantId = assertWorkflowManagePermission(authContext);
  const definition = await workflowRepository.getDefinitionById(
    definitionId,
    tenantId,
  );
  if (!definition) {
    throw Errors.notFound("流程定义不存在");
  }
  if (definition.category !== "construction") {
    throw Errors.business(
      400,
      "只有施工分类流程可以设为项目默认施工流程",
      "WORKFLOW_PROJECT_CONSTRUCTION_DEFAULT_CATEGORY_INVALID",
    );
  }
  if (definition.status !== "active" || !definition.active_version_id) {
    throw Errors.business(
      409,
      "流程尚未发布，不能设为项目默认施工流程",
      "WORKFLOW_PROJECT_CONSTRUCTION_DEFAULT_NOT_ACTIVE",
    );
  }

  const binding = await workflowRepository.setDefaultProjectConstructionWorkflow({
    tenantId,
    definitionId,
  });

  return {
    definition,
    binding,
  };
}

function assertWorkflowManagePermission(authContext: AuthContext) {
  const tenantId = accessPolicyService.assertTenantContext(authContext);
  accessPolicyService.assertPermission(authContext, WORKFLOW_MANAGE_PERMISSION);
  return tenantId;
}
