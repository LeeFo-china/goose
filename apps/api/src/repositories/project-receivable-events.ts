import { Errors } from "@/errors/error-factory";
import type {
  FinanceReceivableEventListQuery,
  ProjectReceivableEventType,
} from "@/schema/finance-receivables";
import { SupabaseDB } from "@/utils/supabase/index";

type EventRow = {
  id: string;
  tenant_id: string;
  project_id: string;
  receivable_plan_id: string;
  event_type: ProjectReceivableEventType;
  title: string;
  note: string | null;
  before_snapshot: Record<string, unknown> | null;
  after_snapshot: Record<string, unknown> | null;
  next_follow_up_at: string | null;
  created_by: string | null;
  created_at: string;
  creator?: {
    id: string;
    name: string | null;
    phone: string | null;
  } | null;
};

export type ProjectReceivableEventRecord = EventRow & {
  created_by_name: string | null;
};

class ProjectReceivableEventRepository {
  private select = `
    id,
    tenant_id,
    project_id,
    receivable_plan_id,
    event_type,
    title,
    note,
    before_snapshot,
    after_snapshot,
    next_follow_up_at,
    created_by,
    created_at,
    creator:employees!project_receivable_events_created_by_fkey(id, name, phone)
  `;

  async create(input: {
    tenant_id: string;
    project_id: string;
    receivable_plan_id: string;
    event_type: ProjectReceivableEventType;
    title: string;
    note?: string | null;
    before_snapshot?: Record<string, unknown> | null;
    after_snapshot?: Record<string, unknown> | null;
    next_follow_up_at?: string | null;
    created_by?: string | null;
  }) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("project_receivable_events")
      .insert(input)
      .select(this.select)
      .single();

    if (error) throw Errors.dbError("写入应收运营记录失败", error);
    return normalizeEvent(data as unknown as EventRow);
  }

  async listByReceivable(input: {
    tenantId: string;
    planId: string;
    query: FinanceReceivableEventListQuery;
  }) {
    const page = input.query.page ?? 1;
    const pageSize = Math.min(input.query.pageSize ?? 20, 100);
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const { data, error, count } = await SupabaseDB.getAdminClient()
      .from("project_receivable_events")
      .select(this.select, { count: "exact" })
      .eq("tenant_id", input.tenantId)
      .eq("receivable_plan_id", input.planId)
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) throw Errors.dbError("查询应收运营记录失败", error);
    return {
      list: ((data as unknown as EventRow[] | null) || []).map(normalizeEvent),
      pagination: {
        page,
        pageSize,
        total: count || 0,
        totalPages: count ? Math.ceil(count / pageSize) : 0,
      },
    };
  }
}

function normalizeEvent(row: EventRow): ProjectReceivableEventRecord {
  return {
    ...row,
    created_by_name: row.creator?.name ?? null,
  };
}

export const projectReceivableEventRepository =
  new ProjectReceivableEventRepository();
