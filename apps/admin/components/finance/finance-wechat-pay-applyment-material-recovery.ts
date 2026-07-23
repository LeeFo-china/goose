import { mapApplymentOcrFields } from "@/components/ocr/ocr-field-review-dialog";
import { fetchApplymentOcrRecognition } from "@/components/ocr/ocr-requests";
import {
  buildFailedMaterialState,
  buildRecoveredMaterialState,
  getOcrMaterialCategory,
  type ApplymentMaterialState,
} from "./finance-wechat-pay-applyment-flow-model";
import type {
  WechatPayApplymentAttachment,
} from "./finance-wechat-pay-applyment-shared";

export async function restoreApplymentMaterialStates(input: {
  attachments: readonly WechatPayApplymentAttachment[];
  isActive: () => boolean;
  onState: (
    attachment: WechatPayApplymentAttachment,
    state: ApplymentMaterialState,
  ) => void;
  onError: (message: string) => void;
}) {
  for (const attachment of input.attachments) {
    if (
      !input.isActive() ||
      attachment.ocr_review_status !== "review_required" ||
      !attachment.ocr_recognition_id
    ) {
      continue;
    }
    const category = getOcrMaterialCategory(attachment);
    if (!category) continue;
    try {
      const recognition = await fetchApplymentOcrRecognition(
        attachment.ocr_recognition_id,
      );
      if (!input.isActive()) return;
      if (recognition.status !== "succeeded") {
        throw new Error(
          recognition.status === "expired"
            ? "识别结果已过期，请重试或手动填写"
            : "识别结果不可用，请重试或手动填写",
        );
      }
      input.onState(
        attachment,
        buildRecoveredMaterialState(
          attachment,
          recognition,
          mapApplymentOcrFields(category, recognition.fields),
        ),
      );
    } catch (error) {
      if (!input.isActive()) return;
      const message = getErrorMessage(error, "OCR 识别结果恢复失败");
      input.onState(attachment, buildFailedMaterialState(attachment, message));
      input.onError(message);
    }
  }
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}
