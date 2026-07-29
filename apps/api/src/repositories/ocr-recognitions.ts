import type {
  OcrDocumentType,
  OcrRecognitionStatus,
  OcrScene,
} from "@gooes/domain";

import { Errors } from "@/errors/error-factory";
import type { Database, Json } from "@/types/database";
import { SupabaseDB } from "@/utils/supabase";

type OcrRecognitionRow =
  Database["public"]["Tables"]["ocr_recognitions"]["Row"];
export type OcrRecognitionOwnershipRecord = Pick<
  OcrRecognitionRow,
  | "id"
  | "tenant_id"
  | "scene"
  | "document_type"
  | "file_object_id"
  | "subject_type"
  | "subject_id"
  | "status"
>;

type AdminClient = ReturnType<typeof SupabaseDB.getAdminClient>;

const OCR_RECOGNITION_COLUMNS = [
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

const OCR_PLATFORM_LIST_COLUMNS = [
  "id",
  "scope_type",
  "tenant_id",
  "actor_employee_id",
  "scene",
  "document_type",
  "provider",
  "provider_action",
  "file_object_id",
  "subject_type",
  "subject_id",
  "status",
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

export type CreateOcrRecognitionInput = {
  tenantId: string;
  actorEmployeeId?: string | null;
  scene: OcrScene;
  documentType: OcrDocumentType;
  providerAction: string;
  fileObjectId: string;
  fileChecksum?: string | null;
  subjectType?: string | null;
  subjectId?: string | null;
  idempotencyKey: string;
  dedupeKey: string;
  expiresAt: string;
};

export type MarkOcrRecognitionSucceededInput = {
  id: string;
  tenantId: string;
  resultCiphertext: string;
  resultSummary: Record<string, unknown>;
  warnings: readonly unknown[];
  quality: Record<string, unknown>;
  providerRequestId?: string | null;
  billableUnits: number;
  durationMs: number;
  processedAt: string;
};

export type MarkOcrRecognitionFailedInput = {
  id: string;
  tenantId: string;
  providerRequestId?: string | null;
  providerErrorCode?: string | null;
  providerErrorMessageSafe?: string | null;
  durationMs: number;
  processedAt: string;
};

export type OcrPlatformListInput = {
  page: number;
  pageSize: number;
  status?: OcrRecognitionStatus;
  documentType?: OcrDocumentType;
  tenantId?: string;
};

export class OcrRecognitionRepository {
  constructor(
    private readonly getAdminClient: () => AdminClient = () =>
      SupabaseDB.getAdminClient(),
  ) {}

  async createProcessing(input: CreateOcrRecognitionInput) {
    const { data, error } = await this.getAdminClient()
      .from("ocr_recognitions")
      .insert({
        scope_type: "tenant",
        tenant_id: input.tenantId,
        actor_employee_id: input.actorEmployeeId ?? null,
        scene: input.scene,
        document_type: input.documentType,
        provider: "tencent_cloud",
        provider_action: input.providerAction,
        file_object_id: input.fileObjectId,
        file_checksum: input.fileChecksum ?? null,
        subject_type: input.subjectType ?? null,
        subject_id: input.subjectId ?? null,
        status: "processing",
        idempotency_key: input.idempotencyKey,
        dedupe_key: input.dedupeKey,
        expires_at: input.expiresAt,
      })
      .select(OCR_RECOGNITION_COLUMNS)
      .maybeSingle();

    if (error) throw Errors.dbError("创建OCR识别记录失败", error);
    if (!data) throw Errors.dbError("创建OCR识别记录失败");
    return data as unknown as OcrRecognitionRow;
  }

  async findByTenantAndIdempotencyKey(
    tenantId: string,
    idempotencyKey: string,
  ) {
    const { data, error } = await this.getAdminClient()
      .from("ocr_recognitions")
      .select(OCR_RECOGNITION_COLUMNS)
      .eq("scope_type", "tenant")
      .eq("tenant_id", tenantId)
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();

    if (error) throw Errors.dbError("查询OCR幂等记录失败", error);
    return (data as OcrRecognitionRow | null) ?? null;
  }

  async findActiveByDedupeKey(tenantId: string, dedupeKey: string) {
    const { data, error } = await this.getAdminClient()
      .from("ocr_recognitions")
      .select(OCR_RECOGNITION_COLUMNS)
      .eq("scope_type", "tenant")
      .eq("tenant_id", tenantId)
      .eq("dedupe_key", dedupeKey)
      .in("status", ["processing", "succeeded"])
      .maybeSingle();

    if (error) throw Errors.dbError("查询OCR去重记录失败", error);
    return (data as OcrRecognitionRow | null) ?? null;
  }

  async expireStaleByDedupeKey(input: {
    tenantId: string;
    dedupeKey: string;
    before: string;
  }) {
    const { error } = await this.getAdminClient()
      .from("ocr_recognitions")
      .update({ status: "expired", result_ciphertext: null })
      .eq("scope_type", "tenant")
      .eq("tenant_id", input.tenantId)
      .eq("dedupe_key", input.dedupeKey)
      .in("status", ["processing", "succeeded"])
      .lte("expires_at", input.before)
      .select("id");

    if (error) throw Errors.dbError("释放OCR过期去重记录失败", error);
  }

  async markSucceeded(input: MarkOcrRecognitionSucceededInput) {
    const { data, error } = await this.getAdminClient()
      .from("ocr_recognitions")
      .update({
        status: "succeeded",
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
      })
      .eq("id", input.id)
      .eq("scope_type", "tenant")
      .eq("tenant_id", input.tenantId)
      .eq("status", "processing")
      .select(OCR_RECOGNITION_COLUMNS)
      .maybeSingle();

    if (error) throw Errors.dbError("保存OCR识别结果失败", error);
    if (!data) throw Errors.dbError("OCR识别记录状态已变化");
    return data as unknown as OcrRecognitionRow;
  }

  async markFailed(input: MarkOcrRecognitionFailedInput) {
    const { data, error } = await this.getAdminClient()
      .from("ocr_recognitions")
      .update({
        status: "failed",
        result_ciphertext: null,
        provider_request_id: input.providerRequestId ?? null,
        provider_error_code: input.providerErrorCode ?? null,
        provider_error_message_safe: input.providerErrorMessageSafe ?? null,
        duration_ms: input.durationMs,
        processed_at: input.processedAt,
      })
      .eq("id", input.id)
      .eq("scope_type", "tenant")
      .eq("tenant_id", input.tenantId)
      .eq("status", "processing")
      .select(OCR_RECOGNITION_COLUMNS)
      .maybeSingle();

    if (error) throw Errors.dbError("保存OCR失败状态失败", error);
    return (data as OcrRecognitionRow | null) ?? null;
  }

  async findByIdForTenant(id: string, tenantId: string) {
    const { data, error } = await this.getAdminClient()
      .from("ocr_recognitions")
      .select(OCR_RECOGNITION_COLUMNS)
      .eq("scope_type", "tenant")
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (error) throw Errors.dbError("查询OCR识别记录失败", error);
    return (data as OcrRecognitionRow | null) ?? null;
  }

  async findByIdsForTenant(input: {
    ids: string[];
    tenantId: string;
    limit: number;
  }): Promise<OcrRecognitionOwnershipRecord[]> {
    const limit = Math.min(Math.max(input.limit, 1), 20);
    const ids = [...new Set(input.ids)].slice(0, limit);
    if (ids.length === 0) return [];
    const { data, error } = await this.getAdminClient()
      .from("ocr_recognitions")
      .select(
        "id,scope_type,tenant_id,scene,document_type,file_object_id,subject_type,subject_id,status",
      )
      .eq("scope_type", "tenant")
      .eq("tenant_id", input.tenantId)
      .in("id", ids)
      .limit(limit);

    if (error) throw Errors.dbError("查询OCR识别记录归属失败", error);
    return (data ?? []) as OcrRecognitionOwnershipRecord[];
  }

  async countTenantSince(tenantId: string, since: string) {
    const { count, error } = await this.getAdminClient()
      .from("ocr_recognitions")
      .select("id", { count: "exact", head: true })
      .eq("scope_type", "tenant")
      .eq("tenant_id", tenantId)
      .gte("created_at", since);

    if (error) throw Errors.dbError("统计租户OCR调用量失败", error);
    return count ?? 0;
  }

  async listPlatform(input: OcrPlatformListInput) {
    const from = (input.page - 1) * input.pageSize;
    const to = from + input.pageSize - 1;
    let query = this.getAdminClient()
      .from("ocr_recognitions")
      .select(OCR_PLATFORM_LIST_COLUMNS, { count: "exact" });

    if (input.status) query = query.eq("status", input.status);
    if (input.documentType) {
      query = query.eq("document_type", input.documentType);
    }
    if (input.tenantId) query = query.eq("tenant_id", input.tenantId);

    const { data, error, count } = await query
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) throw Errors.dbError("查询平台OCR记录失败", error);
    const total = count ?? 0;
    return {
      list: data ?? [],
      pagination: {
        page: input.page,
        pageSize: input.pageSize,
        total,
        totalPages: Math.ceil(total / input.pageSize),
      },
    };
  }

  async expireResultsBefore(input: {
    before: string;
    limit: number;
    apply: boolean;
  }) {
    const limit = Math.min(Math.max(input.limit, 1), 500);
    const { data, error } = await this.getAdminClient()
      .from("ocr_recognitions")
      .select("id,expires_at")
      .in("status", ["processing", "succeeded", "failed"])
      .lte("expires_at", input.before)
      .order("expires_at", { ascending: true })
      .limit(limit);

    if (error) throw Errors.dbError("查询OCR过期结果失败", error);
    const candidates = data ?? [];
    const oldestExpiresAt = candidates[0]?.expires_at ?? null;
    if (!input.apply || candidates.length === 0) {
      return {
        candidateCount: candidates.length,
        expiredCount: 0,
        oldestExpiresAt,
      };
    }

    const ids = candidates.map((item) => item.id);
    const { data: expired, error: updateError } = await this.getAdminClient()
      .from("ocr_recognitions")
      .update({
        status: "expired",
        result_ciphertext: null,
      })
      .in("id", ids)
      .in("status", ["processing", "succeeded", "failed"])
      .lte("expires_at", input.before)
      .select("id");

    if (updateError) throw Errors.dbError("清理OCR过期结果失败", updateError);
    return {
      candidateCount: candidates.length,
      expiredCount: expired?.length ?? 0,
      oldestExpiresAt,
    };
  }
}

export const ocrRecognitionRepository = new OcrRecognitionRepository();
