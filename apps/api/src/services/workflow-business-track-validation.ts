import type {
  WorkflowDefinitionRow,
  WorkflowEdgeRow,
  WorkflowNodeRow,
} from "@/repositories/workflows";

type WorkflowBusinessTrackValidationInput = {
  definition: WorkflowDefinitionRow;
  nodes: WorkflowNodeRow[];
  edges: WorkflowEdgeRow[];
};

const CUSTOMER_DESIGN_TRACK = [
  "start",
  "potential",
  "following",
  "arrived",
  "designing",
  "end",
] as const;

const PROJECT_SIGNING_TRACK = [
  "start",
  "designing",
  "proposal_confirmed",
  "signed",
  "design_finalized",
  "pending_start",
  "end",
] as const;

const CONSTRUCTION_TRACK = [
  "start",
  "started",
  "procedure_demolition",
  "procedure_plumbing_electrical",
  "procedure_tiling",
  "procedure_woodwork",
  "procedure_painting",
  "procedure_installation",
  "final_acceptance",
  "handover",
  "end",
] as const;

const EXCEPTION_ACTION_NODE_KEYS = new Set([
  "on_hold",
  "invalid",
  "pause_project",
  "resume_project",
  "mark_invalid",
  "mark_dormant",
  "reactivate",
]);
const CUSTOMER_STAGE_NODE_KEYS = new Set(["potential", "following", "arrived"]);
const CUSTOMER_STAGE_BUSINESS_KINDS = new Set([
  "customer_lead",
  "phone_follow_up",
  "store_visit",
]);

export function findBusinessTrackIssues(
  input: WorkflowBusinessTrackValidationInput,
) {
  switch (input.definition.workflow_key) {
    case "customer_main":
      return validateCustomerDesignTrack(input.nodes, input.edges);
    case "project_signing":
      return validateProjectSigningTrack(input.nodes, input.edges);
    case "construction_main":
      return validateConstructionTrack(input.nodes, input.edges);
    default:
      return [];
  }
}

function validateCustomerDesignTrack(
  nodes: WorkflowNodeRow[],
  edges: WorkflowEdgeRow[],
) {
  const exceptionIssues = findExceptionActionNodeIssues("客户设计流程", nodes);
  if (exceptionIssues.length > 0) return exceptionIssues;

  const forbiddenNodes = nodes.filter((node) =>
    node.node_key === "signed" ||
    node.node_key === "proposal_confirmed" ||
    node.node_key === "design_finalized" ||
    node.node_key === "pending_start" ||
    node.business_kind === "contract" ||
    node.business_kind === "payment_collection" ||
    node.business_kind === "construction_start" ||
    node.business_kind === "final_acceptance" ||
    node.node_type === "construction_stage" ||
    node.node_type === "procedure"
  );
  if (forbiddenNodes.length > 0) {
    return [`客户设计流程不能包含项目签约节点: ${formatNodeKeys(forbiddenNodes)}`];
  }

  const duplicateIssues = findDuplicateMainStatusIssues(
    "客户设计流程",
    nodes,
    [
      {
        label: "客户线索",
        matches: (node) =>
          node.node_key === "potential" ||
          node.business_kind === "customer_lead",
      },
      {
        label: "跟进",
        matches: (node) =>
          node.node_key === "following" ||
          node.business_kind === "phone_follow_up",
      },
      {
        label: "到店",
        matches: (node) =>
          node.node_key === "arrived" ||
          node.business_kind === "store_visit",
      },
      {
        label: "设计",
        matches: (node) =>
          node.node_key === "designing" ||
          node.business_kind === "design",
      },
    ],
  );
  if (duplicateIssues.length > 0) return duplicateIssues;

  return validateTrackOrder({
    label: "客户设计流程",
    requiredTrack: CUSTOMER_DESIGN_TRACK,
    nodes,
    edges,
  });
}

