import { Errors } from "@/errors/error-factory";
import type {
  CreateExternalReferrerInput,
  ExternalReferrerListQueryType,
  UpdateExternalReferrerInput,
} from "@/schema/project-referrals";
import { SupabaseDB } from "@/utils/supabase/index";

export type ExternalReferrerRecord = {
  id: string;
  tenant_id: string;
  name: string;
  phone: string | null;
  bank_name: string | null;
  bank_account: string | null;
  wechat_account: string | null;
  alipay_account: string | null;
  status: string;
  remark: string | null;
  created_at: string;
  updated_at: string;
};

class ExternalReferrerRepository {
  async list(params: ExternalReferrerListQueryType, tenantId: string) {
    const { page, pageSize, status, keyword } = params;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = SupabaseDB.getAdminClient()
      .from("external_referrers")
      .select("*", { count: "exact" })
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false });

    if (status) {
      query = query.eq("status", status);
    }

    if (keyword) {
      query = query.or(`name.ilike.%${keyword}%,phone.ilike.%${keyword}%`);
    }

    const { data, error, count } = await query.range(from, to);
    if (error) {
      throw Errors.dbError("查询外部介绍人列表失败", error);
    }

    return {
      list: (data as unknown as ExternalReferrerRecord[] | null) || [],
      pagination: {
        page,
        pageSize,
        total: count || 0,
        totalPages: count ? Math.ceil(count / pageSize) : 0,
      },
    };
  }

  async findById(
    id: string,
    tenantId?: string | null,
  ): Promise<ExternalReferrerRecord | null> {
    let query = SupabaseDB.getAdminClient()
      .from("external_referrers")
      .select("*")
      .eq("id", id);

    if (tenantId) {
      query = query.eq("tenant_id", tenantId);
    }

    const { data, error } = await query.maybeSingle();
    if (error) {
      throw Errors.dbError("查询外部介绍人失败", error);
    }

    return (data as unknown as ExternalReferrerRecord | null) ?? null;
  }

  async create(
    input: CreateExternalReferrerInput,
    tenantId: string,
  ): Promise<ExternalReferrerRecord> {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("external_referrers")
      .insert({
        ...input,
        tenant_id: tenantId,
      })
      .select("*")
      .single();

    if (error) {
      throw Errors.dbError("创建外部介绍人失败", error);
    }

    return data as unknown as ExternalReferrerRecord;
  }

  async update(
    id: string,
    input: UpdateExternalReferrerInput,
    tenantId: string,
  ): Promise<ExternalReferrerRecord> {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("external_referrers")
      .update(input)
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .select("*")
      .maybeSingle();

    if (error) {
      throw Errors.dbError("更新外部介绍人失败", error);
    }

    if (!data) {
      throw Errors.badRequest("外部介绍人不存在或更新失败");
    }

    return data as unknown as ExternalReferrerRecord;
  }
}

export const externalReferrerRepository = new ExternalReferrerRepository();
