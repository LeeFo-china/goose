import { z } from "zod";

import { Errors } from "@/errors/error-factory";
import { TenantOnboardingPartnerAssistStatusSchema } from "@/schema/tenant-onboarding";
import { SupabaseDB } from "@/utils/supabase";

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

const PARTNER_ASSIST_SELECT = [
  "id",
  "company_name",
  "admin_phone",
  "address_city",
  "address_district",
  "service_region_codes",
  "partner_assist_status",
  "partner_assist_requested_at",
  "partner_assist_due_at",
  "version",
  "created_at",
  "updated_at",
].join(",");

const PartnerAssistTaskSchema = z.object({
  id: z.uuid(),
  company_name: z.string(),
  admin_phone: z.string(),
  address_city: z.string(),
  address_district: z.string().nullable(),
  service_region_codes: z.array(z.string()),
  partner_assist_status: TenantOnboardingPartnerAssistStatusSchema,
  partner_assist_requested_at: z.string().nullable(),
  partner_assist_due_at: z.string().nullable(),
  version: z.number().int().positive(),
  created_at: z.string(),
  updated_at: z.string(),
});

export type TenantOnboardingPartnerAssistTaskRecord = z.infer<
  typeof PartnerAssistTaskSchema
>;

export type TenantOnboardingPartnerAssistMutationResult =
  | { status: "updated"; task: TenantOnboardingPartnerAssistTaskRecord }
  | {
      status:
        | "application_not_found"
        | "state_conflict"
        | "version_conflict";
    };

export interface TenantOnboardingPartnerAssistRepositoryPort {
  listPartnerAssistTasks(input: {
    partnerId: string;
    page: number;
    pageSize: number;
    cutoff: string;
    status?: TenantOnboardingPartnerAssistTaskRecord["partner_assist_status"];
  }): Promise<{
    list: TenantOnboardingPartnerAssistTaskRecord[];
    pagination: {
      page: number;
      pageSize: number;
      total: number;
      totalPages: number;
    };
  }>;
  findPartnerAssistTask(input: {
    applicationId: string;
    partnerId: string;
    cutoff: string;
  }): Promise<TenantOnboardingPartnerAssistTaskRecord | null>;
  submitPartnerAssist(input: {
    applicationId: string;
    partnerId: string;
    memberId: string;
    decision: "verified" | "supplement_suggested" | "not_recommended";
    remark: string | null;
    expectedVersion: number;
    now: string;
  }): Promise<TenantOnboardingPartnerAssistMutationResult>;
  expireDuePartnerAssistTasks(input: {
    cutoff: string;
    partnerId?: string;
  }): Promise<string[]>;
}

type UntypedTable = {
  select: (...args: unknown[]) => UntypedTable;
  eq: (...args: unknown[]) => UntypedTable;
  neq: (...args: unknown[]) => UntypedTable;
  or: (...args: unknown[]) => UntypedTable;
  order: (...args: unknown[]) => UntypedTable;
  range: (...args: unknown[]) => UntypedTable;
  maybeSingle: () => Promise<{ data: unknown; error: unknown }>;
  then: Promise<{
    data: unknown;
    error: unknown;
    count: number | null;
  }>["then"];
};

type UntypedClient = {
  from: (table: "tenant_onboarding_applications") => UntypedTable;
  rpc: (
    name: string,
    params: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: unknown }>;
};

function client(): UntypedClient {
  return SupabaseDB.getAdminClient() as unknown as UntypedClient;
}

function normalizePagination(pageValue: number, pageSizeValue: number) {
  const page = Number.isInteger(pageValue) && pageValue > 0
    ? pageValue
    : DEFAULT_PAGE;
  const pageSize = Number.isInteger(pageSizeValue) && pageSizeValue > 0
    ? Math.min(pageSizeValue, MAX_PAGE_SIZE)
    : DEFAULT_PAGE_SIZE;
  const start = (page - 1) * pageSize;
  return { page, pageSize, start, end: start + pageSize - 1 };
}

function parseTask(value: unknown, message: string) {
  const parsed = PartnerAssistTaskSchema.safeParse(value);
  if (!parsed.success) throw Errors.dbError(message, parsed.error.issues);
  return parsed.data;
}

function parseTaskList(value: unknown, message: string) {
  const parsed = z.array(PartnerAssistTaskSchema).safeParse(value);
  if (!parsed.success) throw Errors.dbError(message, parsed.error.issues);
  return parsed.data;
}