function validateProjectSigningTrack(
  nodes: WorkflowNodeRow[],
  edges: WorkflowEdgeRow[],
) {
  const exceptionIssues = findExceptionActionNodeIssues("项目签约流程", nodes);
  if (exceptionIssues.length > 0) return exceptionIssues;

  const customerIssues = findCustomerStageNodeIssues("项目签约流程", nodes);
  if (customerIssues.length > 0) return customerIssues;

  const forbiddenNodes = nodes.filter((node) =>
    node.node_type === "procedure" ||
    node.business_kind === "procedure_template" ||
    node.business_kind === "final_acceptance" ||
    node.node_key.startsWith("procedure_") ||
    node.node_key === "started" ||
    node.node_key === "final_acceptance" ||
    node.node_key === "handover"
  );
  if (forbiddenNodes.length > 0) {
    return [`项目签约流程不能包含施工节点: ${formatNodeKeys(forbiddenNodes)}`];
  }

  const duplicateIssues = findDuplicateMainStatusIssues(
    "项目签约流程",
    nodes,
    [
      { label: "设计中", matches: (node) => node.node_key === "designing" },
      {
        label: "方案确认",
        matches: (node) => node.node_key === "proposal_confirmed",
      },
      {
        label: "项目签约",
        matches: (node) =>
          node.node_key === "signed" ||
          node.business_kind === "contract",
      },
      {
        label: "设计定稿",
        matches: (node) => node.node_key === "design_finalized",
      },
      {
        label: "排期开工",
        matches: (node) =>
          node.node_key === "pending_start" ||
          node.business_kind === "construction_start",
      },
    ],
  );
  if (duplicateIssues.length > 0) return duplicateIssues;

  const paymentGateIssues = findProjectSigningPaymentGateIssues(nodes, edges);
  if (paymentGateIssues.length > 0) return paymentGateIssues;

  return validateTrackOrder({
    label: "项目签约流程",
    requiredTrack: PROJECT_SIGNING_TRACK,
    nodes,
    edges,
  });
}

function validateConstructionTrack(
  nodes: WorkflowNodeRow[],
  edges: WorkflowEdgeRow[],
) {
  const exceptionIssues = findExceptionActionNodeIssues("施工流程", nodes);
  if (exceptionIssues.length > 0) return exceptionIssues;

  const customerIssues = findCustomerStageNodeIssues("施工流程", nodes);
  if (customerIssues.length > 0) return customerIssues;

  const forbiddenNodes = nodes.filter((node) =>
    node.node_key === "designing" ||
    node.node_key === "proposal_confirmed" ||
    node.node_key === "signed" ||
    node.node_key === "design_finalized" ||
    node.node_key === "pending_start" ||
    node.business_kind === "contract"
  );
  if (forbiddenNodes.length > 0) {
    return [`施工流程不能包含项目签约节点: ${formatNodeKeys(forbiddenNodes)}`];
  }

  const duplicateIssues = findDuplicateMainStatusIssues(
    "施工流程",
    nodes,
    [
      {
        label: "确认开工",
        matches: (node) =>
          node.node_key === "started" ||
          (
            node.node_type === "construction_stage" &&
            (
              node.business_kind === "construction_start" ||
              node.config.stage_type === "construction_start"
            )
          ),
      },
      {
        label: "竣工验收",
        matches: (node) =>
          node.node_key === "final_acceptance" ||
          (
            node.node_type === "construction_stage" &&
            (
              node.business_kind === "final_acceptance" ||
              node.config.stage_type === "final_acceptance"
            )
          ),
      },
      { label: "交房", matches: (node) => node.node_key === "handover" },
    ],
  );
  if (duplicateIssues.length > 0) return duplicateIssues;

  return validateTrackOrder({
    label: "施工流程",
    requiredTrack: CONSTRUCTION_TRACK,
    nodes,
    edges,
  });
}

function findExceptionActionNodeIssues(label: string, nodes: WorkflowNodeRow[]) {
  const exceptionNodes = nodes.filter((node) =>
    EXCEPTION_ACTION_NODE_KEYS.has(node.node_key)
  );
  if (exceptionNodes.length === 0) return [];

  return [
    `${label}异常动作不能作为主线节点: ${formatNodeKeys(exceptionNodes)}`,
  ];
}

function findCustomerStageNodeIssues(label: string, nodes: WorkflowNodeRow[]) {
  const customerNodes = nodes.filter((node) =>
    CUSTOMER_STAGE_NODE_KEYS.has(node.node_key) ||
    (node.business_kind !== null &&
      CUSTOMER_STAGE_BUSINESS_KINDS.has(node.business_kind))
  );
  if (customerNodes.length === 0) return [];

  return [`${label}不能包含客户节点: ${formatNodeKeys(customerNodes)}`];
}

