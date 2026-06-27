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
