import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

describe("workflow node inline title editing contract", () => {
  test("supports editing a workflow node title from the canvas", () => {
    const flowNodeSource = readFileSync(
      new URL("./workflow-flow-node.tsx", import.meta.url),
      "utf8",
    );
    const canvasSource = readFileSync(
      new URL("./workflow-canvas.tsx", import.meta.url),
      "utf8",
    );
    const adapterSource = readFileSync(
      new URL("./workflow-flow-adapter.ts", import.meta.url),
      "utf8",
    );

    expect(flowNodeSource).toContain("onDoubleClick");
    expect(flowNodeSource).toContain("data-workflow-node-title-input");
    expect(flowNodeSource).toContain("nodrag");
    expect(flowNodeSource).toContain("onRenameNode");
    expect(canvasSource).toContain("onRenameNode");
    expect(adapterSource).toContain("onRenameNode");
  });

  test("keeps node title editable from the property panel", () => {
    const panelSource = readFileSync(
      new URL("./workflow-property-panel.tsx", import.meta.url),
      "utf8",
    );

    expect(panelSource).toContain("workflow-node-title");
    expect(panelSource).toContain("节点名称");
    expect(panelSource).toContain("节点名称不能为空");
  });
});
