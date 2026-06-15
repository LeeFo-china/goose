export type WorkflowAssigneeEmployee = {
  id: string;
  name: string | null;
  avatar: string | null;
};

export type WorkflowTaskAssigneeSource = {
  assignee_employee_id?: string | null;
  assignee_employee?: Partial<WorkflowAssigneeEmployee> | null;
};

export type WorkflowTaskAssigneeMetadata = {
  assignee_employee_id?: string;
  assignee_employee_name?: string | null;
  assignee_employee?: WorkflowAssigneeEmployee;
};

export function buildWorkflowTaskAssigneeMetadata(
  source: WorkflowTaskAssigneeSource,
): WorkflowTaskAssigneeMetadata {
  const employeeId = readString(source.assignee_employee_id);
  if (!employeeId) return {};

  const employee = source.assignee_employee ?? null;
  const name = readString(employee?.name);
  const avatar = readString(employee?.avatar);

  return {
    assignee_employee_id: employeeId,
    assignee_employee_name: name,
    assignee_employee: {
      id: employeeId,
      name,
      avatar,
    },
  };
}

export function buildWorkflowTaskAssigneeMetadataFromRecord(
  source: Record<string, unknown>,
): WorkflowTaskAssigneeMetadata {
  const employee = isRecord(source.assignee_employee)
    ? {
      id: readString(source.assignee_employee.id) ?? undefined,
      name: readString(source.assignee_employee.name),
      avatar: readString(source.assignee_employee.avatar),
    }
    : null;

  return buildWorkflowTaskAssigneeMetadata({
    assignee_employee_id: readString(source.assignee_employee_id),
    assignee_employee: employee,
  });
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
