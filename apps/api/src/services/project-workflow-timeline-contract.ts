import type { WorkflowBusinessKind } from "@gooes/domain";
import type { WorkflowAssigneeEmployee } from "@/services/workflow-task-assignee";

type JsonObject = Record<string, unknown>;

export type WorkflowTimelineNodeStatus =
  | "done"
  | "current"
  | "pending"
  | "blocked";

export type WorkflowTimelineNodeDisplay = {
  label: string;
  status_label: string;
  status_variant: "default" | "success" | "warning" | "danger" | "secondary";
};

export type WorkflowTimelineNodeAttributes = {
  stage_code?: string | null;
  require_log?: boolean;
  min_image_count?: number;
  acceptance_enabled?: boolean;
  acceptance_required?: boolean;
  acceptance_id?: string | null;
  acceptance_status?: string | null;
  payment_type?: string | null;
  finance_reviewer_employee_id?: string | null;
  finance_reviewer_employee_name?: string | null;
  finance_confirmed_by_employee_id?: string | null;
  finance_confirmed_by_employee_name?: string | null;
  finance_confirmed_at?: string | null;
  assignee_employee_id?: string | null;
  assignee_employee_name?: string | null;
};

export type WorkflowTimelineNodeAction = {
  key: string;
  label: string;
  business_domain: string | null;
  business_action: string | null;
  disabled: boolean;
  disabled_reason?: string | null;
  task_id?: string;
  node_key?: string;
  node_type?: string;
  stage_code?: string | null;
  acceptance_id?: string | null;
  acceptance_status?: string | null;
  output_fields?: unknown[];
  [key: string]: unknown;
};

export type WorkflowTimelineNode = {
  node_key: string;
  node_title: string;
  node_type: string | null;
  business_kind: WorkflowBusinessKind | string | null;
  status: WorkflowTimelineNodeStatus;
  display: WorkflowTimelineNodeDisplay;
  attributes: WorkflowTimelineNodeAttributes;
  actions: WorkflowTimelineNodeAction[];
  assignee_employee_id?: string;
  assignee_employee_name?: string | null;
  assignee_employee?: WorkflowAssigneeEmployee;
};

export type WorkflowTimelineGraphNodeProjection = {
  id?: string;
  node_key: string;
  title: string;
  node_type: string | null;
  business_kind: WorkflowBusinessKind | string | null;
  config: JsonObject;
};

export type WorkflowTimelineNodeAssignee = {
  node_key: string;
  assignee_employee_id?: string;
  assignee_employee_name?: string | null;
  assignee_employee?: WorkflowAssigneeEmployee;
};

export type WorkflowTimelineNodeCompletion = {
  node_key: string;
  completed_by_employee_id?: string | null;
  completed_by_employee_name?: string | null;
  completed_at?: string | null;
};

export type ConstructionStagesForWorkflowTimeline = {
  stages?: Array<{
    stage_code?: unknown;
    stage_label?: unknown;
    acceptance_id?: unknown;
    acceptance_status?: unknown;
    acceptance_action?: {
      type?: unknown;
      label?: unknown;
      enabled?: unknown;
      reason?: unknown;
    } | null;
  }>;
};

export function buildWorkflowTimelineNodeContract(input: {
  node: WorkflowTimelineGraphNodeProjection;
  status: WorkflowTimelineNodeStatus;
  assignee?: WorkflowTimelineNodeAssignee;
  completion?: WorkflowTimelineNodeCompletion;
  actions?: Array<Record<string, unknown>>;
}): WorkflowTimelineNode {
  const actions = (input.actions ?? [])
    .map(normalizeTimelineAction)
    .filter((action): action is WorkflowTimelineNodeAction => Boolean(action));
  const attributes = buildTimelineNodeAttributes({
    node: input.node,
    assignee: input.assignee,
    completion: input.completion,
  });

  return {
    node_key: input.node.node_key,
    node_title: input.node.title,
    node_type: input.node.node_type,
    business_kind: input.node.business_kind,
    status: input.status,
    display: buildTimelineNodeDisplay(input.node.title, input.status),
    attributes,
    actions,
    ...(input.assignee
      ? {
        assignee_employee_id: input.assignee.assignee_employee_id,
        assignee_employee_name: input.assignee.assignee_employee_name ?? null,
        ...(input.assignee.assignee_employee
          ? { assignee_employee: input.assignee.assignee_employee }
          : {}),
      }
      : {}),
  };
}

