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

export async function removeProjectConstructionCandidateWorkflow(
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
      "只有施工分类流程可以从项目施工候选中移除",
      "WORKFLOW_PROJECT_CONSTRUCTION_CANDIDATE_CATEGORY_INVALID",
    );
  }

  const binding = await findProjectConstructionBinding(tenantId, definitionId);
  if (!binding || binding.selectable === false) {
    return {
      definition,
      binding,
    };
  }
  if (binding.is_default) {
    throw Errors.business(
      409,
      "默认施工流程不能从候选中移除，请先切换默认施工流程",
      "WORKFLOW_PROJECT_CONSTRUCTION_DEFAULT_REMOVE_FORBIDDEN",
    );
  }

  const updatedBinding = await workflowRepository.updateProjectConstructionWorkflowCandidate({
    tenantId,
    definitionId,
    selectable: false,
    isDefault: false,
  });

  return {
    definition,
    binding: updatedBinding,
  };
}

function assertWorkflowManagePermission(authContext: AuthContext) {
  const tenantId = accessPolicyService.assertTenantContext(authContext);
  accessPolicyService.assertPermission(authContext, WORKFLOW_MANAGE_PERMISSION);
  return tenantId;
}

async function findProjectConstructionBinding(
  tenantId: string,
  definitionId: string,
) {
  const [binding] = await workflowRepository.listProjectConstructionBindingsByDefinitionIds({
    tenantId,
    definitionIds: [definitionId],
  });

  return binding ?? null;
}
