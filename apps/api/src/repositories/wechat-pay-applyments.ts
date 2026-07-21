import { Errors } from "@/errors/error-factory";
import type { Inserts, Tables, Updates } from "@/types/db";
import { SupabaseDB } from "@/utils/supabase/index";
import type { PlatformWechatPayApplymentListQuery } from "@/schema/wechat-pay-applyments";

type WechatPayApplymentTableRow = Tables<"tenant_wechat_pay_applyments">;

export type WechatPayApplymentRecord =
  Omit<WechatPayApplymentTableRow, "sensitive_payload_ciphertext"> & {
    tenant?: {
      id: string;
      name: string | null;
      slug: string | null;
    } | null;
  };
export type WechatPayApplymentSensitiveRecord = Pick<
  WechatPayApplymentTableRow,
  | "id"
  | "tenant_id"
  | "has_sensitive_payload"
  | "sensitive_payload_ciphertext"
  | "sensitive_payload_version"
>;
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

const APPLYMENT_SAFE_COLUMNS = [
  "id",
  "tenant_id",
  "application_no",
  "status",
  "merchant_short_name",
  "license_name",
  "license_code",
  "license_address",
  "license_period_begin",
  "license_period_end",
  "legal_representative_name",
  "identity_doc_type",
  "identity_address_masked",
  "identity_period_begin",
  "identity_period_end",
  "contact_type",
  "super_admin_name",
  "super_admin_phone_masked",
  "super_admin_email",
  "contact_identity_doc_type",
  "contact_identity_period_begin",
  "contact_identity_period_end",
  "service_phone",
  "settlement_account_type",
  "settlement_account_name",
  "settlement_bank_name",
  "settlement_bank_full_name",
  "settlement_bank_branch_id",
  "settlement_account_number_masked",
  "settlement_account_summary",
  "settlement_id",
  "qualification_type",
  "business_scene_description",
  "contact_address",
  "attachments",
  "remark",
  "applyment_business_code",
  "applyment_id",
  "applyment_state",
  "applyment_state_message",
  "wechat_applyment_state_raw",
  "sign_url",
  "audit_detail",
  "last_wechat_request_id",
  "last_wechat_synced_at",
  "sub_mchid",
  "sub_appid",
  "appid_binding_state",
  "appid_binding_message",
  "payment_config_id",
  "has_sensitive_payload",
  "sensitive_payload_version",
  "sensitive_payload_updated_at",
  "submission_claimed_at",
  "submission_attempt_count",
  "submitted_at",
  "approved_at",
  "opened_at",
  "activated_at",
  "rejected_at",
  "rejected_reason",
  "created_by_employee_id",
  "updated_by_employee_id",
  "reviewed_by_employee_id",
  "created_at",
  "updated_at",
].join(", ");

const APPLYMENT_SELECT = [
  APPLYMENT_SAFE_COLUMNS,
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

  async findSensitivePayloadById(input: {
    id: string;
    tenantId?: string;
  }): Promise<WechatPayApplymentSensitiveRecord | null> {
    let request = SupabaseDB.getAdminClient()
      .from("tenant_wechat_pay_applyments")
      .select([
        "id",
        "tenant_id",
        "has_sensitive_payload",
        "sensitive_payload_ciphertext",
        "sensitive_payload_version",
      ].join(", "))
      .eq("id", input.id);

    if (input.tenantId) {
      request = request.eq("tenant_id", input.tenantId);
    }

    const { data, error } = await request.maybeSingle();
    if (error) {
      throw Errors.dbError("查询微信支付进件敏感资料失败", error);
    }
    return (data as WechatPayApplymentSensitiveRecord | null) ?? null;
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
