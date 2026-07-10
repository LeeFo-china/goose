export const projectWorkflowProgressTimingStepKeys = [
  "subject_state_runtime_ms",
  "graph_ms",
  "pending_tasks_ms",
  "runtime_nodes_ms",
  "procedure_assignments_ms",
  "task_actions_ms",
  "finance_reviewers_ms",
  "completed_node_actors_ms",
  "projection_ms",
] as const;

export type ProjectWorkflowProgressTimingStep =
  (typeof projectWorkflowProgressTimingStepKeys)[number];

export type ProjectWorkflowProgressTimingSteps = Record<
  ProjectWorkflowProgressTimingStep,
  number
>;

export function createProjectWorkflowProgressTimingSteps():
  ProjectWorkflowProgressTimingSteps {
  return Object.fromEntries(
    projectWorkflowProgressTimingStepKeys.map((key) => [key, 0]),
  ) as ProjectWorkflowProgressTimingSteps;
}

export async function measureProjectWorkflowProgressStep<Value>(
  steps: ProjectWorkflowProgressTimingSteps | undefined,
  step: ProjectWorkflowProgressTimingStep,
  callback: () => Promise<Value> | Value,
): Promise<Value> {
  if (!steps) return callback();

  const startedAt = Date.now();
  try {
    return await callback();
  } finally {
    steps[step] += Date.now() - startedAt;
  }
}
