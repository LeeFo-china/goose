import { Errors } from "@/errors/error-factory";
import type { WorkflowRuntimeCompleteNodeResult } from "@/repositories/workflows";

export function throwWorkflowRuntimeCompleteError(
  result: Exclude<WorkflowRuntimeCompleteNodeResult, { ok: true }>,
): never {
  switch (result.reason) {
    case "acceptance_required":
      throw Errors.business(409, "当前工序必须经业主确认验收后才能推进", "WORKFLOW_ACCEPTANCE_REQUIRED");
    case "acceptance_not_confirmed":
      throw Errors.business(409, "验收尚未经业主确认或与当前工序不匹配", "WORKFLOW_ACCEPTANCE_NOT_CONFIRMED");
    case "procedure_not_completed":
      throw Errors.business(409, "当前工序尚未完工", "WORKFLOW_PROCEDURE_NOT_COMPLETED");
    case "instance_not_found":
      throw Errors.notFound("流程实例不存在");
    case "instance_not_running":
      throw Errors.badRequest("流程实例不在运行中");
    case "node_not_current":
      throw Errors.business(409, "节点不是当前待处理节点", "WORKFLOW_NODE_NOT_CURRENT", {
        current_node_key: result.currentNodeKey ?? null,
      });
    case "node_run_not_found":
      throw Errors.badRequest("当前节点运行记录不存在");
    case "graph_invalid":
      throw Errors.badRequest("流程发布版本图结构无效");
    case "invalid_output":
      throw Errors.badRequest("节点输出必须是对象");
    case "no_matching_edge":
      throw Errors.badRequest("当前节点没有匹配的分支条件");
  }
}
