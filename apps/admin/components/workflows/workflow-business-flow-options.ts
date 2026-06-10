import type { WorkflowBusinessKind } from "@gooes/domain";

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

export function getWorkflowBusinessFlowOption(
  businessKind: WorkflowBusinessKind | null | undefined,
) {
  return WORKFLOW_BUSINESS_FLOW_OPTIONS.find((option) =>
    option.value === businessKind
  ) ?? null;
}
