import { Errors, randomUUID } from "./shared";
import type {
  BillingAccountBalance,
  BillingEventCreateInput,
  BillingEventQuery,
  BillingEventRow,
  BillingLedgerQuery,
  BillingLedgerRow,
} from "./shared";

export async function listLedger(this: any, query: BillingLedgerQuery & { tenantId?: string; tenantIds?: string[] }) {
  const from = (query.page - 1) * query.pageSize;
  const to = from + query.pageSize - 1;

  if (query.tenantIds && query.tenantIds.length === 0) {
    return {
      list: [] as BillingLedgerRow[],
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total: 0,
        totalPages: 0,
      },
    };
  }

  let request = this.from("tenant_credit_ledger")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);

  const tenantId = query.tenantId || query.tenant_id;
  if (tenantId) request = request.eq("tenant_id", tenantId);
  if (query.tenantIds?.length) request = request.in("tenant_id", query.tenantIds);
  if (query.direction) request = request.eq("direction", query.direction);
  if (query.metric_code) request = request.eq("metric_code", query.metric_code);
  if (query.source_type) request = request.eq("source_type", query.source_type);
  if (query.event_type) request = request.eq("event_type", query.event_type);
  if (query.start_date) request = request.gte("created_at", query.start_date);
  if (query.end_date) request = request.lte("created_at", query.end_date);
  if (query.keyword) {
    const escaped = query.keyword.replaceAll(",", "\\,");
    request = request.or(`event_type.ilike.%${escaped}%,source_no.ilike.%${escaped}%,remark.ilike.%${escaped}%`);
  }

  const { data, count, error } = await request;
  if (error) {
    throw Errors.dbError("查询积分流水失败", error);
  }

  return {
    list: (data || []) as BillingLedgerRow[],
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      total: count || 0,
      totalPages: count ? Math.ceil(count / query.pageSize) : 0,
    },
  };
}

export async function listBillingEvents(this: any, input: BillingEventQuery & {
  tenantId?: string;
  tenantIds?: string[];
  startDate?: string;
  endDate?: string;
  statuses?: string[];
  pageSize?: number;
}) {
  const page = input.page || 1;
  const pageSize = input.pageSize || 1000;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  if (input.tenantIds && input.tenantIds.length === 0) {
    return {
      list: [] as BillingEventRow[],
      pagination: {
        page,
        pageSize,
        total: 0,
        totalPages: 0,
      },
    };
  }

  let request = this.from("tenant_billing_events")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (input.tenantId || input.tenant_id) request = request.eq("tenant_id", input.tenantId || input.tenant_id);
  if (input.tenantIds?.length) request = request.in("tenant_id", input.tenantIds);
  if (input.metric_code) request = request.eq("metric_code", input.metric_code);
  if (input.scene_code) request = request.eq("scene_code", input.scene_code);
  if (input.provider) request = request.eq("provider", input.provider);
  if (input.model) request = request.eq("model", input.model);
  if (input.source_type) request = request.eq("source_type", input.source_type);
  if (input.status) request = request.eq("status", input.status);
  if (input.statuses?.length) request = request.in("status", input.statuses);
  if (input.startDate || input.start_date) request = request.gte("created_at", input.startDate || input.start_date);
  if (input.endDate || input.end_date) request = request.lte("created_at", input.endDate || input.end_date);

  const { data, error, count } = await request;
  if (error) {
    throw Errors.dbError("查询计费事件失败", error);
  }

  return {
    list: (data || []) as BillingEventRow[],
    pagination: {
      page,
      pageSize,
      total: count || 0,
      totalPages: count ? Math.ceil(count / pageSize) : 0,
    },
  };
}

export async function listExistingBillingEventKeys(this: any, input: {
  sourceType: string;
  sourceIds: string[];
}) {
  if (!input.sourceIds.length) return new Set<string>();

  const { data, error } = await this.from("tenant_billing_events")
    .select("metric_code, source_type, source_id, source_sub_id")
    .eq("source_type", input.sourceType)
    .in("source_id", input.sourceIds);

  if (error) {
    throw Errors.dbError("查询已生成计费事件失败", error);
  }

  return new Set((data || []).map((item: {
    metric_code: string;
    source_type: string;
    source_id: string;
    source_sub_id: string | null;
  }) => this.buildEventKey(item)));
}

