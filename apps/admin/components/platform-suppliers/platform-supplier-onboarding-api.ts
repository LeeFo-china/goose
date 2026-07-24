import type { OcrRecognitionView } from "@gooes/domain";
import { requestBackendJson } from "@/lib/backend-client";
import { normalizeCreditCode } from "./platform-supplier-onboarding-rules";

const OCR_POLL_INTERVAL_MS = 500;
const OCR_POLL_ATTEMPTS = 30;

export type IdentityCheckResult = {
  exists: boolean;
  supplier: { id: string; code: string; name: string } | null;
};

type OcrCreateResult = {
  recognition: OcrRecognitionView;
  idempotent: boolean;
  cached: boolean;
};

export async function recognizeSupplierLicense(fileObjectId: string) {
  const created = await requestBackendJson<OcrCreateResult>(
    "/platform/ocr/recognitions",
    {
      method: "POST",
      body: JSON.stringify({
        scene: "supplier_onboarding",
        document_type: "business_license",
        file_object_id: fileObjectId,
        idempotency_key: crypto.randomUUID(),
      }),
      fallbackMessage: "营业执照识别失败",
    },
  );
  if (!isPendingRecognition(created.recognition.status)) {
    return assertRecognitionSucceeded(created.recognition);
  }
  for (let attempt = 0; attempt < OCR_POLL_ATTEMPTS; attempt += 1) {
    if (attempt > 0) await delay(OCR_POLL_INTERVAL_MS);
    const recognition = await fetchSupplierOcrResult(created.recognition.id);
    if (!isPendingRecognition(recognition.status)) {
      return assertRecognitionSucceeded(recognition);
    }
  }
  throw new Error("营业执照识别仍在处理中，请稍后重试");
}

export function checkSupplierIdentity(creditCode: string) {
  const query = new URLSearchParams({
    unified_social_credit_code: normalizeCreditCode(creditCode),
  });
  return requestBackendJson<IdentityCheckResult>(
    `/platform/suppliers/identity-check?${query.toString()}`,
    { fallbackMessage: "供应商查重失败" },
  );
}

function fetchSupplierOcrResult(id: string) {
  return requestBackendJson<OcrRecognitionView>(
    `/platform/ocr/recognitions/${encodeURIComponent(id)}/result`,
    { fallbackMessage: "营业执照识别结果恢复失败" },
  );
}

function assertRecognitionSucceeded(recognition: OcrRecognitionView) {
  if (recognition.status === "succeeded") return recognition;
  throw new Error("营业执照识别失败，请重试或手动录入");
}

function isPendingRecognition(status: OcrRecognitionView["status"]) {
  return status === "pending" || status === "processing";
}

function delay(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}
