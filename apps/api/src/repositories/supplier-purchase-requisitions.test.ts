import { describe, expect, test } from "bun:test";
import { createClient } from "@supabase/supabase-js";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const TENANT_ID = "60000000-0000-4000-8000-000000000001";
const REQUISITION_ID = "60000000-0000-4000-8000-000000000002";
const PROJECT_ID = "60000000-0000-4000-8000-000000000003";
const RELATIONSHIP_ID = "60000000-0000-4000-8000-000000000004";
const SUPPLIER_ID = "60000000-0000-4000-8000-000000000005";
const SKU_ID = "60000000-0000-4000-8000-000000000006";
const COST_CATEGORY_ID = "60000000-0000-4000-8000-000000000007";
const USER_ID = "60000000-0000-4000-8000-000000000008";
const EMPLOYEE_ID = "60000000-0000-4000-8000-000000000009";
const PURCHASE_ORDER_ID = "60000000-0000-4000-8000-000000000010";
const AT = "2026-07-30T08:00:00.000Z";

type ResponseSpec = { body: unknown; count?: number; status?: number };

async function repositoryFor(
  responder: (request: Request, index: number) => ResponseSpec,
) {
  const requests: Request[] = [];
  const fetchStub = (async (
    input: string | URL | Request,
    init?: RequestInit,
  ) => {
    const request = input instanceof Request
      ? input
      : new Request(input.toString(), init);
    const response = responder(request, requests.push(request) - 1);
    return new Response(JSON.stringify(response.body), {
      status: response.status ?? 200,
      headers: {
        "content-type": "application/json",
        ...(response.count === undefined
          ? {}
          : { "content-range": `0-0/${response.count}` }),
      },
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

describe("SupplierPurchaseRequisitionsRepository", () => {
  test("lists only visible tenant projects with all filters and bounded pagination", async () => {
    const { repository, requests } = await repositoryFor(() => ({
      body: [requisition],
      count: 21,
    }));

    const result = await repository.listRequisitions({
      tenant_id: TENANT_ID,
      visible_project_ids: [PROJECT_ID],
      page: 2,
      pageSize: 20,
      keyword: " PR-1,() ",
      status: "pending_approval",
      budget_status: "over_budget",
      project_id: PROJECT_ID,
      tenant_supplier_id: RELATIONSHIP_ID,
    });

    expect(result.pagination).toEqual({
      page: 2,
      pageSize: 20,
      total: 21,
      totalPages: 2,
    });
    const request = requests[0]!;
    const url = new URL(request.url);
    expect(url.searchParams.get("tenant_id")).toBe(`eq.${TENANT_ID}`);
    expect(url.searchParams.get("project_id")).toContain(PROJECT_ID);
    expect(url.searchParams.get("status")).toBe("eq.pending_approval");
    expect(url.searchParams.get("budget_status")).toBe("eq.over_budget");
    expect(url.searchParams.get("tenant_supplier_id")).toBe(
      `eq.${RELATIONSHIP_ID}`,
    );
    expect(url.searchParams.get("offset")).toBe("20");
    expect(url.searchParams.get("limit")).toBe("20");
    expect(url.searchParams.get("order")).toBe("updated_at.desc,id.desc");
    expect(url.searchParams.get("select")).toContain("total_amount::text");
    expect(url.searchParams.get("select")).not.toContain("*");
    expect(url.searchParams.get("or")).toBe(
      "(request_no.ilike.%PR-1%,reason.ilike.%PR-1%)",
    );
    expect(request.headers.get("prefer")).toContain("count=exact");
  });

  test("does not query an empty or excluded project scope", async () => {
    const { repository, requests } = await repositoryFor(() => {
      throw new Error("不应访问数据库");
    });

    const empty = await repository.listRequisitions({
      tenant_id: TENANT_ID,
      visible_project_ids: [],
      page: 1,
      pageSize: 20,
    });
    const excluded = await repository.listRequisitions({
      tenant_id: TENANT_ID,
      visible_project_ids: ["60000000-0000-4000-8000-000000000099"],
      project_id: PROJECT_ID,
      page: 1,
      pageSize: 20,
    });

    expect(empty.list).toEqual([]);
    expect(excluded.list).toEqual([]);
    expect(requests).toHaveLength(0);
  });

  test("loads tenant detail with bounded budget snapshots and paginates items separately", async () => {
    const { repository, requests } = await repositoryFor((_request, index) => {
      if (index === 0) return { body: requisition };
      if (index === 1) return { body: [commitment] };
      return { body: [item], count: 1 };
    });

    const detail = await repository.findRequisition(
      TENANT_ID,
      REQUISITION_ID,
    );
    const items = await repository.listItems({
      tenant_id: TENANT_ID,
      requisition_id: REQUISITION_ID,
      page: 1,
      pageSize: 20,
    });

    expect(detail).toEqual({
      requisition,
      budget_snapshots: [commitment],
    });
    expect(items.list).toEqual([item]);
    const detailUrl = new URL(requests[0]!.url);
    expect(detailUrl.searchParams.get("tenant_id")).toBe(`eq.${TENANT_ID}`);
    expect(detailUrl.searchParams.get("id")).toBe(`eq.${REQUISITION_ID}`);
    const budgetUrl = new URL(requests[1]!.url);
    expect(budgetUrl.pathname).toEndWith("/project_cost_commitments");
    expect(budgetUrl.searchParams.get("tenant_id")).toBe(`eq.${TENANT_ID}`);
    expect(budgetUrl.searchParams.get("source_id")).toBe(
      `eq.${REQUISITION_ID}`,
    );
    expect(budgetUrl.searchParams.get("source_type")).toBe(
      "eq.supplier_purchase_requisition",
    );
    expect(budgetUrl.searchParams.get("limit")).toBe("100");
    const itemUrl = new URL(requests[2]!.url);
    expect(itemUrl.searchParams.get("purchase_requisition_id")).toBe(
      `eq.${REQUISITION_ID}`,
    );
    expect(itemUrl.searchParams.get("order")).toBe("line_no.asc,id.asc");
    expect(itemUrl.searchParams.get("limit")).toBe("20");
  });

  test("does not load budget snapshots when the tenant requisition is absent", async () => {
    const { repository, requests } = await repositoryFor(() => ({
      body: null,
    }));

    expect(await repository.findRequisition(TENANT_ID, REQUISITION_ID))
      .toBeNull();
    expect(requests).toHaveLength(1);
  });

  test("uses complete p-prefixed parameters and preserves numeric strings", async () => {
    const statuses = [
      "saved",
      "submitted",
      "approved",
      "cancelled",
      "converted",
    ] as const;
    const { repository, requests } = await repositoryFor((_request, index) => ({
      body: {
        status: statuses[index],
        idempotent: false,
        requisition: {
          ...requisition,
          status: statuses[index] === "saved"
            ? "draft"
            : statuses[index] === "submitted"
            ? "pending_approval"
            : statuses[index],
          purchase_order_id: statuses[index] === "converted"
            ? PURCHASE_ORDER_ID
            : null,
          version: index + 1,
        },
        ...(statuses[index] === "converted"
          ? { purchase_order_id: PURCHASE_ORDER_ID }
          : {}),
        version: index + 1,
      },
    }));
    const context = {
      tenant_id: TENANT_ID,
      requisition_id: REQUISITION_ID,
      expected_version: 1,
      actor_user_id: USER_ID,
      actor_employee_id: EMPLOYEE_ID,
      idempotency_key: "purchase-requisition:command",
    };

    await repository.saveDraft({
      ...context,
      project_id: PROJECT_ID,
      tenant_supplier_id: RELATIONSHIP_ID,
      expected_delivery_date: null,
      reason: "项目现场需要主材",
      remark: null,
      items: [{
        supplier_sku_id: SKU_ID,
        cost_category_id: COST_CATEGORY_ID,
        quantity: "2.5000",
      }],
    });
    await repository.submit(context);
    await repository.review({ ...context, action: "approve", remark: "同意" });
    await repository.cancel({ ...context, reason: "项目计划调整" });
    await repository.convert({
      ...context,
      purchase_order_id: PURCHASE_ORDER_ID,
    });

    expect(requests.map((request) => new URL(request.url).pathname)).toEqual([
      "/rest/v1/rpc/save_supplier_purchase_requisition_draft",
      "/rest/v1/rpc/submit_supplier_purchase_requisition",
      "/rest/v1/rpc/review_supplier_purchase_requisition",
      "/rest/v1/rpc/cancel_supplier_purchase_requisition",
      "/rest/v1/rpc/convert_supplier_purchase_requisition",
    ]);
    const bodies = await Promise.all(requests.map((request) =>
      request.clone().json() as Promise<Record<string, unknown>>
    ));
    for (const body of bodies) {
      expect(body.p_requisition_id).toBe(REQUISITION_ID);
      expect(body.p_tenant_id).toBe(TENANT_ID);
      expect(body.p_idempotency_key).toBe("purchase-requisition:command");
      expect(Object.keys(body).every((key) => key.startsWith("p_"))).toBeTrue();
    }
    expect(bodies[0]).toEqual({
      p_requisition_id: REQUISITION_ID, p_tenant_id: TENANT_ID,
      p_project_id: PROJECT_ID, p_tenant_supplier_id: RELATIONSHIP_ID,
      p_expected_version: 1, p_expected_delivery_date: null,
      p_reason: "项目现场需要主材", p_remark: null,
      p_items: [{
        supplier_sku_id: SKU_ID, cost_category_id: COST_CATEGORY_ID,
        quantity: "2.5000",
      }],
      p_actor_user_id: USER_ID, p_actor_employee_id: EMPLOYEE_ID,
      p_idempotency_key: "purchase-requisition:command",
    });
    const commonParams = {
      p_requisition_id: REQUISITION_ID, p_tenant_id: TENANT_ID,
      p_expected_version: 1, p_actor_user_id: USER_ID,
      p_actor_employee_id: EMPLOYEE_ID,
      p_idempotency_key: "purchase-requisition:command",
    };
    expect(bodies[1]).toEqual(commonParams);
    expect(bodies[2]).toEqual({
      ...commonParams, p_action: "approve", p_remark: "同意",
    });
    expect(bodies[3]).toEqual({
      ...commonParams, p_reason: "项目计划调整",
    });
    expect(bodies[4]).toEqual({
      ...commonParams, p_purchase_order_id: PURCHASE_ORDER_ID,
    });
  });

  test("rejects malformed reads and command envelopes with DB_ERROR", async () => {
    const { repository: readRepository } = await repositoryFor(() => ({
      body: [{ ...requisition, total_amount: 113 }],
      count: 1,
    }));
    await expect(readRepository.listRequisitions({
      tenant_id: TENANT_ID,
      visible_project_ids: null,
      page: 1,
      pageSize: 20,
    })).rejects.toMatchObject({ statusCode: 500, code: "DB_ERROR" });

    const { repository: commandRepository } = await repositoryFor(() => ({
      body: {
        status: "not_found",
        error_code: "SUPPLIER_PURCHASE_REQUISITION_SELF_REVIEW",
      },
    }));
    await expect(commandRepository.submit(commandContext))
      .rejects.toMatchObject({ statusCode: 500, code: "DB_ERROR" });
  });

  test("rejects success envelopes whose requisition state disagrees", async () => {
    const { repository } = await repositoryFor(() => ({
      body: {
        status: "submitted",
        requisition: { ...requisition, status: "draft" },
        version: requisition.version,
      },
    }));

    await expect(repository.submit(commandContext))
      .rejects.toMatchObject({ statusCode: 500, code: "DB_ERROR" });
  });

  test("rejects success envelopes whose version facts disagree", async () => {
    const { repository } = await repositoryFor(() => ({
      body: {
        status: "submitted",
        requisition,
        version: requisition.version + 1,
      },
    }));

    await expect(repository.submit(commandContext))
      .rejects.toMatchObject({ statusCode: 500, code: "DB_ERROR" });
  });

  test("rejects success envelopes outside the requested tenant identity", async () => {
    const { repository } = await repositoryFor(() => ({
      body: {
        status: "submitted",
        requisition: {
          ...requisition,
          tenant_id: "60000000-0000-4000-8000-000000000099",
        },
        version: requisition.version,
      },
    }));

    await expect(repository.submit(commandContext))
      .rejects.toMatchObject({ statusCode: 500, code: "DB_ERROR" });
  });

  test("maps command envelope and database errors without swallowing unknown failures", async () => {
    const { repository: envelopeRepository } = await repositoryFor(() => ({
      body: {
        status: "state_conflict",
        error_code: "SUPPLIER_PURCHASE_REQUISITION_BUDGET_CHANGED",
      },
    }));
    await expect(envelopeRepository.submit(commandContext))
      .rejects.toMatchObject({
        statusCode: 409,
        code: "SUPPLIER_PURCHASE_REQUISITION_BUDGET_CHANGED",
      });

    const { repository: databaseRepository } = await repositoryFor(() => ({
      body: {
        code: "P0001",
        message: "SUPPLIER_PURCHASE_REQUISITION_NOT_FOUND",
      },
      status: 400,
    }));
    await expect(databaseRepository.cancel({
      ...commandContext,
      reason: "项目计划调整",
    })).rejects.toMatchObject({
      statusCode: 404,
      code: "SUPPLIER_PURCHASE_REQUISITION_NOT_FOUND",
    });

    const { repository: unknownRepository } = await repositoryFor(() => ({
      body: { code: "XX000", message: "internal database error" },
      status: 500,
    }));
    await expect(unknownRepository.submit(commandContext))
      .rejects.toMatchObject({ statusCode: 500, code: "DB_ERROR" });
  });
});

const requisition = {
  id: REQUISITION_ID, tenant_id: TENANT_ID,
  request_no: "PR-20260730-00000001", project_id: PROJECT_ID,
  tenant_supplier_id: RELATIONSHIP_ID, supplier_id: SUPPLIER_ID,
  status: "pending_approval", budget_status: "over_budget", currency: "CNY",
  reason: "项目现场需要主材", expected_delivery_date: null, remark: null,
  priced_at: AT, subtotal_amount: "100.00", tax_amount: "13.00",
  total_amount: "113.00", purchase_order_id: null, version: 2,
  created_by_employee_id: EMPLOYEE_ID, updated_by_employee_id: EMPLOYEE_ID,
  submitted_by_employee_id: EMPLOYEE_ID, submitted_at: AT,
  reviewed_by_employee_id: null, reviewed_at: null, review_remark: null,
  cancelled_by_employee_id: null, cancelled_at: null, cancel_reason: null,
  created_at: AT, updated_at: AT,
} as const;

const commitment = {
  id: "60000000-0000-4000-8000-000000000011", tenant_id: TENANT_ID,
  project_id: PROJECT_ID, cost_category_id: COST_CATEGORY_ID,
  source_type: "supplier_purchase_requisition", source_id: REQUISITION_ID,
  amount: "113.00", status: "reserved", budget_amount_snapshot: "1000.00",
  expense_amount_snapshot: "800.00", other_commitment_amount_snapshot: "150.00",
  available_amount_snapshot: "-63.00", created_by_employee_id: EMPLOYEE_ID,
  released_by_employee_id: null, released_at: null, release_reason: null,
  created_at: AT, updated_at: AT,
} as const;

const item = {
  id: "60000000-0000-4000-8000-000000000012", tenant_id: TENANT_ID,
  purchase_requisition_id: REQUISITION_ID, line_no: 1,
  cost_category_id: COST_CATEGORY_ID,
  supplier_product_id: "60000000-0000-4000-8000-000000000013",
  supplier_sku_id: SKU_ID,
  supplier_price_list_id: "60000000-0000-4000-8000-000000000014",
  supplier_price_list_item_id: "60000000-0000-4000-8000-000000000015",
  product_code_snapshot: "MAT-001", product_name_snapshot: "乳胶漆",
  sku_code_snapshot: "MAT-001-WHITE", sku_name_snapshot: "乳胶漆白色",
  specification_snapshot: "20L", model_snapshot: null,
  purchase_unit_id: "60000000-0000-4000-8000-000000000016",
  purchase_unit_code_snapshot: "BUCKET", purchase_unit_name_snapshot: "桶",
  purchase_unit_symbol_snapshot: "桶",
  base_unit_id: "60000000-0000-4000-8000-000000000017",
  base_unit_code_snapshot: "L", base_unit_name_snapshot: "升",
  base_unit_symbol_snapshot: "L", base_unit_conversion: "20.00000000",
  price_list_code_snapshot: "PL-001", price_list_version_snapshot: 3,
  price_effective_from_snapshot: AT, price_effective_until_snapshot: null,
  quantity: "2.5000", unit_price: "40.00", tax_rate: "0.130000",
  tax_inclusive: false, line_subtotal_amount: "100.00",
  line_tax_amount: "13.00", line_total_amount: "113.00", created_at: AT,
} as const;

const commandContext = {
  tenant_id: TENANT_ID,
  requisition_id: REQUISITION_ID,
  expected_version: 2,
  actor_user_id: USER_ID,
  actor_employee_id: EMPLOYEE_ID,
  idempotency_key: "purchase-requisition:command",
};
