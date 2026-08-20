import { describe, expect, test } from "bun:test";
import {
  PROJECT_PHASE_FILTERS,
  projectFilterToPhase,
  projectPhaseLabel,
} from "./project-phase";

describe("unified public project phase presentation", () => {
  test("offers all, in-progress and completed filters in product order", () => {
    expect(PROJECT_PHASE_FILTERS).toEqual([
      { value: "all", label: "全部" },
      { value: "in_progress", label: "施工中" },
      { value: "completed", label: "已完工" },
    ]);
  });

  test("omits phase for all and maps concrete filters to API phases", () => {
    expect(projectFilterToPhase("all")).toBeUndefined();
    expect(projectFilterToPhase("in_progress")).toBe("in_progress");
    expect(projectFilterToPhase("completed")).toBe("completed");
  });

  test("uses direct Chinese labels for public lifecycle phases", () => {
    expect(projectPhaseLabel("in_progress")).toBe("施工中");
    expect(projectPhaseLabel("completed")).toBe("已完工");
  });
});
