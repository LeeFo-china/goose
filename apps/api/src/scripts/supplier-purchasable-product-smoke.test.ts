import { describe, expect, test } from "bun:test";

import {
  createSupplierPurchasableProductSmokeFixture,
  parseSupplierPurchasableProductSmokeEnv,
  runSupplierPurchasableProductSmoke,
  runSupplierPurchasableProductSmokeCli,
  runSupplierPurchasableProductSmokeRollbackOnly,
  sanitizeSupplierPurchasableProductSmokeError,
  type SupplierPurchasableProductCommandInput,
  type SupplierPurchasableProductSmokeGateway,
  type SupplierPurchasableProductSmokeTransaction,
} from "./supplier-purchasable-product-smoke";

const ENV = {
  SUPABASE_DB_DIRECT_URL: "postgres://smoke:secret@127.0.0.1:54322/postgres",
  SUPPLIER_PURCHASABLE_SMOKE_TENANT_ID:
    "11000000-0000-4000-8000-000000000001",
  SUPPLIER_PURCHASABLE_SMOKE_TENANT_SUPPLIER_ID:
    "11000000-0000-4000-8000-000000000002",
  SUPPLIER_PURCHASABLE_SMOKE_SUPPLIER_ID:
    "11000000-0000-4000-8000-000000000003",
  SUPPLIER_PURCHASABLE_SMOKE_ACTOR_USER_ID:
    "11000000-0000-4000-8000-000000000004",
  SUPPLIER_PURCHASABLE_SMOKE_ACTOR_EMPLOYEE_ID:
    "11000000-0000-4000-8000-000000000005",
  SUPPLIER_PURCHASABLE_SMOKE_CATEGORY_ID:
    "11000000-0000-4000-8000-000000000006",
  SUPPLIER_PURCHASABLE_SMOKE_BRAND_ID:
    "11000000-0000-4000-8000-000000000007",
  SUPPLIER_PURCHASABLE_SMOKE_PURCHASE_UNIT_ID:
    "11000000-0000-4000-8000-000000000008",
} as const;

type Call = {
  operation: string;
  request?: SupplierPurchasableProductCommandInput;
  bytes?: string;
  scope?: {
    tenantId: string;
    actorUserId: string;
    productIds: readonly string[];
    skuIds: readonly string[];
    idempotencyKeys: readonly string[];
    priceListIds?: readonly string[];
    priceItemIds?: readonly string[];
    limit: number;
  };
};

function commandResult(
  request: SupplierPurchasableProductCommandInput,
  idempotent: boolean,
) {
  return {
    status: "created",
    idempotent,
    product: { id: request.product_id },
    sku: { id: request.sku_id, supplier_product_id: request.product_id },
    price: {
      id: "22000000-0000-4000-8000-000000000001",
      supplier_price_list_id: "22000000-0000-4000-8000-000000000002",
      supplier_product_id: request.product_id,
      supplier_sku_id: request.sku_id,
    },
    catalog_item: {
      supplier_product_id: request.product_id,
      supplier_sku_id: request.sku_id,
      supplier_price_list_id: "22000000-0000-4000-8000-000000000002",
      supplier_price_list_item_id:
        "22000000-0000-4000-8000-000000000001",
    },
  };
}

class FakeGateway implements SupplierPurchasableProductSmokeGateway {
  readonly calls: Call[] = [];
  private commandCount = 0;
  failAt: string | null = null;