export function orderWorkflowTimelineGraphNodes<
  T extends { id: string; node_type: string | null },
>(
  graph: {
    nodes: T[];
    edges: Array<{ source_node_id: string; target_node_id: string }>;
  },
): T[] {
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const incomingIds = new Set(graph.edges.map((edge) => edge.target_node_id));
  const outgoingEdges = new Map<string, Array<{ target_node_id: string }>>();

  for (const edge of graph.edges) {
    const edges = outgoingEdges.get(edge.source_node_id) ?? [];
    edges.push(edge);
    outgoingEdges.set(edge.source_node_id, edges);
  }

  const explicitStartNodes = graph.nodes.filter((node) =>
    node.node_type === "start"
  );
  const inferredStartNodes = graph.nodes.filter((node) => !incomingIds.has(node.id));
  const startNodes = explicitStartNodes.length > 0
    ? explicitStartNodes
    : inferredStartNodes.length > 0
      ? inferredStartNodes
      : graph.nodes;
  const ordered: T[] = [];
  const visitedNodeIds = new Set<string>();

  const visit = (node: T) => {
    if (visitedNodeIds.has(node.id)) return;
    visitedNodeIds.add(node.id);
    ordered.push(node);

    for (const edge of outgoingEdges.get(node.id) ?? []) {
      const targetNode = nodeById.get(edge.target_node_id);
      if (targetNode) visit(targetNode);
    }
  };

  for (const node of startNodes) {
    visit(node);
  }

  if (explicitStartNodes.length === 0 && inferredStartNodes.length === 0) {
    for (const node of graph.nodes) {
      visit(node);
    }
  }

  return ordered;
}

export function enrichWorkflowTimelineNodesWithConstructionStages(
  nodes: WorkflowTimelineNode[],
  constructionStages: ConstructionStagesForWorkflowTimeline | null | undefined,
): WorkflowTimelineNode[] {
  const stageByCode = new Map(
    (constructionStages?.stages ?? [])
      .map((stage) => [readString(stage.stage_code), stage] as const)
      .filter((item): item is [string, NonNullable<typeof item[1]>] =>
        Boolean(item[0])
      ),
  );

  return nodes.map((node) => {
    const stageCode = readString(node.attributes.stage_code);
    const stage = stageCode ? stageByCode.get(stageCode) : null;
    if (!stageCode || !stage || node.attributes.acceptance_enabled !== true) {
      return node;
    }

    const acceptanceStatus = readString(stage.acceptance_status);
    const attributes: WorkflowTimelineNodeAttributes = {
      ...node.attributes,
      acceptance_id: readString(stage.acceptance_id),
      acceptance_status: acceptanceStatus,
    };
    const acceptanceAction = buildAcceptanceTimelineAction({
      stage,
      stageCode,
      acceptanceStatus,
    });
    const actions = [
      ...node.actions.filter((action) =>
        action.business_domain !== "project_acceptance"
      ),
      ...(acceptanceAction ? [acceptanceAction] : []),
    ];
    const shouldBlockCompletion = node.status === "done" &&
      attributes.acceptance_required === true &&
      acceptanceStatus !== "customer_confirmed";

    return {
      ...node,
      status: shouldBlockCompletion ? "blocked" : node.status,
      display: shouldBlockCompletion
        ? {
          ...node.display,
          status_label: getAcceptanceStatusLabel(acceptanceStatus),
          status_variant: "warning",
        }
        : node.display,
      attributes,
      actions,
    };
  });
}

