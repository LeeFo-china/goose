import {
  WORKFLOW_BUSINESS_FLOW_OPTIONS,
} from "@/components/workflows/workflow-business-flow-options";
import {
  WORKFLOW_FINANCE_KIND_OPTIONS,
} from "@/components/workflows/workflow-finance-node-options";
import {
  WORKFLOW_NODE_CAPABILITY_OPTIONS,
  type WorkflowNodeCapability,
} from "@/components/workflows/workflow-node-capabilities";
import {
  WorkflowNodePresets,
} from "@/components/workflows/workflow-node-presets";
import type {
  WorkflowDefinition,
  WorkflowEdge,
  WorkflowNode,
} from "@/components/workflows/workflow-types";
import type { WorkflowValidationIssue } from "@/components/workflows/workflow-designer-types";

export type WorkflowBusinessTrack =
  | "customer_design"
  | "project_signing"
  | "construction"
  | "generic";

const STRICT_TRACK_PRESET_KEYS = new Set([
  "start",
  "workflow_step",
  "notification",
  "end",
]);

const TRACK_CAPABILITIES: Record<
  WorkflowBusinessTrack,
  readonly WorkflowNodeCapability[]
> = {
  customer_design: ["business", "approval", "notification"],
  project_signing: ["business", "finance", "approval", "notification"],
  construction: ["construction", "procedure", "finance", "approval", "notification"],
  generic: WORKFLOW_NODE_CAPABILITY_OPTIONS.map((option) => option.value),
};

const CUSTOMER_BUSINESS_KINDS = new Set([
  "customer_lead",
  "phone_follow_up",
  "store_visit",
  "design",
]);

const PROJECT_SIGNING_BUSINESS_KINDS = new Set([
  "design",
  "quote",
  "contract",
]);

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

const PROJECT_EXCEPTION_NODE_KEYS = new Set(["on_hold", "invalid"]);
const CUSTOMER_STAGE_NODE_KEYS = new Set(["potential", "following", "arrived"]);
const CUSTOMER_STAGE_BUSINESS_KINDS = new Set([
  "customer_lead",
  "phone_follow_up",
  "store_visit",
]);

export function getWorkflowTrack(
  definition: Pick<WorkflowDefinition, "workflow_key">,
): WorkflowBusinessTrack {
  switch (definition.workflow_key) {
    case "customer_main":
      return "customer_design";
    case "project_signing":
      return "project_signing";
    case "construction_main":
      return "construction";
    default:
      return "generic";
  }
}

export function getWorkflowCapabilityOptionsForTrack(
  track: WorkflowBusinessTrack,
) {
  const allowed = new Set(TRACK_CAPABILITIES[track]);
  return WORKFLOW_NODE_CAPABILITY_OPTIONS.filter((option) =>
    allowed.has(option.value)
  );
}

export function getWorkflowBusinessFlowOptionsForTrack(
  track: WorkflowBusinessTrack,
) {
  if (track === "customer_design") {
    return WORKFLOW_BUSINESS_FLOW_OPTIONS.filter((option) =>
      CUSTOMER_BUSINESS_KINDS.has(option.value)
    );
  }

  if (track === "project_signing") {
    return WORKFLOW_BUSINESS_FLOW_OPTIONS.filter((option) =>
      PROJECT_SIGNING_BUSINESS_KINDS.has(option.value)
    );
  }

  if (track === "construction") {
    return [];
  }

  return WORKFLOW_BUSINESS_FLOW_OPTIONS;
}

export function getWorkflowFinanceKindOptionsForTrack(
  track: WorkflowBusinessTrack,
) {
  if (track === "project_signing" || track === "construction") {
    return WORKFLOW_FINANCE_KIND_OPTIONS.filter((option) =>
      option.value === "payment_collection"
    );
  }

  if (track === "customer_design") {
    return [];
  }

  return WORKFLOW_FINANCE_KIND_OPTIONS;
}

export function getWorkflowNodePresetsForTrack(track: WorkflowBusinessTrack) {
  if (track === "generic") return WorkflowNodePresets;
  return WorkflowNodePresets.filter((preset) =>
    STRICT_TRACK_PRESET_KEYS.has(preset.key)
  );
}

export function findWorkflowBusinessTrackIssues(graph: {
  definition: Pick<WorkflowDefinition, "workflow_key">;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}): WorkflowValidationIssue[] {
  switch (graph.definition.workflow_key) {
    case "customer_main":
      return validateCustomerDesignTrack(graph.nodes, graph.edges);
    case "project_signing":
      return validateProjectSigningTrack(graph.nodes, graph.edges);
    case "construction_main":
      return validateConstructionTrack(graph.nodes, graph.edges);
    default:
      return [];
  }
}

function validateCustomerDesignTrack(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
): WorkflowValidationIssue[] {
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
    return [
      issue(
        "business_track_forbidden_project_node",
        `客户设计流程不能包含项目签约节点: ${formatNodeKeys(forbiddenNodes)}`,
      ),
    ];
  }

  return validateTrackOrder({
    label: "客户设计流程",
    requiredTrack: CUSTOMER_DESIGN_TRACK,
    nodes,
    edges,
  });
}

