import { SupabaseDB } from "@/utils/supabase";

export type WorkflowTableName =
  | "workflow_definitions"
  | "workflow_versions"
  | "workflow_nodes"
  | "workflow_edges"
  | "workflow_instances"
  | "workflow_instance_nodes"
  | "workflow_tasks"
  | "workflow_transition_logs";

export type WorkflowRpcName =
  | "replace_workflow_draft_graph"
  | "publish_workflow_definition"
  | "start_workflow_instance"
  | "complete_workflow_instance_node"
  | "cancel_workflow_instance";

export type UntypedTable = {
  select: (...args: unknown[]) => UntypedTable;
  insert: (...args: unknown[]) => UntypedTable;
  update: (...args: unknown[]) => UntypedTable;
  delete: () => UntypedTable;
  eq: (...args: unknown[]) => UntypedTable;
  or: (...args: unknown[]) => UntypedTable;
  order: (...args: unknown[]) => UntypedTable;
  range: (...args: unknown[]) => UntypedTable;
  limit: (...args: unknown[]) => UntypedTable;
  single: () => Promise<{ data: unknown; error: unknown }>;
  maybeSingle: () => Promise<{ data: unknown; error: unknown }>;
  then: Promise<{
    data: unknown;
    error: unknown;
    count: number | null;
  }>["then"];
};

type UntypedSupabaseClient = {
  from: (table: WorkflowTableName) => UntypedTable;
  rpc: (
    name: WorkflowRpcName,
    params: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: unknown }>;
};

export function workflowTable(table: WorkflowTableName) {
  return (SupabaseDB.getAdminClient() as unknown as UntypedSupabaseClient)
    .from(table);
}

export function workflowRpc(
  name: WorkflowRpcName,
  params: Record<string, unknown>,
) {
  return (SupabaseDB.getAdminClient() as unknown as UntypedSupabaseClient)
    .rpc(name, params);
}
