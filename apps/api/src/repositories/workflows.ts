import { Errors } from "@/errors/error-factory";
import type {
  WorkflowDefinitionCreateInput,
  WorkflowDefinitionUpdateInput,
  WorkflowGraphSaveInput,
} from "@/schema/workflows";
import { SupabaseDB } from "@/utils/supabase";
import type {
  WorkflowCategory,
  WorkflowDefinitionStatus,
  WorkflowNodeType,
  WorkflowBusinessKind,
  WorkflowEdgeConditionOperator,
  WorkflowVersionStatus,
} from "@gooes/domain";

const WORKFLOW_DEFINITION_SELECT = [
  "id",
  "tenant_id",
  "workflow_key",
  "name",
  "description",
  "category",
  "status",
  "active_version_id",
  "created_by",
  "updated_by",
  "created_at",
  "updated_at",
].join(", ");

const WORKFLOW_VERSION_SELECT = [
  "id",
  "tenant_id",
  "definition_id",
  "version_number",
  "status",
  "snapshot",
  "validation_result",
  "published_by",
  "published_at",
  "created_at",
].join(", ");

const WORKFLOW_NODE_SELECT = [
  "id",
  "tenant_id",
  "definition_id",
  "node_key",
  "node_type",
  "business_kind",
  "title",
  "description",
  "position",
  "config",
  "sort_order",
  "created_at",
  "updated_at",
].join(", ");

const WORKFLOW_EDGE_SELECT = [
  "id",
  "tenant_id",
  "definition_id",
  "source_node_id",
  "target_node_id",
  "label",
  "condition",
  "priority",
  "created_at",
  "updated_at",
].join(", ");

const MAX_GRAPH_NODES = 200;
const MAX_GRAPH_EDGES = 400;

type JsonObject = Record<string, unknown>;
type WorkflowTableName =
  | "workflow_definitions"
  | "workflow_versions"
  | "workflow_nodes"
  | "workflow_edges";

