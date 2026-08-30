import { ErrorCodes } from "@/errors/error-codes";
import { Errors } from "@/errors/error-factory";
import {
  projectLogEvidenceRepository,
  type ProjectLogStageEvidenceRow,
} from "@/repositories/project-log-evidence";
import {
  workflowRepository,
  type JsonObject,
  type WorkflowGraphResult,
  type WorkflowInstanceRow,
  type WorkflowNodeRow,
} from "@/repositories/workflows";
import { constructionStageStatusService } from "@/services/construction-stage-status";
import {
  FINAL_ACCEPTANCE_STAGE_CODE,
  isFinalAcceptanceReportWorkflowNode,
  isFinalAcceptanceWorkflowNode,
} from "@/services/project-final-acceptance-workflow";
import {
  isProjectConstructionStageCode,
  type ProjectConstructionStageCode,
} from "@gooes/domain";

export async function assertRuntimeNodeCompletionAllowed(input: {
  tenantId: string;
  definitionId: string;
  instanceId: string;
  nodeKey: string;
  action?: string | null;
  output: JsonObject;
  instance?: WorkflowInstanceRow | null;
}) {
  const instance = input.instance === undefined
    ? await workflowRepository.getRuntimeInstanceById({
      tenantId: input.tenantId,
      definitionId: input.definitionId,
      instanceId: input.instanceId,
    })
    : input.instance;

  if (!instance) {
    throw Errors.notFound("流程实例不存在");
  }
  if (
    instance.status !== "running" ||
    instance.current_node_key !== input.nodeKey ||
    !instance.current_node_id
  ) {
    return;
  }

  const graph = await workflowRepository.getGraph({
    tenantId: input.tenantId,
    definitionId: input.definitionId,
    versionId: instance.version_id,
  });
  if (!graph) {
    throw Errors.badRequest("流程发布版本图结构无效");
  }

  if (instance.subject_type !== "project") {
    return;
  }

  const currentNode = graph.nodes.find((node) =>
    node.id === instance.current_node_id
  );

  if (graph.definition.category !== "construction") {
    return;
  }

  assertFinalAcceptanceReportGate({
    node: currentNode,
    action: input.action,
  });

  if (input.action?.trim() !== "customer_confirm_acceptance") {
    await assertProcedureNodeRequirements({
      tenantId: input.tenantId,
      projectId: instance.subject_id,
      node: currentNode,
    });
  }

  const nextNode = getNextWorkflowNode(graph, instance.current_node_id);
  if (!isFinalAcceptanceNode(currentNode) && !isFinalAcceptanceNode(nextNode)) {
    return;
  }

  const stages = await constructionStageStatusService
    .listProjectConstructionStagesForProject({
      tenantId: input.tenantId,
      projectId: instance.subject_id,
      canReadAcceptance: true,
      canCreateAcceptance: false,
    });

  if (stages.required_completed) {
    return;
  }

  const completedStageCodes = await listRuntimeCompletedProcedureStageCodes({
    tenantId: input.tenantId,
    definitionId: input.definitionId,
    instanceId: input.instanceId,
  });
  const currentProcedureStageCode = getProcedureStageCode(currentNode);
  if (currentProcedureStageCode) {
    completedStageCodes.add(currentProcedureStageCode);
  }

  const missingRequiredStages = stages.missing_required_stages.filter((stage) =>
    isMissingRuntimeProcedureStage(stage.stage_code, completedStageCodes)
  );
  if (missingRequiredStages.length === 0) {
    return;
  }

  throw Errors.business(
    409,
    `请先完成必需工序后再进入竣工验收：${
      missingRequiredStages
        .map((stage) => stage.stage_label)
        .join("、")
    }`,
    ErrorCodes.WORKFLOW_FINAL_ACCEPTANCE_BLOCKED,
    {
      project_id: instance.subject_id,
      missing_required_stages: missingRequiredStages,
    },
  );
}

async function listRuntimeCompletedProcedureStageCodes(input: {
  tenantId: string;
  definitionId: string;
  instanceId: string;
}): Promise<Set<ProjectConstructionStageCode>> {
  const nodes = await workflowRepository.listCompletedRuntimeProcedureNodes(input);
  return new Set(
    nodes
      .map((node) => getProcedureStageCode(node.node_snapshot))
      .filter((stageCode): stageCode is ProjectConstructionStageCode =>
        Boolean(stageCode)
      ),
  );
}