function buildTimelineNodeAttributes(input: {
  node: WorkflowTimelineGraphNodeProjection;
  assignee?: WorkflowTimelineNodeAssignee;
  completion?: WorkflowTimelineNodeCompletion;
}): WorkflowTimelineNodeAttributes {
  const { node, assignee, completion } = input;
  const stageCode = readString(node.config.stage_key);
  const paymentType = readString(node.config.payment_type);
  const financeReviewerEmployeeId = readString(
    node.config.finance_reviewer_employee_id,
  );
  const financeReviewerEmployeeName = readString(
    node.config.finance_reviewer_employee_name,
  );
  const financeConfirmedByEmployeeId = readString(
    completion?.completed_by_employee_id,
  );
  const financeConfirmedByEmployeeName = readString(
    completion?.completed_by_employee_name,
  );
  const financeConfirmedAt = readString(completion?.completed_at);
  const minImageCount = readNonNegativeNumber(node.config.min_image_count) ?? 0;
  const acceptanceEnabled = node.node_type === "procedure" &&
    node.config.trigger_acceptance === true;

  return {
    ...(stageCode ? { stage_code: stageCode } : {}),
    ...(node.node_type === "procedure"
      ? {
        require_log: node.config.require_log === true,
        min_image_count: minImageCount,
        acceptance_enabled: acceptanceEnabled,
        acceptance_required: acceptanceEnabled,
        acceptance_id: null,
        acceptance_status: null,
      }
      : {}),
    ...(paymentType ? { payment_type: paymentType } : {}),
    ...(node.business_kind === "payment_collection" && financeReviewerEmployeeId
      ? {
        finance_reviewer_employee_id: financeReviewerEmployeeId,
        finance_reviewer_employee_name: financeReviewerEmployeeName,
      }
      : {}),
    ...(node.business_kind === "payment_collection" && financeConfirmedByEmployeeId
      ? {
        finance_confirmed_by_employee_id: financeConfirmedByEmployeeId,
        finance_confirmed_by_employee_name: financeConfirmedByEmployeeName,
        finance_confirmed_at: financeConfirmedAt,
      }
      : {}),
    ...(assignee?.assignee_employee_id
      ? {
        assignee_employee_id: assignee.assignee_employee_id,
        assignee_employee_name: assignee.assignee_employee_name ?? null,
      }
      : {}),
  };
}

function buildTimelineNodeDisplay(
  label: string,
  status: WorkflowTimelineNodeStatus,
): WorkflowTimelineNodeDisplay {
  if (status === "done") {
    return { label, status_label: "已完成", status_variant: "success" };
  }
  if (status === "current") {
    return { label, status_label: "当前", status_variant: "default" };
  }
  if (status === "blocked") {
    return { label, status_label: "受阻", status_variant: "warning" };
  }
  return { label, status_label: "待处理", status_variant: "secondary" };
}

function buildAcceptanceTimelineAction(input: {
  stage: NonNullable<ConstructionStagesForWorkflowTimeline["stages"]>[number];
  stageCode: string;
  acceptanceStatus: string | null;
}): WorkflowTimelineNodeAction | null {
  const action = input.stage.acceptance_action;
  const actionType = readString(action?.type);
  if (!action || !actionType || actionType === "none") return null;
  if (actionType !== "create" && actionType !== "edit" && actionType !== "view") {
    return null;
  }

  const reason = readString(action.reason);
  return {
    key: `${actionType}_acceptance`,
    label: readString(action.label) ?? "处理验收",
    business_domain: "project_acceptance",
    business_action: actionType,
    disabled: action.enabled !== true,
    ...(reason ? { disabled_reason: reason } : {}),
    stage_code: input.stageCode,
    acceptance_id: readString(input.stage.acceptance_id),
    acceptance_status: input.acceptanceStatus,
  };
}

function normalizeTimelineAction(
  action: Record<string, unknown>,
): WorkflowTimelineNodeAction | null {
  const key = readString(action.key);
  if (!key) return null;
  const extra = { ...action };
  delete extra.key;
  delete extra.label;
  delete extra.business_domain;
  delete extra.business_action;
  delete extra.disabled;
  delete extra.disabled_reason;
  delete extra.task_id;
  delete extra.node_key;
  delete extra.node_type;
  delete extra.output_fields;
  const disabledReason = readString(action.disabled_reason);
  const taskId = readString(action.task_id);
  const nodeKey = readString(action.node_key);
  const nodeType = readString(action.node_type);

  return {
    ...extra,
    key,
    label: readString(action.label) ?? key,
    business_domain: readString(action.business_domain),
    business_action: readString(action.business_action),
    disabled: action.disabled === true,
    ...(disabledReason ? { disabled_reason: disabledReason } : {}),
    ...(taskId ? { task_id: taskId } : {}),
    ...(nodeKey ? { node_key: nodeKey } : {}),
    ...(nodeType ? { node_type: nodeType } : {}),
    ...(Array.isArray(action.output_fields)
      ? { output_fields: action.output_fields }
      : {}),
  };
}

function getAcceptanceStatusLabel(status: string | null) {
  if (status === "submitted") return "待复核";
  if (status === "leader_approved") return "待业主确认";
  if (status === "rejected") return "需整改";
  return "待验收";
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readNonNegativeNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}
