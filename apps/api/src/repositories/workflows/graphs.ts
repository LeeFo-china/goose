import { Errors } from "@/errors/error-factory";
import { workflowRpc, workflowTable } from "./client";
import { getDefinitionById } from "./definitions";
import {
  MAX_GRAPH_EDGES,
  MAX_GRAPH_NODES,
  WORKFLOW_EDGE_SELECT,
  WORKFLOW_NODE_SELECT,
  compareWorkflowEdges,
  compareWorkflowNodes,
  getSnapshotEdges,
  getSnapshotNodes,
  unique,
} from "./shared";
import type {
  WorkflowDraftGraph,
  WorkflowDraftGraphReplaceInput,
  WorkflowDraftGraphReplaceResult,
  WorkflowEdgeRow,
  WorkflowGraphQueryInput,
  WorkflowGraphResult,
  WorkflowNodeRow,
} from "./types";
import { getVersionById } from "./versions";

type InvalidReplaceResult = Exclude<
  WorkflowDraftGraphReplaceResult,
  { ok: true }
>;

export async function getDraftGraph(
  definitionId: string,
  tenantId: string,
): Promise<WorkflowDraftGraph | null> {
  const graph = await getGraph({ tenantId, definitionId });
  return graph
    ? {
        definition: graph.definition,
        version: null,
        nodes: graph.nodes,
        edges: graph.edges,
      }
    : null;
}

export async function getGraph(
  input: WorkflowGraphQueryInput,
): Promise<WorkflowGraphResult | null> {
  const definition = await getDefinitionById(input.definitionId, input.tenantId);
  if (!definition) return null;

  if (!input.versionId) {
    const graph = await loadDraftGraph(input.definitionId, input.tenantId);
    return { definition, version: null, nodes: graph.nodes, edges: graph.edges };
  }

  const version = await getVersionById(
    input.versionId,
    input.definitionId,
    input.tenantId,
  );
  if (!version) return null;

  return {
    definition,
    version,
    nodes: getSnapshotNodes(version.snapshot),
    edges: getSnapshotEdges(version.snapshot),
  };
}

export async function replaceDraftGraph(
  input: WorkflowDraftGraphReplaceInput,
): Promise<WorkflowDraftGraphReplaceResult> {
  const invalidGraph = validateDraftGraphInput(input);
  if (invalidGraph) return invalidGraph;

  const { data, error } = await workflowRpc("replace_workflow_draft_graph", {
    p_tenant_id: input.tenantId,
    p_definition_id: input.definitionId,
    p_nodes: input.nodes,
    p_edges: input.edges,
  });

  if (error) {
    throw Errors.dbError("保存流程草稿图失败", error);
  }

  return normalizeReplaceGraphResult(data);
}

async function loadDraftGraph(definitionId: string, tenantId: string) {
  const [nodesResult, edgesResult] = await Promise.all([
    workflowTable("workflow_nodes")
      .select(WORKFLOW_NODE_SELECT)
      .eq("definition_id", definitionId)
      .eq("tenant_id", tenantId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true })
      .limit(MAX_GRAPH_NODES),
    workflowTable("workflow_edges")
      .select(WORKFLOW_EDGE_SELECT)
      .eq("definition_id", definitionId)
      .eq("tenant_id", tenantId)
      .order("priority", { ascending: true })
      .order("created_at", { ascending: true })
      .limit(MAX_GRAPH_EDGES),
  ]);

  if (nodesResult.error) {
    throw Errors.dbError("查询流程草稿节点失败", nodesResult.error);
  }
  if (edgesResult.error) {
    throw Errors.dbError("查询流程草稿连线失败", edgesResult.error);
  }

  return {
    nodes: ((nodesResult.data ?? []) as WorkflowNodeRow[])
      .sort(compareWorkflowNodes),
    edges: ((edgesResult.data ?? []) as WorkflowEdgeRow[])
      .sort(compareWorkflowEdges),
  };
}

function validateDraftGraphInput(
  input: WorkflowDraftGraphReplaceInput,
): InvalidReplaceResult | null {
  const nodeKeyCounts = new Map<string, number>();
  for (const node of input.nodes) {
    nodeKeyCounts.set(node.node_key, (nodeKeyCounts.get(node.node_key) ?? 0) + 1);
  }

  const duplicateNodeKeys = Array.from(nodeKeyCounts.entries())
    .filter(([, count]) => count > 1)
    .map(([nodeKey]) => nodeKey);
  if (duplicateNodeKeys.length > 0) {
    return { ok: false, reason: "duplicate_node_key", duplicateNodeKeys };
  }

  const nodeKeys = new Set(nodeKeyCounts.keys());
  const missingNodeKeys = unique(input.edges.flatMap((edge) => [
    nodeKeys.has(edge.source_node_key) ? null : edge.source_node_key,
    nodeKeys.has(edge.target_node_key) ? null : edge.target_node_key,
  ]));
  if (missingNodeKeys.length > 0) {
    return { ok: false, reason: "invalid_node_reference", missingNodeKeys };
  }

  const selfLoopNodeKeys = unique(input.edges.map((edge) =>
    edge.source_node_key === edge.target_node_key ? edge.source_node_key : null,
  ));
  if (selfLoopNodeKeys.length > 0) {
    return { ok: false, reason: "self_loop_edge", nodeKeys: selfLoopNodeKeys };
  }

  return null;
}

function normalizeReplaceGraphResult(data: unknown): WorkflowDraftGraphReplaceResult {
  if (!isRecord(data)) {
    throw Errors.badRequest("保存流程草稿图失败");
  }

  if (data.ok === false && data.reason === "definition_not_found") {
    return { ok: false, reason: "definition_not_found" };
  }

  if (data.ok !== true || !Array.isArray(data.nodes) || !Array.isArray(data.edges)) {
    throw Errors.badRequest("保存流程草稿图失败");
  }

  return {
    ok: true,
    nodes: (data.nodes as WorkflowNodeRow[]).sort(compareWorkflowNodes),
    edges: (data.edges as WorkflowEdgeRow[]).sort(compareWorkflowEdges),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
