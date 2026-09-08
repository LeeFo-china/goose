import assert from "node:assert/strict";
import ts from "typescript";

type Sections = Partial<Record<"Tables" | "Functions", readonly string[]>>;

export const MATERIAL_TYPE_SECTIONS: Sections = {
  Tables: ["tenant_supplier_settings", "project_cost_events", "inventory_transactions",
    "warehouse_issue_orders", "warehouse_issue_order_items", "warehouse_return_orders",
    "warehouse_return_order_items", "warehouse_material_command_events"],
  Functions: ["__gooes_material_assert_actor", "__gooes_material_assert_project",
    "__gooes_material_order_summary", "command_warehouse_material_order",
    "get_warehouse_material_order", "get_warehouse_material_settings", "list_warehouse_material_orders",
    "list_warehouse_material_order_items", "list_warehouse_material_projects",
    "__gooes_set_supplier_rollout_settings_v2", "set_tenant_supplier_rollout_settings",
    "search_finance_project_risk_ids", "__gooes_submit_supplier_purchase_batch_destinations_v2",
    "__gooes_review_supplier_purchase_batch_destinations_v2",
    "__gooes_supplier_purchase_batch_budget_preflight"],
};

function section(source: ts.SourceFile, name: string): ts.TypeLiteralNode {
  const database = source.statements.find((node): node is ts.TypeAliasDeclaration =>
    ts.isTypeAliasDeclaration(node) && node.name.text === "Database");
  assert.ok(database && ts.isTypeLiteralNode(database.type), "Generated Database must be a type literal");
  function child(parent: ts.TypeLiteralNode, key: string): ts.TypeLiteralNode {
    const member = parent.members.find((node) => node.name?.getText(source) === key);
    assert.ok(member && ts.isPropertySignature(member) && member.type && ts.isTypeLiteralNode(member.type),
      `Missing generated database section: ${key}`);
    return member.type;
  }
  return child(child(database.type, "public"), name);
}

/** Generated schema may lag unrelated feature types; replace only this migration's scope. */
export function syncSelectedDatabaseTypes(current: string, generated: string, sections: Sections): string {
  const originalSource = ts.createSourceFile("current.ts", current, ts.ScriptTarget.Latest, true);
  const generatedSource = ts.createSourceFile("generated.ts", generated, ts.ScriptTarget.Latest, true);
  const edits: { start: number; end: number; text: string }[] = [];
  for (const [name, names] of Object.entries(sections)) {
    const originalSection = section(originalSource, name);
    const emittedSection = section(generatedSource, name);
    const entries = originalSection.members.map((member) => ({
      name: member.name?.getText(originalSource) ?? "", text: member.getFullText(originalSource),
    }));
    for (const key of names) {
      const member = emittedSection.members.find((entry) => entry.name?.getText(generatedSource) === key);
      assert.ok(member, `Missing generated database entry: ${name}.${key}`);
      const replacement = { name: key, text: member.getFullText(generatedSource) };
      const existing = entries.findIndex((entry) => entry.name === key);
      if (existing >= 0) entries[existing] = replacement;
      else {
        const next = entries.findIndex((entry) => entry.name > key);
        entries.splice(next < 0 ? entries.length : next, 0, replacement);
      }
    }
    // Insert new entries lexically without reordering any historical members.
    const first = originalSection.members[0];
    const last = originalSection.members.at(-1);
    assert.ok(first && last, `Empty current database section: ${name}`);
    edits.push({ start: first.getFullStart(), end: last.end, text: entries.map(({ text }) => text).join("") });
  }
  return edits.sort((a, b) => b.start - a.start).reduce((text, edit) =>
    text.slice(0, edit.start) + edit.text + text.slice(edit.end), current);
}
