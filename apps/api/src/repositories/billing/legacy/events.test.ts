import { describe, expect, test } from "bun:test";

import { listLedger } from "./events";

function createLedgerQueryBuilder() {
  const calls: Array<[string, unknown[]]> = [];
  const builder = {
    calls,
    select(...args: unknown[]) {
      calls.push(["select", args]);
      return this;
    },
    order(...args: unknown[]) {
      calls.push(["order", args]);
      return this;
    },
    range(...args: unknown[]) {
      calls.push(["range", args]);
      return this;
    },
    eq(...args: unknown[]) {
      calls.push(["eq", args]);
      return this;
    },
    in(...args: unknown[]) {
      calls.push(["in", args]);
      return this;
    },
    gte(...args: unknown[]) {
      calls.push(["gte", args]);
      return this;
    },
    lte(...args: unknown[]) {
      calls.push(["lte", args]);
      return this;
    },
    or(...args: unknown[]) {
      calls.push(["or", args]);
      return this;
    },
    then(
      resolve: (value: {
        data: unknown[];
        count: number;
        error: null;
      }) => void,
    ) {
      resolve({ data: [], count: 0, error: null });
    },
  };
  return builder;
}

describe("billing ledger repository", () => {
  test("searches keyword against source_no instead of a non-existent order_no column", async () => {
    const builder = createLedgerQueryBuilder();
    const repository = {
      from(table: string) {
        expect(table).toBe("tenant_credit_ledger");
        return builder;
      },
    };

    await listLedger.call(repository, {
      page: 1,
      pageSize: 20,
      keyword: "TC202607030350144069CF5EEF8",
    });

    const orCall = builder.calls.find(([method]) => method === "or");
    expect(orCall?.[1][0]).toBe(
      "event_type.ilike.%TC202607030350144069CF5EEF8%,source_no.ilike.%TC202607030350144069CF5EEF8%,remark.ilike.%TC202607030350144069CF5EEF8%",
    );
  });
});
