import { describe, expect, test } from "bun:test";
import { createClient } from "@supabase/supabase-js";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

describe("SupplierPurchaseBatchAccessRepository", () => {
  test("selects only the three workflow access fields", async () => {
    const requests: Request[] = [];
    const context = {
      tenant_id: "a0000000-0000-4000-8000-000000000001",
      project_id: "a0000000-0000-4000-8000-000000000002",
      submitted_by_employee_id: null,
    };
    const fetchStub = (async (input: string | URL | Request, init?: RequestInit) => {
        requests.push(input instanceof Request
          ? input
          : new Request(input.toString(), init));
        return Response.json(context);
      }) as typeof fetch;
    const client = createClient("http://127.0.0.1:54321", "test-key", {
      global: { fetch: fetchStub },
    });
    const { SupplierPurchaseBatchAccessRepository } = await import(
      "./supplier-purchase-batch-access"
    );
    const repository = new SupplierPurchaseBatchAccessRepository(
      () => client as never,
    );

    expect(await repository.findBatchAccessContext(
      context.tenant_id,
      "a0000000-0000-4000-8000-000000000003",
    )).toEqual(context);
    const url = new URL(requests[0]!.url);
    expect(url.searchParams.get("select")).toBe(
      "tenant_id,project_id,submitted_by_employee_id",
    );
    expect(url.searchParams.get("select")).not.toContain("projects");
  });
});
