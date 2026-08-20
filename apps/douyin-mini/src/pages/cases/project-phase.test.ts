import { describe, expect, test } from "bun:test";
import {
  beginPaginationRequest,
  createPaginationState,
  resolvePaginationRequest,
} from "../../utils/pagination";
import {
  createProjectPhaseSelection,
  PROJECT_PHASE_FILTERS,
  projectFilterToPhase,
  projectPhaseLabel,
  shouldLoadProjectLogs,
  uniqueProjectsById,
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

  test("creates a refresh request with an immutable phase snapshot", () => {
    expect(createProjectPhaseSelection("all", "completed")).toEqual({
      selectedPhase: "completed",
      loadMode: "refresh",
      filterSnapshot: { selectedPhase: "completed" },
    });
    expect(createProjectPhaseSelection("completed", "completed")).toBeNull();
    expect(createProjectPhaseSelection("all", "unknown")).toBeNull();
  });

  test("keeps a newer phase refresh isolated from a stale response", () => {
    const firstSelection = createProjectPhaseSelection("all", "in_progress")!;
    const first = beginPaginationRequest(
      createPaginationState<{ id: string }>(20),
      firstSelection.loadMode,
    );
    const secondSelection = createProjectPhaseSelection("in_progress", "completed")!;
    const second = beginPaginationRequest(first.state, secondSelection.loadMode);

    const stale = resolvePaginationRequest(second.state, first.request, {
      items: [{ id: "in-progress-project" }],
      pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
    });
    expect(stale).toBe(second.state);
    expect(secondSelection.filterSnapshot).toEqual({ selectedPhase: "completed" });

    const current = resolvePaginationRequest(second.state, second.request, {
      items: [{ id: "completed-project" }],
      pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
    });
    expect(current.items).toEqual([{ id: "completed-project" }]);
  });

  test("loads logs only for in-progress projects", () => {
    expect(shouldLoadProjectLogs("in_progress")).toBe(true);
    expect(shouldLoadProjectLogs("completed")).toBe(false);
  });

  test("deduplicates home projects by ID while keeping feed order", () => {
    const first = { id: "first", title: "首个项目" };
    const second = { id: "second", title: "第二个项目" };
    expect(uniqueProjectsById([first, second, { ...first, title: "重复项目" }]))
      .toEqual([first, second]);
  });
});
