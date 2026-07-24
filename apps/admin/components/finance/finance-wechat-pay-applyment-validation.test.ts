import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

function readValidationSource() {
  return readFileSync(
    new URL("./finance-wechat-pay-applyment-validation.ts", import.meta.url),
    "utf8",
  );
}

describe("wechat pay applyment single-page validation", () => {
  test("exposes one whole-form validation entry point", () => {
    const source = readValidationSource();

    expect(source).toContain("export function validateApplymentForm");
    expect(source).toContain("findFirstInvalidApplymentControl(form)");
  });

  test("focuses invalid controls without activating hidden stages", () => {
    const source = readValidationSource();

    expect(source).not.toContain("activateStage");
    expect(source).not.toContain("[data-applyment-stage]");
    expect(source).not.toContain("validateStage");
    expect(source).not.toContain("isStageValid");
    expect(source).toContain("activateOcrCategory");
    expect(source).toContain("invalid.focus()");
    expect(source).toContain("reportValidity");
  });
});
