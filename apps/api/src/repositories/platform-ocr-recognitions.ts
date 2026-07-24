import type {
  OcrDocumentType,
  OcrRecognitionStatus,
  OcrScene,
} from "@gooes/domain";
import { Errors } from "@/errors/error-factory";
import type { Json } from "@/types/database";
import { SupabaseDB } from "@/utils/supabase";

export type PlatformOcrRecognitionRecord = {
  id: string;
  scope_type: "platform";
  tenant_id: string | null;
  actor_employee_id: string | null;
  scene: string;
  document_type: string;
  provider: string;
  provider_action: string;
  file_object_id: string;
  file_checksum: string | null;
  subject_type: string | null;
  subject_id: string | null;
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
  processed_at: string | null;
  expires_at: string;
  created_at: string;
  updated_at: string;
};

export type CreatePlatformOcrRecognitionInput = {
  actorEmployeeId: string;
  scene: OcrScene;
  documentType: OcrDocumentType;
  providerAction: string;
  fileObjectId: string;
  fileChecksum?: string | null;
  idempotencyKey: string;
  dedupeKey: string;
  expiresAt: string;
};

export type MarkPlatformOcrSucceededInput = {
  id: string;
  resultCiphertext: string;
  resultSummary: Record<string, unknown>;
  warnings: readonly unknown[];
  quality: Record<string, unknown>;
  providerRequestId?: string | null;
  billableUnits: number;
  durationMs: number;
  processedAt: string;
};

export type MarkPlatformOcrFailedInput = {
  id: string;
  providerRequestId?: string | null;
  providerErrorCode?: string | null;
  providerErrorMessageSafe?: string | null;
  durationMs: number;
  processedAt: string;
};

const PLATFORM_OCR_COLUMNS = [
  "id",
  "scope_type",
  "tenant_id",
  "actor_employee_id",
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
  "processed_at",
  "expires_at",
  "created_at",
  "updated_at",
].join(",");

type AdminClient = ReturnType<typeof SupabaseDB.getAdminClient>;

export class PlatformOcrRecognitionRepository {
  constructor(
    private readonly getAdminClient: () => AdminClient = () =>
      SupabaseDB.getAdminClient(),
  ) {}

  async createProcessing(input: CreatePlatformOcrRecognitionInput) {
    const { data, error } = await this.getAdminClient()
      .from("ocr_recognitions")
      .insert({
        scope_type: "platform",
        tenant_id: null,
        actor_employee_id: input.actorEmployeeId,
        scene: input.scene,
        document_type: input.documentType,
        provider: "tencent_cloud",
        provider_action: input.providerAction,
        file_object_id: input.fileObjectId,
        file_checksum: input.fileChecksum ?? null,
        subject_type: null,
        subject_id: null,
        status: "processing",
        idempotency_key: input.idempotencyKey,
        dedupe_key: input.dedupeKey,
        expires_at: input.expiresAt,
      } as never)
      .select(PLATFORM_OCR_COLUMNS)
      .maybeSingle();

    if (error) throw Errors.dbError("创建平台OCR识别记录失败", error);
    if (!data) throw Errors.dbError("创建平台OCR识别记录失败");
    return data as unknown as PlatformOcrRecognitionRecord;
  }

  async findByIdempotencyKey(idempotencyKey: string) {
    const { data, error } = await this.getAdminClient()
      .from("ocr_recognitions")
      .select(PLATFORM_OCR_COLUMNS)
      .eq("scope_type", "platform")
      .is("tenant_id", null)
      .eq("idempotency_key", idempotencyKey)
      .limit(1)
      .maybeSingle();

    if (error) throw Errors.dbError("查询平台OCR幂等记录失败", error);
    return (data as unknown as PlatformOcrRecognitionRecord | null) ?? null;
  }

