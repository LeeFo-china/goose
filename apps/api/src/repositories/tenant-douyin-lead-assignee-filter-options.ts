import { z } from "zod";

import { Errors } from "@/errors/error-factory";
import type { TenantDouyinLeadAssigneeFilterOptionsQuery } from
  "@/schema/tenant-douyin-leads";
import type { Json } from "@/types/database";

type DatabaseResult = { data: unknown; error: unknown };
interface FilterOptionsClient {
  rpc(name: "list_tenant_douyin_lead_assignee_filter_options",
    args: Readonly<Record<string, Json | undefined>>): PromiseLike<DatabaseResult>;
}
type FilterOptionsInput = TenantDouyinLeadAssigneeFilterOptionsQuery & {
  tenantId: string;
  visibleEmployeeIds: readonly string[] | null;
};
const FilterOptionRowSchema = z.strictObject({
  id: z.uuid(), name: z.string().nullable(),
});
const FilterOptionsEnvelopeSchema = z.strictObject({
  data: z.strictObject({
    list: FilterOptionRowSchema.array(), total: z.int().nonnegative(),
  }),
});
const RPC_NAME = "list_tenant_douyin_lead_assignee_filter_options";
const ERROR_MESSAGE = "查询抖音线索负责人筛选项失败";

export async function listTenantDouyinLeadAssigneeFilterOptions(
  client: FilterOptionsClient,
  input: FilterOptionsInput,
) {
  if (input.visibleEmployeeIds !== null
    && input.visibleEmployeeIds.length === 0) return { rows: [], total: 0 };
  try {
    const result = await client.rpc(RPC_NAME, {
      p_tenant_id: input.tenantId,
      p_visible_employee_ids: input.visibleEmployeeIds === null
        ? null : [...input.visibleEmployeeIds],
      p_page: input.page,
      p_page_size: input.pageSize,
      p_keyword: input.keyword ?? null,
    });
    if (result.error) throw Errors.dbError(ERROR_MESSAGE);
    const envelope = FilterOptionsEnvelopeSchema.safeParse(result.data);
    if (!envelope.success) throw Errors.dbError(ERROR_MESSAGE);
    const { list, total } = envelope.data.data;
    const visibleIds = input.visibleEmployeeIds === null
      ? null : new Set(input.visibleEmployeeIds);
    if (list.length > input.pageSize || total < list.length
      || new Set(list.map((row) => row.id)).size !== list.length
      || (visibleIds && list.some((row) => !visibleIds.has(row.id)))) {
      throw Errors.dbError(ERROR_MESSAGE);
    }
    return { rows: list, total };
  } catch {
    throw Errors.dbError(ERROR_MESSAGE);
  }
}
