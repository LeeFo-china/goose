import { Errors } from "@/errors/error-factory";
import { SupabaseDB } from "@/utils/supabase/index";

export type ProjectAcceptanceOpenTicketStatus =
  | "active"
  | "used"
  | "expired"
  | "revoked";

export type ProjectAcceptanceOpenTicketRow = {
  id: string;
  ticket: string;
  acceptance_id: string;
  project_id: string;
  customer_id: string;
  phone: string;
  scene: "project_acceptance_customer_review";
  status: ProjectAcceptanceOpenTicketStatus;
  link_type: string | null;
  link_url: string | null;
  send_status: string | null;
  send_error: string | null;
  sent_at: string | null;
  expire_at: string;
  used_at: string | null;
  last_verified_at: string | null;
  verify_count: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

class ProjectAcceptanceOpenTicketRepository {
  async create(input: {
    ticket: string;
    acceptance_id: string;
    project_id: string;
    customer_id: string;
    phone: string;
    expire_at: string;
    created_by: string | null;
    link_type?: string | null;
    link_url?: string | null;
  }) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("project_acceptance_open_tickets")
      .insert({
        ...input,
        scene: "project_acceptance_customer_review",
        status: "active",
      })
      .select("*")
      .single();

    if (error) throw Errors.dbError("创建验收短信访问票据失败", error);
    return data as ProjectAcceptanceOpenTicketRow;
  }

  async findReusable(input: {
    acceptance_id: string;
    customer_id: string;
    phone: string;
  }) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("project_acceptance_open_tickets")
      .select("*")
      .eq("acceptance_id", input.acceptance_id)
      .eq("customer_id", input.customer_id)
      .eq("phone", input.phone)
      .eq("scene", "project_acceptance_customer_review")
      .eq("status", "active")
      .gt("expire_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw Errors.dbError("查询验收短信访问票据失败", error);
    return (data || null) as ProjectAcceptanceOpenTicketRow | null;
  }

  async findByTicket(ticket: string) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("project_acceptance_open_tickets")
      .select("*")
      .eq("ticket", ticket)
      .maybeSingle();

    if (error) throw Errors.dbError("查询验收短信访问票据失败", error);
    return (data || null) as ProjectAcceptanceOpenTicketRow | null;
  }

  async findLatestByAcceptance(acceptanceId: string) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("project_acceptance_open_tickets")
      .select("*")
      .eq("acceptance_id", acceptanceId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw Errors.dbError("查询验收短信通知记录失败", error);
    return (data || null) as ProjectAcceptanceOpenTicketRow | null;
  }

  async update(
    id: string,
    input: Partial<
      Pick<
        ProjectAcceptanceOpenTicketRow,
        | "status"
        | "link_type"
        | "link_url"
        | "send_status"
        | "send_error"
        | "sent_at"
        | "used_at"
        | "last_verified_at"
        | "verify_count"
      >
    >,
  ) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("project_acceptance_open_tickets")
      .update(input)
      .eq("id", id)
      .select("*")
      .maybeSingle();

    if (error) throw Errors.dbError("更新验收短信访问票据失败", error);
    if (!data) throw Errors.badRequest("验收短信访问票据不存在");
    return data as ProjectAcceptanceOpenTicketRow;
  }
}

export const projectAcceptanceOpenTicketRepository =
  new ProjectAcceptanceOpenTicketRepository();
