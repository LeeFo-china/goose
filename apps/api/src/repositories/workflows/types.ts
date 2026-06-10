import type {
  WorkflowDefinitionCreateInput,
  WorkflowDefinitionUpdateInput,
  WorkflowGraphSaveInput,
} from "@/schema/workflows";
import type {
  WorkflowInstanceStatus,
  WorkflowBusinessKind,
  WorkflowCategory,
  WorkflowDefinitionStatus,
  WorkflowEdgeConditionOperator,
  WorkflowNodeType,
  WorkflowSubjectType,
  WorkflowTaskStatus,
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
  Omit<WorkflowDefinitionCreateInput, "workflow_key"> & {
    workflow_key: string;
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

export type WorkflowDefinitionPublishInput = {
  tenantId: string;
  definitionId: string;
  expectedUpdatedAt: string;
  snapshot: JsonObject;
  validationResult: JsonObject;
  publishedBy?: string | null;
  updatedBy?: string | null;
};

export type WorkflowDefinitionPublishResult =
  | {
      ok: true;
      definition: WorkflowDefinitionRow;
      version: WorkflowVersionRow;
    }
  | {
      ok: false;
      reason: "definition_not_found" | "stale_draft";
    };

export type WorkflowInstanceRow = {
  id: string;
  tenant_id: string;
  definition_id: string;
  version_id: string;
  subject_type: WorkflowSubjectType;
  subject_id: string;
  status: WorkflowInstanceStatus;
  context: JsonObject;
  current_node_id: string | null;
  current_node_key: string | null;
  current_node_snapshot: JsonObject | null;
  started_by: string | null;
  completed_by: string | null;
  started_at: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type WorkflowInstanceNodeRow = {
  id: string;
  tenant_id: string;
  instance_id: string;
  definition_id: string;
  version_id: string;
  node_id: string;
  node_key: string;
  node_type: WorkflowNodeType;
  node_snapshot: JsonObject;
  status: WorkflowInstanceStatus;
  input: JsonObject;
  output: JsonObject;
  started_by: string | null;
  completed_by: string | null;
  started_at: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type WorkflowTaskRow = {
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

export type WorkflowRuntimeInstanceListInput = {
  tenantId: string;
  definitionId: string;
  page?: number;
  pageSize?: number;
  status?: WorkflowInstanceStatus;
  subjectType?: WorkflowSubjectType;
  subjectId?: string;
};

export type WorkflowRuntimeInstanceListResult = {
  list: WorkflowInstanceRow[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

export type WorkflowRuntimeStartInput = {
  tenantId: string;
  definitionId: string;
  subjectType: WorkflowSubjectType;
  subjectId: string;
  context: JsonObject;
  startedBy?: string | null;
};

export type WorkflowRuntimeCompleteNodeInput = {
  tenantId: string;
  definitionId: string;
  instanceId: string;
  nodeKey: string;
  action: string;
  output: JsonObject;
  actorEmployeeId?: string | null;
};

export type WorkflowRuntimeStartResult =
  | {
      ok: true;
      instance: WorkflowInstanceRow;
      currentNode: JsonObject;
      task: WorkflowTaskRow | null;
    }
  | {
      ok: false;
      reason:
        | "active_version_not_found"
        | "graph_invalid"
        | "invalid_context"
        | "running_instance_exists";
    };

export type WorkflowRuntimeCompleteNodeResult =
  | {
      ok: true;
      instance: WorkflowInstanceRow;
      completedNode: JsonObject;
      nextNode: JsonObject | null;
      task: WorkflowTaskRow | null;
    }
  | {
      ok: false;
      reason:
        | "instance_not_found"
        | "instance_not_running"
        | "node_not_current"
        | "node_run_not_found"
        | "graph_invalid"
        | "invalid_output";
      currentNodeKey?: string | null;
    };
