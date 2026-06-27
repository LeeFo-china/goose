import {
  workflowRepository,
  type WorkflowDefinitionRow,
} from "@/repositories/workflows";
import { projectRepository } from "@/repositories/projects";

const PROJECT_CONSTRUCTION_WORKFLOW_KEYS = ["construction_main"] as const;

export async function resolveProjectConstructionWorkflowDefinition(input: {
  tenantId: string;
  projectId: string;
}): Promise<WorkflowDefinitionRow | null> {
  const project = await projectRepository.findById(
    input.projectId,
    input.tenantId,
  );
  const selectedDefinitionId = getProjectConstructionWorkflowDefinitionId(
    project,
  );
  if (selectedDefinitionId) {
    const selectedDefinition = await workflowRepository.getDefinitionById(
      selectedDefinitionId,
      input.tenantId,
    );
    return isUsableConstructionWorkflowDefinition(selectedDefinition)
      ? selectedDefinition
      : null;
  }

  const defaultDefinition =
    await workflowRepository.findDefaultProjectConstructionWorkflow(
      input.tenantId,
    );
  if (defaultDefinition) {
    return defaultDefinition;
  }

  return findActiveConstructionWorkflow(input.tenantId);
}

async function findActiveConstructionWorkflow(
  tenantId: string,
): Promise<WorkflowDefinitionRow | null> {
  for (const workflowKey of PROJECT_CONSTRUCTION_WORKFLOW_KEYS) {
    const definition = await workflowRepository.findDefinitionByKey(
      tenantId,
      workflowKey,
    );
    if (isUsableConstructionWorkflowDefinition(definition)) {
      return definition;
    }
  }

  return null;
}

function getProjectConstructionWorkflowDefinitionId(
  project: Record<string, unknown> | null,
) {
  const value = project?.construction_workflow_definition_id;
  return typeof value === "string" && value.trim() ? value : null;
}

export function isUsableConstructionWorkflowDefinition(
  definition: WorkflowDefinitionRow | null,
): definition is WorkflowDefinitionRow {
  return Boolean(
    definition &&
      definition.category === "construction" &&
      definition.status === "active" &&
      definition.active_version_id,
  );
}
