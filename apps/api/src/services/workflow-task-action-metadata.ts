import {
  CustomerWorkflowActionConfig,
} from "@/services/workflow-business-actions";
import {
  ExpenseApprovalActionConfig,
  PaymentTypeConfig,
  type CustomerStatusAction,
  type ExpenseApprovalAction,
  type PaymentType,
  type ProjectConstructionStageCode,
  type WorkflowSubjectType,
} from "@gooes/domain";

export type WorkflowTaskOutputFieldType =
  | "string"
  | "number"
  | "date"
  | "datetime"
  | "employee"
  | "image_list"
  | "payment_collection"
  | "project_log"
  | "settlement_method";

export type WorkflowTaskActionMetadata = {
  key: string;
  label: string;
  business_domain:
    | "customer_status"
    | "workflow_project"
    | "payment_collection"
    | "expense_request"
    | null;
  business_action: string | null;
  requires_reason: boolean;
  output_fields: Array<{
    name: string;
    label: string;
    type: WorkflowTaskOutputFieldType;
    required: boolean;
    stage_code?: ProjectConstructionStageCode;
    min_image_count?: number;
    payment_type?: WorkflowPaymentCollectionType;
    payment_label?: string;
    requirement_mode?: "any_confirmed" | "signed_amount_percentage";
    required_percentage?: number;
    min_amount?: number;
  }>;
};

type BuildWorkflowTaskActionsInput = {
  subjectType: WorkflowSubjectType;
  nodeKey: string;
  nodeType?: string | null;
  taskTitle: string;
  currentNodeSnapshot?: unknown;
};

export const CUSTOMER_LINEAR_ACTION_BY_NODE: Partial<Record<string, CustomerStatusAction>> = {
  potential: "start_following",
  following: "mark_arrived",
  arrived: "start_design",
};

const CUSTOMER_EXPLICIT_ACTIONS = new Set<CustomerStatusAction>(["mark_invalid"]);
const CUSTOMER_GENERIC_COMPLETE_LABEL_BY_NODE: Partial<Record<string, string>> = {
  designing: "方案设计",
  signed: "项目签约",
};

const WORKFLOW_PROJECT_ACTION_NODE_KEYS = new Set([
  "designing",
  "proposal_confirmed",
  "signed",
  "design_finalized",
  "pending_start",
  "started",
  "construction_start",
  "constructing",
  "final_acceptance",
  "on_hold",
  "acceptance",
]);

const WORKFLOW_PROJECT_GENERIC_COMPLETE_NODE_KEYS = new Set([
  "handover",
]);

const WORKFLOW_PAYMENT_COLLECTION_TYPES = [
  "deposit",
  "stage_1",
  "stage_2",
  "stage_3",
  "add_on",
] as const satisfies ReadonlyArray<PaymentType>;

type WorkflowPaymentCollectionType =
  (typeof WORKFLOW_PAYMENT_COLLECTION_TYPES)[number];

export function resolveCustomerWorkflowTaskBusinessAction(input: {
  nodeKey: string;
  action: string;
}): CustomerStatusAction | null {
  return isCustomerExplicitAction(input.action)
    ? input.action
    : CUSTOMER_LINEAR_ACTION_BY_NODE[input.nodeKey] ?? null;
}

export function buildWorkflowTaskActions(
  input: BuildWorkflowTaskActionsInput,
): WorkflowTaskActionMetadata[] {
  if (isPaymentCollectionNode(input)) {
    return buildPaymentCollectionActions(input);
  }

  if (input.nodeType === "procedure") {
    return buildProcedureActions(input);
  }

  if (input.subjectType === "customer") {
    return buildCustomerActions(input.nodeKey);
  }

  if (input.subjectType === "project") {
    return buildProjectActions(input);
  }

  if (input.subjectType === "expense_request") {
    return buildExpenseActions(input.nodeKey);
  }

  return [buildGenericCompleteAction(input.taskTitle)];
}

function buildPaymentCollectionActions(
  input: BuildWorkflowTaskActionsInput,
): WorkflowTaskActionMetadata[] {
  const config = getCurrentNodeConfig(input);
  const paymentType = getPaymentCollectionType(config.payment_type);
  const paymentLabel = PaymentTypeConfig[paymentType].label;
  const requirementMode = getPaymentRequirementMode(config.requirement_mode);
  const requiredPercentage = getPositiveNumber(config.required_percentage);
  const minAmount = getPositiveNumber(config.min_amount);

  return [
    {
      key: "complete",
      label: input.taskTitle || paymentLabel,
      business_domain: "payment_collection",
      business_action: "confirm_payment",
      requires_reason: false,
      output_fields: [
        {
          name: "payment_status",
          label: paymentLabel,
          type: "payment_collection",
          required: true,
          payment_type: paymentType,
          payment_label: paymentLabel,
          requirement_mode: requirementMode,
          ...(requiredPercentage !== null
            ? { required_percentage: requiredPercentage }
            : {}),
          ...(minAmount !== null ? { min_amount: minAmount } : {}),
        },
        {
          name: "amount",
          label: "入账金额",
          type: "number",
          required: true,
          payment_type: paymentType,
          payment_label: paymentLabel,
          requirement_mode: requirementMode,
          ...(requiredPercentage !== null
            ? { required_percentage: requiredPercentage }
            : {}),
          ...(minAmount !== null ? { min_amount: minAmount } : {}),
        },
        {
          name: "paid_at",
          label: "入账时间",
          type: "datetime",
          required: false,
        },
        {
          name: "evidence_images",
          label: "收款凭证",
          type: "image_list",
          required: true,
          min_image_count: 1,
        },
        {
          name: "remark",
          label: "收款备注",
          type: "string",
          required: true,
        },
      ],
    },
  ];
}

