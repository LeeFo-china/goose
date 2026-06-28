export function mergeProjectListEnrichmentRows(input: {
  baseRows: Array<Record<string, unknown>>;
  assigneeRows: Array<Record<string, unknown>>;
  stageRows: Array<Record<string, unknown>>;
  displayStatusRows: Array<Record<string, unknown>>;
}) {
  return input.baseRows.map((row, index) => ({
    ...row,
    ...input.assigneeRows[index],
    ...input.stageRows[index],
    ...input.displayStatusRows[index],
  }));
}

export function mergeProjectListWorkflowRows(input: {
  baseRows: Array<Record<string, unknown>>;
  workflowRows: Array<Record<string, unknown>>;
}) {
  return input.baseRows.map((row, index) => {
    const workflowRow = input.workflowRows[index] ?? {};

    return {
      ...row,
      workflow_progress: workflowRow.workflow_progress ?? null,
      workflow_state: workflowRow.workflow_state ?? null,
    };
  });
}
