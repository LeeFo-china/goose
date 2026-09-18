import { Errors } from "@/errors/error-factory";
import type { TenantOnboardingPageResult } from "@/repositories/tenant-onboarding-types";
import { SupabaseDB } from "@/utils/supabase";
import { z } from "zod";

const MAX_PAGE_SIZE = 100;

const ShareLinkSchema = z.object({
  id: z.uuid(),
  share_token: z.string(),
  sharer_user_id: z.uuid(),
  sharer_employee_id: z.uuid(),
  sharer_openid: z.string().nullable(),
  sharer_display_name: z.string().nullable(),
  expires_at: z.string(),
  created_at: z.string(),
});

const OpenResultSchema = z.object({
  valid: z.boolean(),
  sharer_display_name: z.string().nullable(),
});

const StatisticsRowSchema = z.object({
  id: z.uuid(),
  share_token: z.string(),
  status: z.enum(["active", "revoked"]),
  expires_at: z.string(),
  view_count: z.number().int().nonnegative(),
  submitted_count: z.number().int().nonnegative(),
  approved_count: z.number().int().nonnegative(),
  created_at: z.string(),
  total_count: z.number().int().nonnegative(),
});

const ApplicationSchema = z.object({
  id: z.uuid(),
  application_no: z.string(),
  company_name: z.string(),
  status: z.string(),
  created_at: z.string(),
});

export type TenantOnboardingShareLinkRecord = z.infer<typeof ShareLinkSchema>;
export type TenantOnboardingShareLinkStatistics = Omit<
  z.infer<typeof StatisticsRowSchema>,
  "total_count"
>;
export type TenantOnboardingShareApplication = z.infer<typeof ApplicationSchema>;

type UntypedTable = {
  select: (...args: unknown[]) => UntypedTable;
  eq: (...args: unknown[]) => UntypedTable;
  order: (...args: unknown[]) => UntypedTable;
  range: (...args: unknown[]) => UntypedTable;
  maybeSingle: () => Promise<{ data: unknown; error: unknown }>;
  then: Promise<{ data: unknown; error: unknown; count: number | null }>["then"];
};

type UntypedClient = {
  from: (table: "tenant_onboarding_share_links" | "tenant_onboarding_applications") => UntypedTable;
  rpc: (
    name: string,
    params: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: unknown }>;
};

function client(): UntypedClient {
  return SupabaseDB.getAdminClient() as unknown as UntypedClient;
}

function pageValues(pageValue: number, pageSizeValue: number) {
  const page = Number.isInteger(pageValue) && pageValue > 0 ? pageValue : 1;
  const pageSize = Number.isInteger(pageSizeValue) && pageSizeValue > 0
    ? Math.min(pageSizeValue, MAX_PAGE_SIZE)
    : 20;
  const start = (page - 1) * pageSize;
  return { page, pageSize, start, end: start + pageSize - 1 };
}

function parse<Output>(schema: z.ZodType<Output>, data: unknown, message: string) {
  const result = schema.safeParse(data);
  if (result.success) return result.data;
  throw Errors.dbError(message, {
    message: "tenant onboarding share repository returned invalid data",
    issues: result.error.issues,
  });
}

export class TenantOnboardingShareLinksRepository {
  async createOrFind(input: {
    shareToken: string;
    sharerUserId: string;
    sharerEmployeeId: string;
    sharerOpenid: string | null;
    sharerDisplayName: string | null;
    idempotencyKey: string;
    expiresAt: string;
    now: string;
  }): Promise<TenantOnboardingShareLinkRecord> {
    const { data, error } = await client().rpc(
      "create_tenant_onboarding_share_link",
      {
        p_share_token: input.shareToken,
        p_sharer_user_id: input.sharerUserId,
        p_sharer_employee_id: input.sharerEmployeeId,
        p_sharer_openid: input.sharerOpenid,
        p_sharer_display_name: input.sharerDisplayName,
        p_idempotency_key: input.idempotencyKey,
        p_expires_at: input.expiresAt,
        p_now: input.now,
      },
    );
    if (error) throw Errors.dbError("创建装企入驻分享链接失败", error);
    const rows = parse(z.array(ShareLinkSchema), data, "创建装企入驻分享链接失败");
    if (!rows[0]) throw Errors.dbError("创建装企入驻分享链接失败");
    return rows[0];
  }

  async recordOpen(input: { token: string; visitorId: string; now: string }) {
    const { data, error } = await client().rpc(
      "record_tenant_onboarding_share_open",
      {
        p_share_token: input.token,
        p_visitor_id: input.visitorId,
        p_now: input.now,
      },
    );
    if (error) throw Errors.dbError("记录装企入驻分享访问失败", error);
    const rows = parse(z.array(OpenResultSchema), data, "记录装企入驻分享访问失败");
    return rows[0] ?? { valid: false, sharer_display_name: null };
  }

  async list(input: {
    sharerUserId: string;
    page: number;
    pageSize: number;
  }): Promise<TenantOnboardingPageResult<TenantOnboardingShareLinkStatistics>> {
    const normalized = pageValues(input.page, input.pageSize);
    const { data, error } = await client().rpc(
      "list_tenant_onboarding_share_links",
      {
        p_sharer_user_id: input.sharerUserId,
        p_offset: normalized.start,
        p_limit: normalized.pageSize,
      },
    );
    if (error) throw Errors.dbError("查询装企入驻分享统计失败", error);
    const rows = parse(z.array(StatisticsRowSchema), data, "查询装企入驻分享统计失败");
    const total = rows[0]?.total_count ?? 0;
    return {
      list: rows.map(({ total_count: _totalCount, ...row }) => row),
      pagination: {
        page: normalized.page,
        pageSize: normalized.pageSize,
        total,
        totalPages: total ? Math.ceil(total / normalized.pageSize) : 0,
      },
    };
  }

  async findOwnedById(id: string, sharerUserId: string) {
    const { data, error } = await client().from("tenant_onboarding_share_links")
      .select(
        "id,share_token,sharer_user_id,sharer_employee_id,sharer_openid,sharer_display_name,expires_at,created_at",
      )
      .eq("id", id)
      .eq("sharer_user_id", sharerUserId)
      .maybeSingle();
    if (error) throw Errors.dbError("查询装企入驻分享链接失败", error);
    return data === null
      ? null
      : parse(ShareLinkSchema, data, "查询装企入驻分享链接失败");
  }

  async listApplications(input: {
    shareLinkId: string;
    page: number;
    pageSize: number;
  }): Promise<TenantOnboardingPageResult<TenantOnboardingShareApplication>> {
    const normalized = pageValues(input.page, input.pageSize);
    const { data, error, count } = await client().from("tenant_onboarding_applications")
      .select("id,application_no,company_name,status,created_at", { count: "exact" })
      .eq("share_link_id", input.shareLinkId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(normalized.start, normalized.end);
    if (error) throw Errors.dbError("查询装企入驻分享申请失败", error);
    const list = parse(z.array(ApplicationSchema), data ?? [], "查询装企入驻分享申请失败");
    const total = count ?? 0;
    return {
      list,
      pagination: {
        page: normalized.page,
        pageSize: normalized.pageSize,
        total,
        totalPages: total ? Math.ceil(total / normalized.pageSize) : 0,
      },
    };
  }
}

export const tenantOnboardingShareLinksRepository =
  new TenantOnboardingShareLinksRepository();
