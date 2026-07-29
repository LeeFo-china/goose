import type { OcrRecognitionStatus } from "@gooes/domain";

import { Errors } from "@/errors/error-factory";
import type { Json } from "@/types/database";
import { SupabaseDB } from "@/utils/supabase";

export type VisitorOcrRecognitionRecord = {
  id: string;
  scope_type: "visitor";
  tenant_id: null;
  actor_employee_id: null;
  actor_visitor_id: string;
  scene: string;
  document_type: string;
  provider: string;
  provider_action: string;
  file_object_id: string;
  file_checksum: string | null;
  subject_type: null;
  subject_id: null;
  status: string;
  idempotency_key: string;
  dedupe_key: string;
  result_ciphertext: string | null;
  result_summary: Record<string, unknown>;
  warnings: unknown[];
  quality: Record<string, unknown>;
  provider_request_id: string | null;
  provider_error_code: string | null;
  provider_error_message_safe: string | null;
  billable_units: number;
  duration_ms: number | null;
  provider_started_at: string | null;
  processing_deadline_at: string | null;
  processed_at: string | null;
  expires_at: string;
  created_at: string;
  updated_at: string;
};

export type VisitorOcrClaimInput = {
  actorVisitorId: string;
  fileObjectId: string;
  fileChecksum: string | null;
  idempotencyKey: string;
  requestIpHash: string;
  now: string;
  expiresAt: string;
  processingDeadlineAt: string;
  dailyLimit: number;
  ipWindowSeconds: number;
  ipWindowLimit: number;
  visitorConcurrencyLimit: number;
  globalConcurrencyLimit: number;
};

export type VisitorOcrClaimResult = {
  outcome:
    | "created"
    | "existing"
    | "in_progress"
    | "expired"
    | "idempotency_conflict"
    | "daily_limited"
    | "rate_limited";
  recognition?: VisitorOcrRecognitionRecord;
  retry_after_seconds?: number;
};

type MarkSucceededInput = {
  id: string;
  actorVisitorId: string;
  resultCiphertext: string;
  resultSummary: Record<string, unknown>;
  warnings: readonly unknown[];
  quality: Record<string, unknown>;
  providerRequestId: string | null;
  billableUnits: number;
  durationMs: number;
  processedAt: string;
};

type MarkFailedInput = {
  id: string;
  actorVisitorId: string;
  providerRequestId: string | null;
  providerErrorCode: string | null;
  providerErrorMessageSafe: string;
  durationMs: number;
  processedAt: string;
};

const VISITOR_OCR_COLUMNS = [
  "id",
  "scope_type",
  "tenant_id",
  "actor_employee_id",
  "actor_visitor_id",
  "scene",
  "document_type",
  "provider",
  "provider_action",
  "file_object_id",
  "file_checksum",
  "subject_type",
  "subject_id",
  "status",
  "idempotency_key",
  "dedupe_key",
  "result_ciphertext",
  "result_summary",
  "warnings",
  "quality",
  "provider_request_id",
  "provider_error_code",
  "provider_error_message_safe",
  "billable_units",
  "duration_ms",
  "provider_started_at",
  "processing_deadline_at",
  "processed_at",
  "expires_at",
  "created_at",
  "updated_at",
].join(",");

type AdminClient = ReturnType<typeof SupabaseDB.getAdminClient>;
type UntypedRpcClient = {
  rpc(
    name: string,
    params: Record<string, unknown>,
  ): Promise<{ data: unknown; error: unknown }>;
};

export class VisitorOcrRecognitionRepository {
  constructor(
    private readonly getAdminClient: () => AdminClient = () =>
      SupabaseDB.getAdminClient(),
  ) {}

  async claim(input: VisitorOcrClaimInput): Promise<VisitorOcrClaimResult> {
    const client = this.getAdminClient() as unknown as UntypedRpcClient;
    const { data, error } = await client.rpc("ocr_claim_visitor_recognition", {
      p_actor_visitor_id: input.actorVisitorId,
      p_file_object_id: input.fileObjectId,
      p_file_checksum: input.fileChecksum,
      p_idempotency_key: input.idempotencyKey,
      p_request_ip_hash: input.requestIpHash,
      p_now: input.now,
      p_expires_at: input.expiresAt,
      p_processing_deadline_at: input.processingDeadlineAt,
      p_daily_limit: input.dailyLimit,
      p_ip_window_seconds: input.ipWindowSeconds,
      p_ip_window_limit: input.ipWindowLimit,
      p_visitor_concurrency_limit: input.visitorConcurrencyLimit,
      p_global_concurrency_limit: input.globalConcurrencyLimit,
    });
    if (error) throw Errors.dbError("创建访客OCR识别记录失败", error);
    return parseClaimResult(data);
  }

