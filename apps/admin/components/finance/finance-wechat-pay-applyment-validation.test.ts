import { describe, expect, test } from "bun:test";

import {
  revealInvalidApplymentControl,
} from "./finance-wechat-pay-applyment-validation";

describe("wechat pay applyment invalid control activation", () => {
  test("activates the hidden OCR category before focusing and reporting", () => {
    const events: string[] = [];
    let scheduled: (() => void) | undefined;

    const valid = revealInvalidApplymentControl({
      control: {
        step: "attachments",
        ocrCategory: "legal_representative_id_card_back",
        focus: () => events.push("focus"),
      },
      activateStep: (step) => events.push(`step:${step}`),
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
      "step:attachments",
      "category:legal_representative_id_card_back",
    ]);
    scheduled?.();
    expect(events).toEqual([
      "step:attachments",
      "category:legal_representative_id_card_back",
      "focus",
      "report",
    ]);
  });
});
