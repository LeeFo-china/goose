import { Errors } from "@/errors/error-factory";
import type { Inserts, Tables, Updates } from "@/types/db";
import { SupabaseDB } from "@/utils/supabase/index";
import type { PlatformWechatPayApplymentListQuery } from "@/schema/wechat-pay-applyments";

export type WechatPayApplymentRecord =
  Tables<"tenant_wechat_pay_applyments"> & {
    tenant?: {
      id: string;
      name: string | null;
      slug: string | null;
    } | null;
  };
export type WechatPayApplymentInsert =
  Inserts<"tenant_wechat_pay_applyments">;
export type WechatPayApplymentUpdate =
  Updates<"tenant_wechat_pay_applyments">;
export type WechatPayApplymentEventRecord =
  Tables<"tenant_wechat_pay_applyment_events">;
export type WechatPayApplymentEventInsert =
  Inserts<"tenant_wechat_pay_applyment_events">;

export type WechatPayApplymentListResult = {
  list: WechatPayApplymentRecord[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

const APPLYMENT_SELECT = [
  "*",
  "tenant:tenants!tenant_wechat_pay_applyments_tenant_id_fkey(id, name, slug)",
].join(", ");

class WechatPayApplymentRepository {
  async findLatestByTenant(
    tenantId: string,
  ): Promise<WechatPayApplymentRecord | null> {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("tenant_wechat_pay_applyments")
      .select(APPLYMENT_SELECT)
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询微信支付开通申请失败", error);
    }

    return (data as unknown as WechatPayApplymentRecord | null) ?? null;
  }

  async findById(input: {
    id: string;
    tenantId?: string;
  }): Promise<WechatPayApplymentRecord | null> {
    let request = SupabaseDB.getAdminClient()
      .from("tenant_wechat_pay_applyments")
      .select(APPLYMENT_SELECT)
      .eq("id", input.id);

    if (input.tenantId) {
      request = request.eq("tenant_id", input.tenantId);
    }

    const { data, error } = await request.maybeSingle();

    if (error) {
      throw Errors.dbError("查询微信支付开通申请详情失败", error);
    }

    return (data as unknown as WechatPayApplymentRecord | null) ?? null;
  }

  async createApplyment(
    input: WechatPayApplymentInsert,
  ): Promise<WechatPayApplymentRecord> {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("tenant_wechat_pay_applyments")
      .insert(input)
      .select(APPLYMENT_SELECT)
      .single();

    if (error) {
      throw Errors.dbError("创建微信支付开通申请失败", error);
    }

    return data as unknown as WechatPayApplymentRecord;
  }

  async updateApplyment(input: {
    id: string;
    tenantId?: string;
    patch: WechatPayApplymentUpdate;
  }): Promise<WechatPayApplymentRecord> {
    let request = SupabaseDB.getAdminClient()
      .from("tenant_wechat_pay_applyments")
      .update(input.patch)
      .eq("id", input.id);

    if (input.tenantId) {
      request = request.eq("tenant_id", input.tenantId);
    }

    const { data, error } = await request
      .select(APPLYMENT_SELECT)
      .single();

    if (error) {
      throw Errors.dbError("更新微信支付开通申请失败", error);
    }

    return data as unknown as WechatPayApplymentRecord;
  }

  async insertEvent(
    input: WechatPayApplymentEventInsert,
  ): Promise<WechatPayApplymentEventRecord> {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("tenant_wechat_pay_applyment_events")
      .insert(input)
      .select("*")
      .single();

    if (error) {
      throw Errors.dbError("写入微信支付开通申请事件失败", error);
    }

    return data as WechatPayApplymentEventRecord;
  }

  async findEvents(input: {
    tenantId: string;
    applymentId: string;
  }): Promise<WechatPayApplymentEventRecord[]> {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("tenant_wechat_pay_applyment_events")
      .select("*")
      .eq("tenant_id", input.tenantId)
      .eq("applyment_id", input.applymentId)
      .order("created_at", { ascending: true });

    if (error) {
      throw Errors.dbError("查询微信支付开通申请事件失败", error);
    }

    return (data ?? []) as WechatPayApplymentEventRecord[];
  }

  async listApplyments(input: {
    query: PlatformWechatPayApplymentListQuery;
  }): Promise<WechatPayApplymentListResult> {
    const page = input.query.page ?? 1;
    const pageSize = Math.min(input.query.pageSize ?? 20, 100);
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let request = SupabaseDB.getAdminClient()
      .from("tenant_wechat_pay_applyments")
      .select(APPLYMENT_SELECT, { count: "exact" });

    if (input.query.status) request = request.eq("status", input.query.status);
    if (input.query.tenant_id) request = request.eq("tenant_id", input.query.tenant_id);
    if (input.query.keyword) {
      const keyword = `%${input.query.keyword}%`;
      request = request.or([
        `application_no.ilike.${keyword}`,
        `merchant_short_name.ilike.${keyword}`,
        `license_name.ilike.${keyword}`,
        `applyment_business_code.ilike.${keyword}`,
        `applyment_id.ilike.${keyword}`,
        `sub_mchid.ilike.${keyword}`,
      ].join(","));
    }

    const { data, error, count } = await request
      .order("submitted_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) {
      throw Errors.dbError("查询微信支付开通申请列表失败", error);
    }

    const total = count ?? 0;
    return {
      list: (data ?? []) as unknown as WechatPayApplymentRecord[],
      pagination: {
        page,
        pageSize,
        total,
        totalPages: total ? Math.ceil(total / pageSize) : 0,
      },
    };
  }
}

export const wechatPayApplymentRepository = new WechatPayApplymentRepository();
