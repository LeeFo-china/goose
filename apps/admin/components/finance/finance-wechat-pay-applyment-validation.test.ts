import { describe, expect, test } from "bun:test";

import {
  isStageValid,
  revealInvalidApplymentControl,
  validateAllStages,
  validateStage,
} from "./finance-wechat-pay-applyment-validation";

describe("wechat pay applyment invalid control activation", () => {
  test("activates the hidden OCR category before focusing and reporting", () => {
    const events: string[] = [];
    let scheduled: (() => void) | undefined;

    const valid = revealInvalidApplymentControl({
      control: {
        stage: "recognition",
        ocrCategory: "legal_representative_id_card_back",
        focus: () => events.push("focus"),
      },
      activateStage: (stage) => events.push(`stage:${stage}`),
      activateOcrCategory: (category) => events.push(`category:${category}`),
      reportValidity: () => {
        events.push("report");
      },
      schedule: (callback) => {
        scheduled = callback;
      },
    });

    expect(valid).toBe(false);
    expect(events).toEqual([
      "stage:recognition",
      "category:legal_representative_id_card_back",
    ]);
    scheduled?.();
    expect(events).toEqual([
      "stage:recognition",
      "category:legal_representative_id_card_back",
      "focus",
      "report",
    ]);
  });

  test("validates only the requested stage", () => {
    const selectors: string[] = [];
    const stage = {
      querySelector: (selector: string) => {
        selectors.push(selector);
        return null;
      },
    };
    const form = {
      querySelector: (selector: string) => {
        selectors.push(selector);
        return stage;
      },
    } as unknown as HTMLFormElement;

    expect(validateStage(
      form,
      "supplement",
      () => undefined,
      () => undefined,
    )).toBe(true);
    expect(selectors).toEqual([
      '[data-applyment-stage="supplement"]',
      ":invalid",
    ]);
  });

  test("checks stage validity without activating hidden controls", () => {
    let invalid: HTMLElement | null = {} as HTMLElement;
    const stage = {
      querySelector: () => invalid,
    };
    const form = {
      querySelector: () => stage,
    } as unknown as HTMLFormElement;

    expect(isStageValid(form, "supplement")).toBe(false);
    invalid = null;
    expect(isStageValid(form, "supplement")).toBe(true);
  });

  test("all-stage validation reports only the first hidden invalid control", () => {
    const events: string[] = [];
    let scheduled: (() => void) | undefined;
    const firstInvalid = {
      closest: (selector: string) => {
        if (selector === "[data-applyment-stage]") {
          return { dataset: { applymentStage: "recognition" } };
        }
        if (selector === "[data-ocr-category]") {
          return {
            dataset: {
              ocrCategory: "legal_representative_id_card_front",
            },
          };
        }
        return null;
      },
      focus: () => events.push("focus:first"),
      reportValidity: () => {
        events.push("report:first");
        return false;
      },
    } as unknown as HTMLInputElement;
    const secondInvalid = {
      focus: () => events.push("focus:second"),
      reportValidity: () => {
        events.push("report:second");
        return false;
      },
    } as unknown as HTMLInputElement;
    const form = {
      querySelector: () => firstInvalid,
      querySelectorAll: () => [firstInvalid, secondInvalid],
      reportValidity: () => {
        throw new Error("form.reportValidity must not run");
      },
    } as unknown as HTMLFormElement;

    expect(validateAllStages(
      form,
      (stage) => events.push(`stage:${stage}`),
      (category) => events.push(`category:${category}`),
      (callback) => {
        scheduled = callback;
      },
    )).toBe(false);
    expect(events).toEqual([
      "stage:recognition",
      "category:legal_representative_id_card_front",
    ]);
    scheduled?.();
    expect(events).toEqual([
      "stage:recognition",
      "category:legal_representative_id_card_front",
      "focus:first",
      "report:first",
    ]);
  });
});
