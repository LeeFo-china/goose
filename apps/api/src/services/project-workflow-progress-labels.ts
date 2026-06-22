type JsonObject = Record<string, unknown>;

export type ProjectWorkflowProgressGate = {
  type: "payment_collection";
  payment_type: string;
  payment_label: string;
  blocked_stage_code: string | null;
  blocked_stage_label: string | null;
  blocked_reason?: string;
};

export type ProjectWorkflowProgressLabelNode = {
  id: string;
  title: string;
  node_type: string | null;
  business_kind: string | null;
  config: JsonObject;
};

export type ProjectWorkflowProgressLabelGraph = {
  nodes: ProjectWorkflowProgressLabelNode[];
  edges: Array<{
    source_node_id: string;
    target_node_id: string;
  }>;
};

const PAYMENT_LABELS: Record<string, string> = {
  deposit: "意向定金",
  stage_1: "开工首付款",
  stage_2: "中期进度款",
  stage_3: "工程尾款",
  add_on: "后期增项款",
};

const STAGE_LABELS: Record<string, string> = {
  demolition: "拆改",
  plumbing_electrical: "水电",
  tiling: "瓦工",
  woodwork: "木工",
  painting: "油工",
  installation: "安装",
  completion: "竣工",
};

export function getWorkflowNodeDisplayTitle(
  node: ProjectWorkflowProgressLabelNode,
): string | null {
  if (node.business_kind !== "payment_collection") {
    return node.title || null;
  }

  const paymentType = readString(node.config.payment_type);
  return paymentType ? PAYMENT_LABELS[paymentType] ?? node.title : node.title;
}

export function buildProjectWorkflowPaymentGate(
  currentNode: ProjectWorkflowProgressLabelNode,
  graph: ProjectWorkflowProgressLabelGraph | null,
  blockedReason?: string,
): ProjectWorkflowProgressGate {
  const paymentType = readString(currentNode.config.payment_type) ?? "deposit";
  const nextNode = graph?.edges
    .filter((edge) => edge.source_node_id === currentNode.id)
    .map((edge) =>
      graph.nodes.find((node) => node.id === edge.target_node_id) ?? null
    )
    .find((node): node is ProjectWorkflowProgressLabelNode => Boolean(node)) ??
    null;
  const blockedStageCode = readString(nextNode?.config.stage_key);

  return {
    type: "payment_collection",
    payment_type: paymentType,
    payment_label: getWorkflowNodeDisplayTitle(currentNode) ?? currentNode.title,
    blocked_stage_code: blockedStageCode,
    blocked_stage_label: blockedStageCode
      ? STAGE_LABELS[blockedStageCode] ?? blockedStageCode
      : null,
    ...(blockedReason ? { blocked_reason: blockedReason } : {}),
  };
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