export function buildEventKey(this: any, input: {
  metric_code: string;
  source_type: string;
  source_id: string;
  source_sub_id?: string | null;
}) {
  return `${input.metric_code}:${input.source_type}:${input.source_id}:${input.source_sub_id || ""}`;
}

export async function createBillingEvent(this: any, input: BillingEventCreateInput) {
  const { data, error } = await this.from("tenant_billing_events")
    .insert({
      tenant_id: input.tenant_id,
      metric_code: input.metric_code,
      scene_code: input.scene_code || null,
      provider: input.provider || null,
      model: input.model || null,
      source_type: input.source_type,
      source_id: input.source_id,
      source_sub_id: input.source_sub_id || null,
      billable_units: input.billable_units,
      unit_name: input.unit_name,
      unit_price_credits: input.unit_price_credits,
      credits: input.credits,
      status: input.status,
      pricing_rule_id: input.pricing_rule_id || null,
      pricing_snapshot: input.pricing_snapshot || {},
      raw_usage: input.raw_usage || {},
      failure_code: input.failure_code || null,
      failure_message: input.failure_message || null,
    })
    .select("*")
    .single();

  if (error) {
    const code = (error as { code?: string }).code;
    if (code === "23505") {
      return null;
    }

    throw Errors.dbError("创建影子计费事件失败", error);
  }

  return data as BillingEventRow;
}

export async function findBillingEventBySource(this: any, input: {
  metricCode: string;
  sourceType: string;
  sourceId: string;
  sourceSubId?: string | null;
}) {
  let request = this.from("tenant_billing_events")
    .select("*")
    .eq("metric_code", input.metricCode)
    .eq("source_type", input.sourceType)
    .eq("source_id", input.sourceId);

  if (input.sourceSubId) {
    request = request.eq("source_sub_id", input.sourceSubId);
  } else {
    request = request.is("source_sub_id", null);
  }

  const { data, error } = await request.maybeSingle();
  if (error) {
    throw Errors.dbError("查询计费事件失败", error);
  }

  return (data || null) as BillingEventRow | null;
}

export async function settleBillingEvent(this: any, eventId: string, operatorUserId?: string | null) {
  const { data, error } = await this.rpc("billing_settle_event", {
    p_billing_event_id: eventId,
    p_correlation_id: randomUUID(),
    p_operator_user_id: operatorUserId || null,
  });

  if (error) {
    throw Errors.dbError("结算计费事件失败", error);
  }

  return data as {
    event: BillingEventRow;
    account: BillingAccountBalance;
    ledger: BillingLedgerRow | null;
    idempotent?: boolean;
  };
}

export async function freezeCredits(this: any, input: {
  tenantId: string;
  credits: number;
  eventType: string;
  sourceType: string;
  sourceId: string;
  correlationId: string;
  remark?: string | null;
}) {
  const { data, error } = await this.rpc("billing_freeze_credits", {
    p_tenant_id: input.tenantId,
    p_change_credits: input.credits,
    p_event_type: input.eventType,
    p_source_type: input.sourceType,
    p_source_id: input.sourceId,
    p_correlation_id: input.correlationId,
    p_remark: input.remark || null,
  });

  if (error) {
    throw Errors.dbError("冻结租户积分失败", error);
  }

  return data as {
    account: BillingAccountBalance;
    ledger: BillingLedgerRow | null;
    idempotent?: boolean;
  };
}

export async function unfreezeCredits(this: any, input: {
  tenantId: string;
  credits: number;
  eventType: string;
  sourceType: string;
  sourceId: string;
  correlationId: string;
  remark?: string | null;
}) {
  const { data, error } = await this.rpc("billing_unfreeze_credits", {
    p_tenant_id: input.tenantId,
    p_change_credits: input.credits,
    p_event_type: input.eventType,
    p_source_type: input.sourceType,
    p_source_id: input.sourceId,
    p_correlation_id: input.correlationId,
    p_remark: input.remark || null,
  });

  if (error) {
    throw Errors.dbError("释放租户冻结积分失败", error);
  }

  return data as {
    account: BillingAccountBalance;
    ledger: BillingLedgerRow | null;
    idempotent?: boolean;
  };
}
