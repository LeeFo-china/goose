import type { WorkflowDefinition } from "@/components/workflows/workflow-types";
import { getWorkflowTrack } from "@/components/workflows/workflow-business-track";

export function canSetProjectConstructionDefaultWorkflow(
  workflow: Pick<
    WorkflowDefinition,
    "workflow_key" | "category" | "status" | "active_version_id"
  >,
) {
  return getWorkflowTrack(workflow) === "construction" &&
    workflow.category === "construction" &&
    workflow.status === "active" &&
    Boolean(workflow.active_version_id);
}
