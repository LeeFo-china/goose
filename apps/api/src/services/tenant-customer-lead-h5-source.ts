import type { CustomerLeadSourceContext } from "@gooes/domain";
import type { TenantDouyinLeadRow } from "@/repositories/tenant-douyin-leads-contract";

// Only whitelisted public context leaves the API, never arbitrary form_data or identity tokens.
export function serializeH5LeadSource(lead: TenantDouyinLeadRow,
  page: { title: string | null; slug: string | null } | null): CustomerLeadSourceContext {
  const demand = lead.form_data?.demand;
  return {
    demand: typeof demand === "string" ? demand.trim().slice(0, 1000) || null : null,
    attribution: {}, budget: null, ai: null,
    h5: { page_id: lead.page_id ?? null, page_version_id: lead.page_version_id ?? null,
      page_title: page?.title ?? null, page_slug: page?.slug ?? null },
  };
}
