import type { WorkflowValidationIssue } from "@/components/workflows/workflow-designer-types";
import type {
  WorkflowEdge,
  WorkflowNode,
} from "@/components/workflows/workflow-types";

export function getAlwaysMainlineNodes(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
) {
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const outgoingEdges = new Map<string, WorkflowEdge[]>();
  for (const edge of edges) {
    if (edge.condition.operator !== "always") continue;
    outgoingEdges.set(edge.source_node_id, [
      ...(outgoingEdges.get(edge.source_node_id) ?? []),
      edge,
    ]);
  }

  const startNode = nodes.find((node) => node.node_type === "start");
  if (!startNode) return [];

  const visitedNodeIds = new Set<string>();
  const mainlineNodes: WorkflowNode[] = [];
  let currentNode: WorkflowNode | undefined = startNode;
  while (currentNode && !visitedNodeIds.has(currentNode.id)) {
    visitedNodeIds.add(currentNode.id);
    mainlineNodes.push(currentNode);
    if (currentNode.node_type === "end") break;

    const sortedEdges = [...(outgoingEdges.get(currentNode.id) ?? [])]
      .sort(compareWorkflowEdges);
    const nextEdge: WorkflowEdge | undefined = sortedEdges[0];
    currentNode = nextEdge ? nodesById.get(nextEdge.target_node_id) : undefined;
  }

  return mainlineNodes;
}

export function findNodeIndex(nodes: WorkflowNode[], nodeKey: string) {
  return nodes.findIndex((node) => node.node_key === nodeKey);
}

export function formatNodeKeys(nodes: WorkflowNode[]) {
  return nodes.map((node) => node.node_key).join("、");
}

export function getWorkflowStageType(node: WorkflowNode) {
  return "stage_type" in node.config
    ? readString(node.config.stage_type)
    : null;
}

export function issue(
  code: string,
  message: string,
  nodeKey?: string,
): WorkflowValidationIssue {
  return { code, message, nodeKey };
}

export function readString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function compareWorkflowEdges(left: WorkflowEdge, right: WorkflowEdge) {
  if (left.priority !== right.priority) return left.priority - right.priority;
  return left.id.localeCompare(right.id);
}
