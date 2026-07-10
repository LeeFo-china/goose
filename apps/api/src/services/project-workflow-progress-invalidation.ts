import { projectWorkflowProgressService } from "@/services/project-workflow-progress";

export function invalidateProjectWorkflowProgress(input: {
  tenantId: string;
  subjectType: string;
  subjectId: string;
}) {
  if (input.subjectType !== "project") return;
  projectWorkflowProgressService.invalidateProject({
    tenantId: input.tenantId,
    projectId: input.subjectId,
  });
}
