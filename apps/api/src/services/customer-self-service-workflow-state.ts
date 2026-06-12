import type { CustomerSelfServiceProjectListItem } from "@/repositories/customer-self-service";
import {
  workflowSubjectStateRepository,
  type WorkflowSubjectStateRow,
} from "@/repositories/workflow-subject-states";

export async function attachProjectWorkflowStates<T extends CustomerSelfServiceProjectListItem>(
  projects: T[],
  tenantId: string,
): Promise<Array<T & { workflow_state: WorkflowSubjectStateRow | null }>> {
  if (projects.length === 0) return [];

  const states = await workflowSubjectStateRepository.listBySubjectIds({
    tenantId,
    subjectType: "project",
    subjectIds: projects.map((project) => project.id),
  });
  const stateByProjectId = new Map(states.map((state) => [state.subject_id, state]));

  return projects.map((project) => ({
    ...project,
    workflow_state: stateByProjectId.get(project.id) ?? null,
  }));
}

export async function attachProjectWorkflowState<T extends CustomerSelfServiceProjectListItem | null>(
  project: T,
  tenantId?: string | null,
) {
  if (!project || !tenantId) return project;

  const [item] = await attachProjectWorkflowStates([project], tenantId);
  return item as T;
}
