import type { WorkflowEdgeRow, WorkflowNodeRow } from "@/repositories/workflows";

export function findWorkflowBranchEdgeIssues(
  nodes: WorkflowNodeRow[],
  edges: WorkflowEdgeRow[],
) {
  const nodeKeyById = new Map(nodes.map((node) => [node.id, node.node_key]));
  const edgesBySourceId = new Map<string, WorkflowEdgeRow[]>();
  for (const edge of edges) {
    edgesBySourceId.set(edge.source_node_id, [
      ...(edgesBySourceId.get(edge.source_node_id) || []),
      edge,
    ]);
  }

  const issues: string[] = [];
  edgesBySourceId.forEach((sourceEdges, sourceNodeId) => {
    if (sourceEdges.length <= 1) return;
    const nodeKey = nodeKeyById.get(sourceNodeId) || sourceNodeId;
    const alwaysEdges = sourceEdges.filter((edge) =>
      edge.condition.operator === "always"
    );
    if (alwaysEdges.length === sourceEdges.length) {
      issues.push(`${nodeKey} 多条出边必须配置分支条件`);
    }
    if (alwaysEdges.length > 1) {
      issues.push(`${nodeKey} 最多只能配置一条默认分支`);
    }

    const signatures = new Set<string>();
    for (const edge of sourceEdges) {
      if (edge.condition.operator === "always") continue;
      const signature = getWorkflowEdgeConditionSignature(edge.condition);
      if (signatures.has(signature)) {
        issues.push(`${nodeKey} 存在重复分支条件`);
        break;
      }
      signatures.add(signature);
    }
  });

  return issues;
}

function getWorkflowEdgeConditionSignature(
  condition: WorkflowEdgeRow["condition"],
) {
  return `${condition.operator}:${condition.field ?? ""}:${String(condition.value ?? "")}`;
}
