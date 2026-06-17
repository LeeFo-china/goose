import {
  isProjectConstructionStageCode,
  PROJECT_LOG_STAGE_CONFIG,
  type WorkflowBusinessKind,
  type WorkflowNodeType,
} from "@gooes/domain";
import {
  getWorkflowBusinessFlowOption,
  type WorkflowBusinessFlowKind,
} from "@/components/workflows/workflow-business-flow-options";
import {
  getWorkflowApprovalKindOption,
  getWorkflowApprovalSpecificLabel,
  type WorkflowApprovalKind,
} from "@/components/workflows/workflow-approval-node-options";
import {
  getWorkflowFinanceKindOption,
  getWorkflowFinanceSpecificLabel,
  type WorkflowFinanceKind,
} from "@/components/workflows/workflow-finance-node-options";
import type {
  WorkflowBaseNodeConfig,
  WorkflowNode,
  WorkflowNodeConfig,
} from "@/components/workflows/workflow-types";

export type WorkflowNodeCapability =
  | "business"
  | "construction"
  | "procedure"
  | "finance"
  | "approval"
  | "notification"
  | "automation"
  | "subflow";

export type WorkflowConstructionStageKind = Extract<
  WorkflowBusinessKind,
  "construction_start" | "final_acceptance"
>;

type CapabilityDefaults = {
  label: string;
  description: string;
  nodeType: WorkflowNodeType;
  businessKind: WorkflowBusinessKind | null;
  nodeKeyBase: string;
  config: WorkflowNodeConfig;
};

export type WorkflowNodeDisplayLabels = {
  capabilityLabel: string;
  specificLabel: string;
};

export const WORKFLOW_NODE_CAPABILITY_OPTIONS = [
  { value: "business", label: "业务流转" },
  { value: "construction", label: "施工阶段" },
  { value: "procedure", label: "工序" },
  { value: "finance", label: "财务" },
  { value: "approval", label: "审批" },
  { value: "notification", label: "通知" },
  { value: "automation", label: "自动动作" },
  { value: "subflow", label: "子流程" },
] as const satisfies ReadonlyArray<{
  value: WorkflowNodeCapability;
  label: string;
}>;

export const WORKFLOW_CONSTRUCTION_STAGE_OPTIONS = [
  {
    value: "construction_start",
    label: "开工",
    nodeKeyBase: "construction_start",
    description: "项目进入施工的阶段节点。",
  },
  {
    value: "final_acceptance",
    label: "竣工验收",
    nodeKeyBase: "final_acceptance",
    description: "施工完成后的最终验收节点。",
  },
] as const satisfies ReadonlyArray<{
  value: WorkflowConstructionStageKind;
  label: string;
  nodeKeyBase: string;
  description: string;
}>;

const CAPABILITY_DEFAULTS: Record<WorkflowNodeCapability, CapabilityDefaults> = {
  business: {
    label: "客户线索",
    description: "客户进入业务流程后的线索节点。",
    nodeType: "business",
    businessKind: "customer_lead",
    nodeKeyBase: "lead",
    config: { required_permissions: [] },
  },
  construction: {
    label: "开工",
    description: "项目进入施工的阶段节点。",
    nodeType: "construction_stage",
    businessKind: "construction_start",
    nodeKeyBase: "construction_start",
    config: { required_permissions: [], stage_type: "construction_start" },
  },
  procedure: {
    label: "工序节点",
    description: "具体施工工序，选择拆改、水电、瓦工、木工、油工或安装。",
    nodeType: "procedure",
    businessKind: "procedure_template",
    nodeKeyBase: "procedure",
    config: {
      required_permissions: [],
      stage_key: "",
      require_log: false,
      min_image_count: 0,
      trigger_acceptance: false,
      customer_visible: false,
    },
  },
  finance: {
    label: "结算",
    description: "项目结算或尾款确认节点。",
    nodeType: "approval",
    businessKind: "settlement",
    nodeKeyBase: "settlement",
    config: {
      required_permissions: [],
      finance_type: "settlement",
      assignee_rule: "role",
      approve_mode: "any",
      amount_threshold: null,
    },
  },
  approval: {
    label: "费用审批",
    description: "费用、报销或付款审批节点。",
    nodeType: "approval",
    businessKind: "expense_approval",
    nodeKeyBase: "expense_approval",
    config: {
      required_permissions: [],
      approval_type: "expense_approval",
      assignee_rule: "role",
      approve_mode: "any",
      amount_threshold: null,
    },
  },
  notification: {
    label: "通知",
    description: "发送待办、短信或小程序通知。",
    nodeType: "notification",
    businessKind: null,
    nodeKeyBase: "notification",
    config: {
      required_permissions: [],
      channels: ["todo"],
      recipient_rule: "owner",
      template: "请处理流程节点",
    },
  },
  automation: {
    label: "自动动作",
    description: "由系统自动执行的流程动作。",
    nodeType: "automation",
    businessKind: null,
    nodeKeyBase: "automation",
    config: { required_permissions: [] },
  },
  subflow: {
    label: "子流程",
    description: "引用另一条流程作为当前节点。",
    nodeType: "subflow",
    businessKind: null,
    nodeKeyBase: "subflow",
    config: { required_permissions: [] },
  },
};

