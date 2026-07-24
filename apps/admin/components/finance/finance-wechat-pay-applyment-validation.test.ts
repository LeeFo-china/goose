import { describe, expect, test } from "bun:test";

import { validateApplymentForm } from "./finance-wechat-pay-applyment-validation";

describe("wechat pay applyment single-page validation", () => {
  test("returns true when the complete single-page form is valid", () => {
    const form = {
      querySelector: () => null,
    } as unknown as HTMLFormElement;

    expect(validateApplymentForm(
      form,
      () => {
        throw new Error("有效表单不应调度聚焦");
      },
    )).toBe(true);
  });

  test("focuses and reports the first invalid control", () => {
    const calls: string[] = [];
    const invalidControl = {
      focus: () => calls.push("focus"),
      reportValidity: () => calls.push("reportValidity"),
    };
    const form = {
      querySelector: (selector: string) => {
        expect(selector).toBe(":invalid");
        return invalidControl;
      },
    } as unknown as HTMLFormElement;

    const valid = validateApplymentForm(
      form,
      (callback) => {
        calls.push("schedule");
        callback();
      },
    );

    expect(valid).toBe(false);
    expect(calls).toEqual([
      "schedule",
      "focus",
      "reportValidity",
    ]);
  });
});