  async markSucceeded(input: MarkSucceededInput) {
    const { data, error } = await this.getAdminClient()
      .from("ocr_recognitions")
      .update({
        status: "succeeded" satisfies OcrRecognitionStatus,
        result_ciphertext: input.resultCiphertext,
        result_summary: input.resultSummary as Json,
        warnings: [...input.warnings] as Json,
        quality: input.quality as Json,
        provider_request_id: input.providerRequestId,
        provider_error_code: null,
        provider_error_message_safe: null,
        billable_units: input.billableUnits,
        duration_ms: input.durationMs,
        processed_at: input.processedAt,
      } as never)
      .eq("id", input.id)
      .eq("scope_type", "visitor")
      .eq("actor_visitor_id", input.actorVisitorId)
      .eq("status", "processing")
      .select(VISITOR_OCR_COLUMNS)
      .maybeSingle();
    if (error) throw Errors.dbError("保存访客OCR识别结果失败", error);
    if (!data) throw Errors.dbError("访客OCR识别记录状态已变化");
    return data as unknown as VisitorOcrRecognitionRecord;
  }

  async markFailed(input: MarkFailedInput) {
    const { data, error } = await this.getAdminClient()
      .from("ocr_recognitions")
      .update({
        status: "failed" satisfies OcrRecognitionStatus,
        result_ciphertext: null,
        provider_request_id: input.providerRequestId,
        provider_error_code: input.providerErrorCode,
        provider_error_message_safe: input.providerErrorMessageSafe,
        duration_ms: input.durationMs,
        processed_at: input.processedAt,
      } as never)
      .eq("id", input.id)
      .eq("scope_type", "visitor")
      .eq("actor_visitor_id", input.actorVisitorId)
      .eq("status", "processing")
      .select(VISITOR_OCR_COLUMNS)
      .maybeSingle();
    if (error) throw Errors.dbError("保存访客OCR失败状态失败", error);
    return (data as unknown as VisitorOcrRecognitionRecord | null) ?? null;
  }

  async findByIdForVisitor(id: string, visitorId: string) {
    const { data, error } = await this.getAdminClient()
      .from("ocr_recognitions")
      .select(VISITOR_OCR_COLUMNS)
      .eq("id", id)
      .eq("scope_type", "visitor")
      .eq("actor_visitor_id", visitorId)
      .is("tenant_id", null)
      .limit(1)
      .maybeSingle();
    if (error) throw Errors.dbError("查询访客OCR识别记录失败", error);
    return (data as unknown as VisitorOcrRecognitionRecord | null) ?? null;
  }

  async expireProcessingLease(id: string, visitorId: string, now: string) {
    const { data, error } = await this.getAdminClient()
      .from("ocr_recognitions")
      .update({
        status: "failed" satisfies OcrRecognitionStatus,
        result_ciphertext: null,
        provider_error_code: "OCR_PROCESSING_LEASE_EXPIRED",
        provider_error_message_safe: "OCR识别处理超时",
        processed_at: now,
      } as never)
      .eq("id", id)
      .eq("scope_type", "visitor")
      .eq("actor_visitor_id", visitorId)
      .eq("status", "processing")
      .lte("processing_deadline_at", now)
      .select(VISITOR_OCR_COLUMNS)
      .maybeSingle();
    if (error) throw Errors.dbError("释放访客OCR处理租约失败", error);
    return (data as unknown as VisitorOcrRecognitionRecord | null) ?? null;
  }
}

function parseClaimResult(value: unknown): VisitorOcrClaimResult {
  if (!isRecord(value) || !isClaimOutcome(value.outcome)) {
    throw Errors.dbError("访客OCR认领结果无效");
  }
  const recognition = isRecord(value.recognition)
    ? value.recognition as VisitorOcrRecognitionRecord
    : undefined;
  if (
    ["created", "existing", "in_progress", "expired"].includes(value.outcome) &&
    (
      !recognition ||
      recognition.scope_type !== "visitor" ||
      typeof recognition.actor_visitor_id !== "string"
    )
  ) {
    throw Errors.dbError("访客OCR认领记录无效");
  }
  return {
    outcome: value.outcome,
    ...(recognition ? { recognition } : {}),
    ...(Number.isInteger(value.retry_after_seconds)
      ? { retry_after_seconds: Number(value.retry_after_seconds) }
      : {}),
  };
}

function isClaimOutcome(value: unknown): value is VisitorOcrClaimResult["outcome"] {
  return typeof value === "string" && [
    "created",
    "existing",
    "in_progress",
    "expired",
    "idempotency_conflict",
    "daily_limited",
    "rate_limited",
  ].includes(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export const visitorOcrRecognitionRepository =
  new VisitorOcrRecognitionRepository();
