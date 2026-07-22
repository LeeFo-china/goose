import { createHash } from "node:crypto";

import type { OcrDocumentType, OcrScene } from "@gooes/domain";

import { ErrorCodes } from "@/errors/error-codes";
import { Errors } from "@/errors/error-factory";
import type { OcrPlatformFileObjectRecord } from "@/repositories/platform-file-objects";
import type { Database } from "@/types/database";

type OcrRecognitionRecord =
  Database["public"]["Tables"]["ocr_recognitions"]["Row"];

export type OcrRecognizeRequestIdentity = {
  scene: OcrScene;
  document_type: OcrDocumentType;
  file_object_id: string;
  subject_type?: string | null;
  subject_id?: string | null;
};

export function assertOcrIdempotencyMatches(
  recognition: OcrRecognitionRecord,
  input: OcrRecognizeRequestIdentity,
) {
  if (
    recognition.scene === input.scene &&
    recognition.document_type === input.document_type &&
    recognition.file_object_id === input.file_object_id &&
    (recognition.subject_type ?? null) === (input.subject_type ?? null) &&
    (recognition.subject_id ?? null) === (input.subject_id ?? null)
  ) return;
  throw Errors.business(
    409,
    "幂等键已用于其他OCR请求",
    ErrorCodes.OCR_IDEMPOTENCY_CONFLICT,
  );
}

export async function assertOcrRecognitionReadAccess(input: {
  recognition: OcrRecognitionRecord;
  tenantId: string;
  employeeId: string;
  findApplyment: (input: {
    id: string;
    tenantId?: string;
  }) => Promise<{ tenant_id: string } | null>;
}) {
  const { recognition } = input;
  if (!recognition.subject_type && !recognition.subject_id) {
    if (recognition.actor_employee_id === input.employeeId) return;
    throwReadAccessDenied();
  }
  if (
    recognition.subject_type !== "wechat_pay_applyment" ||
    !recognition.subject_id
  ) throwReadAccessDenied();
  const applyment = await input.findApplyment({
    id: recognition.subject_id,
    tenantId: input.tenantId,
  });
  if (!applyment || applyment.tenant_id !== input.tenantId) {
    throwReadAccessDenied();
  }
}

export function validateOcrFile(
  file: OcrPlatformFileObjectRecord,
  scene: OcrScene,
  mimeTypes: readonly string[],
  maxSize: number,
) {
  if (file.scene !== scene) {
    throw Errors.business(400, "文件业务场景不匹配", ErrorCodes.OCR_FILE_ACCESS_DENIED);
  }
  if (!mimeTypes.includes(file.mime_type)) {
    throw Errors.business(400, "OCR文件格式不支持", ErrorCodes.OCR_FILE_FORMAT_UNSUPPORTED);
  }
  if (file.size_bytes > maxSize) {
    throw Errors.business(400, "OCR文件过大", ErrorCodes.OCR_FILE_TOO_LARGE);
  }
}

export function buildOcrDedupeKey(input: {
  tenantId: string;
  fileIdentity: string;
  documentType: OcrDocumentType;
  providerAction: string;
}) {
  return createHash("sha256").update([
    input.tenantId,
    input.fileIdentity,
    input.documentType,
    input.providerAction,
  ].join(":"), "utf8").digest("hex");
}

function throwReadAccessDenied(): never {
  throw Errors.business(
    403,
    "无权读取OCR识别结果",
    ErrorCodes.OCR_FILE_ACCESS_DENIED,
  );
}
