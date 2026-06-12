import {
  workflowSubjectStateRepository,
  type WorkflowSubjectStateRow,
} from "@/repositories/workflow-subject-states";

type ExpenseWorkflowSubject = {
  id: string;
};

export function attachExpenseWorkflowStatesFromRows<T extends ExpenseWorkflowSubject>(
  rows: T[],
  states: WorkflowSubjectStateRow[],
): Array<T & { workflow_state: WorkflowSubjectStateRow | null }> {
  const stateByExpenseId = new Map(
    states.map((state) => [state.subject_id, state]),
  );

  return rows.map((row) => ({
    ...row,
    workflow_state: stateByExpenseId.get(row.id) ?? null,
  }));
}

export async function attachExpenseWorkflowStates<T extends ExpenseWorkflowSubject>(
  rows: T[],
  tenantId: string,
): Promise<Array<T & { workflow_state: WorkflowSubjectStateRow | null }>> {
  if (rows.length === 0) return [];

  const states = await workflowSubjectStateRepository.listBySubjectIds({
    tenantId,
    subjectType: "expense_request",
    subjectIds: rows.map((row) => row.id),
  });

  return attachExpenseWorkflowStatesFromRows(rows, states);
}
