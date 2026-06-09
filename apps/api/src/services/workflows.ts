import { Errors } from "@/errors/error-factory";
import { workflowRepository, type JsonObject, type WorkflowDefinitionRow, type WorkflowDraftGraphReplaceResult, type WorkflowEdgeRow, type WorkflowGraphResult, type WorkflowNodeRow } from "@/repositories/workflows";
import type {
  WorkflowDefinitionCreateInput,
  WorkflowDefinitionUpdateInput,
  WorkflowGraphSaveInput,
  WorkflowListQuery,
} from "@/schema/workflows";
import { accessPolicyService } from "@/services/access-policy";
import type { AuthContext } from "@/services/authorization";

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
    const workflowKey = this.normalizeWorkflowKey(input.workflow_key);

    await this.assertWorkflowKeyAvailable(tenantId, workflowKey);

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
    const versionNumber = await workflowRepository.getNextVersionNumber(
      definitionId,
      tenantId,
    );
    const snapshot = this.buildSnapshot({
      definition,
      nodes: draftGraph.nodes,
      edges: draftGraph.edges,
      versionNumber,
      publishedAt,
    });

    const version = await workflowRepository.createVersion({
      tenantId,
      definitionId,
      versionNumber,
      snapshot,
      validationResult,
      publishedBy: authContext.employeeId,
    });

    const updatedDefinition = await workflowRepository.updateActiveVersion({
      tenantId,
      definitionId,
      versionId: version.id,
      status: "active",
      updatedBy: authContext.employeeId,
    });

    return {
      definition: updatedDefinition,
      version,
      graph: {
        definition: updatedDefinition,
        version,
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

  private assertManagePermission(authContext: AuthContext) {
    const tenantId = accessPolicyService.assertTenantId(authContext);
    if (!tenantId) {
      throw Errors.business(403, "缺少租户上下文", "TENANT_CONTEXT_REQUIRED");
    }
    accessPolicyService.assertPermission(authContext, WORKFLOW_MANAGE_PERMISSION);
    return tenantId;
  }

  private normalizeWorkflowKey(workflowKey: string) {
    return workflowKey.trim().toLowerCase();
  }

  private async getRequiredDefinition(tenantId: string, id: string) {
    const definition = await workflowRepository.getDefinitionById(id, tenantId);
    if (!definition) {
      throw Errors.notFound("流程定义不存在");
    }

    return definition;
  }

  private async assertWorkflowKeyAvailable(tenantId: string, workflowKey: string) {
    const existing = await this.findDefinitionByWorkflowKey(tenantId, workflowKey);
    if (existing) {
      throw Errors.business(409, "流程编码已存在", "WORKFLOW_KEY_EXISTS", {
        workflow_key: workflowKey,
        definition_id: existing.id,
      });
    }
  }

  private async findDefinitionByWorkflowKey(
    tenantId: string,
    workflowKey: string,
  ): Promise<WorkflowDefinitionRow | null> {
    let page = 1;

    while (true) {
      const result = await workflowRepository.listDefinitions({
        tenantId,
        page,
        pageSize: 100,
        keyword: workflowKey,
      });
      const matched = result.list.find((item) => item.workflow_key === workflowKey);
      if (matched) {
        return matched;
      }

      if (page >= result.pagination.totalPages || result.list.length === 0) {
        return null;
      }

      page += 1;
    }
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

  private validatePublishGraph(nodes: WorkflowNodeRow[], edges: WorkflowEdgeRow[]) {
    if (nodes.length === 0) {
      throw Errors.badRequest("发布前至少需要配置一个节点");
    }

    const nodeIds = new Set<string>();
    const nodeKeyCounts = new Map<string, number>();
    let startNodeCount = 0;

    for (const node of nodes) {
      nodeIds.add(node.id);
      nodeKeyCounts.set(node.node_key, (nodeKeyCounts.get(node.node_key) ?? 0) + 1);
      if (node.node_type === "start") {
        startNodeCount += 1;
      }
    }

    const duplicateNodeKeys = Array.from(nodeKeyCounts.entries())
      .filter(([, count]) => count > 1)
      .map(([nodeKey]) => nodeKey);
    if (duplicateNodeKeys.length > 0) {
      throw Errors.badRequest(`节点编码重复: ${duplicateNodeKeys.join("、")}`);
    }

    if (startNodeCount > 1) {
      throw Errors.badRequest("开始节点最多只能有一个");
    }

    const invalidNodeIds = new Set<string>();
    const selfLoopNodeIds = new Set<string>();

    for (const edge of edges) {
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
    versionNumber: number;
    publishedAt: string;
  }): JsonObject {
    return {
      definition_id: input.definition.id,
      workflow_key: input.definition.workflow_key,
      category: input.definition.category,
      version_number: input.versionNumber,
      published_at: input.publishedAt,
      nodes: input.nodes,
      edges: input.edges,
    };
  }
}

export const workflowService = new WorkflowService();