function validateProjectSigningTrack(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
): WorkflowValidationIssue[] {
  const exceptionIssues = findProjectExceptionNodeIssues(nodes);
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
    return [
      issue(
        "business_track_forbidden_construction_node",
        `项目签约流程不能包含施工节点: ${formatNodeKeys(forbiddenNodes)}`,
      ),
    ];
  }

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
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
): WorkflowValidationIssue[] {
  const exceptionIssues = findProjectExceptionNodeIssues(nodes);
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
    return [
      issue(
        "business_track_forbidden_project_signing_node",
        `施工流程不能包含项目签约节点: ${formatNodeKeys(forbiddenNodes)}`,
      ),
    ];
  }

  return validateTrackOrder({
    label: "施工流程",
    requiredTrack: CONSTRUCTION_TRACK,
    nodes,
    edges,
  });
}

function findProjectExceptionNodeIssues(
  nodes: WorkflowNode[],
): WorkflowValidationIssue[] {
  const exceptionNodes = nodes.filter((node) =>
    PROJECT_EXCEPTION_NODE_KEYS.has(node.node_key)
  );
  if (exceptionNodes.length === 0) return [];

  return [
    issue(
      "business_track_project_exception_node",
      `项目暂停、作废必须作为异常动作，不允许配置为主线节点: ${
        formatNodeKeys(exceptionNodes)
      }`,
    ),
  ];
}

function findCustomerStageNodeIssues(
  label: string,
  nodes: WorkflowNode[],
): WorkflowValidationIssue[] {
  const customerNodes = nodes.filter((node) =>
    CUSTOMER_STAGE_NODE_KEYS.has(node.node_key) ||
    (node.business_kind !== null &&
      CUSTOMER_STAGE_BUSINESS_KINDS.has(node.business_kind))
  );
  if (customerNodes.length === 0) return [];

  return [
    issue(
      "business_track_forbidden_customer_node",
      `${label}不能包含客户节点: ${formatNodeKeys(customerNodes)}`,
    ),
  ];
}

function findProjectSigningPaymentGateIssues(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
): WorkflowValidationIssue[] {
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

  const issues: WorkflowValidationIssue[] = [];
  mainlineNodes.forEach((node, index) => {
    if (node.business_kind !== "payment_collection") return;

    const paymentType = "payment_type" in node.config
      ? node.config.payment_type
      : null;
    if (paymentType !== "deposit" && paymentType !== "stage_1") {
      issues.push(issue(
        "business_track_payment_gate_type",
        `项目签约流程收款节点只允许定金或开工前款: ${node.node_key}`,
        node.node_key,
      ));
      return;
    }

    if (
      paymentType === "deposit" &&
      (index <= proposalConfirmedIndex || index >= signedIndex)
    ) {
      issues.push(issue(
        "business_track_payment_gate_order",
        `项目签约流程收定金节点必须在方案确认之后、项目签约之前: ${node.node_key}`,
        node.node_key,
      ));
      return;
    }

    if (
      paymentType === "stage_1" &&
      (index <= signedIndex || index >= pendingStartIndex)
    ) {
      issues.push(issue(
        "business_track_payment_gate_order",
        `项目签约流程开工前款节点必须在项目签约之后、排期开工之前: ${node.node_key}`,
        node.node_key,
      ));
    }
  });

  return issues;
}

function validateTrackOrder(input: {
  label: string;
  requiredTrack: readonly string[];
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}): WorkflowValidationIssue[] {
  const mainlineNodeKeys = getAlwaysMainlineNodes(input.nodes, input.edges)
    .map((node) => node.node_key);
  const missingKeys = input.requiredTrack.filter((nodeKey) =>
    !mainlineNodeKeys.includes(nodeKey)
  );
  if (missingKeys.length > 0) {
    return [
      issue(
        "business_track_required_node_missing",
        `${input.label}缺少标准节点: ${missingKeys.join("、")}`,
      ),
    ];
  }

  let searchFrom = 0;
  for (const nodeKey of input.requiredTrack) {
    const nextIndex = mainlineNodeKeys.indexOf(nodeKey, searchFrom);
    if (nextIndex < 0) {
      return [
        issue(
          "business_track_order_invalid",
          `${input.label}必须按标准顺序推进: ${input.requiredTrack.join(" -> ")}`,
        ),
      ];
    }
    searchFrom = nextIndex + 1;
  }

  return [];
}

function getAlwaysMainlineNodes(
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

function compareWorkflowEdges(left: WorkflowEdge, right: WorkflowEdge) {
  if (left.priority !== right.priority) return left.priority - right.priority;
  return left.id.localeCompare(right.id);
}

function findNodeIndex(nodes: WorkflowNode[], nodeKey: string) {
  return nodes.findIndex((node) => node.node_key === nodeKey);
}

function formatNodeKeys(nodes: WorkflowNode[]) {
  return nodes.map((node) => node.node_key).join("、");
}

function issue(
  code: string,
  message: string,
  nodeKey?: string,
): WorkflowValidationIssue {
  return { code, message, nodeKey };
}