function findDuplicateMainStatusIssues(
  label: string,
  nodes: WorkflowNodeRow[],
  statusDefinitions: Array<{
    label: string;
    matches: (node: WorkflowNodeRow) => boolean;
  }>,
) {
  return statusDefinitions.flatMap((status) => {
    const matchedNodes = nodes.filter(status.matches);
    if (matchedNodes.length <= 1) return [];
    return [
      `${label}主状态节点重复: ${status.label}(${formatNodeKeys(matchedNodes)})`,
    ];
  });
}

function findProjectSigningPaymentGateIssues(
  nodes: WorkflowNodeRow[],
  edges: WorkflowEdgeRow[],
) {
  const mainlineNodes = getAlwaysMainlineNodes(nodes, edges);
  const proposalConfirmedIndex = findNodeIndex(mainlineNodes, "proposal_confirmed");
  const signedIndex = findNodeIndex(mainlineNodes, "signed");
  const designFinalizedIndex = findNodeIndex(mainlineNodes, "design_finalized");
  const pendingStartIndex = findNodeIndex(mainlineNodes, "pending_start");
  if (
    proposalConfirmedIndex < 0 ||
    signedIndex < 0 ||
    designFinalizedIndex < 0 ||
    pendingStartIndex < 0
  ) {
    return [];
  }

  const issues: string[] = [];
  mainlineNodes.forEach((node, index) => {
    if (node.business_kind !== "payment_collection") return;

    const paymentType = node.config.payment_type;
    if (paymentType !== "deposit" && paymentType !== "stage_1") {
      issues.push(`项目签约流程收款节点只允许定金或开工前款: ${node.node_key}`);
      return;
    }

    if (
      paymentType === "deposit" &&
      (index <= proposalConfirmedIndex || index >= signedIndex)
    ) {
      issues.push(
        `项目签约流程收定金节点必须在方案确认之后、项目签约之前: ${node.node_key}`,
      );
      return;
    }

    if (
      paymentType === "stage_1" &&
      (index <= signedIndex || index >= pendingStartIndex)
    ) {
      issues.push(
        `项目签约流程开工前款节点必须在项目签约之后、排期开工之前: ${node.node_key}`,
      );
    }
  });

  return issues;
}

function validateTrackOrder(input: {
  label: string;
  requiredTrack: readonly string[];
  nodes: WorkflowNodeRow[];
  edges: WorkflowEdgeRow[];
}) {
  const mainlineNodeKeys = getAlwaysMainlineNodes(input.nodes, input.edges)
    .map((node) => node.node_key);
  const missingKeys = input.requiredTrack.filter((nodeKey) =>
    !mainlineNodeKeys.includes(nodeKey)
  );
  if (missingKeys.length > 0) {
    return [`${input.label}缺少标准节点: ${missingKeys.join("、")}`];
  }

  let searchFrom = 0;
  for (const nodeKey of input.requiredTrack) {
    const nextIndex = mainlineNodeKeys.indexOf(nodeKey, searchFrom);
    if (nextIndex < 0) {
      return [
        `${input.label}必须按标准顺序推进: ${input.requiredTrack.join(" -> ")}`,
      ];
    }
    searchFrom = nextIndex + 1;
  }

  return [];
}

function getAlwaysMainlineNodes(
  nodes: WorkflowNodeRow[],
  edges: WorkflowEdgeRow[],
) {
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const outgoingEdges = new Map<string, WorkflowEdgeRow[]>();
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
  const mainlineNodes: WorkflowNodeRow[] = [];
  let currentNode: WorkflowNodeRow | undefined = startNode;
  while (currentNode && !visitedNodeIds.has(currentNode.id)) {
    visitedNodeIds.add(currentNode.id);
    mainlineNodes.push(currentNode);
    if (currentNode.node_type === "end") break;

    const sortedEdges = [...(outgoingEdges.get(currentNode.id) ?? [])]
      .sort(compareWorkflowEdges);
    const nextEdge: WorkflowEdgeRow | undefined = sortedEdges[0];
    currentNode = nextEdge ? nodesById.get(nextEdge.target_node_id) : undefined;
  }

  return mainlineNodes;
}

function compareWorkflowEdges(left: WorkflowEdgeRow, right: WorkflowEdgeRow) {
  if (left.priority !== right.priority) return left.priority - right.priority;
  return left.id.localeCompare(right.id);
}

function findNodeIndex(nodes: WorkflowNodeRow[], nodeKey: string) {
  return nodes.findIndex((node) => node.node_key === nodeKey);
}

function formatNodeKeys(nodes: WorkflowNodeRow[]) {
  return nodes.map((node) => node.node_key).join("、");
}
