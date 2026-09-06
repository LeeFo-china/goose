import { TenantDouyinLeadsRepository } from "@/repositories/tenant-douyin-leads";

// The first integrated source keeps its physical storage and hydration adapter.
// The fixed profile chooses generic RPCs; clients cannot supply this profile.
export const tenantCustomerLeadsRepository = new TenantDouyinLeadsRepository(undefined, "customer_lead");
