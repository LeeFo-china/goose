import {
  CustomerStatusActionConfig,
  ExpenseApprovalActionConfig,
  ProjectStatusActionConfig,
  type CustomerStatusAction,
  type ExpenseApprovalAction,
  type ProjectStatus,
  type ProjectStatusAction,
  type WorkflowSubjectType,
} from "@gooes/domain";

export type WorkflowTaskOutputFieldType =
  | "string"
  | "number"
  | "date"
  | "datetime"
  | "employee"
  | "image_list"
  | "settlement_method";

export type WorkflowTaskActionMetadata = {
  key: string;
  label: string;
  business_domain: "customer_status" | "project_status" | "expense_request" | null;
  business_action: string | null;
  requires_reason: boolean;
  output_fields: Array<{
    name: string;
    label: string;
    type: WorkflowTaskOutputFieldType;
    required: boolean;
  }>;
};

type BuildWorkflowTaskActionsInput = {
  subjectType: WorkflowSubjectType;
  nodeKey: string;
  taskTitle: string;
};

export const CUSTOMER_LINEAR_ACTION_BY_NODE: Partial<Record<string, CustomerStatusAction>> = {
  following: "mark_arrived",
  arrived: "start_design",
};

export const PROJECT_LINEAR_ACTION_BY_NODE: Record<string, ProjectStatusAction> = {
  designing: "confirm_proposal",
  proposal_confirmed: "sign_contract",
  signed: "finalize_design",
  design_finalized: "schedule_construction",
  pending_start: "start_project",
  started: "start_construction",
  constructing: "start_acceptance",
  on_hold: "resume_project",
};

const CUSTOMER_EXPLICIT_ACTIONS = new Set<CustomerStatusAction>(["mark_invalid"]);
const PROJECT_EXPLICIT_ACTIONS = new Set<ProjectStatusAction>([
  "pause_project",
  "mark_invalid",
  "resume_project",
]);

const PROJECT_NODE_STATUS_BY_NODE: Partial<Record<string, ProjectStatus>> = {
  designing: "designing",
  proposal_confirmed: "proposal_confirmed",
  signed: "signed",
  design_finalized: "design_finalized",
  pending_start: "pending_start",
  started: "started",
  constructing: "constructing",
  on_hold: "on_hold",
  acceptance: "acceptance",
};

export function resolveCustomerWorkflowTaskBusinessAction(input: {
  nodeKey: string;
  action: string;
}): CustomerStatusAction | null {
  return isCustomerExplicitAction(input.action)
    ? input.action
    : CUSTOMER_LINEAR_ACTION_BY_NODE[input.nodeKey] ?? null;
}

export function resolveProjectWorkflowTaskBusinessAction(input: {
  nodeKey: string;
  action: string;
}): ProjectStatusAction | null {
  return isProjectExplicitAction(input.action)
    ? input.action
    : PROJECT_LINEAR_ACTION_BY_NODE[input.nodeKey] ?? null;
}

export function buildWorkflowTaskActions(
  input: BuildWorkflowTaskActionsInput,
): WorkflowTaskActionMetadata[] {
  if (input.subjectType === "customer") {
    return buildCustomerActions(input.nodeKey);
  }

  if (input.subjectType === "project") {
    return buildProjectActions(input.nodeKey);
  }

  if (input.subjectType === "expense_request") {
    return buildExpenseActions(input.nodeKey);
  }

  return [
    {
      key: "complete",
      label: input.taskTitle,
      business_domain: null,
      business_action: null,
      requires_reason: false,
      output_fields: [],
    },
  ];
}

function buildCustomerActions(nodeKey: string): WorkflowTaskActionMetadata[] {
  const actions: CustomerStatusAction[] = [];
  const linearAction = CUSTOMER_LINEAR_ACTION_BY_NODE[nodeKey];
  if (linearAction) actions.push(linearAction);
  if (["following", "arrived", "designing"].includes(nodeKey)) {
    actions.push("mark_invalid");
  }

  return unique(actions).map((action) => {
    const config = CustomerStatusActionConfig[action];
    return {
      key: action === linearAction ? "complete" : action,
      label: config.label,
      business_domain: "customer_status",
      business_action: action,
      requires_reason: Boolean(config.requiresReason),
      output_fields: [],
    };
  });
}

function buildProjectActions(nodeKey: string): WorkflowTaskActionMetadata[] {
  const actions: ProjectStatusAction[] = [];
  const linearAction = PROJECT_LINEAR_ACTION_BY_NODE[nodeKey];
  if (linearAction) actions.push(linearAction);

  const currentStatus = PROJECT_NODE_STATUS_BY_NODE[nodeKey];
  if (currentStatus) {
    for (const action of PROJECT_EXPLICIT_ACTIONS) {
      if (ProjectStatusActionConfig[action].from.includes(currentStatus)) {
        actions.push(action);
      }
    }
  }

  return unique(actions).map((action) => {
    const config = ProjectStatusActionConfig[action];
    return {
      key: action === linearAction ? "complete" : action,
      label: config.label,
      business_domain: "project_status",
      business_action: action,
      requires_reason: Boolean(config.requiresReason),
      output_fields: getProjectOutputFields(action),
    };
  });
}

function buildExpenseActions(nodeKey: string): WorkflowTaskActionMetadata[] {
  if (nodeKey === "manager_review" || nodeKey === "finance_review") {
    return [
      buildExpenseAction("approve", false, [
        { name: "comment", label: "审批意见", type: "string", required: false },
      ]),
      buildExpenseAction("reject", true, [
        { name: "comment", label: "审批意见", type: "string", required: false },
      ]),
    ];
  }

  if (nodeKey === "payment") {
    return [
      buildExpenseAction("pay", false, [
        { name: "payee_name", label: "收款人", type: "string", required: true },
        { name: "payee_bank", label: "收款银行", type: "string", required: false },
        { name: "payee_account", label: "收款账号", type: "string", required: false },
        { name: "method", label: "打款方式", type: "settlement_method", required: true },
        { name: "paid_amount", label: "打款金额", type: "number", required: true },
        { name: "paid_at", label: "打款时间", type: "datetime", required: false },
        { name: "evidence_images", label: "打款凭证", type: "image_list", required: true },
        { name: "remark", label: "支付备注", type: "string", required: false },
      ]),
    ];
  }

  return [];
}

function buildExpenseAction(
  action: ExpenseApprovalAction,
  requiresReason: boolean,
  outputFields: WorkflowTaskActionMetadata["output_fields"],
): WorkflowTaskActionMetadata {
  return {
    key: action,
    label: ExpenseApprovalActionConfig[action].label,
    business_domain: "expense_request",
    business_action: action,
    requires_reason: requiresReason,
    output_fields: outputFields,
  };
}

function getProjectOutputFields(
  action: ProjectStatusAction,
): WorkflowTaskActionMetadata["output_fields"] {
  if (action === "sign_contract") {
    return [
      { name: "signed_amount", label: "签约金额", type: "number", required: true },
    ];
  }

  if (action === "schedule_construction") {
    return [
      { name: "start_date", label: "开工日期", type: "date", required: true },
      {
        name: "construction_manager_employee_id",
        label: "工程负责人",
        type: "employee",
        required: true,
      },
    ];
  }

  return [];
}

function isCustomerExplicitAction(value: string): value is CustomerStatusAction {
  return CUSTOMER_EXPLICIT_ACTIONS.has(value as CustomerStatusAction);
}

function isProjectExplicitAction(value: string): value is ProjectStatusAction {
  return PROJECT_EXPLICIT_ACTIONS.has(value as ProjectStatusAction);
}

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}
