import { Errors } from "@/errors/error-factory";
import { SupabaseDB } from "@/utils/supabase";

export type SmsSendLogStatus = "success" | "failure" | "mock" | "disabled";

export type SmsSendLogRecord = {
  id: string;
  tenant_id: string | null;
  provider: string;
  channel_mode: string | null;
  purpose: string;
  template_code: string | null;
  phone_masked: string;
  phone_hash: string;
  status: SmsSendLogStatus;
  request_id: string | null;
  provider_code: string | null;
  provider_message: string | null;
  error_code: string | null;
  error_message: string | null;
  sms_count: number;
  duration_ms: number | null;
  metadata: unknown;
  created_at: string;
};

export type CreateSmsSendLogInput = {
  tenantId?: string | null;
  provider: string;
  channelMode?: string | null;
  purpose: string;
  templateCode?: string | null;
  phoneMasked: string;
  phoneHash: string;
  status: SmsSendLogStatus;
  requestId?: string | null;
  providerCode?: string | null;
  providerMessage?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  smsCount?: number;
  durationMs?: number | null;
  metadata?: Record<string, unknown> | null;
};

export type SmsSendLogListInput = {
  tenantId?: string | null;
  tenantIds?: string[];
  page: number;
  pageSize: number;
  status?: SmsSendLogStatus;
  provider?: string;
  purpose?: string;
  createdFrom?: string;
  createdTo?: string;
};

class SmsSendLogRepository {
  private client = SupabaseDB.getAdminClient();

  private table() {
    return (this.client as unknown as {
      from: (table: string) => any;
    }).from("sms_send_logs");
  }

  async create(input: CreateSmsSendLogInput) {
    const { data, error } = await this.table()
      .insert({
        tenant_id: input.tenantId || null,
        provider: input.provider,
        channel_mode: input.channelMode || null,
        purpose: input.purpose,
        template_code: input.templateCode || null,
        phone_masked: input.phoneMasked,
        phone_hash: input.phoneHash,
        status: input.status,
        request_id: input.requestId || null,
        provider_code: input.providerCode || null,
        provider_message: input.providerMessage || null,
        error_code: input.errorCode || null,
        error_message: input.errorMessage || null,
        sms_count: input.smsCount ?? 1,
        duration_ms: input.durationMs ?? null,
        metadata: input.metadata || null,
      })
      .select("*")
      .maybeSingle();

    if (error) {
      throw Errors.dbError("记录短信发送日志失败", error);
    }

    return data as SmsSendLogRecord | null;
  }

  async list(input: SmsSendLogListInput) {
    const from = (input.page - 1) * input.pageSize;
    const to = from + input.pageSize - 1;
    let query = this.table()
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, to);

    query = this.applyFilters(query, input);

    const { data, error, count } = await query;
    if (error) {
      throw Errors.dbError("查询短信发送日志失败", error);
    }

    return {
      list: (data || []) as SmsSendLogRecord[],
      pagination: {
        page: input.page,
        pageSize: input.pageSize,
        total: count || 0,
        totalPages: count ? Math.ceil(count / input.pageSize) : 0,
      },
    };
  }

  async listUsageRows(input: Omit<SmsSendLogListInput, "page" | "pageSize">) {
    let query = this.table()
      .select(`
        id,
        tenant_id,
        provider,
        channel_mode,
        purpose,
        status,
        sms_count,
        created_at
      `);

    query = this.applyFilters(query, input);

    const { data, error } = await query;
    if (error) {
      throw Errors.dbError("查询短信用量失败", error);
    }

    return (data || []) as Array<{
      id: string;
      tenant_id: string | null;
      provider: string;
      channel_mode: string | null;
      purpose: string;
      status: SmsSendLogStatus;
      sms_count: number;
      created_at: string | null;
    }>;
  }

  private applyFilters<T extends { eq: (...args: any[]) => T; in: (...args: any[]) => T; gte: (...args: any[]) => T; lt: (...args: any[]) => T }>(
    query: T,
    input: Omit<SmsSendLogListInput, "page" | "pageSize">,
  ) {
    if (input.tenantId) {
      query = query.eq("tenant_id", input.tenantId);
    }

    if (input.tenantIds && input.tenantIds.length > 0) {
      query = query.in("tenant_id", input.tenantIds);
    }

    if (input.status) {
      query = query.eq("status", input.status);
    }

    if (input.provider) {
      query = query.eq("provider", input.provider);
    }

    if (input.purpose) {
      query = query.eq("purpose", input.purpose);
    }

    if (input.createdFrom) {
      query = query.gte("created_at", input.createdFrom);
    }

    if (input.createdTo) {
      query = query.lt("created_at", input.createdTo);
    }

    return query;
  }
}

export const smsSendLogRepository = new SmsSendLogRepository();
