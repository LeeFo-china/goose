import { Errors } from "@/errors/error-factory";
import { SupabaseDB } from "@/utils/supabase";

type CustomerProjectLogShareRow = {
  id: string;
  customer_id: string;
  project_id: string;
  log_id: string;
  selected_copy_id: string | null;
  selected_copy_text: string | null;
  action: string;
  created_at: string | null;
};

class CustomerProjectLogShareRepository {
  async create(input: {
    customer_id: string;
    project_id: string;
    log_id: string;
    selected_copy_id?: string | null;
    selected_copy_text?: string | null;
    action: string;
  }) {
    const { data, error } = await SupabaseDB.getAdminClient()
      .from("customer_project_log_shares")
      .insert({
        customer_id: input.customer_id,
        project_id: input.project_id,
        log_id: input.log_id,
        selected_copy_id: input.selected_copy_id ?? null,
        selected_copy_text: input.selected_copy_text ?? null,
        action: input.action,
      })
      .select("*")
      .single();

    if (error || !data) {
      throw Errors.dbError("创建分享记录失败", error);
    }

    return data as CustomerProjectLogShareRow;
  }
}

export const customerProjectLogShareRepository =
  new CustomerProjectLogShareRepository();
