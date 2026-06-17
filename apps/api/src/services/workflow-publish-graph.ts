import { Errors } from "@/errors/error-factory";
import type {
  JsonObject,
  WorkflowDefinitionRow,
  WorkflowEdgeRow,
  WorkflowNodeRow,
} from "@/repositories/workflows";
import { findBusinessTrackIssues } from "@/services/workflow-business-track-validation";
import { findWorkflowBranchEdgeIssues } from "@/services/workflow-branch-validation";
import { findPaymentCollectionIssues } from "@/services/workflow-payment-collection-node-validation";
import { findProcedureStageIssues } from "@/services/workflow-procedure-node-validation";

type WorkflowPublishGraphInput = {
  definition: WorkflowDefinitionRow;
  nodes: WorkflowNodeRow[];
  edges: WorkflowEdgeRow[];
};

type NormalizedWorkflowPublishGraphInput = {
  definition: WorkflowDefinitionRow | null;
  nodes: WorkflowNodeRow[];
  edges: WorkflowEdgeRow[];
};

export function validateWorkflowPublishGraph(
  inputOrNodes: WorkflowPublishGraphInput | WorkflowNodeRow[],
  maybeEdges?: WorkflowEdgeRow[],
) {
  const { definition, nodes, edges } = normalizePublishGraphInput(
    inputOrNodes,
    maybeEdges,
  );

  if (nodes.length === 0) {
    throw Errors.badRequest("发布前至少需要配置一个节点");
  }

  const nodeIds = new Set<string>();
  const nodeKeys = new Set<string>();
  const nodeKeyCounts = new Map<string, number>();
  let startNodeCount = 0;
  let endNodeCount = 0;

  for (const node of nodes) {
    nodeIds.add(node.id);
    nodeKeys.add(node.node_key);
    nodeKeyCounts.set(node.node_key, (nodeKeyCounts.get(node.node_key) ?? 0) + 1);
    if (node.node_type === "start") {
      startNodeCount += 1;
    }
    if (node.node_type === "end") {
      endNodeCount += 1;
    }
  }

  const duplicateNodeKeys = Array.from(nodeKeyCounts.entries())
    .filter(([, count]) => count > 1)
    .map(([nodeKey]) => nodeKey);
  if (duplicateNodeKeys.length > 0) {
    throw Errors.badRequest(`节点编码重复: ${duplicateNodeKeys.join("、")}`);
  }

  if (startNodeCount !== 1) {
    throw Errors.badRequest("发布前必须且只能配置一个开始节点");
  }

  if (endNodeCount < 1) {
    throw Errors.badRequest("发布前至少需要配置一个结束节点");
  }

  const invalidNodeIds = new Set<string>();
  const selfLoopNodeIds = new Set<string>();
  const sourceNodeIds = new Set<string>();

  for (const edge of edges) {
    sourceNodeIds.add(edge.source_node_id);
    if (!nodeIds.has(edge.source_node_id)) {
      invalidNodeIds.add(edge.source_node_id);
    }
    if (!nodeIds.has(edge.target_node_id)) {
      invalidNodeIds.add(edge.target_node_id);
    }
    if (edge.source_node_id === edge.target_node_id) {
      selfLoopNodeIds.add(edge.source_node_id);
    }
  }

  if (invalidNodeIds.size > 0) {
    throw Errors.badRequest(
      `连线引用了不存在的节点: ${Array.from(invalidNodeIds).join("、")}`,
    );
  }

  if (selfLoopNodeIds.size > 0) {
    throw Errors.badRequest(
      `节点不能连接到自身: ${Array.from(selfLoopNodeIds).join("、")}`,
    );
  }

  const branchEdgeIssues = findWorkflowBranchEdgeIssues(nodes, edges);
  if (branchEdgeIssues.length > 0) {
    throw Errors.badRequest(branchEdgeIssues.join("；"));
  }

  const deadEndNodes = nodes.filter((node) =>
    node.node_type !== "end" && !sourceNodeIds.has(node.id)
  );
  if (deadEndNodes.length > 0) {
    throw Errors.badRequest(
      `非结束节点必须至少有一条出边: ${
        deadEndNodes.map((node) => node.node_key).join("、")
      }`,
    );
  }

  const invalidConfigRefs = findInvalidConfigReferences(nodes, nodeKeys);
  if (invalidConfigRefs.length > 0) {
    throw Errors.badRequest(
      `节点配置引用了不存在的节点: ${invalidConfigRefs.join("、")}`,
    );
  }

  const procedureStageIssues = findProcedureStageIssues(nodes);
  if (procedureStageIssues.length > 0) {
    throw Errors.badRequest(procedureStageIssues.join("；"));
  }

  const paymentCollectionIssues = findPaymentCollectionIssues(nodes);
  if (paymentCollectionIssues.length > 0) {
    throw Errors.badRequest(paymentCollectionIssues.join("；"));
  }

  if (definition) {
    const businessTrackIssues = findBusinessTrackIssues({
      definition,
      nodes,
      edges,
    });
    if (businessTrackIssues.length > 0) {
      throw Errors.badRequest(businessTrackIssues.join("；"));
    }
  }

  return {
    valid: true,
    issues: [] as string[],
    checked_at: new Date().toISOString(),
  };
}

function normalizePublishGraphInput(
  inputOrNodes: WorkflowPublishGraphInput | WorkflowNodeRow[],
  maybeEdges?: WorkflowEdgeRow[],
): NormalizedWorkflowPublishGraphInput {
  if (Array.isArray(inputOrNodes)) {
    return {
      definition: null,
      nodes: inputOrNodes,
      edges: maybeEdges ?? [],
    };
  }

  return inputOrNodes;
}

export function buildWorkflowSnapshot(input: {
  definition: WorkflowDefinitionRow;
  nodes: WorkflowNodeRow[];
  edges: WorkflowEdgeRow[];
  publishedAt: string;
}): JsonObject {
  return {
    definition_id: input.definition.id,
    workflow_key: input.definition.workflow_key,
    category: input.definition.category,
    published_at: input.publishedAt,
    nodes: input.nodes,
    edges: input.edges,
  };
}

function findInvalidConfigReferences(
  nodes: WorkflowNodeRow[],
  nodeKeys: Set<string>,
) {
  const invalidRefs = new Set<string>();

  for (const node of nodes) {
    for (const field of ["rollback_target_key", "reject_target_key"] as const) {
      const value = node.config[field];
      if (typeof value === "string" && value.trim() && !nodeKeys.has(value)) {
        invalidRefs.add(`${node.node_key}.${field}=${value}`);
      }
    }
  }

  return Array.from(invalidRefs);
}
