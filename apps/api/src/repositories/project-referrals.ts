import { Errors } from "@/errors/error-factory";
import type {
  CreateProjectReferralInput,
  MarkProjectReferralPaidInput,
  ProjectReferralListQueryType,
  UpdateProjectReferralInput,
} from "@/schema/project-referrals";
import { SupabaseDB } from "@/utils/supabase/index";

export type ProjectReferralRecord = {
  id: string;
  project_id: string;
  referrer_id: string;
  rate_bps: number;
  base_amount: number | null;
  commission_amount: number | null;
  status: string | null;
  calculated_at: string | null;
  recalculated_at: string | null;
  paid_at: string | null;
  paid_evidence_images: unknown;
  paid_remark: string | null;
  paid_by: string | null;
  remark: string | null;
  created_at: string;
  updated_at: string;
  project?: unknown;
  referrer?: unknown;
  paid_operator?: unknown;
};

class ProjectReferralRepository {
  private referralSelect = `
    *,
    project:projects(id, name, status, signed_amount, customer_id),
    referrer:external_referrers(id, name, phone, status),
    paid_operator:employees!project_referrals_paid_by_fkey(id, name, phone)
  `;

  async findById(id: string): Promise<ProjectReferralRecord | null> {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("project_referrals")
      .select(this.referralSelect)
      .eq("id", id)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询项目介绍费失败", error);
    }

    return (data as ProjectReferralRecord | null) ?? null;
  }

  async findByProjectId(projectId: string): Promise<ProjectReferralRecord | null> {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("project_referrals")
      .select(this.referralSelect)
      .eq("project_id", projectId)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("查询项目介绍费失败", error);
    }

    return (data as ProjectReferralRecord | null) ?? null;
  }

  async create(input: CreateProjectReferralInput): Promise<ProjectReferralRecord> {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("project_referrals")
      .insert({
        ...input,
        status: "pending",
      })
      .select(this.referralSelect)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("创建项目介绍费失败", error);
    }

    if (!data) {
      throw Errors.badRequest("创建项目介绍费失败");
    }

    return data as unknown as ProjectReferralRecord;
  }

  async update(id: string, input: UpdateProjectReferralInput): Promise<ProjectReferralRecord> {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("project_referrals")
      .update(input)
      .eq("id", id)
      .select(this.referralSelect)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("更新项目介绍费失败", error);
    }

    if (!data) {
      throw Errors.badRequest("项目介绍费不存在或更新失败");
    }

    return data as unknown as ProjectReferralRecord;
  }

  async calculateByProjectId(params: {
    projectId: string;
    baseAmount: number;
    commissionAmount: number;
    currentStatus: string;
  }): Promise<ProjectReferralRecord> {
    const payload: Record<string, unknown> = {
      base_amount: params.baseAmount,
      commission_amount: params.commissionAmount,
      status: "calculated",
      updated_at: new Date().toISOString(),
    };

    if (params.currentStatus === "pending") {
      payload.calculated_at = new Date().toISOString();
    } else {
      payload.recalculated_at = new Date().toISOString();
    }

    const { data, error } = await SupabaseDB.getAdminClient()
      .from("project_referrals")
      .update(payload)
      .eq("project_id", params.projectId)
      .in("status", ["pending", "calculated"])
      .is("paid_at", null)
      .select(this.referralSelect)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("计算项目介绍费失败", error);
    }

    if (!data) {
      throw Errors.badRequest("项目介绍费已支付或无法重算");
    }

    return data as unknown as ProjectReferralRecord;
  }

  async markPaid(id: string, input: MarkProjectReferralPaidInput): Promise<ProjectReferralRecord> {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("project_referrals")
      .update({
        status: "paid",
        paid_at: input.paid_at || new Date().toISOString(),
        paid_evidence_images: input.paid_evidence_images,
        paid_remark: input.paid_remark || null,
        paid_by: input.paid_by,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("status", "calculated")
      .is("paid_at", null)
      .select(this.referralSelect)
      .maybeSingle();

    if (error) {
      throw Errors.dbError("标记项目介绍费已支付失败", error);
    }

    if (!data) {
      throw Errors.badRequest("项目介绍费不存在、已支付或当前状态不可支付");
    }

    return data as unknown as ProjectReferralRecord;
  }

  async list(
    params: ProjectReferralListQueryType,
    visibleProjectIds?: string[] | null,
  ) {
    const { page, pageSize, status, project_id } = params;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = SupabaseDB.getAdminClient()
      .from("project_referrals")
      .select(this.referralSelect, { count: "exact" })
      .order("created_at", { ascending: false });

    if (visibleProjectIds) {
      if (visibleProjectIds.length === 0) {
        return {
          list: [],
          pagination: {
            page,
            pageSize,
            total: 0,
            totalPages: 0,
          },
        };
      }

      query = query.in("project_id", visibleProjectIds);
    }

    if (status) {
      query = query.eq("status", status);
    }

    if (project_id) {
      query = query.eq("project_id", project_id);
    }

    const { data, error, count } = await query.range(from, to);

    if (error) {
      throw Errors.dbError("查询项目介绍费列表失败", error);
    }

    return {
      list: data || [],
      pagination: {
        page,
        pageSize,
        total: count || 0,
        totalPages: count ? Math.ceil(count / pageSize) : 0,
      },
    };
  }
}

export const projectReferralRepository = new ProjectReferralRepository();
