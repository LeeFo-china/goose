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
    expect(source).toContain("workflow 当前节点以 Workflow 状态为准");
  });
});
