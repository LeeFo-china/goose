import type {
  JsonObject,
  WorkflowEdgeRow,
  WorkflowNodeRow,
} from "./types";

export const WORKFLOW_DEFINITION_SELECT = [
  "id",
  "tenant_id",
  "workflow_key",
  "name",
  "description",
  "category",
  "status",
  "active_version_id",
  "created_by",
  "updated_by",
  "created_at",
  "updated_at",
].join(", ");

export const WORKFLOW_VERSION_SELECT = [
  "id",
  "tenant_id",
  "definition_id",
  "version_number",
  "version_label",
  "status",
  "snapshot",
  "validation_result",
  "published_by",
  "published_at",
  "created_at",
].join(", ");

export const WORKFLOW_NODE_SELECT = [
  "id",
  "tenant_id",
  "definition_id",
  "node_key",
  "node_type",
  "business_kind",
  "title",
  "description",
  "position",
  "config",
  "sort_order",
  "created_at",
  "updated_at",
].join(", ");

export const WORKFLOW_EDGE_SELECT = [
  "id",
  "tenant_id",
  "definition_id",
  "source_node_id",
  "target_node_id",
  "label",
  "condition",
  "priority",
  "created_at",
  "updated_at",
].join(", ");

export const WORKFLOW_INSTANCE_SELECT = [
  "id",
  "tenant_id",
  "definition_id",
  "version_id",
  "subject_type",
  "subject_id",
  "status",
  "context",
  "current_node_id",
  "current_node_key",
  "current_node_snapshot",
  "started_by",
  "completed_by",
  "started_at",
  "completed_at",
  "archived_at",
  "archived_by",
  "archive_reason",
  "created_at",
  "updated_at",
].join(", ");

export const WORKFLOW_TASK_SELECT = [
  "id",
  "tenant_id",
  "instance_id",
  "instance_node_id",
  "definition_id",
  "version_id",
  "node_id",
  "node_key",
  "node_type",
  "title",
  "status",
  "assignee_employee_id",
  "assignee_role_code",
  "assignee_permission_code",
  "due_at",
  "completed_by",
  "completed_at",
  "created_at",
  "updated_at",
].join(", ");

export const MAX_GRAPH_NODES = 200;
export const MAX_GRAPH_EDGES = 400;

export function escapeSupabaseOrValue(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/[%_]/g, "\\$&")
    .replace(/,/g, "\\,");
}

export function unique(values: Array<string | null>): string[] {
  return Array.from(
    new Set(values.filter((value): value is string => Boolean(value))),
  );
}

export function compareWorkflowNodes(
  left: WorkflowNodeRow,
  right: WorkflowNodeRow,
): number {
  if (left.sort_order !== right.sort_order) {
    return left.sort_order - right.sort_order;
  }

  return left.created_at.localeCompare(right.created_at);
}

export function compareWorkflowEdges(
  left: WorkflowEdgeRow,
  right: WorkflowEdgeRow,
): number {
  if (left.priority !== right.priority) {
    return left.priority - right.priority;
  }

  return left.created_at.localeCompare(right.created_at);
}

export function getSnapshotNodes(snapshot: JsonObject) {
  return getSnapshotRows(
    snapshot,
    "nodes",
    MAX_GRAPH_NODES,
    isWorkflowNodeRow,
    compareWorkflowNodes,
  );
}

export function getSnapshotEdges(snapshot: JsonObject) {
  return getSnapshotRows(
    snapshot,
    "edges",
    MAX_GRAPH_EDGES,
    isWorkflowEdgeRow,
    compareWorkflowEdges,
  );
}

function getSnapshotRows<T>(
  snapshot: JsonObject,
  key: "nodes" | "edges",
  limit: number,
  predicate: (value: unknown) => value is T,
  compare: (left: T, right: T) => number,
): T[] {
  const value = snapshot[key];
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(predicate).slice(0, limit).sort(compare);
}

function isWorkflowNodeRow(value: unknown): value is WorkflowNodeRow {
  if (!isRecord(value)) return false;

  return (
    typeof value.id === "string" &&
    typeof value.tenant_id === "string" &&
    typeof value.definition_id === "string" &&
    typeof value.node_key === "string" &&
    typeof value.node_type === "string" &&
    typeof value.title === "string" &&
    isRecord(value.position) &&
    isRecord(value.config) &&
    typeof value.sort_order === "number" &&
    typeof value.created_at === "string" &&
    typeof value.updated_at === "string"
  );
}

function isWorkflowEdgeRow(value: unknown): value is WorkflowEdgeRow {
  if (!isRecord(value)) return false;

  return (
    typeof value.id === "string" &&
    typeof value.tenant_id === "string" &&
    typeof value.definition_id === "string" &&
    typeof value.source_node_id === "string" &&
    typeof value.target_node_id === "string" &&
    isRecord(value.condition) &&
    typeof value.priority === "number" &&
    typeof value.created_at === "string" &&
    typeof value.updated_at === "string"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
