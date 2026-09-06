import { expect, test } from "bun:test";
import type { AuthContext } from "@/services/authorization";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

test("shared workflow selects real customer-lead permission without rewriting identity", async () => {
  const { TenantDouyinLeadsService } = await import("./tenant-douyin-leads");
  const seen: string[] = [];
  const auth = { tenantId: "11111111-1111-4111-8111-111111111111",
    employeeId: "22222222-2222-4222-8222-222222222222" } as AuthContext;
  const service = new TenantDouyinLeadsService({
    accessPolicy: {
      assertTenantContext: (context: AuthContext) => {
        expect(context).toBe(auth);
        return context.tenantId;
      },
      assertPermission: (_context: AuthContext, permission: string) => {
        seen.push(permission); return "all";
      },
      getVisibleCustomerOwnerIds: async () => [],
    },
  } as never, "customer_lead");
  await expect(service.list(auth, {})).resolves.toMatchObject({ list: [] });
  expect(seen).toEqual(["customer_lead.read"]);
});
