import { Errors } from "@/errors/error-factory";
import { workflowTable } from "./workflows/client";

type ProcedureTask = {
  instance_id: string; instance_node_id: string | null; node_type: string;
  instance_node?: { procedure_completed?: unknown } | null;
  instance: { subject_type: string } | null;
};

// Older task-list RPCs omit the node relation. Hydrate only procedure rows,
// in bounded batches, so fallback responses expose the same facts as direct SQL.
export async function attachProcedureNodeOutputs<T extends ProcedureTask>(tenantId: string, tasks: T[]): Promise<T[]> {
  const ids = [...new Set(tasks.filter((task) => task.instance?.subject_type === "project" &&
    task.node_type === "procedure" && !task.instance_node && task.instance_node_id)
    .map((task) => task.instance_node_id!))];
  const nodes = new Map<string, { id: string; instance_id: string; procedure_completed: unknown }>();
  for (let offset = 0; offset < ids.length; offset += 100) {
    const { data, error } = await workflowTable("workflow_instance_nodes")
      .select("id, instance_id, procedure_completed:output->procedure_completed").eq("tenant_id", tenantId)
      .in("id", ids.slice(offset, offset + 100)).limit(100);
    if (error) throw Errors.dbError("查询工序完工事实失败", error);
    for (const node of (data ?? []) as Array<{ id: string; instance_id: string; procedure_completed: unknown }>) {
      nodes.set(node.id, node);
    }
  }
  return tasks.map((task) => {
    const node = task.instance_node_id ? nodes.get(task.instance_node_id) : undefined;
    return node?.instance_id === task.instance_id ? { ...task, instance_node: { procedure_completed: node.procedure_completed } } : task;
  });
}
