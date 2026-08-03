import { describe, expect, test } from "bun:test";
import {
  clearCaseFilters,
  hasActiveCaseFilters,
  toggleCaseFilter,
} from "./filter-state";

describe("case filters", () => {
  test("selects and then deselects the same style", () => {
    const selected = toggleCaseFilter({ selectedStyle: "", selectedLayout: "" }, "style", "现代");
    expect(selected).toEqual({ selectedStyle: "现代", selectedLayout: "" });
    expect(toggleCaseFilter(selected, "style", "现代")).toEqual({
      selectedStyle: "",
      selectedLayout: "",
    });
  });

  test("changes one filter without dropping the other", () => {
    expect(toggleCaseFilter(
      { selectedStyle: "现代", selectedLayout: "三室" },
      "layout",
      "两室",
    )).toEqual({ selectedStyle: "现代", selectedLayout: "两室" });
  });

  test("clears both filters and reports no active selection", () => {
    const cleared = clearCaseFilters();
    expect(cleared).toEqual({ selectedStyle: "", selectedLayout: "" });
    expect(hasActiveCaseFilters(cleared)).toBe(false);
  });

  test("reports either filter as active", () => {
    expect(hasActiveCaseFilters({ selectedStyle: "原木", selectedLayout: "" })).toBe(true);
    expect(hasActiveCaseFilters({ selectedStyle: "", selectedLayout: "四室" })).toBe(true);
  });
});