  private readonly transaction: SupplierPurchasableProductSmokeTransaction = {
    command: async (request) => {
      this.calls.push({
        operation: "command",
        request,
        bytes: JSON.stringify(request),
      });
      if (this.failAt === "command") throw new Error("database://secret");
      this.commandCount += 1;
      if (this.commandCount === 1) return commandResult(request, false);
      if (this.commandCount === 2) return commandResult(request, true);
      return {
        status: "validation_error",
        idempotent: false,
        error_code: "SUPPLIER_PURCHASABLE_PRODUCT_CREATE_FAILED",
        reason: "invalid_price",
      };
    },
    resolveCatalog: async (query) => {
      this.calls.push({ operation: "catalog" });
      return {
        page: query.page,
        page_size: query.pageSize,
        total: 1,
        items: [{
          supplier_product_id: query.productId,
          supplier_sku_id: query.skuId,
        }],
      };
    },
    expectIdempotencyConflict: async (request) => {
      this.calls.push({ operation: "conflict", request });
      return "SUPPLIER_IDEMPOTENCY_CONFLICT";
    },
    countResiduals: async (scope) => {
      this.calls.push({ operation: "count-invalid", scope });
      return { products: 0, skus: 0, prices: 0, events: 0 };
    },
  };

  async withRollback<Result>(
    callback: (
      transaction: SupplierPurchasableProductSmokeTransaction,
    ) => Promise<Result>,
  ): Promise<Result> {
    this.calls.push({ operation: "begin" });
    try {
      return await callback(this.transaction);
    } finally {
      this.calls.push({ operation: "rollback" });
    }
  }

  async countResiduals(scope: Call["scope"]) {
    if (!scope) throw new Error("scope missing");
    this.calls.push({ operation: "count-rollback", scope });
    return { products: 0, skus: 0, prices: 0, events: 0 };
  }

  async close() {
    this.calls.push({ operation: "close" });
  }
}