export function isWorkflowControlNode(node: WorkflowNode) {
  return node.node_type === "start" || node.node_type === "end";
}

export function getWorkflowNodeCapability(node: WorkflowNode): WorkflowNodeCapability {
  if (
    node.node_type === "construction_stage" ||
    node.business_kind === "construction_start" ||
    node.business_kind === "final_acceptance"
  ) {
    return "construction";
  }
  if (node.node_type === "procedure") return "procedure";
  if (node.business_kind === "payment_collection") return "finance";
  if (node.business_kind === "settlement") return "finance";
  if (node.business_kind === "expense_approval") return "approval";
  if (node.node_type === "approval") return "approval";
  if (node.node_type === "notification") return "notification";
  if (node.node_type === "automation") return "automation";
  if (node.node_type === "subflow") return "subflow";
  return "business";
}

export function getWorkflowNodeCapabilityLabel(
  capability: WorkflowNodeCapability,
) {
  return WORKFLOW_NODE_CAPABILITY_OPTIONS.find((option) =>
    option.value === capability
  )?.label ?? capability;
}

export function getWorkflowNodeDisplayLabels(
  node: WorkflowNode,
): WorkflowNodeDisplayLabels {
  if (isWorkflowControlNode(node)) {
    return {
      capabilityLabel: "流程控制",
      specificLabel: node.title,
    };
  }

  const capability = getWorkflowNodeCapability(node);
  const capabilityLabel = getWorkflowNodeCapabilityLabel(capability);
  const specificLabel = getWorkflowNodeSpecificLabel(node, capability);

  return {
    capabilityLabel,
    specificLabel,
  };
}

export function getWorkflowConstructionStageOption(
  stageKind: WorkflowBusinessKind | null | undefined,
) {
  return WORKFLOW_CONSTRUCTION_STAGE_OPTIONS.find((option) =>
    option.value === stageKind
  ) ?? null;
}

export function applyWorkflowNodeCapability(input: {
  node: WorkflowNode;
  capability: WorkflowNodeCapability;
  usedNodeKeys: string[];
}): WorkflowNode {
  const defaults = CAPABILITY_DEFAULTS[input.capability];

  return {
    ...input.node,
    node_key: buildUniqueWorkflowNodeKey(
      defaults.nodeKeyBase,
      input.usedNodeKeys,
    ),
    node_type: defaults.nodeType,
    business_kind: defaults.businessKind,
    title: defaults.label,
    description: defaults.description,
    config: mergeWithCommonConfig(defaults.config, input.node.config),
  };
}

function getWorkflowNodeSpecificLabel(
  node: WorkflowNode,
  capability: WorkflowNodeCapability,
) {
  switch (capability) {
    case "business":
      return getWorkflowBusinessFlowOption(node.business_kind)?.label ||
        node.title;
    case "construction":
      return getWorkflowConstructionStageOption(
        getWorkflowConstructionStageKind(node),
      )?.label || node.title;
    case "procedure":
      return getProcedureSpecificLabel(node);
    case "finance":
      return getWorkflowFinanceSpecificLabel(node);
    case "approval":
      return getWorkflowApprovalSpecificLabel(node);
    case "notification":
      return node.title || "通知";
    case "automation":
      return node.title || "自动动作";
    case "subflow":
      return node.title || "子流程";
  }
}

function getProcedureSpecificLabel(node: WorkflowNode) {
  const stageKey = "stage_key" in node.config ? node.config.stage_key : null;
  if (
    typeof stageKey === "string" &&
    isProjectConstructionStageCode(stageKey)
  ) {
    return PROJECT_LOG_STAGE_CONFIG[stageKey].label;
  }

  return node.title === "工序节点" ? "未选择工序" : node.title;
}

export function applyWorkflowBusinessKind(input: {
  node: WorkflowNode;
  businessKind: WorkflowBusinessKind;
  usedNodeKeys: string[];
}): WorkflowNode {
  const option = getWorkflowBusinessFlowOption(input.businessKind);
  if (!option) {
    return input.node;
  }

  return {
    ...input.node,
    node_key: buildUniqueWorkflowNodeKey(option.nodeKeyBase, input.usedNodeKeys),
    node_type: "business",
    business_kind: option.value,
    title: option.label,
    description: option.description,
    config: mergeWithCommonConfig({ required_permissions: [] }, input.node.config),
  };
}

