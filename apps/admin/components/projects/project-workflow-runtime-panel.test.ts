import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

describe("ProjectWorkflowRuntimePanel read-only boundary", () => {
  test("does not expose manual runtime start or rebuild controls", () => {
    const source = readFileSync(
      new URL("./project-workflow-runtime-panel.tsx", import.meta.url),
      "utf8",
    );

    expect(source).not.toContain("startWorkflowRuntimeInstance");
    expect(source).not.toContain("rebuildWorkflowRuntimeInstance");
    expect(source).not.toContain("启动项目流程");
    expect(source).not.toContain("重建实例");
    expect(source).not.toContain("项目状态校正");
  });
});
