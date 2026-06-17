import { describe, expect, test } from "bun:test";
import { workflowTemplateService } from "./workflow-templates";

describe("workflowTemplateService customer_main", () => {
  test("creates customer_main with potential node before following", () => {
    const template = workflowTemplateService.getTemplateForTest({
      template_key: "customer_main",
    });

    expect(template.graph.nodes.map((node) => node.node_key)).toEqual([
      "start",
      "potential",
      "following",
      "arrived",
      "designing",
      "signed",
      "end",
    ]);
    expect(template.graph.edges.map((edge) => [
      edge.source_node_key,
      edge.target_node_key,
      edge.label,
    ])).toContainEqual(["potential", "following", "开始跟进"]);
  });
});
