"use client";

import {
  isPaymentType,
  isProjectAcceptanceStatus,
  isProjectLogStageCode,
  PaymentTypeConfig,
  PROJECT_LOG_STAGE_CONFIG,
  ProjectAcceptanceStatusConfig,
} from "@gooes/domain";
import { formatDateTime } from "@/components/projects/project-mutation-utils";

export type WorkflowBadgeVariant =
  | "default"
  | "secondary"
  | "outline"
  | "success"
  | "warning"
  | "danger";

const instanceStatusLabels: Record<string, string> = {
  running: "运行中",
  completed: "已完成",
  canceled: "已取消",
  failed: "异常",
};

const instanceStatusVariants: Record<string, WorkflowBadgeVariant> = {
  running: "default",
  completed: "success",
  canceled: "outline",
  failed: "danger",
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

const nodeStatusVariants: Record<string, WorkflowBadgeVariant> = {
  current: "default",
  running: "default",
  done: "success",
  completed: "success",
  blocked: "danger",
  failed: "danger",
  pending: "secondary",
  waiting: "secondary",
};

const nodeTypeLabels: Record<string, string> = {
  start: "开始",
  end: "结束",
  task: "任务",
  procedure: "工序",
  construction_stage: "施工节点",
  approval: "审批",
  confirmation: "确认",
  notification: "通知",
  automation: "自动化",
  subflow: "子流程",
};

const businessKindLabels: Record<string, string> = {
  customer_lead: "客户线索",
  phone_follow_up: "电话跟进",
  store_visit: "到店",
  measurement: "量房",
  design: "设计",
  quote: "报价",
  deposit: "定金",
  payment_collection: "收款确认",
  contract: "签约",
  construction_start: "确认开工",
  final_acceptance: "竣工验收",
  settlement: "结算",
  expense_approval: "费用审批",
  stage_template: "阶段模板",
  procedure_template: "工序模板",
};

const workflowActionLabels: Record<string, string> = {
  complete: "完成",
  complete_procedure: "完成工序",
  create: "创建",
  update: "更新",
  submit: "提交",
  approve: "通过",
  reject: "驳回",
  cancel: "取消",
  start: "开始",
  finish: "完成",
  create_acceptance: "发起验收",
  edit_acceptance: "编辑验收",
  view_acceptance: "查看验收",
  confirm_payment: "确认收款",
  customer_confirm: "客户确认",
  employee_rectify: "整改",
};

const nodeKeyLabels: Record<string, string> = {
  started: "确认开工",
  payment_stage_1: "开工首付款",
  payment_stage_2: "中期进度款",
  payment_stage_3: "工程尾款",
  final_acceptance: "竣工验收",
  handover: "交房",
};

const attributeLabels: Record<string, string> = {
  acceptance_enabled: "阶段验收",
  acceptance_id: "验收单",
  acceptance_required: "验收闭环",
  acceptance_status: "验收状态",
  assignee_employee_name: "负责人",
  finance_confirmed_at: "确认时间",
  finance_confirmed_by_employee_name: "收款确认人",
  finance_reviewer_employee_name: "财务确认人",
  min_image_count: "最少照片",
  payment_type: "收款类型",
  require_log: "施工日志",
  stage_code: "工序",
};

const attributeOrder: Record<string, number> = {
  stage_code: 10,
  acceptance_status: 20,
  acceptance_enabled: 30,
  acceptance_required: 40,
  require_log: 50,
  min_image_count: 60,
  payment_type: 70,
  finance_reviewer_employee_name: 80,
  finance_confirmed_by_employee_name: 90,
  finance_confirmed_at: 100,
  assignee_employee_name: 110,
};

export function instanceStatusLabel(status: string | null | undefined) {
  return status ? instanceStatusLabels[status] || "未知状态" : "未启动";
}

export function instanceStatusVariant(
  status: string | null | undefined,
): WorkflowBadgeVariant {
  return status ? instanceStatusVariants[status] || "outline" : "outline";
}

export function normalizeBadgeVariant(value: unknown): WorkflowBadgeVariant | null {
  if (
    value === "default" ||
    value === "secondary" ||
    value === "outline" ||
    value === "success" ||
    value === "warning" ||
    value === "danger"
  ) {
    return value;
  }
  return null;
}

export function formatNodeStatusLabel(status: string | null | undefined) {
  return status ? nodeStatusLabels[status] || "待处理" : "待处理";
}

export function formatNodeStatusVariant(
  status: string | null | undefined,
): WorkflowBadgeVariant {
  return status ? nodeStatusVariants[status] || "outline" : "outline";
}

export function formatAttributeLabel(key: string) {
  return attributeLabels[key] || key;
}

export function formatAttributeValue(key: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "boolean") return value ? "是" : "否";
  if (Array.isArray(value)) {
    return value.map((item) => formatAttributeValue(key, item)).filter(Boolean).join("、");
  }
  if (typeof value === "object") return "";

  const stringValue = String(value);
  if (key.endsWith("_at")) return formatDateTime(stringValue);
  if (key === "stage_code" && isProjectLogStageCode(stringValue)) {
    return PROJECT_LOG_STAGE_CONFIG[stringValue].label;
  }
  if (key === "payment_type" && isPaymentType(stringValue)) {
    return PaymentTypeConfig[stringValue].label;
  }
  if (key === "acceptance_status" && isProjectAcceptanceStatus(stringValue)) {
    return ProjectAcceptanceStatusConfig[stringValue].label;
  }
  return stringValue;
}

export function compareAttributeOrder(leftKey: string, rightKey: string) {
  return (attributeOrder[leftKey] ?? 999) - (attributeOrder[rightKey] ?? 999);
}

export function formatNodeType(value: unknown) {
  const key = readString(value);
  if (!key) return "";
  return nodeTypeLabels[key] ? `类型：${nodeTypeLabels[key]}` : "类型：自定义";
}

export function formatBusinessKind(value: unknown) {
  const key = readString(value);
  if (!key) return "";
  return businessKindLabels[key] ? `业务：${businessKindLabels[key]}` : "业务：自定义";
}

export function formatWorkflowActionLabel(value: unknown) {
  const key = readString(value);
  if (!key) return "执行动作";
  return workflowActionLabels[key] || "执行动作";
}

export function formatTransitionNodeLabel(
  value: string | null | undefined,
  nodeLabelMap: Map<string, string>,
  fallback: string,
) {
  const key = readString(value);
  if (!key) return fallback;
  return nodeLabelMap.get(key) || formatWorkflowNodeKeyLabel(key);
}

export function formatWorkflowNodeKeyLabel(value: unknown) {
  const key = readString(value);
  if (!key) return "未命名节点";
  if (nodeKeyLabels[key]) return nodeKeyLabels[key];
  const procedureStage = key.startsWith("procedure_")
    ? key.slice("procedure_".length)
    : "";
  if (isProjectLogStageCode(procedureStage)) {
    return PROJECT_LOG_STAGE_CONFIG[procedureStage].label;
  }
  return "未命名节点";
}

export function formatAcceptanceStatus(value: string) {
  return isProjectAcceptanceStatus(value)
    ? ProjectAcceptanceStatusConfig[value].label
    : "待处理";
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
