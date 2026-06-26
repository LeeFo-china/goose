import { isPermissionCode, PermissionCodeConfig } from "@gooes/domain";

export type WorkflowAssigneeEmployee = {
  id: string;
  name: string | null;
  avatar: string | null;
};

export type WorkflowTaskAssigneeType =
  | "employee"
  | "role_permission"
  | "role"
  | "permission"
  | "unassigned";

export type WorkflowTaskAssigneeSource = {
  node_key?: string | null;
  title?: string | null;
  assignee_employee_id?: string | null;
  assignee_employee?: Partial<WorkflowAssigneeEmployee> | null;
  assignee_role_code?: string | null;
  assignee_permission_code?: string | null;
};

export type WorkflowTaskAssigneeMetadata = {
  assignee_type: WorkflowTaskAssigneeType;
  assignee_display_name: string | null;
  assignee_display_hint?: string | null;
  current_handler_label: string;
  assignee_employee_id?: string;
  assignee_employee_name?: string | null;
  assignee_employee?: WorkflowAssigneeEmployee;
  assignee_role_code?: string;
  assignee_role_name?: string | null;
  assignee_permission_code?: string;
  assignee_permission_name?: string | null;
};

const ROLE_DISPLAY_NAME_BY_CODE: Record<string, string> = {
  finance_base: "财务",
  system_admin: "管理员",
};

const EXPENSE_HANDLER_DISPLAY_BY_NODE: Record<
  string,
  { displayName: string; label: string }
> = {
  manager_review: {
    displayName: "部门经理",
    label: "等待部门经理审批",
  },
  finance_review: {
    displayName: "财务人员",
    label: "等待财务人员审核",
  },
  payment: {
    displayName: "出纳",
    label: "等待出纳打款",
  },
};

const PERMISSION_HANDLER_DISPLAY_BY_CODE: Record<
  string,
  { displayName: string; label: string }
> = {
  "expense_request.approve_manager": {
    displayName: "部门经理",
    label: "等待部门经理审批",
  },
  "expense_request.approve_finance": {
    displayName: "财务人员",
    label: "等待财务人员审核",
  },
  "expense_request.pay": {
    displayName: "出纳",
    label: "等待出纳打款",
  },
  "finance.payment.confirm": {
    displayName: "财务人员",
    label: "等待财务人员确认收款",
  },
};

export function buildWorkflowTaskAssigneeMetadata(
  source: WorkflowTaskAssigneeSource,
): WorkflowTaskAssigneeMetadata {
  const employeeId = readString(source.assignee_employee_id);
  const nodeKey = readString(source.node_key);
  const roleCode = readString(source.assignee_role_code);
  const permissionCode = readString(source.assignee_permission_code);
  const roleName = roleCode ? resolveRoleName(roleCode) : null;
  const permissionName = resolvePermissionName(permissionCode);

  if (!employeeId) {
    const assigneeType = resolveAssigneeType({ roleCode, permissionCode });
    const display = resolvePoolDisplay({
      nodeKey,
      roleCode,
      roleName,
      permissionCode,
      permissionName,
      title: readString(source.title),
    });

    return {
      assignee_type: assigneeType,
      assignee_display_name: display.displayName,
      assignee_display_hint: display.hint,
      current_handler_label: display.label,
      ...(roleCode
        ? {
          assignee_role_code: roleCode,
          assignee_role_name: roleName,
        }
        : {}),
      ...(permissionCode
        ? {
          assignee_permission_code: permissionCode,
          assignee_permission_name: permissionName,
        }
        : {}),
    };
  }

  const employee = source.assignee_employee ?? null;
  const name = readString(employee?.name);
  const avatar = readString(employee?.avatar);
  const displayName = name ?? "指定员工";

  return {
    assignee_type: "employee",
    assignee_display_name: displayName,
    current_handler_label: `等待${displayName}处理`,
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
    node_key: readString(source.node_key),
    title: readString(source.title),
    assignee_employee_id: readString(source.assignee_employee_id),
    assignee_role_code: readString(source.assignee_role_code),
    assignee_permission_code: readString(source.assignee_permission_code),
    assignee_employee: employee,
  });
}

function resolveAssigneeType(input: {
  roleCode: string | null;
  permissionCode: string | null;
}): WorkflowTaskAssigneeType {
  if (input.roleCode && input.permissionCode) return "role_permission";
  if (input.roleCode) return "role";
  if (input.permissionCode) return "permission";
  return "unassigned";
}

function resolvePoolDisplay(input: {
  nodeKey: string | null;
  roleCode: string | null;
  roleName: string | null;
  permissionCode: string | null;
  permissionName: string | null;
  title: string | null;
}): {
  displayName: string | null;
  hint?: string;
  label: string;
} {
  const nodeDisplay = input.nodeKey
    ? EXPENSE_HANDLER_DISPLAY_BY_NODE[input.nodeKey]
    : null;
  if (nodeDisplay) return nodeDisplay;

  const permissionDisplay = input.permissionCode
    ? PERMISSION_HANDLER_DISPLAY_BY_CODE[input.permissionCode]
    : null;
  if (permissionDisplay) return permissionDisplay;

  if (input.permissionName) {
    const displayName = `具备${input.permissionName}权限的人员`;
    return {
      displayName,
      label: `等待${displayName}处理`,
    };
  }

  if (input.roleName) {
    const displayName = `${input.roleName}角色`;
    return {
      displayName,
      label: `等待${displayName}处理`,
    };
  }

  if (input.roleCode) {
    return {
      displayName: "指定角色",
      hint: input.roleCode,
      label: "等待指定角色处理",
    };
  }

  if (input.title) {
    return {
      displayName: input.title,
      label: `等待${input.title}处理`,
    };
  }

  return {
    displayName: null,
    label: "等待当前节点处理",
  };
}

function resolvePermissionName(permissionCode: string | null): string | null {
  if (!isPermissionCode(permissionCode)) return null;
  return PermissionCodeConfig[permissionCode].label;
}

function resolveRoleName(roleCode: string): string | null {
  return ROLE_DISPLAY_NAME_BY_CODE[roleCode] ?? null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
