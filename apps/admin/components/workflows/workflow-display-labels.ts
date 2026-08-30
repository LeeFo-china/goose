import {
  CustomerStatusConfig,
  isCustomerStatus,
  isCustomerStatusAction,
} from "@gooes/domain";
import { CustomerWorkflowActionConfig } from "./workflow-business-actions";

const visibleWorkflowKeyPattern = /[A-Za-z_]/;

const subjectTypeLabels: Record<string, string> = {
  manual: "手动",
  customer: "客户",
  project: "项目",
  expense_request: "费用申请",
  procedure: "工序",
  supplier_purchase_batch: "采购批次",
};

const instanceStatusLabels: Record<string, string> = {
  running: "运行中",
  completed: "已完成",
  canceled: "已取消",
  failed: "异常",
};

const nodeStatusLabels: Record<string, string> = {
  current: "当前",
  running: "运行中",
  done: "已完成",
  completed: "已完成",
  blocked: "受阻",
  failed: "异常",
  pending: "待处理",
  waiting: "等待中",
};

const nodeKeyLabels: Record<string, string> = {
  start: "开始",
  end: "结束",
  rejected: "已驳回",
  approved: "已通过",
  completed: "已完成",
  purchase_review: "采购审批",
  finance_review: "财务审批",
  approved_end: "审批通过",
  rejected_end: "审批驳回",
};

const actionLabels: Record<string, string> = {
  complete: "完成",
  create: "创建",
  update: "更新",
  submit: "提交",
  approve: "通过",
  reject: "驳回",
  cancel: "取消",
  start: "开始",
  finish: "完成",
};

const attributeLabels: Record<string, string> = {
  assignee_employee_name: "负责人",
  business_kind: "业务类型",
  node_type: "节点类型",
  status: "状态",
};

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isChineseDisplayText(value: string) {
  return !visibleWorkflowKeyPattern.test(value);
}

function readableDisplayText(value: unknown, fallback: string) {
  const text = readString(value);
  if (!text) return fallback;
  return isChineseDisplayText(text) ? text : fallback;
}

export function workflowSubjectTypeLabel(value: string | null | undefined) {
  if (!value) return "业务对象";
  return subjectTypeLabels[value] || "业务对象";
}

export function workflowInstanceStatusLabel(status: string | null | undefined) {
  if (!status) return "未启动";
  return instanceStatusLabels[status] || "未知状态";
}

export function workflowNodeKeyLabel(
  value: string | null | undefined,
  fallback = "未命名节点",
) {
  const key = readString(value);
  if (!key) return fallback;
  if (isCustomerStatus(key)) return CustomerStatusConfig[key].label;
  return nodeKeyLabels[key] || fallback;
}

export function workflowNodeTitle({
  displayLabel,
  nodeKey,
  nodeTitle,
  title,
  fallback = "未命名节点",
}: {
  displayLabel?: string | null;
  nodeKey?: string | null;
  nodeTitle?: string | null;
  title?: string | null;
  fallback?: string;
}) {
  for (const value of [displayLabel, nodeTitle, title]) {
    const text = readString(value);
    if (text && isChineseDisplayText(text)) return text;
  }

  return workflowNodeKeyLabel(nodeKey, fallback);
}

export function workflowNodeStatusLabel(
  status: string | null | undefined,
  displayLabel?: string | null,
) {
  const label = readString(displayLabel);
  if (label && isChineseDisplayText(label)) return label;
  if (!status) return "待处理";
  return nodeStatusLabels[status] || "待处理";
}

export function workflowTransitionNodeLabel(
  value: string | null | undefined,
  nodeLabelMap: Map<string, string>,
  fallback: string,
) {
  const key = readString(value);
  if (!key) return fallback;
  return nodeLabelMap.get(key) || workflowNodeKeyLabel(key, fallback);
}

export function workflowActionDisplayLabel(
  label: string | null | undefined,
  action: string | null | undefined,
) {
  const customLabel = readString(label);
  if (customLabel && isChineseDisplayText(customLabel)) return customLabel;
  return workflowActionLabel(action);
}

export function workflowActionLabel(value: string | null | undefined) {
  const key = readString(value);
  if (!key) return "执行动作";
  if (isCustomerStatusAction(key)) return CustomerWorkflowActionConfig[key].label;
  return actionLabels[key] || "执行动作";
}

export function workflowAttributeLabel(key: string, index: number) {
  return attributeLabels[key] || `属性 ${index + 1}`;
}

export function workflowAttributeValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "boolean") return value ? "是" : "否";
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) {
    return value
      .map(workflowAttributeValue)
      .filter(Boolean)
      .join("、");
  }
  if (typeof value === "object") return "";

  const text = String(value);
  if (isCustomerStatus(text)) return CustomerStatusConfig[text].label;
  if (isCustomerStatusAction(text)) return CustomerWorkflowActionConfig[text].label;
  return readableDisplayText(text, "已配置");
}