export class TenantOnboardingPartnerAssistRepository
  implements TenantOnboardingPartnerAssistRepositoryPort {
  constructor(private readonly clientProvider: () => UntypedClient = client) {}

  async listPartnerAssistTasks(input: {
    partnerId: string;
    page: number;
    pageSize: number;
    cutoff: string;
    status?: TenantOnboardingPartnerAssistTaskRecord["partner_assist_status"];
  }) {
    const pagination = normalizePagination(input.page, input.pageSize);
    let query = this.clientProvider()
      .from("tenant_onboarding_applications")
      .select(PARTNER_ASSIST_SELECT, { count: "exact" })
      .eq("candidate_partner_id", input.partnerId)
      .neq("partner_assist_status", "not_applicable")
      .or(`partner_assist_status.neq.pending,partner_assist_due_at.gt.${input.cutoff}`);
    if (input.status) {
      query = query.eq("partner_assist_status", input.status);
    }
    const { data, error, count } = await query
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(pagination.start, pagination.end);
    if (error) throw Errors.dbError("查询城市合伙人装企协查队列失败", error);
    return {
      list: parseTaskList(data ?? [], "查询城市合伙人装企协查队列失败"),
      pagination: {
        page: pagination.page,
        pageSize: pagination.pageSize,
        total: count ?? 0,
        totalPages: count ? Math.ceil(count / pagination.pageSize) : 0,
      },
    };
  }

  async findPartnerAssistTask(input: {
    applicationId: string;
    partnerId: string;
    cutoff: string;
  }) {
    const { data, error } = await this.clientProvider()
      .from("tenant_onboarding_applications")
      .select(PARTNER_ASSIST_SELECT)
      .eq("candidate_partner_id", input.partnerId)
      .neq("partner_assist_status", "not_applicable")
      .or(`partner_assist_status.neq.pending,partner_assist_due_at.gt.${input.cutoff}`)
      .eq("id", input.applicationId)
      .maybeSingle();
    if (error) throw Errors.dbError("查询城市合伙人装企协查详情失败", error);
    return data === null
      ? null
      : parseTask(data, "查询城市合伙人装企协查详情失败");
  }

  async submitPartnerAssist(input: {
    applicationId: string;
    partnerId: string;
    memberId: string;
    decision: "verified" | "supplement_suggested" | "not_recommended";
    remark: string | null;
    expectedVersion: number;
    now: string;
  }): Promise<TenantOnboardingPartnerAssistMutationResult> {
    const { data, error } = await this.clientProvider().rpc(
      "submit_tenant_onboarding_partner_assist",
      {
        p_application_id: input.applicationId,
        p_partner_id: input.partnerId,
        p_partner_member_id: input.memberId,
        p_decision: input.decision,
        p_remark: input.remark,
        p_expected_version: input.expectedVersion,
        p_now: input.now,
      },
    );
    if (error) throw Errors.dbError("提交城市合伙人装企协查失败", error);
    return parseMutation(data);
  }

  async expireDuePartnerAssistTasks(input: {
    cutoff: string;
    partnerId?: string;
  }) {
    const { data, error } = await this.clientProvider().rpc(
      "expire_tenant_onboarding_partner_assists",
      {
        p_cutoff: input.cutoff,
        p_partner_id: input.partnerId ?? null,
      },
    );
    if (error) throw Errors.dbError("过期城市合伙人装企协查任务失败", error);
    const parsed = z.array(z.object({ application_id: z.uuid() })).safeParse(
      data ?? [],
    );
    if (!parsed.success) {
      throw Errors.dbError("过期城市合伙人装企协查任务失败", parsed.error.issues);
    }
    return parsed.data.map((row) => row.application_id);
  }
}

function parseMutation(value: unknown): TenantOnboardingPartnerAssistMutationResult {
  const status = z.object({ status: z.string() }).safeParse(value);
  if (!status.success) {
    throw Errors.dbError("提交城市合伙人装企协查失败", status.error.issues);
  }
  if (status.data.status === "updated") {
    const result = z.object({ status: z.literal("updated"), task: PartnerAssistTaskSchema })
      .safeParse(value);
    if (!result.success) {
      throw Errors.dbError("提交城市合伙人装企协查失败", result.error.issues);
    }
    return result.data;
  }
  if (
    status.data.status === "application_not_found" ||
    status.data.status === "state_conflict" ||
    status.data.status === "version_conflict"
  ) {
    return { status: status.data.status };
  }
  throw Errors.dbError("提交城市合伙人装企协查失败", {
    message: `unknown mutation status: ${status.data.status}`,
  });
}

export const tenantOnboardingPartnerAssistRepository =
  new TenantOnboardingPartnerAssistRepository();
