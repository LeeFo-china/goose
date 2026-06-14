import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  buildPaymentGateNodeSnapshots,
  buildProjectWorkflowSourceBatchReport,
  buildProjectWorkflowSourceReport,
  readString,
  resolveLegacyConstructionStagesCurrentStage,
  resolveProjectWorkflowSourceCheckConfig,
  resolveRuntimeStageCode,
  type ProjectWorkflowSourceCheckConfig,
  type ProjectWorkflowSourceReport,
  type ProjectWorkflowSourceSnapshot,
  type WorkflowGraphEdgeSnapshot,
  type WorkflowGraphNodeSnapshot,
} from "./project-workflow-source-of-truth-core";

export {
  buildProjectWorkflowSourceBatchReport,
  buildProjectWorkflowSourceReport,
  resolveProjectWorkflowSourceCheckConfig,
};
export type {
  PaymentGateNodeSnapshot,
  ProjectWorkflowSourceBatchReport,
  ProjectWorkflowSourceCheckConfig,
  ProjectWorkflowSourceIssue,
  ProjectWorkflowSourceReport,
  ProjectWorkflowSourceSnapshot,
} from "./project-workflow-source-of-truth-core";

type EnvLike = Record<string, string | undefined>;
type SupabaseClientLike = SupabaseClient<any, "public", any>;

type ProjectRow = {
  id: string;
  tenant_id: string | null;
  customer_id: string | null;
  status: string | null;
};

type WorkflowStateRow = {
  instance_id: string | null;
  current_node_key: string | null;
  current_node_title: string | null;
};

type WorkflowInstanceRow = {
  id: string;
  tenant_id: string;
  definition_id: string;
  current_node_key: string | null;
  current_node_snapshot: Record<string, unknown> | null;
};

export async function runProjectWorkflowSourceCheck(
  config: ProjectWorkflowSourceCheckConfig,
  env: EnvLike = process.env,
) {
  const supabase = createSupabaseClient(env);
  const projectIds = config.mode === "single"
    ? [config.projectId]
    : await listActiveConstructionProjectIds(supabase);
  const generatedAt = new Date().toISOString();
  const reports: ProjectWorkflowSourceReport[] = [];

  for (const projectId of projectIds) {
    const snapshot = await loadProjectWorkflowSourceSnapshot(supabase, projectId);
    reports.push(buildProjectWorkflowSourceReport(snapshot, generatedAt));
  }

  if (config.mode === "single") return reports[0] ?? null;
  return buildProjectWorkflowSourceBatchReport(reports, generatedAt);
}

