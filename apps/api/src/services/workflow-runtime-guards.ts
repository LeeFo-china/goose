import { ErrorCodes } from "@/errors/error-codes";
import { Errors } from "@/errors/error-factory";
import {
  workflowRepository,
  type JsonObject,
  type WorkflowGraphResult,
  type WorkflowNodeRow,
} from "@/repositories/workflows";
import { constructionStageStatusService } from "@/services/construction-stage-status";

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

  if (
    graph.definition.category !== "construction" ||
    instance.subject_type !== "project"
  ) {
    return;
  }

  const currentNode = graph.nodes.find((node) =>
    node.id === instance.current_node_id
  );
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

  throw Errors.business(
    409,
    `请先完成必需工序后再进入竣工验收：${
      stages.missing_required_stages
        .map((stage) => stage.stage_label)
        .join("、")
    }`,
    ErrorCodes.WORKFLOW_FINAL_ACCEPTANCE_BLOCKED,
    {
      project_id: instance.subject_id,
      missing_required_stages: stages.missing_required_stages,
    },
  );
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
