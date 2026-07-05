import { Errors } from "@/errors/error-factory";
import type {
  FinanceMonthlyDifferenceResolutionWriteStatus,
  FinanceMonthlyOverviewDifferenceSourceType,
} from "@/schema/finance-reports";
import { SupabaseDB } from "@/utils/supabase/index";

export type FinanceMonthlyDifferenceResolutionRecord = {
  id: string;
  tenant_id: string;
  month: string;
  source_type: FinanceMonthlyOverviewDifferenceSourceType;
  source_id: string;
  project_id: string | null;
  status: FinanceMonthlyDifferenceResolutionWriteStatus;
  note: string | null;
  handled_by: string | null;
  handled_by_name: string | null;
  handled_at: string;
  created_at: string;
  updated_at: string;
};

export type FinanceMonthlyDifferenceResolutionSourceKey = {
  sourceType: FinanceMonthlyOverviewDifferenceSourceType;
  sourceId: string;
};

type MaybeArray<T> = T | T[] | null;

type HandlerRelation = {
  name: string | null;
};

type ResolutionDbRow = {
  id: string;
  tenant_id: string;
  month: string;
  source_type: FinanceMonthlyOverviewDifferenceSourceType;
  source_id: string;
  project_id: string | null;
  status: FinanceMonthlyDifferenceResolutionWriteStatus;
  note: string | null;
  handled_by: string | null;
  handled_at: string;
  created_at: string;
  updated_at: string;
  handler?: MaybeArray<HandlerRelation>;
};

class FinanceMonthlyDifferenceResolutionsRepository {
  async listBySources(input: {
    tenantId: string;
    month: string;
    sources: FinanceMonthlyDifferenceResolutionSourceKey[];
  }): Promise<FinanceMonthlyDifferenceResolutionRecord[]> {
    if (input.sources.length === 0) return [];

    const sourceTypes = [...new Set(input.sources.map((source) => source.sourceType))];
    const sourceIds = [...new Set(input.sources.map((source) => source.sourceId))];
    const allowedPairs = new Set(
      input.sources.map((source) => sourceKey(source.sourceType, source.sourceId)),
    );

    const { data, error } = await SupabaseDB.getAdminClient()
      .from("finance_monthly_difference_resolutions")
      .select(`
        id,
        tenant_id,
        month,
        source_type,
        source_id,
        project_id,
        status,
        note,
        handled_by,
        handled_at,
        created_at,
        updated_at,
        handler:employees!finance_monthly_difference_resolutions_handled_by_fkey(name)
      `)
      .eq("tenant_id", input.tenantId)
      .eq("month", input.month)
      .in("source_type", sourceTypes)
      .in("source_id", sourceIds)
      .limit(Math.max(input.sources.length, 1));

    if (error) {
      throw Errors.dbError("查询月度差异处理记录失败", error);
    }

    return ((data as unknown as ResolutionDbRow[] | null) || [])
      .filter((row) => allowedPairs.has(sourceKey(row.source_type, row.source_id)))
      .map(mapResolutionRow);
  }

  async upsert(input: {
    tenantId: string;
    month: string;
    sourceType: FinanceMonthlyOverviewDifferenceSourceType;
    sourceId: string;
    projectId: string | null;
    status: FinanceMonthlyDifferenceResolutionWriteStatus;
    note: string | null;
    handledBy: string | null;
  }): Promise<FinanceMonthlyDifferenceResolutionRecord> {
    const now = new Date().toISOString();
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("finance_monthly_difference_resolutions")
      .upsert({
        tenant_id: input.tenantId,
        month: input.month,
        source_type: input.sourceType,
        source_id: input.sourceId,
        project_id: input.projectId,
        status: input.status,
        note: input.note,
        handled_by: input.handledBy,
        handled_at: now,
        updated_at: now,
      }, {
        onConflict: "tenant_id,month,source_type,source_id",
      })
      .select(`
        id,
        tenant_id,
        month,
        source_type,
        source_id,
        project_id,
        status,
        note,
        handled_by,
        handled_at,
        created_at,
        updated_at,
        handler:employees!finance_monthly_difference_resolutions_handled_by_fkey(name)
      `)
      .single();

    if (error) {
      throw Errors.dbError("保存月度差异处理记录失败", error);
    }

    return mapResolutionRow(data as unknown as ResolutionDbRow);
  }
}

function mapResolutionRow(
  row: ResolutionDbRow,
): FinanceMonthlyDifferenceResolutionRecord {
  const handler = firstRelation(row.handler);
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    month: row.month,
    source_type: row.source_type,
    source_id: row.source_id,
    project_id: row.project_id,
    status: row.status,
    note: row.note,
    handled_by: row.handled_by,
    handled_by_name: handler?.name ?? null,
    handled_at: row.handled_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function sourceKey(
  sourceType: FinanceMonthlyOverviewDifferenceSourceType,
  sourceId: string,
) {
  return `${sourceType}:${sourceId}`;
}

function firstRelation<T>(value: MaybeArray<T> | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

export const financeMonthlyDifferenceResolutionsRepository =
  new FinanceMonthlyDifferenceResolutionsRepository();