export function applyWorkflowFinanceKind(input: {
  node: WorkflowNode;
  financeKind: WorkflowFinanceKind;
  usedNodeKeys: string[];
}): WorkflowNode {
  const option = getWorkflowFinanceKindOption(input.financeKind);
  if (!option) {
    return input.node;
  }

  const config = input.financeKind === "payment_collection"
    ? {
      required_permissions: ["finance.payment.confirm"],
      finance_type: "payment_collection" as const,
      payment_type: "deposit" as const,
      requirement_mode: "any_confirmed" as const,
      required_percentage: null,
      block_message: null,
      finance_reviewer_employee_id: null,
    }
    : {
      required_permissions: [],
      finance_type: "settlement" as const,
      assignee_rule: "role" as const,
      approve_mode: "any" as const,
      amount_threshold: null,
    };

  return {
    ...input.node,
    node_key: buildUniqueWorkflowNodeKey(option.nodeKeyBase, input.usedNodeKeys),
    node_type: input.financeKind === "payment_collection"
      ? "confirmation"
      : "approval",
    business_kind: option.value,
    title: option.label,
    description: option.description,
    config: mergeWithCommonConfig(config, input.node.config),
  };
}

export function applyWorkflowApprovalKind(input: {
  node: WorkflowNode;
  approvalKind: WorkflowApprovalKind;
  usedNodeKeys: string[];
}): WorkflowNode {
  const option = getWorkflowApprovalKindOption(input.approvalKind);
  if (!option) {
    return input.node;
  }

  return {
    ...input.node,
    node_key: buildUniqueWorkflowNodeKey(option.nodeKeyBase, input.usedNodeKeys),
    node_type: "approval",
    business_kind: "expense_approval",
    title: option.label,
    description: option.description,
    config: mergeWithCommonConfig(
      {
        required_permissions: [],
        approval_type: option.value,
        assignee_rule: "role",
        approve_mode: "any",
        amount_threshold: null,
      },
      input.node.config,
    ),
  };
}

export function applyWorkflowConstructionStageKind(input: {
  node: WorkflowNode;
  stageKind: WorkflowConstructionStageKind;
  usedNodeKeys: string[];
}): WorkflowNode {
  const option = getWorkflowConstructionStageOption(input.stageKind);
  if (!option) {
    return input.node;
  }

  return {
    ...input.node,
    node_key: buildUniqueWorkflowNodeKey(option.nodeKeyBase, input.usedNodeKeys),
    node_type: "construction_stage",
    business_kind: option.value,
    title: option.label,
    description: option.description,
    config: mergeWithCommonConfig(
      { required_permissions: [], stage_type: option.value },
      input.node.config,
    ),
  };
}

export function getWorkflowConstructionStageKind(
  node: WorkflowNode,
): WorkflowConstructionStageKind {
  const stageType = "stage_type" in node.config ? node.config.stage_type : null;
  if (stageType === "construction_start" || stageType === "final_acceptance") {
    return stageType;
  }
  if (
    node.business_kind === "construction_start" ||
    node.business_kind === "final_acceptance"
  ) {
    return node.business_kind;
  }
  return "construction_start";
}

export function buildUniqueWorkflowNodeKey(
  base: string,
  usedNodeKeys: string[],
) {
  const normalizedBase = base.trim() || "workflow_step";
  const used = new Set(usedNodeKeys);
  if (!used.has(normalizedBase)) {
    return normalizedBase;
  }

  for (let index = 2; index <= 999; index += 1) {
    const candidate = `${normalizedBase}_${index}`;
    if (!used.has(candidate)) {
      return candidate;
    }
  }

  return `${normalizedBase}_${Date.now()}`;
}

function mergeWithCommonConfig(
  defaults: WorkflowNodeConfig,
  previous: WorkflowNodeConfig,
): WorkflowNodeConfig {
  return {
    ...defaults,
    ...pickCommonConfig(previous),
  };
}

function pickCommonConfig(config: WorkflowNodeConfig): WorkflowBaseNodeConfig {
  return {
    required_permissions: Array.isArray(config.required_permissions)
      ? config.required_permissions
      : [],
    timeout_hours: typeof config.timeout_hours === "number"
      ? config.timeout_hours
      : null,
    rollback_target_key: typeof config.rollback_target_key === "string" &&
        config.rollback_target_key.trim()
      ? config.rollback_target_key.trim()
      : null,
  };
}
