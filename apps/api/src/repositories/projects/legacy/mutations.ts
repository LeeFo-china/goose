import { Errors, SupabaseDB } from "./shared";
import type { CreateProjectInput, UpdateProjectInput } from "./shared";

export async function update(this: any, id: string, input: UpdateProjectInput, tenantId?: string | null) {
  let query = SupabaseDB.getAdminClient()
    .from("projects")
    .update(input)
    .eq("id", id);

  if (tenantId) {
    query = query.eq("tenant_id", tenantId);
  }

  const { data, error } = await query.select("*").maybeSingle();

  if (error) {
    throw Errors.dbError("更新项目失败", error);
  }

  if (!data) {
    throw Errors.badRequest("项目不存在或更新失败");
  }

  return data;
}

export async function updateIfStatus(this: any, input: {
  id: string;
  tenantId: string;
  expectedStatus: string;
  payload: UpdateProjectInput;
}) {
  const { data, error } = await SupabaseDB.getAdminClient()
    .from("projects")
    .update(input.payload)
    .eq("id", input.id)
    .eq("tenant_id", input.tenantId)
    .eq("status", input.expectedStatus)
    .select("*")
    .maybeSingle();

  if (error) {
    throw Errors.dbError("更新项目状态失败", error);
  }

  return data;
}
