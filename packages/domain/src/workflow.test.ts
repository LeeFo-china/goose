import { describe, expect, test } from "bun:test";

import { WORKFLOW_SUBJECT_TYPE_VALUES } from "./index";

describe("workflow domain contract", () => {
  test("supports supplier purchase batches as workflow subjects", () => {
    expect(WORKFLOW_SUBJECT_TYPE_VALUES).toEqual([
      "manual",
      "customer",
      "project",
      "expense_request",
      "procedure",
      "supplier_purchase_batch",
    ]);
  });
});
