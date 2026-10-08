import { expect, test } from "bun:test";
import { throwWorkflowRuntimeCompleteError } from "./workflow-runtime-completion-error";

test.each([
  ["acceptance_required", "WORKFLOW_ACCEPTANCE_REQUIRED"],
  ["acceptance_not_confirmed", "WORKFLOW_ACCEPTANCE_NOT_CONFIRMED"],
  ["procedure_not_completed", "WORKFLOW_PROCEDURE_NOT_COMPLETED"],
] as const)("adapts SQL %s to a stable conflict", (reason, code) => {
  expect(() => throwWorkflowRuntimeCompleteError({ ok: false, reason }))
    .toThrow(expect.objectContaining({ statusCode: 409, code }));
});
