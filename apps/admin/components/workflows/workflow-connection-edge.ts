import type { WorkflowDesignerGraph } from "@/components/workflows/workflow-designer-types";
import {
  getDefaultWorkflowBranchOutcome,
  getWorkflowBranchOutcomeOption,
  getWorkflowBranchSourceKind,
  type WorkflowConnectionSource,
} from "@/components/workflows/workflow-branch-projection";
import {
  getWorkflowEdgeConditionSignature,
} from "@/components/workflows/workflow-edge-conditions";
import type { WorkflowEdge } from "@/components/workflows/workflow-types";

type CreateWorkflowConnectionEdgeResult =
  | { ok: true; edge: WorkflowEdge }
  | { ok: false; message: string };

export function createWorkflowConnectionEdge(input: {
  graph: WorkflowDesignerGraph;
  source: WorkflowConnectionSource;
  targetNodeId: string;
}): CreateWorkflowConnectionEdgeResult {
  const sourceNode = input.graph.nodes.find((node) => node.id === input.source.nodeId);
  if (!sourceNode || sourceNode.id === input.targetNodeId) {
    return { ok: false, message: "无法连接到该节点" };
  }

  const branchKind = getWorkflowBranchSourceKind(sourceNode);
  const branchOutcome = input.source.branchOutcome ||
    (branchKind ? getDefaultWorkflowBranchOutcome(branchKind) : null);
  const branchOption = branchOutcome
    ? getWorkflowBranchOutcomeOption(branchOutcome)
    : null;
  const condition = branchOption?.condition || { operator: "always" as const };
  const duplicate = input.graph.edges.some((edge) => {
    if (
      edge.source_node_id !== sourceNode.id ||
      edge.target_node_id !== input.targetNodeId
    ) {
      return false;
    }
    if (!branchOption) return true;
    return getWorkflowEdgeConditionSignature(edge.condition) ===
      getWorkflowEdgeConditionSignature(condition);
  });
  if (duplicate) {
    return { ok: false, message: "这两个节点之间已经存在连线" };
  }
  if (branchOption) {
    const branchDuplicate = input.graph.edges.some((edge) =>
      edge.source_node_id === sourceNode.id &&
      getWorkflowEdgeConditionSignature(edge.condition) ===
        getWorkflowEdgeConditionSignature(condition)
    );
    if (branchDuplicate) {
      return { ok: false, message: `${branchOption.label}分支已经存在` };
    }
  }

  const now = new Date().toISOString();
  return {
    ok: true,
    edge: {
      id: `local-edge-${Date.now()}`,
      tenant_id: input.graph.definition.tenant_id,
      definition_id: input.graph.definition.id,
      source_node_id: sourceNode.id,
      target_node_id: input.targetNodeId,
      label: branchOption?.edgeLabel || null,
      condition,
      priority: input.graph.edges.length + 1,
      created_at: now,
      updated_at: now,
    },
  };
}
