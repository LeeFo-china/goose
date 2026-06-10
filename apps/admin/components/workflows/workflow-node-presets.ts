import type {
  WorkflowBusinessKind,
  WorkflowNodeType,
} from "@gooes/domain";
import type { WorkflowNode, WorkflowNodeConfig } from "@/components/workflows/workflow-types";

export type WorkflowNodePresetGroup =
  | "control"
  | "common"
  | "system";

export type WorkflowNodePreset = {
  key: string;
  label: string;
  description: string;
  group: WorkflowNodePresetGroup;
  nodeType: WorkflowNodeType;
  businessKind: WorkflowBusinessKind | null;
  config?: WorkflowNodeConfig;
};

export const WorkflowNodePresetGroupLabels: Record<WorkflowNodePresetGroup, string> = {
  control: "流程控制",
  common: "常用节点",
  system: "系统动作",
};

export const WorkflowNodePresets: WorkflowNodePreset[] = [
  {
    key: "start",
    label: "开始",
    description: "流程入口，只允许一个开始节点。",
    group: "control",
    nodeType: "start",
    businessKind: null,
  },
  {
    key: "workflow_step",
    label: "流程节点",
    description: "添加一个流程步骤，然后在属性里选择业务、工序、收款、审批等能力。",
    group: "common",
    nodeType: "business",
    businessKind: "customer_lead",
    config: { required_permissions: [] },
  },
  {
    key: "notification",
    label: "通知",
    description: "发送待办、短信或小程序通知。",
    group: "system",
    nodeType: "notification",
    businessKind: null,
    config: {
      channels: ["todo"],
      recipient_rule: "owner",
      template: "请处理流程节点",
    },
  },
  {
    key: "automation",
    label: "自动动作",
    description: "由系统自动执行的流程动作。",
    group: "system",
    nodeType: "automation",
    businessKind: null,
  },
  {
    key: "subflow",
    label: "子流程",
    description: "引用另一条流程作为当前节点。",
    group: "system",
    nodeType: "subflow",
    businessKind: null,
  },
  {
    key: "end",
    label: "结束",
    description: "流程出口，只允许一个结束节点。",
    group: "control",
    nodeType: "end",
    businessKind: null,
  },
];

export function getWorkflowNodePreset(key: string) {
  return WorkflowNodePresets.find((preset) => preset.key === key) || null;
}

export function applyWorkflowNodePreset(
  node: WorkflowNode,
  preset: WorkflowNodePreset,
): WorkflowNode {
  return {
    ...node,
    node_key: preset.key,
    node_type: preset.nodeType,
    business_kind: preset.businessKind,
    title: preset.label,
    description: node.description || preset.description,
    config: preset.config || {},
  };
}
