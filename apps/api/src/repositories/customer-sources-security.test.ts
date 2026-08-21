import { beforeAll, describe, expect, test } from "bun:test";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

let CustomerSourceRepository: typeof import("./customer-sources")
  .CustomerSourceRepository;

beforeAll(async () => {
  ({ CustomerSourceRepository } = await import("./customer-sources"));
});

type QueryResult = { data: unknown; error: unknown; count?: number | null };

function clientWith(
  result: QueryResult,
  tableResults: Record<string, QueryResult> = {},
) {
  class Query implements PromiseLike<QueryResult> {
    constructor(private readonly queryResult: QueryResult) {}
    select() { return this; }
    eq() { return this; }
    in() { return this; }
    order() { return this; }
    range() { return this; }
    maybeSingle() { return this; }
    then<TResult1 = QueryResult, TResult2 = never>(
      onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ) {
      return Promise.resolve(this.queryResult).then(onfulfilled, onrejected);
    }
  }

  return {
    from(table: string) {
      return new Query(tableResults[table] ?? result);
    },
  };
}

const rawError = {
  message: "relation topology secret",
  details: "private row value",
  hint: "internal index name",
};

const sourceRow = {
  id: "source-1",
  tenant_id: "tenant-1",
  customer_id: "customer-1",
  source: "platform_lead",
  source_label: "平台线索",
  platform_lead_id: null,
  assigned_by_employee_id: null,
  assigned_at: null,
  metadata: {},
  created_at: "2026-08-22T10:00:00.000Z",
  source_employee_id: null,
  related_type: null,
  related_id: null,
  share_link_id: null,
  marketing_lead_id: null,
  douyin_measurement_appointment_id: null,
};

describe("CustomerSourceRepository error privacy", () => {
  test("never exposes Supabase error details from source reads or hydration", async () => {
    const list = (repository: InstanceType<typeof CustomerSourceRepository>) =>
      repository.listByCustomer({
        tenantId: "tenant-1",
        customerId: "customer-1",
        query: { page: 1, pageSize: 20 },
      });
    const cases = [
      {
        operation: (repository: InstanceType<typeof CustomerSourceRepository>) =>
          repository.findCustomerAccess({ tenantId: "tenant-1", customerId: "customer-1" }),
        client: clientWith({ data: null, error: rawError }),
      },
      {
        operation: list,
        client: clientWith({ data: null, error: rawError }),
      },
      ...[
        ["employees", "source_employee_id"],
        ["platform_leads", "platform_lead_id"],
        ["tenant_share_links", "share_link_id"],
      ].map(([table, field]) => ({
        operation: list,
        client: clientWith(
          { data: [{ ...sourceRow, [field!]: `${field}-1` }], error: null, count: 1 },
          { [table!]: { data: null, error: rawError } },
        ),
      })),
    ];

    for (const item of cases) {
      let caught: unknown;
      try {
        await item.operation(new CustomerSourceRepository(item.client as never));
      } catch (error) {
        caught = error;
      }
      expect(caught).toMatchObject({ statusCode: 500, details: undefined });
      expect(JSON.stringify(caught)).not.toMatch(
        /relation topology secret|private row value|internal index name/,
      );
    }
  });
});
