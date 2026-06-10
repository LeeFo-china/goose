import { Errors } from "@/errors/error-factory";
import {
  workflowRepository,
  type JsonObject,
  type WorkflowDefinitionRow,
  type WorkflowDraftGraphReplaceResult,
  type WorkflowEdgeRow,
  type WorkflowGraphResult,
  type WorkflowNodeRow,
} from "@/repositories/workflows";
import type {
  WorkflowDefinitionCreateInput,
  WorkflowDefinitionUpdateInput,
  WorkflowGraphSaveInput,
  WorkflowListQuery,
  WorkflowRuntimeCompleteNodeInput,
  WorkflowRuntimeInstanceListQuery,
  WorkflowRuntimeInstanceStartInput,
} from "@/schema/workflows";
import { accessPolicyService } from "@/services/access-policy";
import type { AuthContext } from "@/services/authorization";
import { resolveWorkflowKey } from "@/services/workflow-key";

const WORKFLOW_MANAGE_PERMISSION = "employee.permission_manage";

type WorkflowDraftGraphView = {
  nodes: WorkflowNodeRow[];
  edges: WorkflowEdgeRow[];
};

type WorkflowDefinitionDetail = {
  definition: WorkflowDefinitionRow;
  draftGraph: WorkflowDraftGraphView | null;
};

type WorkflowPublishResult = {
  definition: WorkflowDefinitionRow;
  version: NonNullable<WorkflowGraphResult["version"]>;
  graph: WorkflowGraphResult;
};

class WorkflowService {
  async listDefinitions(authContext: AuthContext, query: WorkflowListQuery) {
    const tenantId = this.assertManagePermission(authContext);
    return workflowRepository.listDefinitions({
      tenantId,
      page: query.page,
      pageSize: query.pageSize,
      status: query.status,
      category: query.category,
      keyword: query.keyword?.trim() || undefined,
    });
  }

  async getDefinition(
    authContext: AuthContext,
    id: string,
  ): Promise<WorkflowDefinitionDetail> {
    const tenantId = this.assertManagePermission(authContext);
    const definition = await this.getRequiredDefinition(tenantId, id);
    const draftGraph = await workflowRepository.getDraftGraph(id, tenantId);

    return {
      definition,
      draftGraph: draftGraph
        ? {
            nodes: draftGraph.nodes,
            edges: draftGraph.edges,
          }
        : null,
    };
  }

  async createDefinition(
    authContext: AuthContext,
    input: WorkflowDefinitionCreateInput,
  ) {
    const tenantId = this.assertManagePermission(authContext);
    const workflowKey = await resolveWorkflowKey(tenantId, input);

    return workflowRepository.createDefinition({
      ...input,
      workflow_key: workflowKey,
      tenantId,
      createdBy: authContext.employeeId,
    });
  }

  async updateDefinition(
    authContext: AuthContext,
    id: string,
    input: WorkflowDefinitionUpdateInput,
  ) {
    const tenantId = this.assertManagePermission(authContext);
    await this.getRequiredDefinition(tenantId, id);

    return workflowRepository.updateDefinition(id, tenantId, {
      ...input,
      updatedBy: authContext.employeeId,
    });
  }

  async getGraph(
    authContext: AuthContext,
    definitionId: string,
    versionId?: string,
  ) {
    const tenantId = this.assertManagePermission(authContext);
    await this.getRequiredDefinition(tenantId, definitionId);

    const graph = await workflowRepository.getGraph({
      tenantId,
      definitionId,
      versionId,
    });

    if (!graph) {
      throw Errors.notFound(versionId ? "流程版本不存在" : "流程图不存在");
    }

    return graph;
  }

  async saveDraftGraph(
    authContext: AuthContext,
    definitionId: string,
    input: WorkflowGraphSaveInput,
  ) {
    const tenantId = this.assertManagePermission(authContext);

    const result = await workflowRepository.replaceDraftGraph({
      tenantId,
      definitionId,
      nodes: input.nodes,
      edges: input.edges,
    });

    if (!result.ok) {
      this.throwDraftGraphReplaceError(result);
    }

    return result;
  }

