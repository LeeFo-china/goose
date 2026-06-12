export type BackfillSubjectType = "customer" | "project" | "expense_request";
export type BackfillInstanceStatus = "running" | "completed" | "canceled";

export type SnapshotNode = {
  id: string;
  nodeKey: string;
  nodeType: string;
  businessKind: string | null;
  title: string;
  snapshot: Record<string, unknown>;
  requiredPermission: string | null;
};

export type SubjectBackfillPlan =
  | {
    action: "create";
    subjectType: BackfillSubjectType;
    subjectId: string;
    nodeKey: string;
    node: SnapshotNode;
    instanceStatus: BackfillInstanceStatus;
  }
  | {
    action: "skip";
    subjectType: BackfillSubjectType;
    subjectId: string;
    nodeKey?: string;
    reason:
      | "running_instance_exists"
      | "instance_exists"
      | "legacy_status_not_supported"
      | "mapped_node_missing";
  };

export type BuildSubjectBackfillPlanInput = {
  subjectType: BackfillSubjectType;
  subjectId: string;
  legacyStatus: string | null;
  legacyStep: string | null;
  snapshot: unknown;
  hasRunningInstance: boolean;
  hasExistingInstance?: boolean;
};

type MappingResult = {
  nodeKey: string;
  instanceStatus: BackfillInstanceStatus;
} | null;

const CUSTOMER_STATUS_NODE_MAP: Record<string, MappingResult> = {
  potential: { nodeKey: "following", instanceStatus: "running" },
  following: { nodeKey: "following", instanceStatus: "running" },
  arrived: { nodeKey: "arrived", instanceStatus: "running" },
  designing: { nodeKey: "designing", instanceStatus: "running" },
  signed: { nodeKey: "signed", instanceStatus: "completed" },
  dormant: null,
  invalid: { nodeKey: "invalid", instanceStatus: "canceled" },
};

const PROJECT_STATUS_NODE_MAP: Record<string, MappingResult> = {
  designing: { nodeKey: "designing", instanceStatus: "running" },
  proposal_confirmed: { nodeKey: "proposal_confirmed", instanceStatus: "running" },
  signed: { nodeKey: "signed", instanceStatus: "running" },
  design_finalized: { nodeKey: "design_finalized", instanceStatus: "running" },
  pending_start: { nodeKey: "pending_start", instanceStatus: "running" },
  started: { nodeKey: "started", instanceStatus: "running" },
  constructing: { nodeKey: "constructing", instanceStatus: "running" },
  on_hold: { nodeKey: "on_hold", instanceStatus: "running" },
  acceptance: { nodeKey: "acceptance", instanceStatus: "running" },
  invalid: { nodeKey: "invalid", instanceStatus: "canceled" },
};

const EXPENSE_STATUS_STEP_NODE_MAP: Record<string, MappingResult> = {
  "draft/draft": null,
  "pending/manager_review": { nodeKey: "manager_review", instanceStatus: "running" },
  "pending/finance_review": { nodeKey: "finance_review", instanceStatus: "running" },
  "approved/payment": { nodeKey: "payment", instanceStatus: "running" },
  "paid/done": { nodeKey: "done", instanceStatus: "completed" },
  "rejected/draft": { nodeKey: "rejected", instanceStatus: "completed" },
  "cancelled/cancelled": { nodeKey: "cancelled", instanceStatus: "canceled" },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function firstString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function readRequiredPermission(node: Record<string, unknown>): string | null {
  const config = node.config;
  if (!isRecord(config)) return null;

  const permissions = config.required_permissions;
  if (!Array.isArray(permissions)) return null;

  const permission = permissions.find((item) => typeof item === "string" && item.trim());
  return typeof permission === "string" ? permission : null;
}

export function findSnapshotNode(
  snapshot: unknown,
  nodeKey: string,
): SnapshotNode | null {
  if (!isRecord(snapshot) || !Array.isArray(snapshot.nodes)) return null;

  for (const item of snapshot.nodes) {
    if (!isRecord(item) || item.node_key !== nodeKey) continue;

    const id = firstString(item.id);
    const nodeType = firstString(item.node_type);
    const title = firstString(item.title);
    if (!id || !nodeType || !title) return null;

    return {
      id,
      nodeKey,
      nodeType,
      businessKind: firstString(item.business_kind),
      title,
      snapshot: item,
      requiredPermission: readRequiredPermission(item),
    };
  }

  return null;
}

export function shouldCreatePendingTask(
  instanceStatus: BackfillInstanceStatus,
  node: SnapshotNode | null,
): boolean {
  return instanceStatus === "running" && Boolean(node) && node?.nodeType !== "end";
}

function resolveMapping(input: BuildSubjectBackfillPlanInput): MappingResult {
  if (!input.legacyStatus) return null;

  if (input.subjectType === "customer") {
    return CUSTOMER_STATUS_NODE_MAP[input.legacyStatus] ?? null;
  }

  if (input.subjectType === "project") {
    return PROJECT_STATUS_NODE_MAP[input.legacyStatus] ?? null;
  }

  return EXPENSE_STATUS_STEP_NODE_MAP[
    `${input.legacyStatus}/${input.legacyStep ?? ""}`
  ] ?? null;
}

export function buildSubjectBackfillPlan(
  input: BuildSubjectBackfillPlanInput,
): SubjectBackfillPlan {
  if (input.hasRunningInstance) {
    return {
      action: "skip",
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      reason: "running_instance_exists",
    };
  }

  if (input.hasExistingInstance) {
    return {
      action: "skip",
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      reason: "instance_exists",
    };
  }

  const mapping = resolveMapping(input);
  if (!mapping) {
    return {
      action: "skip",
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      reason: "legacy_status_not_supported",
    };
  }

  const node = findSnapshotNode(input.snapshot, mapping.nodeKey);
  if (!node) {
    return {
      action: "skip",
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      nodeKey: mapping.nodeKey,
      reason: "mapped_node_missing",
    };
  }

  return {
    action: "create",
    subjectType: input.subjectType,
    subjectId: input.subjectId,
    nodeKey: mapping.nodeKey,
    node,
    instanceStatus: mapping.instanceStatus,
  };
}