describe("supplier purchasable product smoke", () => {
  test("fails closed before constructing a gateway when env is incomplete", async () => {
    expect(() => parseSupplierPurchasableProductSmokeEnv({})).toThrow(
      "SMOKE_ENV_INVALID",
    );
    expect(() => parseSupplierPurchasableProductSmokeEnv({
      ...ENV,
      SUPPLIER_PURCHASABLE_SMOKE_TENANT_ID: "not-a-uuid",
    })).toThrow("SMOKE_ENV_INVALID");
    expect(parseSupplierPurchasableProductSmokeEnv({
      ...ENV,
      UNRELATED_PROCESS_ENV: "allowed",
    }).tenantId).toBe(ENV.SUPPLIER_PURCHASABLE_SMOKE_TENANT_ID);

    let gatewayConstructions = 0;
    const errors: string[] = [];
    const exitCode = await runSupplierPurchasableProductSmokeCli({
      env: {},
      createGateway: () => {
        gatewayConstructions += 1;
        return new FakeGateway();
      },
      writeOutput: () => {},
      writeError: (message) => errors.push(message),
    });

    expect(exitCode).toBe(1);
    expect(gatewayConstructions).toBe(0);
    expect(errors).toEqual(["SUPPLIER_PURCHASABLE_PRODUCT_SMOKE_FAILED"]);
  });

  test("forces rollback after a successful void callback", async () => {
    const events: string[] = [];
    const executor = {
      async begin<Result>(callback: (transaction: { marker: true }) => Promise<Result>) {
        events.push("begin");
        try {
          return await callback({ marker: true });
        } catch (error) {
          events.push("rollback");
          throw error;
        }
      },
    };

    await expect(runSupplierPurchasableProductSmokeRollbackOnly(
      executor,
      async (transaction) => {
        expect(transaction.marker).toBe(true);
      },
    )).resolves.toBeUndefined();
    expect(events).toEqual(["begin", "rollback"]);
  });

  test("builds unique UUID-derived command fixtures without selecting rows", () => {
    const config = parseSupplierPurchasableProductSmokeEnv(ENV);
    const first = createSupplierPurchasableProductSmokeFixture(config);
    const second = createSupplierPurchasableProductSmokeFixture(config);

    expect(first.created.product_id).not.toBe(first.created.sku_id);
    expect(first.invalid.product_id).not.toBe(first.created.product_id);
    expect(first.invalid.sku_id).not.toBe(first.created.sku_id);
    expect(first.created.idempotency_key).not.toBe(
      first.invalid.idempotency_key,
    );
    expect(second.created.product_id).not.toBe(first.created.product_id);
    expect(first.created.product.product_code).toBe(
      `TP-${first.created.product_id.replaceAll("-", "").slice(0, 16)}`,
    );
    expect(first.created.sku.sku_code).toBe(
      `TS-${first.created.sku_id.replaceAll("-", "").slice(0, 16)}`,
    );
    expect(first.invalid.price.unit_price).toBe("0");
  });

  test("executes create, catalog, byte-identical replay, conflict and invalid atomicity in order", async () => {
    const gateway = new FakeGateway();
    const summary = await runSupplierPurchasableProductSmoke(
      parseSupplierPurchasableProductSmokeEnv(ENV),
      gateway,
    );

    expect(summary).toEqual({
      created: true,
      replay_idempotent: true,
      conflict_rejected: true,
      rollback_clean: true,
    });
    expect(gateway.calls.map((call) => call.operation)).toEqual([
      "begin",
      "command",
      "catalog",
      "command",
      "conflict",
      "command",
      "count-invalid",
      "rollback",
      "count-rollback",
      "close",
    ]);

    const commandCalls = gateway.calls.filter((call) =>
      call.operation === "command"
    );
    expect(commandCalls[1]?.request).toBe(commandCalls[0]?.request);
    expect(commandCalls[1]?.bytes).toBe(commandCalls[0]?.bytes);
    const conflict = gateway.calls.find((call) =>
      call.operation === "conflict"
    )?.request;
    expect(conflict?.idempotency_key).toBe(
      commandCalls[0]?.request?.idempotency_key,
    );
    expect(conflict?.product_id).toBe(commandCalls[0]?.request?.product_id);
    expect(conflict?.price).not.toEqual(commandCalls[0]?.request?.price);
  });

  test("passes only tenant-bounded IDs and keys to limited residual probes", async () => {
    const gateway = new FakeGateway();
    await runSupplierPurchasableProductSmoke(
      parseSupplierPurchasableProductSmokeEnv(ENV),
      gateway,
    );

    const scopes = gateway.calls.flatMap((call) =>
      call.scope ? [call.scope] : []
    );
    expect(scopes).toHaveLength(2);
    for (const scope of scopes) {
      expect(scope.tenantId).toBe(ENV.SUPPLIER_PURCHASABLE_SMOKE_TENANT_ID);
      expect(scope.actorUserId).toBe(
        ENV.SUPPLIER_PURCHASABLE_SMOKE_ACTOR_USER_ID,
      );
      expect(scope.productIds.length).toBeGreaterThan(0);
      expect(scope.skuIds.length).toBeGreaterThan(0);
      expect(scope.idempotencyKeys.length).toBeGreaterThan(0);
      expect(scope.limit).toBe(1);
    }
    expect(scopes[0]?.productIds).toHaveLength(1);
    expect(scopes[1]?.productIds).toHaveLength(2);
    expect(scopes[0]?.priceListIds).toEqual([]);
    expect(scopes[0]?.priceItemIds).toEqual([]);
    expect(scopes[1]?.priceListIds).toEqual([
      "22000000-0000-4000-8000-000000000002",
    ]);
    expect(scopes[1]?.priceItemIds).toEqual([
      "22000000-0000-4000-8000-000000000001",
    ]);
  });

  test("rolls back and closes on primary failure while sanitizing secrets", async () => {
    const gateway = new FakeGateway();
    gateway.failAt = "command";

    await expect(runSupplierPurchasableProductSmoke(
      parseSupplierPurchasableProductSmokeEnv(ENV),
      gateway,
    )).rejects.toThrow();
    expect(gateway.calls.map((call) => call.operation)).toEqual([
      "begin",
      "command",
      "rollback",
      "close",
    ]);

    const sanitized = sanitizeSupplierPurchasableProductSmokeError(
      new Error(`${ENV.SUPABASE_DB_DIRECT_URL} service-role-secret`),
    );
    expect(sanitized).toBe("SUPPLIER_PURCHASABLE_PRODUCT_SMOKE_FAILED");
    expect(sanitized).not.toContain("secret");
    expect(sanitized).not.toContain("postgres");
  });
});
