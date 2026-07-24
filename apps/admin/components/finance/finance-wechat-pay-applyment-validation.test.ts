import { describe, expect, test } from "bun:test";

type ValidateApplymentForm = (
  form: HTMLFormElement,
  activateOcrCategory: (category: string) => void,
  schedule?: (callback: () => void) => void,
) => boolean;

async function getValidateApplymentForm(): Promise<ValidateApplymentForm> {
  const validation = await import("./finance-wechat-pay-applyment-validation");
  const candidate = (
    validation as typeof validation & {
      validateApplymentForm?: ValidateApplymentForm;
    }
  ).validateApplymentForm;
  if (typeof candidate !== "function") {
    throw new Error("validateApplymentForm 尚未实现");
  }
  return candidate;
}

describe("wechat pay applyment single-page validation", () => {
  test("returns true when the complete single-page form is valid", async () => {
    const validateApplymentForm = await getValidateApplymentForm();
    const form = {
      querySelector: () => null,
    } as unknown as HTMLFormElement;

    expect(validateApplymentForm(
      form,
      () => {
        throw new Error("有效表单不应激活 OCR 类别");
      },
      () => {
        throw new Error("有效表单不应调度聚焦");
      },
    )).toBe(true);
  });

  test("reveals, focuses, and reports the first invalid OCR control", async () => {
    const validateApplymentForm = await getValidateApplymentForm();
    const calls: string[] = [];
    const invalidControl = {
      closest: (selector: string) =>
        selector === "[data-ocr-category]"
          ? { dataset: { ocrCategory: "legal_representative_id_card_front" } }
          : null,
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
      (category) => calls.push(`activate:${category}`),
      (callback) => {
        calls.push("schedule");
        callback();
      },
    );

    expect(valid).toBe(false);
    expect(calls).toEqual([
      "activate:legal_representative_id_card_front",
      "schedule",
      "focus",
      "reportValidity",
    ]);
  });
});
