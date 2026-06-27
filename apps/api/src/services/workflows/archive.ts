import { Errors } from "@/errors/error-factory";
import { workflowRepository } from "@/repositories/workflows";
import type { WorkflowRuntimeArchiveInput } from "@/schema/workflows";
import { accessPolicyService } from "@/services/access-policy";
import type { AuthContext } from "@/services/authorization";

const WORKFLOW_MANAGE_PERMISSION = "employee.permission_manage";

export async function archiveWorkflowDefinition(
  authContext: AuthContext,
  definitionId: string,
) {
  const tenantId = assertManagePermission(authContext);
  const definition = await getRequiredDefinition(tenantId, definitionId);

  if (definition.category === "construction") {
    const [binding] = await workflowRepository.listProjectConstructionBindingsByDefinitionIds({
      tenantId,
      definitionIds: [definitionId],
    });
    if (binding?.selectable === true) {
      if (binding.is_default) {
        throw Errors.business(
          409,
          "默认施工流程不能归档，请先切换默认施工流程",
          "WORKFLOW_PROJECT_CONSTRUCTION_DEFAULT_ARCHIVE_FORBIDDEN",
        );
      }
      await workflowRepository.updateProjectConstructionWorkflowCandidate({
        tenantId,
        definitionId,
        selectable: false,
        isDefault: false,
      });
    }
  }

  return workflowRepository.updateDefinition(definitionId, tenantId, {
    status: "archived",
    updatedBy: authContext.employeeId,
  });
}

export async function archiveWorkflowVersion(
  authContext: AuthContext,
  definitionId: string,
  versionId: string,
) {
  const tenantId = assertManagePermission(authContext);
  const definition = await getRequiredDefinition(tenantId, definitionId);
  const version = await workflowRepository.getVersionById(
    versionId,
    definitionId,
    tenantId,
  );

  if (!version) {
    throw Errors.notFound("流程版本不存在");
  }
  if (version.id === definition.active_version_id) {
    throw Errors.business(
      409,
      "当前 active 版本不能归档，请先发布新版本",
      "WORKFLOW_ACTIVE_VERSION_ARCHIVE_FORBIDDEN",
    );
  }
  if (version.status === "deprecated") {
    return version;
  }

  const runningCounts = await workflowRepository.listRunningInstanceCountsByVersion({
    tenantId,
    definitionId,
    versionIds: [versionId],
  });
  const runningInstanceCount = runningCounts.get(versionId) ?? 0;
  if (runningInstanceCount > 0) {
    throw Errors.business(
      409,
      "该历史版本仍有运行中的实例，不能归档",
      "WORKFLOW_VERSION_RUNNING_INSTANCES",
      { running_instance_count: runningInstanceCount },
    );
  }

  return workflowRepository.updateVersionStatus({
    id: versionId,
    definitionId,
    tenantId,
    status: "deprecated",
  });
}

export async function activateWorkflowVersion(
  authContext: AuthContext,
  definitionId: string,
  versionId: string,
) {
  const tenantId = assertManagePermission(authContext);
  const definition = await getRequiredDefinition(tenantId, definitionId);
  const version = await workflowRepository.getVersionById(
    versionId,
    definitionId,
    tenantId,
  );

  if (!version) {
    throw Errors.notFound("流程版本不存在");
  }
  if (version.status === "deprecated") {
    throw Errors.business(
      409,
      "已归档的流程版本不能设为当前版本",
      "WORKFLOW_VERSION_ACTIVATE_FORBIDDEN",
    );
  }
  if (version.id === definition.active_version_id) {
    return definition;
  }

  return workflowRepository.updateActiveVersion({
    tenantId,
    definitionId,
    versionId,
    status: "active",
    updatedBy: authContext.employeeId,
  });
}

export async function archiveWorkflowRuntimeInstance(
  authContext: AuthContext,
  definitionId: string,
  instanceId: string,
  input: WorkflowRuntimeArchiveInput,
) {
  const tenantId = assertManagePermission(authContext);
  await getRequiredDefinition(tenantId, definitionId);
  const instance = await workflowRepository.getRuntimeInstanceById({
    tenantId,
    definitionId,
    instanceId,
  });

  if (!instance) {
    throw Errors.notFound("流程实例不存在");
  }
  if (instance.status !== "completed") {
    throw Errors.business(
      409,
      "只有已完成的流程实例可以归档",
      "WORKFLOW_INSTANCE_ARCHIVE_NOT_COMPLETED",
    );
  }
  if (instance.archived_at) {
    return instance;
  }

  return workflowRepository.archiveRuntimeInstance({
    tenantId,
    definitionId,
    instanceId,
    archivedBy: authContext.employeeId,
    archiveReason: input.reason?.trim() || null,
  });
}

function assertManagePermission(authContext: AuthContext) {
  const tenantId = accessPolicyService.assertTenantId(authContext);
  if (!tenantId) {
    throw Errors.business(403, "缺少租户上下文", "TENANT_CONTEXT_REQUIRED");
  }
  accessPolicyService.assertPermission(authContext, WORKFLOW_MANAGE_PERMISSION);
  return tenantId;
}

async function getRequiredDefinition(tenantId: string, id: string) {
  const definition = await workflowRepository.getDefinitionById(id, tenantId);
  if (!definition) {
    throw Errors.notFound("流程定义不存在");
  }

  return definition;
}
