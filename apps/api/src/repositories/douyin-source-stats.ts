import { z } from "zod";

import { AppError } from "@/errors/app-error";
import { Errors } from "@/errors/error-factory";
import type { TenantDouyinSourceStatsQuery } from
  "@/schema/tenant-douyin-source-stats";
import { SupabaseDB } from "@/utils/supabase";

const BASIS_VALUES = ["official_video", "official_live", "official_account",
  "manual", "unidentified"] as const;
const count = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const dateTime = z.iso.datetime({ offset: true });
const stageCounts = {
  entries: count, visitors: count, page_views: count,
  lead_clicks: count, appointments: count,
};
const sourceRow = z.strictObject({
  source_key: z.string().min(1).max(300), basis: z.enum(BASIS_VALUES),
  source_type: z.enum(["short_video", "live", "search", "profile", "share",
    "direct", "other"]).nullable(),
  account_id: z.string().min(1).max(256).nullable(),
  video_id: z.string().min(1).max(256).nullable(),
  live_room_id: z.string().min(1).max(256).nullable(),
  ...stageCounts,
});

export const DouyinSourceStatsResultSchema = z.strictObject({
  window_start: dateTime,
  window_end: dateTime,
  first_captured_at: dateTime.nullable(),
  overview: z.strictObject({ ...stageCounts, lead_people: count }),
  daily: z.array(z.strictObject({ date: z.iso.date(), ...stageCounts })).max(90),
  source_types: z.array(z.strictObject({ basis: z.enum(BASIS_VALUES),
    ...stageCounts })).max(5),
  sources: z.strictObject({
    list: z.array(sourceRow).max(100),
    pagination: z.strictObject({ page: count.min(1), pageSize: count.min(1).max(100),
      total: count, totalPages: count }),
  }),
});

export type DouyinSourceStatsResult = z.infer<
  typeof DouyinSourceStatsResultSchema
>;

type RpcPort = {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{
    data: unknown; error: unknown;
  }>;
};

export class DouyinSourceStatsRepository {
  constructor(private readonly client: RpcPort =
    SupabaseDB.getAdminClient() as unknown as RpcPort) {}

  async load(input: TenantDouyinSourceStatsQuery & { tenantId: string }):
    Promise<DouyinSourceStatsResult> {
    try {
      const response = await this.client.rpc("get_tenant_douyin_source_stats", {
        p_tenant_id: input.tenantId,
        p_days: input.days,
        p_group_by: input.groupBy,
        p_page: input.page,
        p_page_size: input.pageSize,
      });
      if (response.error) throw Errors.dbError("读取抖音来源统计失败");
      const parsed = DouyinSourceStatsResultSchema.safeParse(response.data);
      if (!parsed.success || parsed.data.sources.pagination.page !== input.page
        || parsed.data.sources.pagination.pageSize !== input.pageSize
        || parsed.data.sources.list.length > input.pageSize) {
        throw Errors.dbError("抖音来源统计响应无效");
      }
      return parsed.data;
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw Errors.dbError("读取抖音来源统计失败");
    }
  }
}

export const douyinSourceStatsRepository = new DouyinSourceStatsRepository();
