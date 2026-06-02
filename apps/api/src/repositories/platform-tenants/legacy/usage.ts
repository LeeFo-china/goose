import { Errors, EMPTY_USAGE, USAGE_TABLES } from "./shared";
import type {
  PlatformTenantTemplateApplication,
  PlatformTenantUsageStats,
} from "./shared";

export async function getUsageStats(this: any, tenantIds: string[]) {
  const uniqueTenantIds = Array.from(new Set(tenantIds.filter(Boolean)));
  const result = new Map<string, PlatformTenantUsageStats>();

  for (const tenantId of uniqueTenantIds) {
    result.set(tenantId, { ...EMPTY_USAGE });
  }

  if (uniqueTenantIds.length === 0) {
    return result;
  }

  await Promise.all(
    uniqueTenantIds.flatMap((tenantId) =>
      USAGE_TABLES.map(async ({ table, key }) => {
        const { count, error } = await this.from(table)
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", tenantId);

        if (error) {
          throw Errors.dbError("查询租户用量统计失败", { table, error });
        }

        const usage = result.get(tenantId);
        if (usage) {
          usage[key] = count || 0;
        }
      })
    ),
  );

  return result;
}

export async function getLatestTemplateApplication(this: any, tenantId: string) {
  const { data, error } = await this.from("tenant_template_applications")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("applied_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw Errors.dbError("查询租户模板初始化记录失败", error);
  }

  return (data || null) as PlatformTenantTemplateApplication | null;
}
