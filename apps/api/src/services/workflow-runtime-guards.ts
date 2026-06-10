import { ErrorCodes } from "@/errors/error-codes";
import { Errors } from "@/errors/error-factory";
import { paymentRepository } from "@/repositories/payments";
import {
  workflowRepository,
  type JsonObject,
  type WorkflowGraphResult,
  type WorkflowNodeRow,
} from "@/repositories/workflows";
import { constructionStageStatusService } from "@/services/construction-stage-status";
import {
  isProjectConstructionStageCode,
  type ProjectConstructionStageCode,
} from "@gooes/domain";

export async function assertRuntimeNodeCompletionAllowed(input: {
  tenantId: string;
  definitionId: string;
  instanceId: string;
  nodeKey: string;
  output: JsonObject;
}) {
  const instance = await workflowRepository.getRuntimeInstanceById({
    tenantId: input.tenantId,
    definitionId: input.definitionId,
    instanceId: input.instanceId,
  });

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

  await assertPaymentCollectionRequirements({
    node: currentNode,
    projectId: instance.subject_id,
  });

  if (graph.definition.category !== "construction") {
    return;
  }

  assertProcedureNodeRequirements(currentNode, input.output);

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

async function assertPaymentCollectionRequirements(input: {
  node: WorkflowNodeRow | null | undefined;
  projectId: string;
}) {
  if (input.node?.business_kind !== "payment_collection") {
    return;
  }

  const paymentType = getPaymentCollectionType(input.node.config.payment_type);
  const requirement = await getPaymentCollectionRequirement({
    config: input.node.config,
    projectId: input.projectId,
  });
  const summary = await paymentRepository.summarizeConfirmedProjectPayments({
    projectId: input.projectId,
    type: paymentType,
  });
  const amountSatisfied = requirement.requiredAmount === null ||
    summary.totalAmount >= requirement.requiredAmount;

  if (!requirement.issue && summary.count > 0 && amountSatisfied) {
    return;
  }

  const fallbackMessage = requirement.issue ||
    (requirement.requiredAmount === null
    ? "请先确认收款后再推进流程"
    : `已入账金额不足，当前已入账 ${summary.totalAmount} 元，要求至少 ${requirement.requiredAmount} 元`);
  const message = typeof input.node.config.block_message === "string" &&
      input.node.config.block_message.trim()
    ? input.node.config.block_message.trim()
    : fallbackMessage;

  throw Errors.business(
    409,
    message,
    ErrorCodes.WORKFLOW_PAYMENT_COLLECTION_BLOCKED,
    {
      node_key: input.node.node_key,
      project_id: input.projectId,
      payment_type: paymentType,
      confirmed_payment_count: summary.count,
      confirmed_amount: summary.totalAmount,
      requirement_mode: requirement.mode,
      required_percentage: requirement.requiredPercentage,
      required_amount: requirement.requiredAmount,
      signed_amount: requirement.signedAmount,
      legacy_min_amount: requirement.legacyMinAmount,
    },
  );
}

function getPaymentCollectionType(value: unknown) {
  if (
    value === "deposit" ||
    value === "stage_1" ||
    value === "stage_2" ||
    value === "stage_3" ||
    value === "add_on"
  ) {
    return value;
  }
  return "deposit";
}

function getPaymentCollectionMinAmount(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value;
  }
  return null;
}

type PaymentCollectionRequirement = {
  mode: "any_confirmed" | "signed_amount_percentage" | "legacy_fixed_amount";
  requiredAmount: number | null;
  requiredPercentage: number | null;
  signedAmount: number | null;
  legacyMinAmount: number | null;
  issue: string | null;
};

async function getPaymentCollectionRequirement(input: {
  config: JsonObject;
  projectId: string;
}): Promise<PaymentCollectionRequirement> {
  const explicitMode = getPaymentCollectionRequirementMode(
    input.config.requirement_mode,
  );
  const legacyMinAmount = getPaymentCollectionMinAmount(input.config.min_amount);

  if (!explicitMode && legacyMinAmount !== null) {
    return {
      mode: "legacy_fixed_amount",
      requiredAmount: legacyMinAmount,
      requiredPercentage: null,
      signedAmount: null,
      legacyMinAmount,
      issue: null,
    };
  }

  const mode = explicitMode || "any_confirmed";
  if (mode === "any_confirmed") {
    return {
      mode,
      requiredAmount: null,
      requiredPercentage: null,
      signedAmount: null,
      legacyMinAmount,
      issue: null,
    };
  }

  const requiredPercentage = getPaymentCollectionRequiredPercentage(
    input.config.required_percentage,
  );
  if (requiredPercentage === null) {
    return {
      mode,
      requiredAmount: null,
      requiredPercentage: null,
      signedAmount: null,
      legacyMinAmount,
      issue: "收款节点未配置有效的签约金额比例",
    };
  }

  const signedAmount = await paymentRepository.findProjectSignedAmount(input.projectId);
  if (signedAmount === null) {
    return {
      mode,
      requiredAmount: null,
      requiredPercentage,
      signedAmount: null,
      legacyMinAmount,
      issue: "项目缺少签约金额，无法按比例校验收款要求",
    };
  }

  return {
    mode,
    requiredAmount: Number((signedAmount * requiredPercentage / 100).toFixed(2)),
    requiredPercentage,
    signedAmount,
    legacyMinAmount,
    issue: null,
  };
}

function getPaymentCollectionRequirementMode(value: unknown) {
  if (value === "any_confirmed" || value === "signed_amount_percentage") {
    return value;
  }
  return null;
}

function getPaymentCollectionRequiredPercentage(value: unknown) {
  if (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value > 0 &&
    value <= 100
  ) {
    return value;
  }
  return null;
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

function assertProcedureNodeRequirements(
  node: WorkflowNodeRow | null | undefined,
  output: JsonObject,
) {
  if (node?.node_type !== "procedure") {
    return;
  }

  const requireLog = node.config.require_log === true;
  const minImageCount = getMinImageCount(node.config.min_image_count);
  const imageCount = getOutputImageCount(output);
  const hasLog = isNonEmptyString(output.project_log_id) ||
    isNonEmptyString(output.log_id) ||
    output.require_log_verified === true;
  const messages: string[] = [];

  if (requireLog && !hasLog) {
    messages.push("需要关联施工日志");
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
      require_log: requireLog,
      min_image_count: minImageCount,
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
  return (
    node?.business_kind === "final_acceptance" ||
    node?.node_key === "final_acceptance"
  );
}

function getMinImageCount(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, value)
    : 0;
}

function getOutputImageCount(output: JsonObject) {
  if (typeof output.image_count === "number" && Number.isFinite(output.image_count)) {
    return output.image_count;
  }
  if (Array.isArray(output.images)) {
    return output.images.length;
  }
  if (Array.isArray(output.image_urls)) {
    return output.image_urls.length;
  }
  return 0;
}

function isNonEmptyString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
