import { expect, spyOn, test } from "bun:test";
import type { AuthContext } from "@/services/authorization";
process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

test("legacy tenant H5 writes fail closed without calling mutable repositories", async () => {
  const { marketingPageRepository, accessPolicyService } = await import("./shared");
  const { updateLead, convertLeadToCustomer } = await import("./leads-events");
  const tenant = spyOn(accessPolicyService, "assertTenantId").mockReturnValue("tenant");
  const update = spyOn(marketingPageRepository, "updateLead").mockResolvedValue(null as never);
  const convert = spyOn(marketingPageRepository, "convertLeadToCustomer").mockResolvedValue(null as never);
  try {
    const auth = { employeeId: "employee" } as AuthContext;
    await expect(updateLead.call({}, auth, "lead", { lead_status: "contacted" }))
      .rejects.toMatchObject({ statusCode: 409, code: "CUSTOMER_LEAD_LEGACY_WRITE_DISABLED" });
    await expect(convertLeadToCustomer.call({}, auth, "lead", {}))
      .rejects.toMatchObject({ statusCode: 409, code: "CUSTOMER_LEAD_LEGACY_WRITE_DISABLED" });
    expect(update).not.toHaveBeenCalled();
    expect(convert).not.toHaveBeenCalled();
  } finally { tenant.mockRestore(); update.mockRestore(); convert.mockRestore(); }
});

test("tenant H5 duplicate submission preserves its existing customer despite a different token identity", async () => {
  const { marketingPageRepository } = await import("./shared");
  const { submitLead } = await import("./leads-events");
  const existing = { id: "lead", customer_id: "original-customer", phone: "13800138000" };
  const recent = spyOn(marketingPageRepository, "findRecentLeadByPageAndPhone")
    .mockResolvedValue(existing as never);
  const update = spyOn(marketingPageRepository, "updateRecentLeadSubmission")
    .mockResolvedValue(existing as never);
  try {
    const service = {
      getPublishedPageBySlug: async () => ({ page: { id: "page", tenant_id: "tenant" }, version: { id: "version" } }),
      resolveH5MarketingIdentity: () => ({ customerId: "another-customer", wxOpenid: null, status: "identified" }),
    };
    await submitLead.call(service, { slug: "activity", phone: existing.phone,
      form_data: {}, requestIp: null, userAgent: null });
    expect(update).toHaveBeenCalledWith(existing.id, expect.objectContaining({ customerId: "original-customer" }));
  } finally { recent.mockRestore(); update.mockRestore(); }
});
