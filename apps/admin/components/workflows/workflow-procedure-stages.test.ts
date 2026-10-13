import { describe, expect, test } from "bun:test";
import type { WorkflowNode } from "./workflow-types";
import { getWorkflowProcedureStageAvailability, WorkflowProcedureStageOptions } from "./workflow-procedure-stages";

function node(id: string, stage: string, title = id): WorkflowNode {
  return { id, node_key: id, title, node_type: "procedure", business_kind: "procedure_template",
    tenant_id: "tenant", definition_id: "definition", description: null, position: { x: 0, y: 0 },
    config: { stage_key: stage }, sort_order: 1, created_at: "", updated_at: "" };
}
const stages = WorkflowProcedureStageOptions.map((option) => node(option.value, option.value, option.label));

describe("procedure stage availability", () => {
  test("new node cannot select any stage when all six are occupied", () => {
    const options = getWorkflowProcedureStageAvailability(stages, "new");
    expect(options).toHaveLength(6);
    expect(options.every((option) => option.disabled && option.usedBy.length === 1)).toBe(true);
  });
  test("editing a node keeps its own type available and names other owners", () => {
    const options = getWorkflowProcedureStageAvailability(stages, stages[0]!.id);
    expect(options[0]!.disabled).toBe(false);
    expect(options[1]!.usedBy).toEqual([stages[1]!.title]);
  });
  test("deleting an owner immediately frees its type", () => {
    const options = getWorkflowProcedureStageAvailability(stages.slice(1), "new");
    expect(options.filter((option) => !option.disabled).map((option) => option.value)).toEqual([WorkflowProcedureStageOptions[0]!.value]);
  });
  test("legacy blank and invalid nodes do not consume a type", () => {
    expect(getWorkflowProcedureStageAvailability([node("empty", ""), node("invalid", "legacy")]).every((option) => !option.disabled)).toBe(true);
  });
  test("changing an existing node to another capability releases its type", () => {
    const changed = { ...stages[0]!, node_type: "business" as const };
    expect(getWorkflowProcedureStageAvailability([changed, ...stages.slice(1)])[0]!.disabled).toBe(false);
  });
  test("legacy duplicates name all owners while excluding the selected node", () => {
    const duplicate = node("duplicate", WorkflowProcedureStageOptions[0]!.value, "施工二期");
    expect(getWorkflowProcedureStageAvailability([...stages, duplicate], stages[0]!.id)[0]!.usedBy).toEqual(["施工二期"]);
    expect(getWorkflowProcedureStageAvailability([...stages, duplicate])[0]!.usedBy).toHaveLength(2);
  });
});
