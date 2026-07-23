import type { OcrTenantPolicyDocumentType } from "@gooes/domain";

import { Errors } from "@/errors/error-factory";
import { SupabaseDB } from "@/utils/supabase";

type QueryResult = {
  data: unknown;
  error: unknown;
  count?: number | null;
};

type UntypedQuery = PromiseLike<QueryResult> & {
  select(columns: string, options?: { count: "exact" }): UntypedQuery;
  eq(column: string, value: unknown): UntypedQuery;
  or(filters: string): UntypedQuery;
  order(column: string, options: { ascending: boolean }): UntypedQuery;
  range(from: number, to: number): UntypedQuery;
  upsert(
    values: Record<string, unknown>,
    options: { onConflict: string },
  ): UntypedQuery;
  maybeSingle(): Promise<QueryResult>;
};

type UntypedClient = {
  from(table: string): UntypedQuery;
};

export type OcrTenantPolicyRecord = {
  tenant_id: string;
  enabled: boolean;
  allowed_document_types: OcrTenantPolicyDocumentType[];
  daily_limit: number | null;
  remark: string | null;
  enabled_at: string | null;
  updated_by_employee_id: string | null;
  created_at: string;
  updated_at: string;
};

export type PlatformOcrTenantPolicyRecord = Omit<
  OcrTenantPolicyRecord,
  "created_at" | "updated_at"
> & {
  tenant_name: string;
  tenant_slug: string;
  tenant_status: string;
  configured: boolean;
  created_at: string | null;
  updated_at: string | null;
};

export type OcrTenantPolicyPlatformListInput = {
  page: number;
  pageSize: number;
  keyword?: string;
  enabled?: boolean;
};

export type UpsertOcrTenantPolicyInput = {
  tenantId: string;
  enabled: boolean;
  allowedDocumentTypes: OcrTenantPolicyDocumentType[];
  dailyLimit: number | null;
  remark: string | null;
  enabledAt: string | null;
  updatedByEmployeeId: string | null;
};

const POLICY_COLUMNS = [
  "tenant_id",
  "enabled",
  "allowed_document_types",
  "daily_limit",
  "remark",
  "enabled_at",
  "updated_by_employee_id",
  "created_at",
  "updated_at",
].join(",");

const PLATFORM_POLICY_COLUMNS = [
  "tenant_id",
  "tenant_name",
  "tenant_slug",
  "tenant_status",
  "configured",
  "enabled",
  "allowed_document_types",
  "daily_limit",
  "remark",
  "enabled_at",
  "updated_by_employee_id",
  "created_at",
  "updated_at",
].join(",");

export class OcrTenantPolicyRepository {
  constructor(
    private readonly getAdminClient: () => UntypedClient = () =>
      SupabaseDB.getAdminClient() as unknown as UntypedClient,
  ) {}

  async listPlatform(input: OcrTenantPolicyPlatformListInput) {
    const from = (input.page - 1) * input.pageSize;
    const to = from + input.pageSize - 1;
    let query = this.getAdminClient()
      .from("platform_ocr_tenant_policy_overview")
      .select(PLATFORM_POLICY_COLUMNS, { count: "exact" });

    if (input.enabled !== undefined) query = query.eq("enabled", input.enabled);
    const keyword = sanitizeKeyword(input.keyword);
    if (keyword) {
      query = query.or(
        `tenant_name.ilike.%${keyword}%,tenant_slug.ilike.%${keyword}%`,
      );
    }

    const { data, error, count } = await query
      .order("tenant_name", { ascending: true })
      .range(from, to);
    if (error) throw Errors.dbError("查询OCR租户灰度策略失败", error);

    const total = count ?? 0;
    return {
      list: (data ?? []) as PlatformOcrTenantPolicyRecord[],
      pagination: {
        page: input.page,
        pageSize: input.pageSize,
        total,
        totalPages: Math.ceil(total / input.pageSize),
      },
    };
  }

  async findByTenantId(tenantId: string) {
    const { data, error } = await this.getAdminClient()
      .from("ocr_tenant_policies")
      .select(POLICY_COLUMNS)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (error) throw Errors.dbError("查询OCR租户灰度策略失败", error);
    return (data as OcrTenantPolicyRecord | null) ?? null;
  }

  async findTenantById(tenantId: string) {
    const { data, error } = await this.getAdminClient()
      .from("tenants")
      .select("id,name,status")
      .eq("id", tenantId)
      .maybeSingle();
    if (error) throw Errors.dbError("查询租户失败", error);
    return (data as { id: string; name: string; status: string } | null) ?? null;
  }

  async upsert(input: UpsertOcrTenantPolicyInput) {
    const { data, error } = await this.getAdminClient()
      .from("ocr_tenant_policies")
      .upsert({
        tenant_id: input.tenantId,
        enabled: input.enabled,
        allowed_document_types: input.allowedDocumentTypes,
        daily_limit: input.dailyLimit,
        remark: input.remark,
        enabled_at: input.enabledAt,
        updated_by_employee_id: input.updatedByEmployeeId,
      }, { onConflict: "tenant_id" })
      .select(POLICY_COLUMNS)
      .maybeSingle();
    if (error) throw Errors.dbError("保存OCR租户灰度策略失败", error);
    if (!data) throw Errors.dbError("保存OCR租户灰度策略失败");
    return data as OcrTenantPolicyRecord;
  }
}

function sanitizeKeyword(keyword?: string) {
  return keyword?.replace(/[,()]/g, " ").trim() ?? "";
}

export const ocrTenantPolicyRepository = new OcrTenantPolicyRepository();
