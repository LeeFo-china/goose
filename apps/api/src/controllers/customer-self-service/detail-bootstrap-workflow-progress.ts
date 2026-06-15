import {
  buildUnavailableProjectWorkflowProgress,
  projectWorkflowProgressService,
  type ProjectWorkflowProgress,
} from "@/services/project-workflow-progress";
import {
  measureCustomerProjectDetailStep,
  type CustomerProjectDetailTimingSteps,
} from "@/utils/customer-project-detail-timing";

export function loadCustomerProjectWorkflowProgress(input: {
  projectId: string;
  tenantId: string | null;
  steps: CustomerProjectDetailTimingSteps;
  addPartialError: (module: string, error: unknown) => void;
}): Promise<ProjectWorkflowProgress> {
  return measureCustomerProjectDetailStep(
    input.steps,
    "workflow_progress_ms",
    () => input.tenantId
      ? projectWorkflowProgressService.getProjectProgress({
        tenantId: input.tenantId,
        projectId: input.projectId,
      })
      : Promise.resolve(buildUnavailableProjectWorkflowProgress()),
  ).catch((error) => {
    input.addPartialError("workflow_progress", error);
    return buildUnavailableProjectWorkflowProgress();
  });
}
