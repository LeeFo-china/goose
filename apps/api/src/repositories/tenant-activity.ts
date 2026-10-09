import { z } from "zod";
import {
  TENANT_ACTIVITY_CHANNEL_VALUES, TENANT_ACTIVITY_KIND_VALUES,
  type TenantActivityChannel, type TenantActivityKind, type TenantActivitySummary,
} from "@gooes/domain";
import { Errors } from "@/errors/error-factory";
import { SupabaseDB } from "@/utils/supabase";

type RpcResult = { data: unknown; error: unknown };
type ActivityClient = {
  rpc(name: string, params: Record<string, unknown>): PromiseLike<RpcResult>;
};

export interface RecordTenantActivityInput {
  tenantId: string;
  employeeId: string;
  channel: TenantActivityChannel;
  kind: TenantActivityKind;
  /** Stable event identifier only; never pass a token, phone or request body. */
  eventKey: string;
}

const count = z.number().int().nonnegative();
const timestamp = z.iso.datetime({ offset: true }).nullable();
const summaryRowSchema = z.object({
  tenant_id: z.uuid(), status: z.enum(["collecting", "ready"]),
  collection_started_at: timestamp, window_start: timestamp, window_end: timestamp,
  observed_days: count.max(7), last_active_at: timestamp,
  active_employee_count: count.nullable(), admin_active_employee_count: count.nullable(),
  mini_active_employee_count: count.nullable(), active_days: count.max(7).nullable(),
  admin_login_count: count.nullable(), mini_login_count: count.nullable(),
  business_actions: z.object({
    customer_created: count, follow_up_created: count, project_created: count,
    construction_log_created: count, acceptance_handled: count,
  }).nullable(),
}).refine((row) => {
  const metrics = [row.active_employee_count, row.admin_active_employee_count,
    row.mini_active_employee_count, row.active_days, row.admin_login_count,
    row.mini_login_count, row.business_actions];
  if (row.collection_started_at === null) {
    return row.status === "collecting" && row.observed_days === 0
      && row.window_start === null && row.window_end === null && row.last_active_at === null
      && metrics.every((metric) => metric === null);
  }
  return row.window_start !== null && row.window_end !== null && row.observed_days > 0
    && (row.status !== "ready" || row.observed_days === 7)
    && metrics.every((metric) => metric !== null);
});
const recordInputSchema = z.object({
  tenantId: z.uuid(), employeeId: z.uuid(), channel: z.enum(TENANT_ACTIVITY_CHANNEL_VALUES),
  kind: z.enum(TENANT_ACTIVITY_KIND_VALUES), eventKey: z.string().min(1).max(512)
    .refine((value) => value.trim().length > 0),
});

export class TenantActivityRepository {
  constructor(private readonly clientProvider: () => ActivityClient = () =>
    SupabaseDB.getAdminClient() as unknown as ActivityClient) {}

  async record(input: RecordTenantActivityInput): Promise<boolean> {
    const parsed = recordInputSchema.safeParse(input);
    if (!parsed.success) throw Errors.badRequest("无效的租户活跃事件");
    const { tenantId, employeeId, channel, kind, eventKey } = parsed.data;
    const data = await this.rpc("record_tenant_activity", {
      p_tenant_id: tenantId, p_employee_id: employeeId, p_channel: channel,
      p_kind: kind, p_event_key: eventKey,
    });
    if (typeof data !== "boolean") throw Errors.dbError("记录租户活跃失败");
    return data;
  }

  async listSummaries(tenantIds: string[]): Promise<Map<string, TenantActivitySummary>> {
    const ids = [...new Set(tenantIds)];
    if (ids.length > 100 || !z.array(z.uuid()).safeParse(ids).success) {
      throw Errors.badRequest("一次最多查询 100 个有效租户的活跃概览");
    }
    if (!ids.length) return new Map();
    const data = await this.rpc("get_tenant_activity_summaries", { p_tenant_ids: ids });
    const parsed = z.array(summaryRowSchema).max(100).safeParse(data);
    if (!parsed.success || parsed.data.length !== ids.length
      || new Set(parsed.data.map((row) => row.tenant_id)).size !== ids.length
      || parsed.data.some((row) => !ids.includes(row.tenant_id))) {
      throw Errors.dbError("租户活跃概览数据无效");
    }
    return new Map(parsed.data.map(({ tenant_id, ...summary }) => [tenant_id, summary]));
  }

  private async rpc(name: string, params: Record<string, unknown>): Promise<unknown> {
    let result: RpcResult;
    try {
      result = await this.clientProvider().rpc(name, params);
    } catch {
      throw Errors.dbError("租户活跃统计服务暂不可用");
    }
    if (result.error) throw Errors.dbError("租户活跃统计服务暂不可用");
    return result.data;
  }
}

export const tenantActivityRepository = new TenantActivityRepository();