function buildProcedureActions(
  input: BuildWorkflowTaskActionsInput,
): WorkflowTaskActionMetadata[] {
  const config = getCurrentNodeConfig(input);
  if (config.trigger_acceptance === true) {
    return [];
  }

  return [
    {
      key: "complete",
      label: input.taskTitle,
      business_domain: "workflow_project",
      business_action: "complete_procedure",
      requires_reason: false,
      output_fields: [],
    },
  ];
}

function buildCustomerActions(nodeKey: string): WorkflowTaskActionMetadata[] {
  const actions: CustomerStatusAction[] = [];
  const linearAction = CUSTOMER_LINEAR_ACTION_BY_NODE[nodeKey];
  const genericCompleteLabel = CUSTOMER_GENERIC_COMPLETE_LABEL_BY_NODE[nodeKey];
  const genericActions: WorkflowTaskActionMetadata[] = genericCompleteLabel
    ? [{
      key: "complete",
      label: genericCompleteLabel,
      business_domain: null,
      business_action: null,
      requires_reason: false,
      output_fields: [],
    }]
    : [];
  if (linearAction) actions.push(linearAction);
  if (["potential", "following", "arrived", "designing"].includes(nodeKey)) {
    actions.push("mark_invalid");
  }

  const statusActions: WorkflowTaskActionMetadata[] = unique(actions).map((action) => {
    const config = CustomerWorkflowActionConfig[action];
    return {
      key: action === linearAction ? "complete" : action,
      label: config.label,
      business_domain: "customer_status" as const,
      business_action: action,
      requires_reason: Boolean(config.requiresReason),
      output_fields: [],
    };
  });

  return [...genericActions, ...statusActions];
}

function buildProjectActions(
  input: BuildWorkflowTaskActionsInput,
): WorkflowTaskActionMetadata[] {
  if (WORKFLOW_PROJECT_GENERIC_COMPLETE_NODE_KEYS.has(input.nodeKey)) {
    return [buildGenericCompleteAction(input.taskTitle)];
  }

  if (!WORKFLOW_PROJECT_ACTION_NODE_KEYS.has(input.nodeKey)) {
    return [];
  }

  return [
    {
      key: "complete",
      label: input.taskTitle,
      business_domain: "workflow_project",
      business_action: input.nodeKey,
      requires_reason: false,
      output_fields: getProjectOutputFields(input.nodeKey),
    },
  ];
}

function buildGenericCompleteAction(label: string): WorkflowTaskActionMetadata {
  return {
    key: "complete",
    label,
    business_domain: null,
    business_action: null,
    requires_reason: false,
    output_fields: [],
  };
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
  nodeKey: string,
): WorkflowTaskActionMetadata["output_fields"] {
  if (nodeKey === "proposal_confirmed") {
    return [
      { name: "signed_amount", label: "签约金额", type: "number", required: true },
    ];
  }

  if (nodeKey === "design_finalized") {
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

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

function isPaymentCollectionNode(input: BuildWorkflowTaskActionsInput) {
  const snapshot = asRecord(input.currentNodeSnapshot);
  if (!snapshot) return false;
  if (snapshot.node_key !== input.nodeKey) return false;
  return snapshot.business_kind === "payment_collection";
}

function getCurrentNodeConfig(
  input: BuildWorkflowTaskActionsInput,
): Record<string, unknown> {
  const snapshot = asRecord(input.currentNodeSnapshot);
  if (!snapshot) return {};

  const snapshotNodeKey = snapshot.node_key;
  if (typeof snapshotNodeKey === "string" && snapshotNodeKey !== input.nodeKey) {
    return {};
  }

  return asRecord(snapshot.config) ?? {};
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function getPaymentCollectionType(value: unknown): WorkflowPaymentCollectionType {
  return typeof value === "string" &&
      WORKFLOW_PAYMENT_COLLECTION_TYPES.includes(
        value as WorkflowPaymentCollectionType,
      )
    ? value as WorkflowPaymentCollectionType
    : "deposit";
}

function getPaymentRequirementMode(
  value: unknown,
): "any_confirmed" | "signed_amount_percentage" {
  return value === "signed_amount_percentage"
    ? "signed_amount_percentage"
    : "any_confirmed";
}

function getPositiveNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : null;
}