export type WorkflowDefinitionRow = {
  id: string;
  tenant_id: string;
  workflow_key: string;
  name: string;
  description: string | null;
  category: WorkflowCategory;
  status: WorkflowDefinitionStatus;
  active_version_id: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type WorkflowVersionRow = {
  id: string;
  tenant_id: string;
  definition_id: string;
  version_number: number;
  status: WorkflowVersionStatus;
  snapshot: JsonObject;
  validation_result: JsonObject;
  published_by: string | null;
  published_at: string;
  created_at: string;
};

export type WorkflowNodePosition = {
  x: number;
  y: number;
};

export type WorkflowNodeRow = {
  id: string;
  tenant_id: string;
  definition_id: string;
  node_key: string;
  node_type: WorkflowNodeType;
  business_kind: WorkflowBusinessKind | null;
  title: string;
  description: string | null;
  position: WorkflowNodePosition;
  config: JsonObject;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type WorkflowEdgeCondition = {
  operator: WorkflowEdgeConditionOperator;
  field?: string | null;
  value?: string | number | boolean | string[] | null;
};

export type WorkflowEdgeRow = {
  id: string;
  tenant_id: string;
  definition_id: string;
  source_node_id: string;
  target_node_id: string;
  label: string | null;
  condition: WorkflowEdgeCondition;
  priority: number;
  created_at: string;
  updated_at: string;
};

export type WorkflowDefinitionListInput = {
  tenantId: string;
  page?: number;
  pageSize?: number;
  status?: WorkflowDefinitionStatus;
  category?: WorkflowCategory;
  keyword?: string;
};

export type WorkflowDefinitionListResult = {
  list: WorkflowDefinitionRow[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

export type WorkflowDefinitionCreateRepositoryInput =
  WorkflowDefinitionCreateInput & {
    tenantId: string;
    createdBy?: string | null;
  };

export type WorkflowDefinitionUpdateRepositoryInput =
  WorkflowDefinitionUpdateInput & {
    updatedBy?: string | null;
  };

export type WorkflowDraftGraph = {
  definition: WorkflowDefinitionRow;
  version: null;
  nodes: WorkflowNodeRow[];
  edges: WorkflowEdgeRow[];
};

export type WorkflowGraphQueryInput = { tenantId: string; definitionId: string; versionId?: string | null };

export type WorkflowGraphResult = {
  definition: WorkflowDefinitionRow; version: WorkflowVersionRow | null; nodes: WorkflowNodeRow[]; edges: WorkflowEdgeRow[];
};

export type WorkflowDraftGraphReplaceInput = WorkflowGraphSaveInput & {
  tenantId: string;
  definitionId: string;
};

export type WorkflowDraftGraphReplaceResult =
  | {
      ok: true;
      nodes: WorkflowNodeRow[];
      edges: WorkflowEdgeRow[];
    }
  | {
      ok: false;
      reason: "duplicate_node_key";
      duplicateNodeKeys: string[];
    }
  | {
      ok: false;
      reason: "invalid_node_reference";
      missingNodeKeys: string[];
    }
  | {
      ok: false;
      reason: "self_loop_edge";
      nodeKeys: string[];
    };

type WorkflowDraftGraphInvalidResult = Exclude<
  WorkflowDraftGraphReplaceResult,
  { ok: true }
>;

export type WorkflowVersionCreateInput = {
  tenantId: string;
  definitionId: string;
  versionNumber: number;
  snapshot: JsonObject;
  validationResult?: JsonObject;
  status?: WorkflowVersionStatus;
  publishedBy?: string | null;
};

export type WorkflowActiveVersionUpdateInput = {
  tenantId: string;
  definitionId: string;
  versionId: string | null;
  status?: WorkflowDefinitionStatus;
  updatedBy?: string | null;
};

type WorkflowNodeInsertRow = {
  id?: string;
  tenant_id: string;
  definition_id: string;
  node_key: string;
  node_type: WorkflowNodeType;
  business_kind: WorkflowBusinessKind | null;
  title: string;
  description: string | null;
  position: WorkflowNodePosition;
  config: JsonObject;
  sort_order: number;
};

type WorkflowEdgeInsertRow = {
  id?: string;
  tenant_id: string;
  definition_id: string;
  source_node_id: string;
  target_node_id: string;
  label: string | null;
  condition: WorkflowEdgeCondition;
  priority: number;
};

class WorkflowRepository {
  private client = SupabaseDB.getAdminClient();

  private from(table: WorkflowTableName) {
    return (
      this.client as unknown as { from: (table: WorkflowTableName) => any }
    ).from(table);
  }

  async listDefinitions(
    input: WorkflowDefinitionListInput,
  ): Promise<WorkflowDefinitionListResult> {
    const page = input.page ?? 1;
    const pageSize = Math.min(input.pageSize ?? 20, 100);
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let request = this.from("workflow_definitions")
      .select(WORKFLOW_DEFINITION_SELECT, { count: "exact" })
      .eq("tenant_id", input.tenantId);

    if (input.status) {
      request = request.eq("status", input.status);
    }

    if (input.category) {
      request = request.eq("category", input.category);
    }

    const keyword = input.keyword?.trim();
    if (keyword) {
      const escapedKeyword = escapeSupabaseOrValue(keyword);
      request = request.or(
        [
          `workflow_key.ilike.%${escapedKeyword}%`,
          `name.ilike.%${escapedKeyword}%`,
          `description.ilike.%${escapedKeyword}%`,
        ].join(","),
      );
    }

    const { data, error, count } = await request
      .order("updated_at", { ascending: false })
      .range(from, to);

    if (error) {
      throw Errors.dbError("查询流程定义列表失败", error);
    }

    const total = count ?? 0;

    return {
      list: (data ?? []) as WorkflowDefinitionRow[],
      pagination: {
        page,
        pageSize,
        total,
        totalPages: total ? Math.ceil(total / pageSize) : 0,
      },
    };
  }

  async getDefinitionById(
    id: string,
    tenantId: string,
  ): Promise<WorkflowDefinitionRow | null> {
    const { data, error } = await this.from("workflow_definitions")
      .select(WORKFLOW_DEFINITION_SELECT)
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询流程定义失败", error);
    }

    return (data ?? null) as WorkflowDefinitionRow | null;
  }

  async findDefinitionById(
    id: string,
    tenantId: string,
  ): Promise<WorkflowDefinitionRow | null> {
    return this.getDefinitionById(id, tenantId);
  }

  async createDefinition(
    input: WorkflowDefinitionCreateRepositoryInput,
  ): Promise<WorkflowDefinitionRow> {
    const { data, error } = await this.from("workflow_definitions")
      .insert({
        tenant_id: input.tenantId,
        workflow_key: input.workflow_key,
        name: input.name,
        description: input.description ?? null,
        category: input.category,
        status: "draft",
        created_by: input.createdBy ?? null,
        updated_by: input.createdBy ?? null,
      })
      .select(WORKFLOW_DEFINITION_SELECT)
      .single();

    if (error) {
      throw Errors.dbError("创建流程定义失败", error);
    }

    if (!data) {
      throw Errors.badRequest("创建流程定义失败");
    }

    return data as WorkflowDefinitionRow;
  }

  async updateDefinition(
    id: string,
    tenantId: string,
    input: WorkflowDefinitionUpdateRepositoryInput,
  ): Promise<WorkflowDefinitionRow> {
    const updatePayload: Partial<
      Pick<
        WorkflowDefinitionRow,
        "name" | "description" | "status" | "updated_by"
      >
    > = {};

    if (input.name !== undefined) {
      updatePayload.name = input.name;
    }

    if (input.description !== undefined) {
      updatePayload.description = input.description;
    }

    if (input.status !== undefined) {
      updatePayload.status = input.status;
    }

    if (input.updatedBy !== undefined) {
      updatePayload.updated_by = input.updatedBy;
    }

    if (Object.keys(updatePayload).length === 0) {
      const current = await this.getDefinitionById(id, tenantId);
      if (!current) {
        throw Errors.badRequest("流程定义不存在");
      }
      return current;
    }

    const { data, error } = await this.from("workflow_definitions")
      .update(updatePayload)
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .select(WORKFLOW_DEFINITION_SELECT)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("更新流程定义失败", error);
    }

    if (!data) {
      throw Errors.badRequest("流程定义不存在");
    }

    return data as WorkflowDefinitionRow;
  }

  async getDraftGraph(
    definitionId: string,
    tenantId: string,
  ): Promise<WorkflowDraftGraph | null> {
    const graph = await this.getGraph({ tenantId, definitionId });
    return graph ? { definition: graph.definition, version: null, nodes: graph.nodes, edges: graph.edges } : null;
  }

  async getGraph(input: WorkflowGraphQueryInput): Promise<WorkflowGraphResult | null> {
    const definition = await this.getDefinitionById(input.definitionId, input.tenantId);
    if (!definition) {
      return null;
    }

    if (!input.versionId) {
      const draftGraph = await this.loadDraftGraph(input.definitionId, input.tenantId);
      return {
        definition,
        version: null,
        nodes: draftGraph.nodes,
        edges: draftGraph.edges,
      };
    }

    const version = await this.getVersionById(input.versionId, input.definitionId, input.tenantId);

    if (!version) {
      return null;
    }

    return {
      definition,
      version,
      nodes: getSnapshotRows<WorkflowNodeRow>(version.snapshot, "nodes", MAX_GRAPH_NODES, compareWorkflowNodes),
      edges: getSnapshotRows<WorkflowEdgeRow>(version.snapshot, "edges", MAX_GRAPH_EDGES, compareWorkflowEdges),
    };
  }

  async replaceDraftGraph(
    input: WorkflowDraftGraphReplaceInput,
  ): Promise<WorkflowDraftGraphReplaceResult> {
    const invalidGraph = this.validateDraftGraphInput(input);
    if (invalidGraph) {
      return invalidGraph;
    }

    const deleteEdgesResult = await this.from("workflow_edges")
      .delete()
      .eq("definition_id", input.definitionId)
      .eq("tenant_id", input.tenantId);

    if (deleteEdgesResult.error) {
      throw Errors.dbError("删除流程草稿连线失败", deleteEdgesResult.error);
    }

    const deleteNodesResult = await this.from("workflow_nodes")
      .delete()
      .eq("definition_id", input.definitionId)
      .eq("tenant_id", input.tenantId);

    if (deleteNodesResult.error) {
      throw Errors.dbError("删除流程草稿节点失败", deleteNodesResult.error);
    }

    const nodes = await this.insertDraftNodes(input);
    const edges = await this.insertDraftEdges(input, nodes);

    return {
      ok: true,
      nodes,
      edges,
    };
  }

  async getLatestVersion(
    definitionId: string,
    tenantId: string,
  ): Promise<WorkflowVersionRow | null> {
    const { data, error } = await this.from("workflow_versions")
      .select(WORKFLOW_VERSION_SELECT)
      .eq("definition_id", definitionId)
      .eq("tenant_id", tenantId)
      .order("version_number", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询流程最新版本失败", error);
    }

    return (data ?? null) as WorkflowVersionRow | null;
  }

  async getVersionById(id: string, definitionId: string, tenantId: string): Promise<WorkflowVersionRow | null> {
    const { data, error } = await this.from("workflow_versions")
      .select(WORKFLOW_VERSION_SELECT)
      .eq("id", id)
      .eq("definition_id", definitionId)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询流程版本失败", error);
    }

    return (data ?? null) as WorkflowVersionRow | null;
  }

  async getNextVersionNumber(
    definitionId: string,
    tenantId: string,
  ): Promise<number> {
    const latestVersion = await this.getLatestVersion(definitionId, tenantId);
    return latestVersion ? latestVersion.version_number + 1 : 1;
  }

  async createVersion(input: WorkflowVersionCreateInput): Promise<WorkflowVersionRow> {
    const { data, error } = await this.from("workflow_versions")
      .insert({
        tenant_id: input.tenantId,
        definition_id: input.definitionId,
        version_number: input.versionNumber,
        status: input.status ?? "published",
        snapshot: input.snapshot,
        validation_result: input.validationResult ?? {},
        published_by: input.publishedBy ?? null,
      })
      .select(WORKFLOW_VERSION_SELECT)
      .single();

    if (error) {
      throw Errors.dbError("创建流程版本失败", error);
    }

    if (!data) {
      throw Errors.badRequest("创建流程版本失败");
    }

    return data as WorkflowVersionRow;
  }

  async updateActiveVersion(
    input: WorkflowActiveVersionUpdateInput,
  ): Promise<WorkflowDefinitionRow> {
    const { data, error } = await this.from("workflow_definitions")
      .update({
        active_version_id: input.versionId,
        status: input.status ?? "active",
        updated_by: input.updatedBy ?? null,
      })
      .eq("id", input.definitionId)
      .eq("tenant_id", input.tenantId)
      .select(WORKFLOW_DEFINITION_SELECT)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("更新流程启用版本失败", error);
    }

    if (!data) {
      throw Errors.badRequest("流程定义不存在");
    }

    return data as WorkflowDefinitionRow;
  }

  private async insertDraftNodes(
    input: WorkflowDraftGraphReplaceInput,
  ): Promise<WorkflowNodeRow[]> {
    if (input.nodes.length === 0) {
      return [];
    }

    const payload: WorkflowNodeInsertRow[] = input.nodes.map((node) => ({
      ...(node.id ? { id: node.id } : {}),
      tenant_id: input.tenantId,
      definition_id: input.definitionId,
      node_key: node.node_key,
      node_type: node.node_type,
      business_kind: node.business_kind ?? null,
      title: node.title,
      description: node.description ?? null,
      position: node.position,
      config: node.config,
      sort_order: node.sort_order,
    }));

    const { data, error } = await this.from("workflow_nodes")
      .insert(payload)
      .select(WORKFLOW_NODE_SELECT);

    if (error) {
      throw Errors.dbError("保存流程草稿节点失败", error);
    }

    return ((data ?? []) as WorkflowNodeRow[]).sort(compareWorkflowNodes);
  }

  private async insertDraftEdges(
    input: WorkflowDraftGraphReplaceInput,
    nodes: WorkflowNodeRow[],
  ): Promise<WorkflowEdgeRow[]> {
    if (input.edges.length === 0) {
      return [];
    }

    const nodeIdByKey = new Map(nodes.map((node) => [node.node_key, node.id]));
    const payload: WorkflowEdgeInsertRow[] = input.edges.map((edge) => ({
      ...(edge.id ? { id: edge.id } : {}),
      tenant_id: input.tenantId,
      definition_id: input.definitionId,
      source_node_id: nodeIdByKey.get(edge.source_node_key) as string,
      target_node_id: nodeIdByKey.get(edge.target_node_key) as string,
      label: edge.label ?? null,
      condition: edge.condition,
      priority: edge.priority,
    }));

    const { data, error } = await this.from("workflow_edges")
      .insert(payload)
      .select(WORKFLOW_EDGE_SELECT);

    if (error) {
      throw Errors.dbError("保存流程草稿连线失败", error);
    }

    return ((data ?? []) as WorkflowEdgeRow[]).sort(compareWorkflowEdges);
  }

  private validateDraftGraphInput(
    input: WorkflowDraftGraphReplaceInput,
  ): WorkflowDraftGraphInvalidResult | null {
    const nodeKeyCounts = new Map<string, number>();
    for (const node of input.nodes) {
      nodeKeyCounts.set(node.node_key, (nodeKeyCounts.get(node.node_key) ?? 0) + 1);
    }

    const duplicateNodeKeys = Array.from(nodeKeyCounts.entries())
      .filter(([, count]) => count > 1)
      .map(([nodeKey]) => nodeKey);
    if (duplicateNodeKeys.length > 0) {
      return {
        ok: false,
        reason: "duplicate_node_key",
        duplicateNodeKeys,
      };
    }

    const nodeKeys = new Set(nodeKeyCounts.keys());
    const missingNodeKeys = unique(
      input.edges.flatMap((edge) => [
        nodeKeys.has(edge.source_node_key) ? null : edge.source_node_key,
        nodeKeys.has(edge.target_node_key) ? null : edge.target_node_key,
      ]),
    );
    if (missingNodeKeys.length > 0) {
      return {
        ok: false,
        reason: "invalid_node_reference",
        missingNodeKeys,
      };
    }

    const selfLoopNodeKeys = unique(
      input.edges.map((edge) =>
        edge.source_node_key === edge.target_node_key ? edge.source_node_key : null,
      ),
    );
    if (selfLoopNodeKeys.length > 0) {
      return {
        ok: false,
        reason: "self_loop_edge",
        nodeKeys: selfLoopNodeKeys,
      };
    }

    return null;
  }

  private async loadDraftGraph(definitionId: string, tenantId: string) {
    const [nodesResult, edgesResult] = await Promise.all([
      this.from("workflow_nodes")
        .select(WORKFLOW_NODE_SELECT)
        .eq("definition_id", definitionId)
        .eq("tenant_id", tenantId)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true })
        .limit(MAX_GRAPH_NODES),
      this.from("workflow_edges")
        .select(WORKFLOW_EDGE_SELECT)
        .eq("definition_id", definitionId)
        .eq("tenant_id", tenantId)
        .order("priority", { ascending: true })
        .order("created_at", { ascending: true })
        .limit(MAX_GRAPH_EDGES),
    ]);

    if (nodesResult.error) {
      throw Errors.dbError("查询流程草稿节点失败", nodesResult.error);
    }

    if (edgesResult.error) {
      throw Errors.dbError("查询流程草稿连线失败", edgesResult.error);
    }

    return { nodes: (nodesResult.data ?? []) as WorkflowNodeRow[], edges: (edgesResult.data ?? []) as WorkflowEdgeRow[] };
  }
}

function escapeSupabaseOrValue(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/[%_]/g, "\\$&")
    .replace(/,/g, "\\,");
}

function unique(values: Array<string | null>): string[] {
  return Array.from(
    new Set(values.filter((value): value is string => Boolean(value))),
  );
}

function compareWorkflowNodes(
  left: WorkflowNodeRow,
  right: WorkflowNodeRow,
): number {
  if (left.sort_order !== right.sort_order) {
    return left.sort_order - right.sort_order;
  }

  return left.created_at.localeCompare(right.created_at);
}

function compareWorkflowEdges(
  left: WorkflowEdgeRow,
  right: WorkflowEdgeRow,
): number {
  if (left.priority !== right.priority) {
    return left.priority - right.priority;
  }

  return left.created_at.localeCompare(right.created_at);
}

function getSnapshotRows<T>(snapshot: JsonObject, key: "nodes" | "edges", limit: number, compare: (left: T, right: T) => number): T[] {
  const value = snapshot[key];
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(isRecord)
    .slice(0, limit)
    .map((item) => item as T)
    .sort(compare);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export const workflowRepository = new WorkflowRepository();