  async publishDefinition(
    authContext: AuthContext,
    definitionId: string,
  ): Promise<WorkflowPublishResult> {
    const tenantId = this.assertManagePermission(authContext);
    const definition = await this.getRequiredDefinition(tenantId, definitionId);
    const draftGraph = await workflowRepository.getDraftGraph(definitionId, tenantId);

    if (!draftGraph) {
      throw Errors.notFound("流程定义不存在");
    }

    const publishedAt = new Date().toISOString();
    const validationResult = this.validatePublishGraph(draftGraph.nodes, draftGraph.edges);
    const snapshot = this.buildSnapshot({
      definition,
      nodes: draftGraph.nodes,
      edges: draftGraph.edges,
      publishedAt,
    });

    const publishResult = await workflowRepository.publishDefinition({
      tenantId,
      definitionId,
      expectedUpdatedAt: definition.updated_at,
      snapshot,
      validationResult,
      publishedBy: authContext.employeeId,
      updatedBy: authContext.employeeId,
    });

    if (!publishResult.ok) {
      if (publishResult.reason === "stale_draft") {
        throw Errors.business(409, "流程草稿已变更，请重新发布", "WORKFLOW_DRAFT_STALE");
      }
      throw Errors.notFound("流程定义不存在");
    }

    return {
      definition: publishResult.definition,
      version: publishResult.version,
      graph: {
        definition: publishResult.definition,
        version: publishResult.version,
        nodes: draftGraph.nodes,
        edges: draftGraph.edges,
      },
    };
  }

  async archiveDefinition(authContext: AuthContext, id: string) {
    const tenantId = this.assertManagePermission(authContext);
    await this.getRequiredDefinition(tenantId, id);

    return workflowRepository.updateDefinition(id, tenantId, {
      status: "archived",
      updatedBy: authContext.employeeId,
    });
  }

  async listRuntimeInstances(
    authContext: AuthContext,
    definitionId: string,
    query: WorkflowRuntimeInstanceListQuery,
  ) {
    const tenantId = this.assertManagePermission(authContext);
    await this.getRequiredDefinition(tenantId, definitionId);

    return workflowRepository.listRuntimeInstances({
      tenantId,
      definitionId,
      page: query.page,
      pageSize: query.pageSize,
      status: query.status,
      subjectType: query.subject_type,
      subjectId: query.subject_id?.trim() || undefined,
    });
  }

  async startRuntimeInstance(
    authContext: AuthContext,
    definitionId: string,
    input: WorkflowRuntimeInstanceStartInput,
  ) {
    const tenantId = this.assertManagePermission(authContext);
    await this.getRequiredDefinition(tenantId, definitionId);

    const result = await workflowRepository.startRuntimeInstance({
      tenantId,
      definitionId,
      subjectType: input.subject_type,
      subjectId: input.subject_id.trim(),
      context: input.context as JsonObject,
      startedBy: authContext.employeeId,
    });

    if (!result.ok) {
      this.throwRuntimeStartError(result);
    }

    return result;
  }

  async completeRuntimeNode(
    authContext: AuthContext,
    definitionId: string,
    instanceId: string,
    input: WorkflowRuntimeCompleteNodeInput,
  ) {
    const tenantId = this.assertManagePermission(authContext);
    await this.getRequiredDefinition(tenantId, definitionId);

    const result = await workflowRepository.completeRuntimeNode({
      tenantId,
      definitionId,
      instanceId,
      nodeKey: input.node_key.trim(),
      action: input.action.trim(),
      output: input.output as JsonObject,
      actorEmployeeId: authContext.employeeId,
    });

    if (!result.ok) {
      this.throwRuntimeCompleteError(result);
    }

    return result;
  }

  private assertManagePermission(authContext: AuthContext) {
    const tenantId = accessPolicyService.assertTenantId(authContext);
    if (!tenantId) {
      throw Errors.business(403, "缺少租户上下文", "TENANT_CONTEXT_REQUIRED");
    }
    accessPolicyService.assertPermission(authContext, WORKFLOW_MANAGE_PERMISSION);
    return tenantId;
  }

  private async getRequiredDefinition(tenantId: string, id: string) {
    const definition = await workflowRepository.getDefinitionById(id, tenantId);
    if (!definition) {
      throw Errors.notFound("流程定义不存在");
    }

    return definition;
  }

  private throwDraftGraphReplaceError(result: Exclude<WorkflowDraftGraphReplaceResult, { ok: true }>): never {
    switch (result.reason) {
      case "definition_not_found":
        throw Errors.notFound("流程定义不存在");
      case "duplicate_node_key":
        throw Errors.badRequest(
          `节点编码重复: ${result.duplicateNodeKeys.join("、")}`,
        );
      case "invalid_node_reference":
        throw Errors.badRequest(
          `连线引用了不存在的节点: ${result.missingNodeKeys.join("、")}`,
        );
      case "self_loop_edge":
        throw Errors.badRequest(
          `节点不能连接到自身: ${result.nodeKeys.join("、")}`,
        );
    }
  }

