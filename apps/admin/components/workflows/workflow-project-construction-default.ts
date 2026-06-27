import type { WorkflowDefinition } from "@/components/workflows/workflow-types";

export function canSetProjectConstructionDefaultWorkflow(
  workflow: Pick<
    WorkflowDefinition,
    "workflow_key" | "category" | "status" | "active_version_id"
  >,
) {
  return workflow.category === "construction" &&
    workflow.status === "active" &&
    Boolean(workflow.active_version_id);
}

export function canRemoveProjectConstructionCandidateWorkflow(
  workflow: Pick<WorkflowDefinition, "category" | "project_construction_binding">,
) {
  return workflow.category === "construction" &&
    workflow.project_construction_binding?.selectable === true &&
    workflow.project_construction_binding.is_default !== true;
}
