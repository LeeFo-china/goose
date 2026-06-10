import {
  isProjectConstructionStageCode,
  PROJECT_LOG_STAGE_CONFIG,
  PaymentTypeConfig,
  type WorkflowBusinessKind,
  type WorkflowNodeType,
} from "@gooes/domain";
import type {
  WorkflowBaseNodeConfig,
  WorkflowNode,
  WorkflowNodeConfig,
} from "@/components/workflows/workflow-types";

export type WorkflowNodeCapability =
  | "business"
  | "construction"
  | "procedure"
  | "payment_collection"
  | "final_acceptance"
  | "finance"
  | "approval"
  | "notification"
  | "automation"
  | "subflow";

export type WorkflowBusinessFlowKind = Extract<
  WorkflowBusinessKind,
  | "customer_lead"
  | "phone_follow_up"
  | "store_visit"
  | "measurement"
  | "design"
  | "quote"
  | "contract"
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
  summaryLabel: string;
};

export const WORKFLOW_NODE_CAPABILITY_OPTIONS = [
  { value: "business", label: "业务流转" },
  { value: "construction", label: "施工阶段" },
  { value: "procedure", label: "工序" },
  { value: "payment_collection", label: "收款" },
  { value: "final_acceptance", label: "竣工验收" },
  { value: "finance", label: "财务" },
  { value: "approval", label: "审批" },
  { value: "notification", label: "通知" },
  { value: "automation", label: "自动动作" },
  { value: "subflow", label: "子流程" },
] as const satisfies ReadonlyArray<{
  value: WorkflowNodeCapability;
  label: string;
}>;

export const WORKFLOW_BUSINESS_FLOW_OPTIONS = [
  {
    value: "customer_lead",
    label: "客户线索",
    nodeKeyBase: "lead",
    description: "客户进入业务流程后的线索节点。",
  },
  {
    value: "phone_follow_up",
    label: "电话跟进",
    nodeKeyBase: "following",
    description: "客户主流程的跟进节点，对应开始跟进动作。",
  },
  {
    value: "store_visit",
    label: "到店",
    nodeKeyBase: "arrived",
    description: "客户主流程的到店节点，对应标记到店动作。",
  },
  {
    value: "measurement",
    label: "量房",
    nodeKeyBase: "measurement",
    description: "到店后的量房或现场测量节点。",
  },
  {
    value: "design",
    label: "设计",
    nodeKeyBase: "designing",
    description: "客户主流程的设计节点，对应开始设计动作。",
  },
  {
    value: "quote",
    label: "报价",
    nodeKeyBase: "quote",
    description: "方案报价或预算确认节点。",
  },
  {
    value: "contract",
    label: "签约",
    nodeKeyBase: "signed",
    description: "客户主流程的签约节点，对应标记签约动作。",
  },
] as const satisfies ReadonlyArray<{
  value: WorkflowBusinessFlowKind;
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
    config: { required_permissions: [] },
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
  payment_collection: {
    label: PaymentTypeConfig.deposit.label,
    description: "检查项目收款已入账后再放行后续流程。",
    nodeType: "confirmation",
    businessKind: "payment_collection",
    nodeKeyBase: "payment_deposit",
    config: {
      required_permissions: [],
      payment_type: "deposit",
      min_amount: null,
      block_message: null,
    },
  },
  final_acceptance: {
    label: "竣工验收",
    description: "施工完成后的验收节点。",
    nodeType: "confirmation",
    businessKind: "final_acceptance",
    nodeKeyBase: "final_acceptance",
    config: { required_permissions: [] },
  },
  finance: {
    label: "结算",
    description: "项目结算或尾款确认节点。",
    nodeType: "approval",
    businessKind: "settlement",
    nodeKeyBase: "settlement",
    config: {
      required_permissions: [],
      assignee_rule: "role",
      approve_mode: "any",
      amount_threshold: null,
    },
  },
  approval: {
    label: "财务审批",
    description: "费用、报销或付款审批节点。",
    nodeType: "approval",
    businessKind: "expense_approval",
    nodeKeyBase: "expense_approval",
    config: {
      required_permissions: [],
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
    node.business_kind === "construction_start"
  ) {
    return "construction";
  }
  if (node.node_type === "procedure") return "procedure";
  if (node.business_kind === "payment_collection") return "payment_collection";
  if (node.business_kind === "final_acceptance") return "final_acceptance";
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
      summaryLabel: `流程控制 · ${node.title}`,
    };
  }

  const capability = getWorkflowNodeCapability(node);
  const capabilityLabel = getWorkflowNodeCapabilityLabel(capability);
  const specificLabel = getWorkflowNodeSpecificLabel(node, capability);

  return {
    capabilityLabel,
    specificLabel,
    summaryLabel: specificLabel && specificLabel !== capabilityLabel
      ? `${capabilityLabel} · ${specificLabel}`
      : capabilityLabel,
  };
}

export function getWorkflowBusinessFlowOption(
  businessKind: WorkflowBusinessKind | null | undefined,
) {
  return WORKFLOW_BUSINESS_FLOW_OPTIONS.find((option) =>
    option.value === businessKind
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
      return "开工";
    case "procedure":
      return getProcedureSpecificLabel(node);
    case "payment_collection":
      return getPaymentSpecificLabel(node);
    case "final_acceptance":
      return "竣工验收";
    case "finance":
      return "结算";
    case "approval":
      return node.title || "审批";
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

function getPaymentSpecificLabel(node: WorkflowNode) {
  const paymentType = "payment_type" in node.config
    ? node.config.payment_type
    : null;
  if (
    typeof paymentType === "string" &&
    paymentType in PaymentTypeConfig
  ) {
    return PaymentTypeConfig[paymentType as keyof typeof PaymentTypeConfig].label;
  }

  return node.title === "收款节点" ? "未选择收款类型" : node.title;
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
