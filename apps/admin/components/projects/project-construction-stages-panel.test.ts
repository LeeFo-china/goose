import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

describe("ProjectConstructionStagesPanel workflow boundary", () => {
  test("does not present construction stages as workflow current state", () => {
    const source = readFileSync(
      new URL("./project-construction-stages-panel.tsx", import.meta.url),
      "utf8",
    );

    expect(source).not.toContain("等待前置阶段");
    expect(source).not.toContain("施工推进中");
    expect(source).toContain("施工阶段明细");
    expect(source).toContain("当前节点以流程状态为准");
  });

  test("renders construction stages as a visual flow instead of large stage cards", () => {
    const source = readFileSync(
      new URL("./project-construction-stages-panel.tsx", import.meta.url),
      "utf8",
    );

    expect(source).toContain('data-testid="project-construction-stage-flow"');
    expect(source).toContain("stageFlowConnector");
    expect(source).not.toContain("md:grid-cols-4");
    expect(source).not.toContain("flex min-h-28 flex-col gap-3 rounded-md border bg-background p-3");
  });
});