  private throwRuntimeStartError(
    result: Exclude<Awaited<ReturnType<typeof workflowRepository.startRuntimeInstance>>, { ok: true }>,
  ): never {
    switch (result.reason) {
      case "active_version_not_found":
        throw Errors.badRequest("流程尚未发布，无法启动实例");
      case "graph_invalid":
        throw Errors.badRequest("流程发布版本图结构无效");
      case "invalid_context":
        throw Errors.badRequest("流程上下文必须是对象");
      case "running_instance_exists":
        throw Errors.business(409, "该业务对象已有运行中的流程实例", "WORKFLOW_INSTANCE_EXISTS");
    }
  }

  private throwRuntimeCompleteError(
    result: Exclude<Awaited<ReturnType<typeof workflowRepository.completeRuntimeNode>>, { ok: true }>,
  ): never {
    switch (result.reason) {
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
    }
  }

  private validatePublishGraph(nodes: WorkflowNodeRow[], edges: WorkflowEdgeRow[]) {
    if (nodes.length === 0) {
      throw Errors.badRequest("发布前至少需要配置一个节点");
    }

    const nodeIds = new Set<string>();
    const nodeKeys = new Set<string>();
    const nodeKeyCounts = new Map<string, number>();
    let startNodeCount = 0;
    let endNodeCount = 0;

    for (const node of nodes) {
      nodeIds.add(node.id);
      nodeKeys.add(node.node_key);
      nodeKeyCounts.set(node.node_key, (nodeKeyCounts.get(node.node_key) ?? 0) + 1);
      if (node.node_type === "start") {
        startNodeCount += 1;
      }
      if (node.node_type === "end") {
        endNodeCount += 1;
      }
    }

    const duplicateNodeKeys = Array.from(nodeKeyCounts.entries())
      .filter(([, count]) => count > 1)
      .map(([nodeKey]) => nodeKey);
    if (duplicateNodeKeys.length > 0) {
      throw Errors.badRequest(`节点编码重复: ${duplicateNodeKeys.join("、")}`);
    }

    if (startNodeCount !== 1) {
      throw Errors.badRequest("发布前必须且只能配置一个开始节点");
    }

    if (endNodeCount < 1) {
      throw Errors.badRequest("发布前至少需要配置一个结束节点");
    }

    const invalidNodeIds = new Set<string>();
    const selfLoopNodeIds = new Set<string>();
    const sourceNodeIds = new Set<string>();

    for (const edge of edges) {
      sourceNodeIds.add(edge.source_node_id);
      if (!nodeIds.has(edge.source_node_id)) {
        invalidNodeIds.add(edge.source_node_id);
      }
      if (!nodeIds.has(edge.target_node_id)) {
        invalidNodeIds.add(edge.target_node_id);
      }
      if (edge.source_node_id === edge.target_node_id) {
        selfLoopNodeIds.add(edge.source_node_id);
      }
    }

    if (invalidNodeIds.size > 0) {
      throw Errors.badRequest(
        `连线引用了不存在的节点: ${Array.from(invalidNodeIds).join("、")}`,
      );
    }

    if (selfLoopNodeIds.size > 0) {
      throw Errors.badRequest(
        `节点不能连接到自身: ${Array.from(selfLoopNodeIds).join("、")}`,
      );
    }

    const deadEndNodes = nodes.filter((node) =>
      node.node_type !== "end" && !sourceNodeIds.has(node.id)
    );
    if (deadEndNodes.length > 0) {
      throw Errors.badRequest(
        `非结束节点必须至少有一条出边: ${
          deadEndNodes.map((node) => node.node_key).join("、")
        }`,
      );
    }

    const invalidConfigRefs = this.findInvalidConfigReferences(nodes, nodeKeys);
    if (invalidConfigRefs.length > 0) {
      throw Errors.badRequest(
        `节点配置引用了不存在的节点: ${invalidConfigRefs.join("、")}`,
      );
    }

    return {
      valid: true,
      issues: [] as string[],
      checked_at: new Date().toISOString(),
    };
  }

  private buildSnapshot(input: {
    definition: WorkflowDefinitionRow;
    nodes: WorkflowNodeRow[];
    edges: WorkflowEdgeRow[];
    publishedAt: string;
  }): JsonObject {
    return {
      definition_id: input.definition.id,
      workflow_key: input.definition.workflow_key,
      category: input.definition.category,
      published_at: input.publishedAt,
      nodes: input.nodes,
      edges: input.edges,
    };
  }

  private findInvalidConfigReferences(
    nodes: WorkflowNodeRow[],
    nodeKeys: Set<string>,
  ) {
    const invalidRefs = new Set<string>();

    for (const node of nodes) {
      for (const field of ["rollback_target_key", "reject_target_key"] as const) {
        const value = node.config[field];
        if (typeof value === "string" && value.trim() && !nodeKeys.has(value)) {
          invalidRefs.add(`${node.node_key}.${field}=${value}`);
        }
      }
    }

    return Array.from(invalidRefs);
  }
}

export const workflowService = new WorkflowService();
