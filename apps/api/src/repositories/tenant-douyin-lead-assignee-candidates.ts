import { z } from "zod";

import { Errors } from "@/errors/error-factory";
import type { TenantDouyinLeadAssigneeCandidatesQuery } from
  "@/schema/tenant-douyin-leads";

type DatabaseResult = {
  readonly data: unknown;
  readonly error: unknown;
  readonly count?: number | null;
};
interface CandidateQuery extends PromiseLike<DatabaseResult> {
  select(...args: unknown[]): CandidateQuery;
  eq(...args: unknown[]): CandidateQuery;
  ilike(...args: unknown[]): CandidateQuery;
  order(...args: unknown[]): CandidateQuery;
  range(...args: unknown[]): CandidateQuery;
}
interface CandidateClient {
  from(table: string): CandidateQuery;
}
type CandidateInput = TenantDouyinLeadAssigneeCandidatesQuery & {
  tenantId: string;
  scope: "self" | "department" | "assigned" | "all";
  employeeId: string | null;
  tenantDepartmentId: string | null;
};

const CandidateRowSchema = z.strictObject({
  id: z.uuid(),
  name: z.string().nullable(),
});
const ERROR_MESSAGE = "查询抖音线索负责人候选失败";

export async function listTenantDouyinLeadAssigneeCandidates(
  client: CandidateClient,
  input: CandidateInput,
) {
  try {
    const offset = (input.page - 1) * input.pageSize;
    let query = client.from("employees").select("id,name", { count: "exact" })
      .eq("tenant_id", input.tenantId).eq("status", "active");
    if (input.scope === "department") {
      if (!input.tenantDepartmentId) throw Errors.dbError(ERROR_MESSAGE);
      query = query.eq("tenant_department_id", input.tenantDepartmentId);
    } else if (input.scope !== "all") {
      if (!input.employeeId) throw Errors.dbError(ERROR_MESSAGE);
      query = query.eq("id", input.employeeId);
    }
    if (input.keyword) query = query.ilike("name", `%${input.keyword}%`);
    const result = await query.order("name", { ascending: true })
      .order("id", { ascending: true })
      .range(offset, offset + input.pageSize - 1);
    if (result.error) throw Errors.dbError(ERROR_MESSAGE);
    const rows = CandidateRowSchema.array().safeParse(result.data ?? []);
    if (!rows.success) throw Errors.dbError("解析抖音线索负责人候选失败");
    const total = result.count;
    if (typeof total !== "number" || !Number.isInteger(total) || total < 0) {
      throw Errors.dbError("查询抖音线索负责人候选总数失败");
    }
    return { rows: rows.data, total };
  } catch {
    throw Errors.dbError(ERROR_MESSAGE);
  }
}