function createSupabaseClient(env: EnvLike) {
  const url = env.SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("缺少 SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY");
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

async function listActiveConstructionProjectIds(supabase: SupabaseClientLike) {
  const projectIds: string[] = [];
  const pageSize = 100;

  for (let from = 0;; from += pageSize) {
    const { data, error } = await supabase
      .from("projects")
      .select("id")
      .in("status", ["constructing", "acceptance"])
      .order("updated_at", { ascending: false })
      .range(from, from + pageSize - 1);

    if (error) throw new Error(`查询施工项目失败: ${error.message}`);

    const rows = (data ?? []) as Array<{ id: string }>;
    projectIds.push(...rows.map((row) => row.id));
    if (rows.length < pageSize) break;
  }

  return projectIds;
}

async function loadProjectWorkflowSourceSnapshot(
  supabase: SupabaseClientLike,
  projectId: string,
): Promise<ProjectWorkflowSourceSnapshot> {
  const project = await loadProject(supabase, projectId);
  const state = await loadWorkflowState(supabase, project);
  const instance = state?.instance_id
    ? await loadWorkflowInstance(supabase, state.instance_id)
    : null;
  const [completedStages, acceptedStages, confirmedPayments, graph] =
    await Promise.all([
      instance ? loadCompletedRuntimeProcedureStageCodes(supabase, instance.id) : [],
      loadAcceptedStageCodes(supabase, projectId),
      loadConfirmedPaymentTypes(supabase, projectId),
      instance ? loadWorkflowGraph(supabase, instance.definition_id) : null,
    ]);

  return {
    projectId,
    workflowCurrentNodeKey: instance?.current_node_key ??
      state?.current_node_key ?? null,
    workflowCurrentNodeTitle: readString(instance?.current_node_snapshot?.title) ??
      state?.current_node_title ?? null,
    constructionStagesCurrentStage:
      resolveLegacyConstructionStagesCurrentStage(acceptedStages),
    acceptedStageCodes: acceptedStages,
    completedRuntimeProcedureStageCodes: completedStages,
    confirmedPaymentTypes: confirmedPayments,
    paymentGateNodes: graph
      ? buildPaymentGateNodeSnapshots(graph.nodes, graph.edges)
      : [],
  };
}

async function loadProject(supabase: SupabaseClientLike, projectId: string) {
  const { data, error } = await supabase
    .from("projects")
    .select("id, tenant_id, customer_id, status")
    .eq("id", projectId)
    .maybeSingle();

  if (error) throw new Error(`查询项目失败: ${error.message}`);
  if (!data) throw new Error(`项目不存在: ${projectId}`);
  return data as ProjectRow;
}

async function loadWorkflowState(
  supabase: SupabaseClientLike,
  project: ProjectRow,
) {
  if (!project.tenant_id) return null;
  const { data, error } = await supabase
    .from("workflow_subject_states")
    .select("instance_id, current_node_key, current_node_title")
    .eq("tenant_id", project.tenant_id)
    .eq("subject_type", "project")
    .eq("subject_id", project.id)
    .maybeSingle();

  if (error) throw new Error(`查询流程投影失败: ${error.message}`);
  return data as WorkflowStateRow | null;
}

async function loadWorkflowInstance(
  supabase: SupabaseClientLike,
  instanceId: string,
) {
  const { data, error } = await supabase
    .from("workflow_instances")
    .select("id, tenant_id, definition_id, current_node_key, current_node_snapshot")
    .eq("id", instanceId)
    .maybeSingle();

  if (error) throw new Error(`查询流程实例失败: ${error.message}`);
  return data as WorkflowInstanceRow | null;
}

async function loadCompletedRuntimeProcedureStageCodes(
  supabase: SupabaseClientLike,
  instanceId: string,
) {
  const { data, error } = await supabase
    .from("workflow_instance_nodes")
    .select("node_key, node_snapshot")
    .eq("instance_id", instanceId)
    .eq("node_type", "procedure")
    .eq("status", "completed")
    .order("created_at", { ascending: true })
    .limit(200);

  if (error) throw new Error(`查询流程已完成工序失败: ${error.message}`);

  return [
    ...new Set(
      ((data ?? []) as Array<{ node_key: string; node_snapshot: unknown }>)
        .map((row) => resolveRuntimeStageCode(row.node_key, row.node_snapshot))
        .filter((stageCode): stageCode is string => Boolean(stageCode)),
    ),
  ];
}

async function loadAcceptedStageCodes(
  supabase: SupabaseClientLike,
  projectId: string,
) {
  const { data, error } = await supabase
    .from("project_acceptances")
    .select("stage_code")
    .eq("project_id", projectId)
    .eq("status", "customer_confirmed")
    .limit(200);

  if (error) throw new Error(`查询项目验收失败: ${error.message}`);
  return uniqueStrings((data ?? []) as Array<{ stage_code: string | null }>, "stage_code");
}

async function loadConfirmedPaymentTypes(
  supabase: SupabaseClientLike,
  projectId: string,
) {
  const { data, error } = await supabase
    .from("payments")
    .select("type")
    .eq("project_id", projectId)
    .eq("status", "confirmed")
    .limit(200);

  if (error) throw new Error(`查询项目收款失败: ${error.message}`);
  return uniqueStrings((data ?? []) as Array<{ type: string | null }>, "type");
}

async function loadWorkflowGraph(
  supabase: SupabaseClientLike,
  definitionId: string,
) {
  const [nodesResult, edgesResult] = await Promise.all([
    supabase
      .from("workflow_nodes")
      .select("id, node_key, title, node_type, business_kind, config, sort_order")
      .eq("definition_id", definitionId)
      .order("sort_order", { ascending: true }),
    supabase
      .from("workflow_edges")
      .select("source_node_id, target_node_id")
      .eq("definition_id", definitionId)
      .order("priority", { ascending: true }),
  ]);

  if (nodesResult.error) throw new Error(`查询流程节点失败: ${nodesResult.error.message}`);
  if (edgesResult.error) throw new Error(`查询流程连线失败: ${edgesResult.error.message}`);

  return {
    nodes: (nodesResult.data ?? []) as WorkflowGraphNodeSnapshot[],
    edges: (edgesResult.data ?? []) as WorkflowGraphEdgeSnapshot[],
  };
}

function uniqueStrings<T extends Record<K, string | null>, K extends keyof T>(
  rows: T[],
  key: K,
): string[] {
  const result: string[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    const value = row[key];
    if (typeof value !== "string" || !value || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }

  return result;
}

async function main() {
  const config = resolveProjectWorkflowSourceCheckConfig();
  const report = await runProjectWorkflowSourceCheck(config);
  console.log(JSON.stringify(report, null, 2));
  if (config.strict && report && !report.ok) process.exit(1);
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(
      error instanceof Error ? error.message : "项目流程事实源检查失败",
    );
    process.exit(1);
  });
}
