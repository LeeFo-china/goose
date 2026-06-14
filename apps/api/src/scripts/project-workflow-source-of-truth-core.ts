export type ProjectWorkflowSourceCheckConfig =
  | {
      mode: "single";
      projectId: string;
      strict: boolean;
    }
  | {
      mode: "all-active-construction";
      projectId: null;
      strict: boolean;
    };

export type PaymentGateNodeSnapshot = {
  nodeKey: string;
  title: string;
  paymentType: string;
  nextStageCode: string | null;
  nextStageLabel: string | null;
};

export type ProjectWorkflowSourceSnapshot = {
  projectId: string;
  workflowCurrentNodeKey: string | null;
  workflowCurrentNodeTitle: string | null;
  constructionStagesCurrentStage: string | null;
  acceptedStageCodes: string[];
  completedRuntimeProcedureStageCodes: string[];
  confirmedPaymentTypes: string[];
  paymentGateNodes: PaymentGateNodeSnapshot[];
};

export type ProjectWorkflowSourceIssue = {
  code:
    | "ACCEPTANCE_AHEAD_OF_WORKFLOW"
    | "RUNTIME_STAGE_PROJECTION_MISMATCH"
    | "PAYMENT_GATE_SKIPPED_WITHOUT_PAYMENT";
  message: string;
  stage_code?: string;
  node_key?: string;
  payment_type?: string;
};

export type ProjectWorkflowSourceReport = {
  generated_at: string;
  ok: boolean;
  project_id: string;
  workflow_current_node_key: string | null;
  construction_stages_current_stage: string | null;
  accepted_stage_codes: string[];
  completed_runtime_procedure_stage_codes: string[];
  confirmed_payment_types: string[];
  issues: ProjectWorkflowSourceIssue[];
};

export type ProjectWorkflowSourceBatchReport = {
  generated_at: string;
  ok: boolean;
  total_projects: number;
  total_issues: number;
  reports: ProjectWorkflowSourceReport[];
};

export type WorkflowGraphNodeSnapshot = {
  id: string;
  node_key: string;
  title: string;
  business_kind: string | null;
  config: Record<string, unknown>;
};

export type WorkflowGraphEdgeSnapshot = {
  source_node_id: string;
  target_node_id: string;
};

const REQUIRED_STAGE_CODES = [
  "demolition",
  "plumbing_electrical",
  "tiling",
  "woodwork",
  "painting",
  "installation",
] as const;

const STAGE_LABELS: Record<string, string> = {
  demolition: "拆改",
  plumbing_electrical: "水电",
  tiling: "瓦工",
  woodwork: "木工",
  painting: "油工",
  installation: "安装",
  completion: "竣工",
};

const PROCEDURE_NODE_STAGE_MAP: Record<string, string> = {
  procedure_demolition: "demolition",
  procedure_plumbing_electrical: "plumbing_electrical",
  procedure_tiling: "tiling",
  procedure_woodwork: "woodwork",
  procedure_painting: "painting",
  procedure_installation: "installation",
};

export function resolveProjectWorkflowSourceCheckConfig(
  args: string[] = process.argv.slice(2),
): ProjectWorkflowSourceCheckConfig {
  const strict = args.includes("--strict");
  const allActiveConstruction = args.includes("--all-active-construction");
  const projectIdIndex = args.indexOf("--project-id");
  const projectId = projectIdIndex >= 0 ? args[projectIdIndex + 1] : undefined;

  if (allActiveConstruction) {
    return { mode: "all-active-construction", projectId: null, strict };
  }

  if (projectId?.trim()) {
    return { mode: "single", projectId: projectId.trim(), strict };
  }

  throw new Error("请传入 --project-id <id> 或 --all-active-construction");
}

