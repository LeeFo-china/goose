import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { validateWorkflowPublishGraph } from "./workflow-publish-graph";
import type { WorkflowDefinitionRow, WorkflowNodeRow, WorkflowEdgeRow } from "@/repositories/workflows";

const migration = readFileSync(new URL("../../../../supabase/migrations/20261008061809_default_decoration_workflow_templates.sql", import.meta.url), "utf8");
const template = JSON.parse(migration.split("$workflow_template$")[1]!) as {
  workflows: Array<{
    workflow_key: string; name: string; category: string; subject_type: string | null;
    nodes: Array<Omit<WorkflowNodeRow, "id" | "tenant_id" | "definition_id" | "created_at" | "updated_at">>;
    edges: Array<{source_node_key: string; target_node_key: string; label: string | null; condition: WorkflowEdgeRow["condition"]; priority: number}>;
  }>;
};

for (const workflow of template.workflows) {
  test(`frozen ${workflow.workflow_key} passes the real publish graph validator with portable configuration`, () => {
    const definition = { id: "definition", tenant_id: "target", workflow_key: workflow.workflow_key, name: workflow.name, category: workflow.category,
      description: null, status: "draft", active_version_id: null, created_by: null, updated_by: null,
      created_at: "2026-10-08", updated_at: "2026-10-08" } as WorkflowDefinitionRow;
    const nodes: WorkflowNodeRow[] = workflow.nodes.map(node => ({ ...node, id: node.node_key, definition_id: "definition", tenant_id: "target", created_at: "2026-10-08", updated_at: "2026-10-08" }));
    const edges: WorkflowEdgeRow[] = workflow.edges.map((edge, index) => ({ ...edge, id: `edge-${index}`, definition_id: "definition", tenant_id: "target", source_node_id: edge.source_node_key, target_node_id: edge.target_node_key, created_at: "2026-10-08", updated_at: "2026-10-08" }));
    expect(validateWorkflowPublishGraph({ definition, nodes, edges }).valid).toBe(true);
    expect(JSON.stringify(workflow.nodes)).not.toMatch(/[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}/i);
    if (workflow.workflow_key === "supplier_purchase_batch_approval") expect(workflow.subject_type).toBe("supplier_purchase_batch");
  });
}
