export const WORKFLOW_DEFINITION_STATUS_VALUES = [
  'draft',
  'active',
  'archived',
] as const;

export type WorkflowDefinitionStatus =
  (typeof WORKFLOW_DEFINITION_STATUS_VALUES)[number];

export const WORKFLOW_VERSION_STATUS_VALUES = [
  'published',
  'deprecated',
] as const;

export type WorkflowVersionStatus =
  (typeof WORKFLOW_VERSION_STATUS_VALUES)[number];

export const WORKFLOW_INSTANCE_STATUS_VALUES = [
  'running',
  'completed',
  'canceled',
  'failed',
] as const;

export type WorkflowInstanceStatus =
  (typeof WORKFLOW_INSTANCE_STATUS_VALUES)[number];

export const WORKFLOW_TASK_STATUS_VALUES = [
  'pending',
  'completed',
  'canceled',
] as const;

export type WorkflowTaskStatus =
  (typeof WORKFLOW_TASK_STATUS_VALUES)[number];

export const WORKFLOW_SUBJECT_TYPE_VALUES = [
  'manual',
  'customer',
  'project',
  'expense_request',
  'procedure',
] as const;

export type WorkflowSubjectType =
  (typeof WORKFLOW_SUBJECT_TYPE_VALUES)[number];

export const WORKFLOW_CATEGORY_VALUES = [
  'main',
  'sales',
  'construction',
  'procedure',
  'approval',
  'acceptance',
] as const;

export type WorkflowCategory = (typeof WORKFLOW_CATEGORY_VALUES)[number];

export const WORKFLOW_NODE_TYPE_VALUES = [
  'start',
  'end',
  'business',
  'construction_stage',
  'procedure',
  'approval',
  'confirmation',
  'notification',
  'automation',
  'subflow',
] as const;

export type WorkflowNodeType = (typeof WORKFLOW_NODE_TYPE_VALUES)[number];

export const WORKFLOW_BUSINESS_KIND_VALUES = [
  'customer_lead',
  'phone_follow_up',
  'store_visit',
  'measurement',
  'design',
  'quote',
  'deposit',
  'contract',
  'construction_start',
  'final_acceptance',
  'settlement',
  'expense_approval',
  'stage_template',
  'procedure_template',
] as const;

export type WorkflowBusinessKind =
  (typeof WORKFLOW_BUSINESS_KIND_VALUES)[number];

export const WORKFLOW_EDGE_CONDITION_OPERATOR_VALUES = [
  'always',
  'eq',
  'neq',
  'gt',
  'gte',
  'lt',
  'lte',
  'in',
] as const;

export type WorkflowEdgeConditionOperator =
  (typeof WORKFLOW_EDGE_CONDITION_OPERATOR_VALUES)[number];

export const WorkflowCategoryConfig: Record<WorkflowCategory, { label: string }> = {
  main: { label: '主流程' },
  sales: { label: '销售流转' },
  construction: { label: '施工阶段' },
  procedure: { label: '工序模板' },
  approval: { label: '审批流程' },
  acceptance: { label: '验收确认' },
};

export const WorkflowNodeTypeConfig: Record<WorkflowNodeType, { label: string }> = {
  start: { label: '开始' },
  end: { label: '结束' },
  business: { label: '业务节点' },
  construction_stage: { label: '施工阶段' },
  procedure: { label: '工序节点' },
  approval: { label: '审批节点' },
  confirmation: { label: '确认节点' },
  notification: { label: '通知节点' },
  automation: { label: '自动动作' },
  subflow: { label: '子流程' },
};

export const WorkflowDefinitionStatusConfig: Record<
  WorkflowDefinitionStatus,
  { label: string; type: 'default' | 'primary' | 'success' | 'warning' | 'danger' }
> = {
  draft: { label: '草稿', type: 'warning' },
  active: { label: '已发布', type: 'success' },
  archived: { label: '已归档', type: 'default' },
};

export const isWorkflowNodeType = (
  value: string | null | undefined,
): value is WorkflowNodeType =>
  typeof value === 'string' &&
  WORKFLOW_NODE_TYPE_VALUES.includes(value as WorkflowNodeType);