export function buildProjectWorkflowSourceReport(
  snapshot: ProjectWorkflowSourceSnapshot,
  generatedAt = new Date().toISOString(),
): ProjectWorkflowSourceReport {
  const issues: ProjectWorkflowSourceIssue[] = [];
  const completedStages = new Set(snapshot.completedRuntimeProcedureStageCodes);
  const runtimeStage = resolveRuntimeStageCode(snapshot.workflowCurrentNodeKey);

  for (const stageCode of snapshot.acceptedStageCodes) {
    if (!isRequiredStageCode(stageCode) || completedStages.has(stageCode)) {
      continue;
    }

    issues.push({
      code: "ACCEPTANCE_AHEAD_OF_WORKFLOW",
      stage_code: stageCode,
      message: `${getStageLabel(stageCode)}验收已确认，但 workflow 未完成对应工序节点`,
    });
  }

  if (
    snapshot.constructionStagesCurrentStage &&
    snapshot.constructionStagesCurrentStage !== runtimeStage
  ) {
    issues.push({
      code: "RUNTIME_STAGE_PROJECTION_MISMATCH",
      stage_code: snapshot.constructionStagesCurrentStage,
      message:
        `施工阶段 current_stage=${getStageLabel(snapshot.constructionStagesCurrentStage)} 不是 workflow runtime 当前工序`,
    });
  }

  const confirmedPayments = new Set(snapshot.confirmedPaymentTypes);
  for (const gate of snapshot.paymentGateNodes) {
    if (
      snapshot.constructionStagesCurrentStage === gate.nextStageCode &&
      !confirmedPayments.has(gate.paymentType)
    ) {
      issues.push({
        code: "PAYMENT_GATE_SKIPPED_WITHOUT_PAYMENT",
        node_key: gate.nodeKey,
        payment_type: gate.paymentType,
        stage_code: gate.nextStageCode ?? undefined,
        message:
          `${gate.title}未确认入账，但施工阶段已显示${getStageLabel(gate.nextStageCode)}`,
      });
    }
  }

  return {
    generated_at: generatedAt,
    ok: issues.length === 0,
    project_id: snapshot.projectId,
    workflow_current_node_key: snapshot.workflowCurrentNodeKey,
    construction_stages_current_stage: snapshot.constructionStagesCurrentStage,
    accepted_stage_codes: snapshot.acceptedStageCodes,
    completed_runtime_procedure_stage_codes:
      snapshot.completedRuntimeProcedureStageCodes,
    confirmed_payment_types: snapshot.confirmedPaymentTypes,
    issues,
  };
}

export function buildProjectWorkflowSourceBatchReport(
  reports: ProjectWorkflowSourceReport[],
  generatedAt = new Date().toISOString(),
): ProjectWorkflowSourceBatchReport {
  const totalIssues = reports.reduce(
    (sum, report) => sum + report.issues.length,
    0,
  );

  return {
    generated_at: generatedAt,
    ok: totalIssues === 0,
    total_projects: reports.length,
    total_issues: totalIssues,
    reports,
  };
}

export function buildPaymentGateNodeSnapshots(
  nodes: WorkflowGraphNodeSnapshot[],
  edges: WorkflowGraphEdgeSnapshot[],
): PaymentGateNodeSnapshot[] {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));

  return nodes
    .filter((node) => node.business_kind === "payment_collection")
    .map((node) => {
      const nextNode = edges
        .filter((edge) => edge.source_node_id === node.id)
        .map((edge) => nodeById.get(edge.target_node_id) ?? null)
        .find((target): target is WorkflowGraphNodeSnapshot => Boolean(target));
      const nextStageCode = resolveRuntimeStageCode(
        nextNode?.node_key ?? null,
        nextNode?.config ? { config: nextNode.config } : null,
      );

      return {
        nodeKey: node.node_key,
        title: node.title,
        paymentType: readString(node.config.payment_type) ?? "deposit",
        nextStageCode,
        nextStageLabel: nextStageCode ? getStageLabel(nextStageCode) : null,
      };
    });
}

export function resolveLegacyConstructionStagesCurrentStage(
  acceptedStageCodes: string[],
) {
  const acceptedStages = new Set(acceptedStageCodes);
  return REQUIRED_STAGE_CODES.find((stageCode) => !acceptedStages.has(stageCode)) ??
    null;
}

export function resolveRuntimeStageCode(
  nodeKey: string | null | undefined,
  nodeSnapshot?: unknown,
) {
  const snapshotStageKey = readNestedString(nodeSnapshot, ["config", "stage_key"]);
  if (snapshotStageKey) return snapshotStageKey;
  if (!nodeKey) return null;
  return PROCEDURE_NODE_STAGE_MAP[nodeKey] ?? null;
}

export function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isRequiredStageCode(value: string) {
  return (REQUIRED_STAGE_CODES as readonly string[]).includes(value);
}

function getStageLabel(stageCode: string | null | undefined) {
  if (!stageCode) return "未知阶段";
  return STAGE_LABELS[stageCode] ?? stageCode;
}

function readNestedString(value: unknown, path: string[]) {
  let current = value;
  for (const key of path) {
    if (!isRecord(current)) return null;
    current = current[key];
  }
  return readString(current);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
