import { describe, expect, test } from "bun:test";

import {
  SupplierPurchaseOrderSharingRepository,
} from "@/repositories/supplier-purchase-order-sharing";

const TENANT_ID = "64000000-0000-4000-8000-000000000001";
const ORDER_ID = "64000000-0000-4000-8000-000000000002";
const LINK_ID = "64000000-0000-4000-8000-000000000003";
const TENANT_SUPPLIER_ID = "64000000-0000-4000-8000-000000000004";
const SUPPLIER_ID = "64000000-0000-4000-8000-000000000005";
const EMPLOYEE_ID = "64000000-0000-4000-8000-000000000006";
const CHECKED_AT = "2026-09-05T00:00:00.000Z";

describe("SupplierPurchaseOrderSharingRepository", () => {
  test("aggregates active share-link status for one purchase order", async () => {
    const fixture = createClient([
      shareLink({
        id: "64000000-0000-4000-8000-000000000011",
        viewed_count: 2,
        last_viewed_at: "2026-09-05T01:00:00.000Z",
        confirmed_at: "2026-09-05T02:00:00.000Z",
        confirm_remark: "第一次确认",
      }),
      shareLink({
        id: "64000000-0000-4000-8000-000000000012",
        viewed_count: 3,
        last_viewed_at: "2026-09-05T03:00:00.000Z",
        confirmed_at: "2026-09-05T04:00:00.000Z",
        confirm_remark: "最新确认",
      }),
    ]);
    const repository = new SupplierPurchaseOrderSharingRepository(
      () => fixture.client,
    );

    const status = await repository.getShareStatus({
      tenantId: TENANT_ID,
      orderId: ORDER_ID,
      checkedAt: CHECKED_AT,
    });

    expect(status).toEqual({
      viewed_count: 5,
      last_viewed_at: "2026-09-05T03:00:00.000Z",
      confirmed_at: "2026-09-05T04:00:00.000Z",
      confirm_remark: "最新确认",
    });
    expect(fixture.calls).toContainEqual({
      method: "from",
      args: ["supplier_purchase_order_share_links"],
    });
    expect(fixture.calls).toContainEqual({
      method: "eq",
      args: ["tenant_id", TENANT_ID],
    });
    expect(fixture.calls).toContainEqual({
      method: "eq",
      args: ["supplier_purchase_order_id", ORDER_ID],
    });
    expect(fixture.calls).toContainEqual({
      method: "eq",
      args: ["status", "active"],
    });
    expect(fixture.calls).toContainEqual({
      method: "gt",
      args: ["expires_at", CHECKED_AT],
    });
    expect(fixture.calls).toContainEqual({ method: "limit", args: [1000] });
  });

  test("does not expose confirm remark when no active link is confirmed", async () => {
    const fixture = createClient([
      shareLink({
        viewed_count: 1,
        last_viewed_at: "2026-09-05T01:00:00.000Z",
        confirm_remark: "不应返回",
      }),
    ]);
    const repository = new SupplierPurchaseOrderSharingRepository(
      () => fixture.client,
    );

    const status = await repository.getShareStatus({
      tenantId: TENANT_ID,
      orderId: ORDER_ID,
      checkedAt: CHECKED_AT,
    });

    expect(status).toEqual({
      viewed_count: 1,
      last_viewed_at: "2026-09-05T01:00:00.000Z",
      confirmed_at: null,
      confirm_remark: null,
    });
  });
});

function createClient(data: unknown[]) {
  const calls: Array<{ method: string; args: unknown[] }> = [];

  class Query implements PromiseLike<{
    data: unknown;
    error: null;
    count: null;
  }> {
    private selectedColumns: string[] | null = null;

    select(...args: unknown[]) {
      calls.push({ method: "select", args });
      this.selectedColumns = typeof args[0] === "string"
        ? args[0].split(",").map((column) => column.trim())
        : null;
      return this;
    }

    insert(...args: unknown[]) {
      calls.push({ method: "insert", args });
      return this;
    }

    update(...args: unknown[]) {
      calls.push({ method: "update", args });
      return this;
    }

    eq(...args: unknown[]) {
      calls.push({ method: "eq", args });
      return this;
    }

    in(...args: unknown[]) {
      calls.push({ method: "in", args });
      return this;
    }

    gt(...args: unknown[]) {
      calls.push({ method: "gt", args });
      return this;
    }

    order(...args: unknown[]) {
      calls.push({ method: "order", args });
      return this;
    }

    limit(...args: unknown[]) {
      calls.push({ method: "limit", args });
      return this;
    }

    single() {
      calls.push({ method: "single", args: [] });
      return Promise.resolve({ data: data[0] ?? null, error: null });
    }

    maybeSingle() {
      calls.push({ method: "maybeSingle", args: [] });
      return Promise.resolve({ data: data[0] ?? null, error: null });
    }

    then<TResult1 = { data: unknown; error: null; count: null }, TResult2 = never>(
      onfulfilled?: ((value: {
        data: unknown;
        error: null;
        count: null;
      }) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ): Promise<TResult1 | TResult2> {
      return Promise.resolve({
        data: this.projectRows(data),
        error: null,
        count: null,
      }).then(
        onfulfilled,
        onrejected,
      );
    }

    private projectRows(rows: unknown[]) {
      const selectedColumns = this.selectedColumns;
      if (!selectedColumns) return rows;
      return rows.map((row) => {
        if (!row || typeof row !== "object" || Array.isArray(row)) return row;
        const record = row as Record<string, unknown>;
        return Object.fromEntries(
          selectedColumns
            .filter((column) => column in record)
            .map((column) => [column, record[column]]),
        );
      });
    }
  }

  return {
    calls,
    client: {
      from(table: string) {
        calls.push({ method: "from", args: [table] });
        return new Query();
      },
    },
  };
}

function shareLink(overrides: Record<string, unknown> = {}) {
  return {
    id: LINK_ID,
    tenant_id: TENANT_ID,
    supplier_purchase_order_id: ORDER_ID,
    tenant_supplier_id: TENANT_SUPPLIER_ID,
    supplier_id: SUPPLIER_ID,
    share_token: "pos_0123456789abcdefghijklmnopqrstuvwxyzABCDE",
    status: "active",
    expires_at: "2026-10-05T00:00:00.000Z",
    created_by_employee_id: EMPLOYEE_ID,
    idempotency_key: "share-key",
    last_viewed_at: null,
    viewed_count: 0,
    confirmed_at: null,
    confirm_remark: null,
    created_at: "2026-09-05T00:00:00.000Z",
    updated_at: "2026-09-05T00:00:00.000Z",
    ...overrides,
  };
}