function isMissingRuntimeProcedureStage(
  stageCode: string,
  completedStageCodes: Set<ProjectConstructionStageCode>,
): boolean {
  if (!isProjectConstructionStageCode(stageCode)) {
    return true;
  }
  return !completedStageCodes.has(stageCode);
}

function getProcedureStageCode(
  node: WorkflowNodeRow | JsonObject | null | undefined,
): ProjectConstructionStageCode | null {
  if (!node || node.node_type !== "procedure") {
    return null;
  }

  const config = node.config;
  if (!isRecord(config)) {
    return null;
  }

  const stageKey = config.stage_key;
  if (typeof stageKey !== "string" || !isProjectConstructionStageCode(stageKey)) {
    return null;
  }

  return stageKey;
}

async function assertProcedureNodeRequirements(input: {
  tenantId: string;
  projectId: string;
  node: WorkflowNodeRow | null | undefined;
}) {
  const node = input.node;
  if (node?.node_type !== "procedure") {
    return;
  }

  const requireLog = node.config.require_log === true;
  const minImageCount = getMinImageCount(node.config.min_image_count);
  if (!requireLog && minImageCount === 0) {
    return;
  }

  const stageCode = getProcedureStageCode(node);
  if (!stageCode) {
    throw Errors.business(
      409,
      "工序节点要求未满足：需要有效工序阶段",
      ErrorCodes.WORKFLOW_PROCEDURE_REQUIREMENT_BLOCKED,
      {
        node_key: node.node_key,
        stage_code: null,
        require_log: requireLog,
        min_image_count: minImageCount,
        log_count: 0,
        image_count: 0,
      },
    );
  }

  const stageLogs = await projectLogEvidenceRepository.listStageLogEvidence({
    tenantId: input.tenantId,
    projectId: input.projectId,
    stageCode,
    limit: 100,
  });
  const logCount = stageLogs.length;
  const imageCount = getStageLogImageCount(stageLogs);
  const messages: string[] = [];

  if (requireLog && logCount === 0) {
    messages.push("需要施工日志");
  }
  if (minImageCount > 0 && imageCount < minImageCount) {
    messages.push(`至少需要 ${minImageCount} 张施工图片`);
  }
  if (messages.length === 0) {
    return;
  }

  throw Errors.business(
    409,
    `工序节点要求未满足：${messages.join("，")}`,
    ErrorCodes.WORKFLOW_PROCEDURE_REQUIREMENT_BLOCKED,
    {
      node_key: node.node_key,
      stage_code: stageCode,
      require_log: requireLog,
      min_image_count: minImageCount,
      log_count: logCount,
      image_count: imageCount,
    },
  );
}

function getNextWorkflowNode(
  graph: WorkflowGraphResult,
  currentNodeId: string,
) {
  const nextEdge = graph.edges
    .filter((edge) => edge.source_node_id === currentNodeId)
    .sort((left, right) => {
      if (left.priority !== right.priority) {
        return left.priority - right.priority;
      }
      return left.created_at.localeCompare(right.created_at);
    })[0];

  if (!nextEdge) {
    return null;
  }

  return graph.nodes.find((node) => node.id === nextEdge.target_node_id) ?? null;
}

function isFinalAcceptanceNode(node: WorkflowNodeRow | null | undefined) {
  return isFinalAcceptanceWorkflowNode(node);
}

function assertFinalAcceptanceReportGate(input: {
  node: WorkflowNodeRow | null | undefined;
  action?: string | null;
}) {
  if (input.action?.trim() !== "complete") {
    return;
  }
  if (!isFinalAcceptanceReportNode(input.node)) {
    return;
  }

  throw Errors.business(
    409,
    "请先完成竣工验收报告后再推进流程",
    ErrorCodes.WORKFLOW_ACCEPTANCE_NOT_AVAILABLE,
    {
      node_key: input.node?.node_key ?? null,
    stage_code: FINAL_ACCEPTANCE_STAGE_CODE,
    },
  );
}

function isFinalAcceptanceReportNode(node: WorkflowNodeRow | null | undefined) {
  return isFinalAcceptanceReportWorkflowNode(node);
}

function getMinImageCount(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, value)
    : 0;
}

function getStageLogImageCount(logs: ProjectLogStageEvidenceRow[]) {
  return logs.reduce((total, log) => total + getImageListCount(log.images), 0);
}

function getImageListCount(value: unknown): number {
  if (Array.isArray(value)) {
    return value.length;
  }
  if (typeof value !== "string") {
    return 0;
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
