import { describe, expect, test } from "bun:test";
import { createClient } from "@supabase/supabase-js";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const TENANT_ID = "88000000-0000-4000-8000-000000000001";
const PROJECT_ID = "88000000-0000-4000-8000-000000000002";
const PAYABLE_ID = "88000000-0000-4000-8000-000000000003";

test("batch fetch uses a bounded dedicated RPC and visible project scope", async () => {
  const requests: Request[] = [];
  const fetchStub = (async (input: string | URL | Request, init?: RequestInit) => {
    const request = input instanceof Request
      ? input
      : new Request(input.toString(), init);
    requests.push(request);
    return new Response("[]", {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  const client = createClient("http://127.0.0.1:54321", "test-key", {
    global: { fetch: fetchStub },
  });
  const { SupplierPayablesRepository } = await import("./supplier-payables");
  const repository = new SupplierPayablesRepository(() => client as never);

  expect(await repository.batch({
    tenant_id: TENANT_ID,
    visible_project_ids: [PROJECT_ID],
    ids: [PAYABLE_ID],
  })).toEqual([]);
  expect(new URL(requests[0]!.url).pathname).toEndWith(
    "/rpc/get_supplier_payables_by_ids",
  );
  expect(await requests[0]!.clone().json()).toEqual({
    p_tenant_id: TENANT_ID,
    p_visible_project_ids: [PROJECT_ID],
    p_payable_event_ids: [PAYABLE_ID],
  });
});
