import type {
  WorkflowBusinessKind,
  WorkflowCategory,
  WorkflowDefinitionStatus,
  WorkflowEdgeConditionOperator,
  WorkflowInstanceStatus,
  WorkflowNodeType,
  WorkflowSubjectType,
  WorkflowTaskStatus,
  WorkflowVersionStatus,
} from "@gooes/domain";

export type WorkflowPagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type WorkflowDefinition = {
  id: string;
  tenant_id: string;
  workflow_key: string;
  name: string;
  description: string | null;
  category: WorkflowCategory;
  status: WorkflowDefinitionStatus;
  active_version_id: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type WorkflowVersion = {
  id: string;
  tenant_id: string;
  definition_id: string;
  version_number: number;
  version_label: string | null;
  status: WorkflowVersionStatus;
  snapshot: Record<string, unknown>;
  validation_result: Record<string, unknown>;
  published_by: string | null;
  published_at: string;
  created_at: string;
};

export type WorkflowVersionSummary = WorkflowVersion & {
  is_active: boolean;
  running_instance_count: number;
};

export type WorkflowNodePosition = {
  x: number;
  y: number;
};

export type WorkflowBaseNodeConfig = {
  required_permissions?: string[];
  timeout_hours?: number | null;
  rollback_target_key?: string | null;
};

export type WorkflowConstructionStageNodeConfig = WorkflowBaseNodeConfig & {
  stage_type?: "construction_start" | "final_acceptance";
};

export type WorkflowFinanceNodeConfig = WorkflowBaseNodeConfig & {
  finance_type?: "payment_collection" | "settlement";
};

export type WorkflowApprovalNodeConfig = WorkflowBaseNodeConfig & {
  approval_type?: "expense_approval" | "workflow_approval";
  assignee_rule?: "employee" | "department" | "role";
  assignee_id?: string | null;
  amount_threshold?: number | null;
  approve_mode?: "any" | "all";
  reject_target_key?: string | null;
};

export type WorkflowProcedureNodeConfig = WorkflowBaseNodeConfig & {
  stage_key: string;
  work_instructions?: string | null;
  require_log?: boolean;
  min_image_count?: number;
  trigger_acceptance?: boolean;
  customer_visible?: boolean;
};

export type WorkflowPaymentCollectionNodeConfig = WorkflowBaseNodeConfig & {
  payment_type?: "deposit" | "stage_1" | "stage_2" | "stage_3" | "add_on";
  requirement_mode?: "any_confirmed" | "signed_amount_percentage";
  required_percentage?: number | null;
  /** Legacy published snapshots may still carry a fixed amount. New nodes use requirement_mode. */
  min_amount?: number | null;
  block_message?: string | null;
  finance_reviewer_employee_id?: string | null;
};

export type WorkflowEmployeeOption = {
  id: string;
  name: string | null;
  phone: string | null;
  status: string | null;
  department_name?: string | null;
  department_code?: string | null;
  post_name?: string | null;
  roles?: Array<{
    id: string;
    code: string;
    name: string;
    status: string;
  }>;
};

export type WorkflowNotificationNodeConfig = WorkflowBaseNodeConfig & {
  channels: Array<"mini_program" | "sms" | "todo">;
  recipient_rule: "owner" | "assignee" | "customer" | "role";
  template: string;
};

export type WorkflowNodeConfig =
  | WorkflowBaseNodeConfig
  | WorkflowConstructionStageNodeConfig
  | WorkflowFinanceNodeConfig
  | WorkflowApprovalNodeConfig
  | WorkflowProcedureNodeConfig
  | WorkflowPaymentCollectionNodeConfig
  | WorkflowNotificationNodeConfig;

export type WorkflowNode = {
  id: string;
  tenant_id: string;
  definition_id: string;
  node_key: string;
  node_type: WorkflowNodeType;
  business_kind: WorkflowBusinessKind | null;
  title: string;
  description: string | null;
  position: WorkflowNodePosition;
  config: WorkflowNodeConfig;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type WorkflowEdgeCondition = {
  operator: WorkflowEdgeConditionOperator;
  field?: string | null;
  value?: string | number | boolean | string[] | null;
};

export type WorkflowEdge = {
  id: string;
  tenant_id: string;
  definition_id: string;
  source_node_id: string;
  target_node_id: string;
  label: string | null;
  condition: WorkflowEdgeCondition;
  priority: number;
  created_at: string;
  updated_at: string;
};

export type WorkflowGraph = {
  definition: WorkflowDefinition;
  version: WorkflowVersion | null;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
};

export type WorkflowDefinitionDetail = {
  definition: WorkflowDefinition;
  draftGraph: {
    nodes: WorkflowNode[];
    edges: WorkflowEdge[];
  } | null;
};

export type WorkflowDefinitionListData = {
  list: WorkflowDefinition[];
  pagination: WorkflowPagination;
};

export type WorkflowDefinitionListQuery = {
  page?: number;
  pageSize?: number;
  status?: WorkflowDefinitionStatus;
  category?: WorkflowCategory;
  keyword?: string;
};

export type WorkflowVersionListData = {
  list: WorkflowVersionSummary[];
  pagination: WorkflowPagination;
};

export type WorkflowVersionListQuery = {
  page?: number;
  pageSize?: number;
};

export type WorkflowDefinitionCreateInput = {
  workflow_key?: string;
  name: string;
  description?: string | null;
  category: WorkflowCategory;
};

export type WorkflowTemplateCreateInput = {
  template_key: "customer_main" | "project_signing" | "construction_main";
  name?: string;
};

export type WorkflowDefinitionUpdateInput = {
  name?: string;
  description?: string | null;
  status?: WorkflowDefinitionStatus;
};

export type WorkflowNodeInput = {
  id?: string;
  node_key: string;
  node_type: WorkflowNodeType;
  business_kind?: WorkflowBusinessKind | null;
  title: string;
  description?: string | null;
  position: WorkflowNodePosition;
  config: WorkflowNodeConfig;
  sort_order: number;
};

export type WorkflowEdgeInput = {
  id?: string;
  source_node_key: string;
  target_node_key: string;
  label?: string | null;
  condition: WorkflowEdgeCondition;
  priority: number;
};

export type WorkflowGraphSaveInput = {
  nodes: WorkflowNodeInput[];
  edges: WorkflowEdgeInput[];
};

export type WorkflowGraphSaveResult = {
  ok: true;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
};

export type WorkflowPublishInput = {
  version_label?: string | null;
};

export type WorkflowPublishResult = {
  definition: WorkflowDefinition;
  version: WorkflowVersion;
  graph: WorkflowGraph;
};

export type WorkflowRuntimeInstance = {
  id: string;
  tenant_id: string;
  definition_id: string;
  version_id: string;
  subject_type: WorkflowSubjectType;
  subject_id: string;
  status: WorkflowInstanceStatus;
  context: Record<string, unknown>;
  current_node_id: string | null;
  current_node_key: string | null;
  current_node_snapshot: Record<string, unknown> | null;
  started_by: string | null;
  completed_by: string | null;
  started_at: string;
  completed_at: string | null;
  archived_at: string | null;
  archived_by: string | null;
  archive_reason: string | null;
  created_at: string;
  updated_at: string;
};

export type WorkflowRuntimeTask = {
  id: string;
  tenant_id: string;
  instance_id: string;
  instance_node_id: string | null;
  definition_id: string;
  version_id: string;
  node_id: string;
  node_key: string;
  node_type: WorkflowNodeType;
  title: string;
  status: WorkflowTaskStatus;
  assignee_employee_id: string | null;
  assignee_role_code: string | null;
  due_at: string | null;
  completed_by: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type WorkflowRuntimeInstanceListData = {
  list: WorkflowRuntimeInstance[];
  pagination: WorkflowPagination;
};

export type WorkflowRuntimeInstanceListQuery = {
  page?: number;
  pageSize?: number;
  status?: WorkflowInstanceStatus;
  subject_type?: WorkflowSubjectType;
  subject_id?: string;
  archived?: "without" | "only" | "all";
};

export type WorkflowRuntimeStartResult = {
  ok: true;
  instance: WorkflowRuntimeInstance;
  currentNode: Record<string, unknown>;
  task: WorkflowRuntimeTask | null;
};

export type WorkflowRuntimeCompleteNodeResult = {
  ok: true;
  instance: WorkflowRuntimeInstance;
  completedNode: Record<string, unknown>;
  nextNode: Record<string, unknown> | null;
  task: WorkflowRuntimeTask | null;
};

export type WorkflowRuntimeRebuildResult = {
  ok: true;
  dryRun: boolean;
  instance: WorkflowRuntimeInstance | null;
  currentNode: Record<string, unknown> | null;
  task: WorkflowRuntimeTask | null;
  subjectState: Record<string, unknown> | null;
  existingInstanceCount: number;
  canceledInstanceCount: number;
  deletedInstanceCount: number;
};
