import { describe, expect, test } from "bun:test";
import {
  filterSelectSubmitValue,
  normalizeFilterSelectValue,
} from "./finance-filter-control-utils";

describe("finance filter controls", () => {
  test("maps empty filter values to a select sentinel and back", () => {
    expect(normalizeFilterSelectValue(undefined)).toBe("__all");
    expect(normalizeFilterSelectValue("")).toBe("__all");
    expect(normalizeFilterSelectValue("out")).toBe("out");

    expect(filterSelectSubmitValue("__all")).toBe("");
    expect(filterSelectSubmitValue("out")).toBe("out");
  });
});
