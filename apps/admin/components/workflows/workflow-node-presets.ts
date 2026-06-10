import type {
  WorkflowBusinessKind,
  WorkflowNodeType,
} from "@gooes/domain";
import type { WorkflowNode, WorkflowNodeConfig } from "@/components/workflows/workflow-types";

export type WorkflowNodePresetGroup =
  | "control"
  | "business"
  | "construction"
  | "procedure"
  | "approval"
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
  business: "业务流转",
  construction: "施工节点",
  procedure: "工序节点",
  approval: "审批确认",
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
    key: "lead",
    label: "客户线索",
    description: "客户进入业务流程后的线索节点。",
    group: "business",
    nodeType: "business",
    businessKind: "customer_lead",
  },
  {
    key: "following",
    label: "电话跟进",
    description: "客户主流程的跟进节点，对应开始跟进动作。",
    group: "business",
    nodeType: "business",
    businessKind: "phone_follow_up",
  },
  {
    key: "arrived",
    label: "到店",
    description: "客户主流程的到店节点，对应标记到店动作。",
    group: "business",
    nodeType: "business",
    businessKind: "store_visit",
  },
  {
    key: "measurement",
    label: "量房",
    description: "到店后的量房或现场测量节点。",
    group: "business",
    nodeType: "business",
    businessKind: "measurement",
  },
  {
    key: "designing",
    label: "设计",
    description: "客户主流程的设计节点，对应开始设计动作。",
    group: "business",
    nodeType: "business",
    businessKind: "design",
  },
  {
    key: "quote",
    label: "报价",
    description: "方案报价或预算确认节点。",
    group: "business",
    nodeType: "business",
    businessKind: "quote",
  },
  {
    key: "deposit",
    label: "定金",
    description: "客户缴纳定金后的业务节点。",
    group: "business",
    nodeType: "business",
    businessKind: "deposit",
  },
  {
    key: "signed",
    label: "签约",
    description: "客户主流程的签约节点，对应标记签约动作。",
    group: "business",
    nodeType: "business",
    businessKind: "contract",
  },
  {
    key: "construction_start",
    label: "开工",
    description: "项目进入施工的阶段节点。",
    group: "construction",
    nodeType: "construction_stage",
    businessKind: "construction_start",
  },
  {
    key: "final_acceptance",
    label: "竣工验收",
    description: "施工完成后的验收节点。",
    group: "construction",
    nodeType: "confirmation",
    businessKind: "final_acceptance",
  },
  {
    key: "settlement",
    label: "结算",
    description: "项目结算或尾款确认节点。",
    group: "approval",
    nodeType: "approval",
    businessKind: "settlement",
  },
  {
    key: "expense_approval",
    label: "财务审批",
    description: "费用、报销或付款审批节点。",
    group: "approval",
    nodeType: "approval",
    businessKind: "expense_approval",
  },
  {
    key: "stage_template",
    label: "施工阶段模板",
    description: "按阶段组织一组工序。",
    group: "procedure",
    nodeType: "construction_stage",
    businessKind: "stage_template",
  },
  {
    key: "procedure_template",
    label: "工序节点",
    description: "具体施工工序，选择拆改、水电、瓦工、木工、油工或安装。",
    group: "procedure",
    nodeType: "procedure",
    businessKind: "procedure_template",
    config: {
      stage_key: "",
      require_log: false,
      min_image_count: 0,
      trigger_acceptance: false,
      customer_visible: false,
    },
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
  const nextNodeKey = preset.nodeType === "procedure"
    ? `procedure_${Date.now()}`
    : preset.key;

  return {
    ...node,
    node_key: nextNodeKey,
    node_type: preset.nodeType,
    business_kind: preset.businessKind,
    title: preset.label,
    description: node.description || preset.description,
    config: preset.config || {},
  };
}
