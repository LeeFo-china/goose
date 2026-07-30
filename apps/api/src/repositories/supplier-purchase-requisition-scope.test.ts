import { describe, expect, test } from "bun:test";
import { createClient } from "@supabase/supabase-js";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const TENANT_ID = "65000000-0000-4000-8000-000000000001";
const REQUISITION_ID = "65000000-0000-4000-8000-000000000002";
const PROJECT_ID = "65000000-0000-4000-8000-000000000003";
const RELATIONSHIP_ID = "65000000-0000-4000-8000-000000000004";
const EMPLOYEE_ID = "65000000-0000-4000-8000-000000000005";

type ResponseSpec = { body: unknown; status?: number };

async function repositoryFor(
  responder: (request: Request) => ResponseSpec,
) {
  const requests: Request[] = [];
  const fetchStub = (async (
    input: string | URL | Request,
    init?: RequestInit,
  ) => {
    const request = input instanceof Request
      ? input
      : new Request(input.toString(), init);
    requests.push(request);
    const response = responder(request);
    return new Response(JSON.stringify(response.body), {
      status: response.status ?? 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  const client = createClient("http://127.0.0.1:54321", "test-key", {
    global: { fetch: fetchStub },
  });
  const { SupplierPurchaseRequisitionsRepository } = await import(
    "./supplier-purchase-requisitions"
  );
  return {
    repository: new SupplierPurchaseRequisitionsRepository(
      () => client as never,
    ),
    requests,
  };
}

describe("SupplierPurchaseRequisitionsRepository scope lookup", () => {
  test("pushes tenant, id, and visible projects into a minimal strict query", async () => {
    const scope = {
      id: REQUISITION_ID,
      project_id: PROJECT_ID,
      tenant_supplier_id: RELATIONSHIP_ID,
      created_by_employee_id: EMPLOYEE_ID,
      budget_status: "over_budget",
    } as const;
    const { repository, requests } = await repositoryFor(() => ({
      body: scope,
    }));

    expect(await repository.findRequisitionScope({
      tenant_id: TENANT_ID,
      requisition_id: REQUISITION_ID,
      visible_project_ids: [PROJECT_ID],
    })).toEqual(scope);

    expect(requests).toHaveLength(1);
    const url = new URL(requests[0]!.url);
    expect(url.pathname).toEndWith("/supplier_purchase_requisitions");
    expect(url.searchParams.get("tenant_id")).toBe(`eq.${TENANT_ID}`);
    expect(url.searchParams.get("id")).toBe(`eq.${REQUISITION_ID}`);
    expect(url.searchParams.get("project_id")).toBe(`in.(${PROJECT_ID})`);
    expect(url.searchParams.get("select")).toBe([
      "id",
      "project_id",
      "tenant_supplier_id",
      "created_by_employee_id",
      "budget_status",
    ].join(","));
    expect(url.searchParams.get("select")).not.toContain("total_amount");
    expect(url.searchParams.get("select")).not.toContain("remark");
  });

  test("treats null as all projects and skips the database for an empty scope", async () => {
    const scope = {
      id: REQUISITION_ID,
      project_id: PROJECT_ID,
      tenant_supplier_id: RELATIONSHIP_ID,
      created_by_employee_id: EMPLOYEE_ID,
      budget_status: "within_budget",
    } as const;
    const { repository, requests } = await repositoryFor(() => ({
      body: scope,
    }));

    expect(await repository.findRequisitionScope({
      tenant_id: TENANT_ID,
      requisition_id: REQUISITION_ID,
      visible_project_ids: [],
    })).toBeNull();
    expect(requests).toHaveLength(0);

    expect(await repository.findRequisitionScope({
      tenant_id: TENANT_ID,
      requisition_id: REQUISITION_ID,
      visible_project_ids: null,
    })).toEqual(scope);
    expect(requests).toHaveLength(1);
    expect(new URL(requests[0]!.url).searchParams.has("project_id"))
      .toBeFalse();
  });

  test("returns null for hidden rows and rejects malformed or failed reads", async () => {
    const { repository: hidden } = await repositoryFor(() => ({
      body: null,
    }));
    expect(await hidden.findRequisitionScope({
      tenant_id: TENANT_ID,
      requisition_id: REQUISITION_ID,
      visible_project_ids: [PROJECT_ID],
    })).toBeNull();

    const { repository: malformed } = await repositoryFor(() => ({
      body: {
        id: REQUISITION_ID,
        project_id: PROJECT_ID,
        tenant_supplier_id: RELATIONSHIP_ID,
        created_by_employee_id: EMPLOYEE_ID,
        budget_status: "within_budget",
        remark: "不应读取",
      },
    }));
    await expect(malformed.findRequisitionScope({
      tenant_id: TENANT_ID,
      requisition_id: REQUISITION_ID,
      visible_project_ids: [PROJECT_ID],
    })).rejects.toMatchObject({ code: "DB_ERROR" });

    const { repository: failed } = await repositoryFor(() => ({
      body: { code: "XX000", message: "database failed" },
      status: 500,
    }));
    await expect(failed.findRequisitionScope({
      tenant_id: TENANT_ID,
      requisition_id: REQUISITION_ID,
      visible_project_ids: [PROJECT_ID],
    })).rejects.toMatchObject({ code: "DB_ERROR" });
  });
});