  async findActiveByDedupeKey(dedupeKey: string) {
    const { data, error } = await this.getAdminClient()
      .from("ocr_recognitions")
      .select(PLATFORM_OCR_COLUMNS)
      .eq("scope_type", "platform")
      .is("tenant_id", null)
      .eq("dedupe_key", dedupeKey)
      .in("status", ["processing", "succeeded"])
      .limit(1)
      .maybeSingle();

    if (error) throw Errors.dbError("查询平台OCR去重记录失败", error);
    return (data as unknown as PlatformOcrRecognitionRecord | null) ?? null;
  }

  async expireStaleByDedupeKey(input: { dedupeKey: string; before: string }) {
    const { error } = await this.getAdminClient()
      .from("ocr_recognitions")
      .update({ status: "expired", result_ciphertext: null } as never)
      .eq("scope_type", "platform")
      .is("tenant_id", null)
      .eq("dedupe_key", input.dedupeKey)
      .in("status", ["processing", "succeeded"])
      .lte("expires_at", input.before)
      .select("id");

    if (error) throw Errors.dbError("释放平台OCR过期去重记录失败", error);
  }

  async countPlatformSince(since: string) {
    const { count, error } = await this.getAdminClient()
      .from("ocr_recognitions")
      .select("id", { count: "exact", head: true })
      .eq("scope_type", "platform")
      .is("tenant_id", null)
      .gte("created_at", since);

    if (error) throw Errors.dbError("统计平台OCR调用量失败", error);
    return count ?? 0;
  }

  async markSucceeded(input: MarkPlatformOcrSucceededInput) {
    const { data, error } = await this.getAdminClient()
      .from("ocr_recognitions")
      .update({
        status: "succeeded" satisfies OcrRecognitionStatus,
        result_ciphertext: input.resultCiphertext,
        result_summary: input.resultSummary as Json,
        warnings: [...input.warnings] as Json,
        quality: input.quality as Json,
        provider_request_id: input.providerRequestId ?? null,
        provider_error_code: null,
        provider_error_message_safe: null,
        billable_units: input.billableUnits,
        duration_ms: input.durationMs,
        processed_at: input.processedAt,
      } as never)
      .eq("id", input.id)
      .eq("scope_type", "platform")
      .is("tenant_id", null)
      .eq("status", "processing")
      .select(PLATFORM_OCR_COLUMNS)
      .maybeSingle();

    if (error) throw Errors.dbError("保存平台OCR识别结果失败", error);
    if (!data) throw Errors.dbError("平台OCR识别记录状态已变化");
    return data as unknown as PlatformOcrRecognitionRecord;
  }

  async markFailed(input: MarkPlatformOcrFailedInput) {
    const { data, error } = await this.getAdminClient()
      .from("ocr_recognitions")
      .update({
        status: "failed" satisfies OcrRecognitionStatus,
        result_ciphertext: null,
        provider_request_id: input.providerRequestId ?? null,
        provider_error_code: input.providerErrorCode ?? null,
        provider_error_message_safe: input.providerErrorMessageSafe ?? null,
        duration_ms: input.durationMs,
        processed_at: input.processedAt,
      } as never)
      .eq("id", input.id)
      .eq("scope_type", "platform")
      .is("tenant_id", null)
      .eq("status", "processing")
      .select(PLATFORM_OCR_COLUMNS)
      .maybeSingle();

    if (error) throw Errors.dbError("保存平台OCR失败状态失败", error);
    return (data as unknown as PlatformOcrRecognitionRecord | null) ?? null;
  }

  async findByIdForEmployee(id: string, employeeId: string) {
    const { data, error } = await this.getAdminClient()
      .from("ocr_recognitions")
      .select(PLATFORM_OCR_COLUMNS)
      .eq("id", id)
      .eq("scope_type", "platform")
      .is("tenant_id", null)
      .eq("actor_employee_id", employeeId)
      .limit(1)
      .maybeSingle();

    if (error) throw Errors.dbError("查询平台OCR识别记录失败", error);
    return (data as unknown as PlatformOcrRecognitionRecord | null) ?? null;
  }
}

export const platformOcrRecognitionRepository =
  new PlatformOcrRecognitionRepository();
