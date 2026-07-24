import type { OcrDocumentType, OcrRecognitionView } from "@gooes/domain";
import { requestBackendJson } from "@/lib/backend-client";
import type {
  OcrCapabilitiesResult,
  OcrRecognitionResult,
} from "./ocr-types";

const OCR_POLL_INTERVAL_MS = 500;
const OCR_POLL_ATTEMPTS = 30;

export function fetchApplymentOcrCapabilities() {
  return requestBackendJson<OcrCapabilitiesResult>(
    "/ocr/capabilities?scene=wechat_pay_applyment",
    { fallbackMessage: "OCR 可用能力加载失败" },
  );
}

export async function createApplymentOcrRecognition(input: {
  documentType: OcrDocumentType;
  fileObjectId: string;
  applymentId?: string | null;
}) {
  const result = await requestBackendJson<OcrRecognitionResult>(
    "/ocr/recognitions",
    {
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
    },
  );
  if (!isOcrRecognitionPending(result.recognition.status)) {
    return assertOcrRecognitionSucceeded(result);
  }
  let recognition = result.recognition;
  for (let attempt = 0; attempt < OCR_POLL_ATTEMPTS; attempt += 1) {
    if (attempt > 0) await delay(OCR_POLL_INTERVAL_MS);
    recognition = await fetchApplymentOcrRecognition(recognition.id);
    if (!isOcrRecognitionPending(recognition.status)) {
      return assertOcrRecognitionSucceeded({ ...result, recognition });
    }
  }
  throw new Error("证照识别仍在处理中，请稍后重试");
}

export function fetchApplymentOcrRecognition(id: string) {
  return requestBackendJson<OcrRecognitionView>(
    `/ocr/recognitions/${encodeURIComponent(id)}`,
    { fallbackMessage: "OCR 识别结果恢复失败" },
  );
}

function isOcrRecognitionPending(status: string) {
  return status === "pending" || status === "processing";
}

function assertOcrRecognitionSucceeded(
  result: OcrRecognitionResult,
): OcrRecognitionResult {
  if (result.recognition.status === "succeeded") return result;
  throw new Error("证照识别失败，请重试");
}

function delay(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}
