import type {
  WorkflowBusinessKind,
  WorkflowCategory,
  WorkflowDefinitionStatus,
  WorkflowEdgeConditionOperator,
  WorkflowNodeType,
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
  status: WorkflowVersionStatus;
  snapshot: Record<string, unknown>;
  validation_result: Record<string, unknown>;
  published_by: string | null;
  published_at: string;
  created_at: string;
};

export type WorkflowNodePosition = {
  x: number;
  y: number;
};

export type WorkflowNodeConfig = Record<string, unknown> & {
  required_permissions?: string[];
  timeout_hours?: number | null;
  rollback_target_key?: string | null;
  reject_target_key?: string | null;
};

export type WorkflowNode = {
  id?: string;
  tenant_id?: string;
  definition_id?: string;
  node_key: string;
  node_type: WorkflowNodeType;
  business_kind?: WorkflowBusinessKind | null;
  title: string;
  description?: string | null;
  position: WorkflowNodePosition;
  config: WorkflowNodeConfig;
  sort_order: number;
  created_at?: string;
  updated_at?: string;
};

export type WorkflowEdgeCondition = {
  operator: WorkflowEdgeConditionOperator;
  field?: string | null;
  value?: string | number | boolean | string[] | null;
};

export type WorkflowEdge = {
  id?: string;
  tenant_id?: string;
  definition_id?: string;
  source_node_id?: string;
  target_node_id?: string;
  source_node_key?: string;
  target_node_key?: string;
  label?: string | null;
  condition: WorkflowEdgeCondition;
  priority: number;
  created_at?: string;
  updated_at?: string;
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

export type WorkflowDefinitionCreateInput = {
  workflow_key: string;
  name: string;
  description?: string | null;
  category: WorkflowCategory;
};

export type WorkflowDefinitionUpdateInput = {
  name?: string;
  description?: string | null;
  status?: WorkflowDefinitionStatus;
};

export type WorkflowGraphSaveInput = {
  nodes: WorkflowNode[];
  edges: Array<
    Omit<WorkflowEdge, "source_node_id" | "target_node_id"> & {
      source_node_key: string;
      target_node_key: string;
    }
  >;
};

export type WorkflowPublishResult = {
  definition: WorkflowDefinition;
  version: WorkflowVersion;
  graph: WorkflowGraph;
};
