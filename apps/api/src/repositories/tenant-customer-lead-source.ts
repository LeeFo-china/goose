import { z } from "zod";
import { Errors } from "@/errors/error-factory";
import type { TenantDouyinLeadsDatabaseClient } from "./tenant-douyin-leads";

export function scopedLeadQuery(client: TenantDouyinLeadsDatabaseClient,
  mode: "douyin_lead" | "customer_lead", fields: string,
  input: { tenantId: string; leadId: string }) {
  const query = client.from("marketing_leads").select(fields)
    .eq("tenant_id", input.tenantId).eq("id", input.leadId);
  return mode === "customer_lead"
    ? query.in("source", ["douyin_miniapp", "h5"])
    : query.eq("source", "douyin_miniapp");
}

const PageSchema = z.strictObject({ id: z.uuid(), tenant_id: z.uuid(),
  title: z.string().nullable(), slug: z.string().nullable() });

export async function findH5LeadPage(client: TenantDouyinLeadsDatabaseClient,
  tenantId: string, pageId: string) {
  let result;
  try {
    result = await client.from("marketing_pages").select("id,tenant_id,title,slug")
      .eq("tenant_id", tenantId).eq("id", pageId).maybeSingle();
  } catch { throw Errors.dbError("查询线索活动失败"); }
  if (result.error) throw Errors.dbError("查询线索活动失败");
  if (result.data === null) return null;
  const parsed = PageSchema.safeParse(result.data);
  if (!parsed.success || parsed.data.id !== pageId || parsed.data.tenant_id !== tenantId) {
    throw Errors.dbError("解析线索活动失败");
  }
  return parsed.data;
}
