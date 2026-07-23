import { describe, expect, test } from "bun:test";
import { buildInitialMaterialStates } from "./finance-wechat-pay-applyment-flow-model";
import { changeApplymentAttachments } from "./finance-wechat-pay-applyment-manual-entry";
import { changeApplymentContactTypeWithRollback } from "./finance-wechat-pay-applyment-contact-type";
import type {
  WechatPayApplymentAttachment,
  WechatPayApplymentAttachmentCategory,
} from "./finance-wechat-pay-applyment-shared";

function attachment(
  category: WechatPayApplymentAttachmentCategory,
): WechatPayApplymentAttachment {
  return {
    category,
    object_key: `tenant/${category}.jpg`,
    ocr_review_status: "confirmed",
  };
}

describe("wechat pay applyment attachment changes", () => {
  test("rolls back a deleted attachment when persistence fails", async () => {
    const license = attachment("license_copy");
    const baselineStates = buildInitialMaterialStates([license]);
    let currentAttachments: WechatPayApplymentAttachment[] = [license];
    let currentStates = baselineStates;
    let reportedError = "";

    await expect(changeApplymentAttachments({
      currentAttachments,
      currentStates,
      nextAttachments: [],
      commitLocal: (attachments, states) => {
        currentAttachments = attachments;
        currentStates = states;
      },
      getCurrentStates: () => currentStates,
      commitStates: (states) => {
        currentStates = states;
      },
      enqueue: (operation) => operation(),
      isActive: () => true,
      persist: async () => {
        throw new Error("save unavailable");
      },
      clearError: () => undefined,
      reportError: () => undefined,
      reportOperationError: (error) => {
        reportedError = error instanceof Error ? error.message : "failed";
      },
    })).rejects.toThrow("save unavailable");

    expect(currentAttachments).toEqual([license]);
    expect(currentStates).toEqual(baselineStates);
    expect(reportedError).toBe("save unavailable");
  });

  test("rolls back SUPER contact type when contact deletion fails", async () => {
    const contact = attachment("contact_id_card_front");
    const committedTypes: string[] = [];
    let reportedError = "";

    await expect(changeApplymentContactTypeWithRollback({
      currentType: "SUPER",
      nextType: "LEGAL",
      attachments: [contact],
      commitType: (value) => {
        committedTypes.push(value);
      },
      changeAttachments: async (nextAttachments) => {
        expect(nextAttachments).toEqual([]);
        throw new Error("save unavailable");
      },
      reportError: (message) => {
        reportedError = message;
      },
    })).rejects.toThrow("save unavailable");

    expect(committedTypes).toEqual(["LEGAL", "SUPER"]);
    expect(reportedError).toBe("save unavailable");
  });
});
