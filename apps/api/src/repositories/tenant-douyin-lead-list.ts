import { z } from "zod";

import { Errors } from "@/errors/error-factory";
import { TenantDouyinLeadRowSchema } from
  "@/repositories/tenant-douyin-leads-contract";
import type { TenantDouyinLeadListQuery } from
  "@/schema/tenant-douyin-leads";
import type { Json } from "@/types/database";

export const TENANT_DOUYIN_LEAD_FIELDS = [
  "id", "tenant_id", "douyin_miniapp_installation_id", "customer_id",
  "assigned_employee_id", "name", "phone", "community", "lead_status",
  "created_at", "followed_at", "follow_remark", "version",
].join(",");

const EnvelopeSchema = z.strictObject({ data: z.strictObject({
  list: z.array(TenantDouyinLeadRowSchema).max(100),
  total: z.number().int().min(0),
}) });

type Client = { rpc(name: "list_tenant_douyin_leads",
  args: Readonly<Record<string, Json | undefined>>): Promise<{
    readonly data: unknown; readonly error: unknown;
  }> };
export type ScopedLeadListInput = TenantDouyinLeadListQuery & {
  readonly tenantId: string;
  readonly visibleAssigneeIds: readonly string[] | null;
};

export async function listTenantDouyinLeads(
  client: Client,
  input: ScopedLeadListInput,
) {
  if (input.visibleAssigneeIds !== null
    && (input.visibleAssigneeIds.length === 0
      || (input.assigneeId !== undefined
        && !input.visibleAssigneeIds.includes(input.assigneeId)))) {
    return { rows: [], total: 0 };
  }
  let result: Awaited<ReturnType<Client["rpc"]>>;
  try {
    result = await client.rpc("list_tenant_douyin_leads", {
      p_tenant_id: input.tenantId,
      p_visible_assignee_ids: input.visibleAssigneeIds
        ? [...input.visibleAssigneeIds] : null,
      p_status: input.status ?? null,
      p_assignee_id: input.assigneeId ?? null,
      p_date_from: input.dateFrom ? `${input.dateFrom}T00:00:00+08:00` : null,
      p_date_to_exclusive: input.dateTo
        ? `${nextIsoDate(input.dateTo)}T00:00:00+08:00` : null,
      p_keyword: input.keyword ?? null,
      p_page: input.page,
      p_page_size: input.pageSize,
    });
  } catch {
    throw Errors.dbError("查询抖音线索失败");
  }
  if (result.error) throw Errors.dbError("查询抖音线索失败");
  const parsed = EnvelopeSchema.safeParse(result.data);
  const offset = (input.page - 1) * input.pageSize;
  if (!parsed.success || parsed.data.data.list.length > input.pageSize
    || parsed.data.data.total < parsed.data.data.list.length
    || (parsed.data.data.list.length > 0
      && offset + parsed.data.data.list.length > parsed.data.data.total)) {
    throw Errors.dbError("解析抖音线索失败");
  }
  assertScope(parsed.data.data.list, input);
  return { rows: parsed.data.data.list, total: parsed.data.data.total };
}

function assertScope(rows: readonly z.infer<typeof TenantDouyinLeadRowSchema>[],
  input: ScopedLeadListInput): void {
  const visible = input.visibleAssigneeIds === null
    ? null : new Set(input.visibleAssigneeIds);
  const seen = new Set<string>();
  const from = input.dateFrom
    ? Date.parse(`${input.dateFrom}T00:00:00+08:00`) : null;
  const to = input.dateTo
    ? Date.parse(`${nextIsoDate(input.dateTo)}T00:00:00+08:00`) : null;
  const keyword = input.keyword?.toLocaleLowerCase();
  for (const row of rows) {
    const created = Date.parse(row.created_at);
    const matchesKeyword = keyword === undefined || [
      row.name, row.phone, row.community,
    ].some((value) => value?.toLocaleLowerCase().includes(keyword));
    if (row.tenant_id !== input.tenantId || seen.has(row.id)
      || (visible !== null && (row.assigned_employee_id === null
        || !visible.has(row.assigned_employee_id)))
      || (input.assigneeId !== undefined
        && row.assigned_employee_id !== input.assigneeId)
      || (input.status !== undefined && row.lead_status !== input.status)
      || (from !== null && created < from) || (to !== null && created >= to)
      || !matchesKeyword) {
      throw Errors.dbError("解析抖音线索失败");
    }
    seen.add(row.id);
  }
}

function nextIsoDate(value: string): string {
  const next = new Date(`${value}T00:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
}
