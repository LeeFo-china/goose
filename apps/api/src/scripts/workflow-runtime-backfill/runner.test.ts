import { describe, expect, test } from "bun:test";
import { resolveBackfillSubjectTypes } from "./runner";

describe("resolveBackfillSubjectTypes", () => {
  test("returns only the requested subject type when filter is provided", () => {
    expect(resolveBackfillSubjectTypes({
      subjectType: "customer",
    })).toEqual(["customer"]);
  });

  test("returns all subject types when no filter is provided", () => {
    expect(resolveBackfillSubjectTypes({})).toEqual([
      "customer",
      "project",
      "expense_request",
    ]);
  });
});
