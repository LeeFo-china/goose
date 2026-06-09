import type {
  WorkflowDefinitionCreateInput,
  WorkflowDefinitionUpdateInput,
  WorkflowGraphSaveInput,
} from "@/schema/workflows";
import type {
  WorkflowBusinessKind,
  WorkflowCategory,
  WorkflowDefinitionStatus,
  WorkflowEdgeConditionOperator,
  WorkflowNodeType,
  WorkflowVersionStatus,
} from "@gooes/domain";

export type JsonObject = Record<string, unknown>;

export type WorkflowDefinitionRow = {
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

export type WorkflowVersionRow = {
  id: string;
  tenant_id: string;
  definition_id: string;
  version_number: number;
  status: WorkflowVersionStatus;
  snapshot: JsonObject;
  validation_result: JsonObject;
  published_by: string | null;
  published_at: string;
  created_at: string;
};

export type WorkflowNodePosition = {
  x: number;
  y: number;
};

export type WorkflowNodeRow = {
  id: string;
  tenant_id: string;
  definition_id: string;
  node_key: string;
  node_type: WorkflowNodeType;
  business_kind: WorkflowBusinessKind | null;
  title: string;
  description: string | null;
  position: WorkflowNodePosition;
  config: JsonObject;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type WorkflowEdgeCondition = {
  operator: WorkflowEdgeConditionOperator;
  field?: string | null;
  value?: string | number | boolean | string[] | null;
};

export type WorkflowEdgeRow = {
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

export type WorkflowDefinitionListInput = {
  tenantId: string;
  page?: number;
  pageSize?: number;
  status?: WorkflowDefinitionStatus;
  category?: WorkflowCategory;
  keyword?: string;
};

export type WorkflowDefinitionListResult = {
  list: WorkflowDefinitionRow[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

export type WorkflowDefinitionCreateRepositoryInput =
  WorkflowDefinitionCreateInput & {
    tenantId: string;
    createdBy?: string | null;
  };

export type WorkflowDefinitionUpdateRepositoryInput =
  WorkflowDefinitionUpdateInput & {
    updatedBy?: string | null;
  };

export type WorkflowDraftGraph = {
  definition: WorkflowDefinitionRow;
  version: null;
  nodes: WorkflowNodeRow[];
  edges: WorkflowEdgeRow[];
};

export type WorkflowGraphQueryInput = {
  tenantId: string;
  definitionId: string;
  versionId?: string | null;
};

export type WorkflowGraphResult = {
  definition: WorkflowDefinitionRow;
  version: WorkflowVersionRow | null;
  nodes: WorkflowNodeRow[];
  edges: WorkflowEdgeRow[];
};

export type WorkflowDraftGraphReplaceInput = WorkflowGraphSaveInput & {
  tenantId: string;
  definitionId: string;
};

export type WorkflowDraftGraphReplaceResult =
  | {
      ok: true;
      nodes: WorkflowNodeRow[];
      edges: WorkflowEdgeRow[];
    }
  | {
      ok: false;
      reason: "definition_not_found";
    }
  | {
      ok: false;
      reason: "duplicate_node_key";
      duplicateNodeKeys: string[];
    }
  | {
      ok: false;
      reason: "invalid_node_reference";
      missingNodeKeys: string[];
    }
  | {
      ok: false;
      reason: "self_loop_edge";
      nodeKeys: string[];
    };

export type WorkflowVersionCreateInput = {
  tenantId: string;
  definitionId: string;
  versionNumber: number;
  snapshot: JsonObject;
  validationResult?: JsonObject;
  status?: WorkflowVersionStatus;
  publishedBy?: string | null;
};

export type WorkflowActiveVersionUpdateInput = {
  tenantId: string;
  definitionId: string;
  versionId: string | null;
  status?: WorkflowDefinitionStatus;
  updatedBy?: string | null;
};
