import type { OcrDocumentType } from "@gooes/domain";
import { requestBackendJson } from "@/lib/backend-client";
import type {
  OcrCapabilitiesResult,
  OcrRecognitionResult,
} from "./ocr-types";

export function fetchApplymentOcrCapabilities() {
  return requestBackendJson<OcrCapabilitiesResult>(
    "/ocr/capabilities?scene=wechat_pay_applyment",
    { fallbackMessage: "OCR 可用能力加载失败" },
  );
}

export function createApplymentOcrRecognition(input: {
  documentType: OcrDocumentType;
  fileObjectId: string;
  applymentId?: string | null;
}) {
  return requestBackendJson<OcrRecognitionResult>("/ocr/recognitions", {
    method: "POST",
    body: JSON.stringify({
      scene: "wechat_pay_applyment",
      document_type: input.documentType,
      file_object_id: input.fileObjectId,
      ...(input.applymentId
        ? {
          subject_type: "wechat_pay_applyment",
          subject_id: input.applymentId,
        }
        : {}),
      idempotency_key: crypto.randomUUID(),
    }),
    fallbackMessage: "证照识别失败",
  });
}
