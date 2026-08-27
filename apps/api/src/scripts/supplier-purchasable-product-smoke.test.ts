import { describe, expect, test } from "bun:test";

import {
  createSupplierPurchasableProductSmokeFixture,
  parseSupplierPurchasableProductSmokeEnv,
  runSupplierPurchasableProductSmoke,
  runSupplierPurchasableProductSmokeCli,
  sanitizeSupplierPurchasableProductSmokeError,
  type PriceListSnapshot,
  type SupplierPurchasableProductCommandInput,
  type SupplierPurchasableProductPriceSeriesSnapshot,
  type SupplierPurchasableProductResidualScope,
  type SupplierPurchasableProductSmokeGateway,
  type SupplierPurchasableProductSmokeTransaction,
} from "./supplier-purchasable-product-smoke";

const smokeId = (suffix: string) =>
  `11000000-0000-4000-8000-000000000${suffix}`;
const ENV = {
  SUPABASE_DB_DIRECT_URL: "postgres://smoke:secret@127.0.0.1:54322/postgres",
  SUPPLIER_PURCHASABLE_SMOKE_TENANT_ID: smokeId("001"),
  SUPPLIER_PURCHASABLE_SMOKE_TENANT_SUPPLIER_ID: smokeId("002"),
  SUPPLIER_PURCHASABLE_SMOKE_SUPPLIER_ID: smokeId("003"),
  SUPPLIER_PURCHASABLE_SMOKE_ACTOR_USER_ID: smokeId("004"),
  SUPPLIER_PURCHASABLE_SMOKE_ACTOR_EMPLOYEE_ID: smokeId("005"),
  SUPPLIER_PURCHASABLE_SMOKE_CATEGORY_ID: smokeId("006"),
  SUPPLIER_PURCHASABLE_SMOKE_BRAND_ID: smokeId("007"),
  SUPPLIER_PURCHASABLE_SMOKE_PURCHASE_UNIT_ID: smokeId("008"),
} as const;
const CONFIG = parseSupplierPurchasableProductSmokeEnv(ENV);
const PRICE_ITEM_ID = "22000000-0000-4000-8000-000000000001";
const PRICE_LIST_ID = "22000000-0000-4000-8000-000000000002";
const BASELINE_ID = "22000000-0000-4000-8000-000000000003";
const NOW = "2026-08-27T00:00:00+00:00";
const CLEAN = {
  products: false,
  skus: false,
  priceLists: false,
  priceItems: false,
  events: false,
} as const;

const BASELINE: PriceListSnapshot = {
  id: BASELINE_ID,
  tenant_id: ENV.SUPPLIER_PURCHASABLE_SMOKE_TENANT_ID,
  tenant_supplier_id: ENV.SUPPLIER_PURCHASABLE_SMOKE_TENANT_SUPPLIER_ID,
  supplier_id: ENV.SUPPLIER_PURCHASABLE_SMOKE_SUPPLIER_ID,
  price_list_code: "DEFAULT",
  currency: "CNY",
  lifecycle_status: "published",
  row_version: 4,
  effective_from: NOW,
  effective_until: null,
  acting_tenant_id: ENV.SUPPLIER_PURCHASABLE_SMOKE_TENANT_ID,
  acting_employee_id: ENV.SUPPLIER_PURCHASABLE_SMOKE_ACTOR_EMPLOYEE_ID,
  updated_by_employee_id: ENV.SUPPLIER_PURCHASABLE_SMOKE_ACTOR_EMPLOYEE_ID,
  updated_at: NOW,
};

function commandResult(
  request: SupplierPurchasableProductCommandInput,
  idempotent: boolean,
) {
  const actor = request.actor_employee_id;
  const audit = {
    ownership_scope: "tenant",
    owner_tenant_id: request.tenant_id,
    acting_tenant_id: request.tenant_id,
    acting_employee_id: actor,
    operation_source: "tenant",
    proxy_reason: null,
    created_by_employee_id: actor,
    updated_by_employee_id: actor,
    created_at: NOW,
    updated_at: NOW,
  };
  const catalog = {
    supplier_product_id: request.product_id,
    product_code: request.product.product_code,
    product_name: request.product.name,
    supplier_sku_id: request.sku_id,
    sku_code: request.sku.sku_code,
    sku_name: request.sku.name,
    specification: null,
    model: null,
    supplier_price_list_id: PRICE_LIST_ID,
    price_list_code: "DEFAULT",
    price_list_version: 5,
    effective_from: NOW,
    effective_until: null,
    supplier_price_list_item_id: PRICE_ITEM_ID,
    purchase_unit_id: request.sku.purchase_unit_id,
    purchase_unit_code: "PCS",
    purchase_unit_name: "Piece",
    purchase_unit_symbol: "pc",
    base_unit_id: request.sku.purchase_unit_id,
    base_unit_code: "PCS",
    base_unit_name: "Piece",
    base_unit_symbol: "pc",
    base_unit_conversion: "1.00000000",
    unit_price: request.price.unit_price,
    tax_rate: request.price.tax_rate,
    tax_inclusive: request.price.tax_inclusive,
  };
  return {
    status: "created",
    idempotent,
    product: {
      id: request.product_id,
      supplier_id: request.supplier_id,
      ...request.product,
      description: null,
      status: "active",
      version: 2,
      ...audit,
    },
    sku: {
      id: request.sku_id,
      supplier_id: request.supplier_id,
      supplier_product_id: request.product_id,
      sku_code: request.sku.sku_code,
      name: request.sku.name,
      specification: null,
      model: null,
      spec_values: request.sku.spec_values,
      purchase_unit_id: request.sku.purchase_unit_id,
      base_unit_id: request.sku.purchase_unit_id,
      base_unit_conversion: 1,
      batch_managed: false,
      color_managed: false,
      serial_managed: false,
      status: "active",
      version: 2,
      ...audit,
    },
    price: {
      id: PRICE_ITEM_ID,
      tenant_id: request.tenant_id,
      supplier_id: request.supplier_id,
      supplier_price_list_id: PRICE_LIST_ID,
      supplier_product_id: request.product_id,
      supplier_sku_id: request.sku_id,
      minimum_quantity: "1.0000",
      maximum_quantity: null,
      purchase_unit_id: request.sku.purchase_unit_id,
      base_unit_id: request.sku.purchase_unit_id,
      base_unit_conversion: "1.00000000",
      unit_price: request.price.unit_price,
      tax_rate: request.price.tax_rate,
      tax_inclusive: request.price.tax_inclusive,
      acting_tenant_id: request.tenant_id,
      acting_employee_id: actor,
      operation_source: "tenant",
      proxy_reason: null,
      created_by_employee_id: actor,
      updated_by_employee_id: actor,
      created_at: NOW,
      updated_at: NOW,
    },
    catalog_item: catalog,
  };
}

type CommandResult = ReturnType<typeof commandResult>;
type Call = {
  operation: string;
  request?: SupplierPurchasableProductCommandInput;
  bytes?: string;
  scope?: SupplierPurchasableProductResidualScope;
};

class FakeGateway implements SupplierPurchasableProductSmokeGateway {
  readonly calls: Call[] = [];
  private commandCount = 0;
  private rootSnapshotCount = 0;
  baseline: PriceListSnapshot | null = BASELINE;
  after: PriceListSnapshot | null | undefined;
  failAt: "command" | null = null;
  dirtyAt: "invalid" | "rollback" | null = null;
  polluteInvalidSeries = false;
  existingBaselineEvent = false;
  mutateResult?: (result: CommandResult) => void;
  mutateCreatedSnapshot?: (snapshot: PriceListSnapshot) => void;

  private readonly transaction: SupplierPurchasableProductSmokeTransaction = {
    command: async (request) => {
      this.calls.push({
        operation: "command",
        request,
        bytes: JSON.stringify(request),
      });
      if (this.failAt === "command") throw new Error("database://secret");
      this.commandCount += 1;
      if (this.commandCount <= 2) {
        const result = commandResult(request, this.commandCount === 2);
        this.mutateResult?.(result);
        return result;
      }
      return {
        status: "validation_error",
        idempotent: false,
        error_code: "SUPPLIER_PURCHASABLE_PRODUCT_CREATE_FAILED",
        reason: "invalid_price",
      };
    },
    resolveCatalog: async (query) => {
      this.calls.push({ operation: "catalog" });
      const request = this.calls.find((call) =>
        call.operation === "command"
      )?.request;
      if (!request) throw new Error("missing command");
      const result = commandResult(request, false);
      this.mutateResult?.(result);
      return {
        page: query.page,
        page_size: query.pageSize,
        total: 1,
        items: [result.catalog_item],
      };
    },
    expectIdempotencyConflict: async (request) => {
      this.calls.push({ operation: "conflict", request });
      return "SUPPLIER_IDEMPOTENCY_CONFLICT";
    },
    snapshotPublishedPriceList: async () => {
      this.calls.push({ operation: "snapshot-created" });
      const snapshot: PriceListSnapshot = {
        ...BASELINE,
        id: PRICE_LIST_ID,
        row_version: 1,
      };
      this.mutateCreatedSnapshot?.(snapshot);
      return snapshot;
    },
    inspectResiduals: async (scope) => {
      this.calls.push({ operation: "residual-invalid", scope });
      return this.dirtyAt === "invalid" ? { ...CLEAN, events: true } : CLEAN;
    },
    snapshotPriceSeries: async (): Promise<
      SupplierPurchasableProductPriceSeriesSnapshot
    > => {
      const previous = this.calls.some((call) =>
        call.operation === "series-before"
      );
      this.calls.push({ operation: previous ? "series-after" : "series-before" });
      const request = this.calls.find((call) =>
        call.operation === "command"
      )?.request;
      if (!request) throw new Error("missing command");
      const result = commandResult(request, false);
      const list = {
        ...BASELINE,
        id: PRICE_LIST_ID,
        name: "Default supplier price",
        scope_type: "default",
        version_number: 5,
        supersedes_price_list_id: BASELINE_ID,
        operation_source: "tenant",
        proxy_reason: null,
        created_by_employee_id: request.actor_employee_id,
        created_at: NOW,
        published_at: NOW,
      };
      const pollutedList = { ...list, id: smokeId("998") };
      const pollutedItem = { ...result.price, id: smokeId("999") };
      return {
        lists: previous && this.polluteInvalidSeries
          ? [list, pollutedList]
          : [list],
        items: previous && this.polluteInvalidSeries
          ? [result.price, pollutedItem]
          : [result.price],
      };
    },
  };

  async begin<Result>(
    callback: (
      transaction: SupplierPurchasableProductSmokeTransaction,
    ) => Promise<Result>,
  ): Promise<Result> {
    this.calls.push({ operation: "begin" });
    try {
      return await callback(this.transaction);
    } catch (error) {
      this.calls.push({ operation: "rollback" });
      throw error;
    }
  }

  async snapshotPublishedPriceList() {
    const operation = this.rootSnapshotCount++ === 0
      ? "snapshot-before"
      : "snapshot-after";
    this.calls.push({ operation });
    return operation === "snapshot-before"
      ? this.baseline
      : (this.after === undefined ? this.baseline : this.after);
  }

  async inspectResiduals(scope: SupplierPurchasableProductResidualScope) {
    this.calls.push({ operation: "residual-rollback", scope });
    const resourceIds = [
      ...scope.productIds,
      ...scope.skuIds,
      scope.newPriceListId,
      scope.newPriceItemId,
    ];
    if (this.existingBaselineEvent && resourceIds.includes(BASELINE_ID)) {
      return { ...CLEAN, events: true };
    }
    return this.dirtyAt === "rollback" ? { ...CLEAN, priceItems: true } : CLEAN;
  }

  async close() {
    this.calls.push({ operation: "close" });
  }
}

describe("supplier purchasable product smoke", () => {
  test("fails closed before constructing a gateway and sanitizes errors", async () => {
    expect(() => parseSupplierPurchasableProductSmokeEnv({})).toThrow(
      "SMOKE_ENV_INVALID",
    );
    expect(() => parseSupplierPurchasableProductSmokeEnv({
      ...ENV,
      SUPPLIER_PURCHASABLE_SMOKE_TENANT_ID: "not-a-uuid",
    })).toThrow("SMOKE_ENV_INVALID");
    let constructions = 0;
    const errors: string[] = [];
    const exit = await runSupplierPurchasableProductSmokeCli({
      env: {},
      createGateway: () => {
        constructions += 1;
        return new FakeGateway();
      },
      writeOutput: () => {},
      writeError: (message) => errors.push(message),
    });
    expect([exit, constructions, errors]).toEqual([
      1,
      0,
      ["SUPPLIER_PURCHASABLE_PRODUCT_SMOKE_FAILED"],
    ]);
    const sanitized = sanitizeSupplierPurchasableProductSmokeError(
      new Error(`${ENV.SUPABASE_DB_DIRECT_URL} service-role-secret`),
    );
    expect(sanitized).toBe("SUPPLIER_PURCHASABLE_PRODUCT_SMOKE_FAILED");
    expect(sanitized).not.toContain("secret");
  });

  test("uses unique fixtures and executes all bounded evidence in order", async () => {
    const fixtureA = createSupplierPurchasableProductSmokeFixture(CONFIG);
    const fixtureB = createSupplierPurchasableProductSmokeFixture(CONFIG);
    expect(fixtureA.created.product_id).not.toBe(fixtureB.created.product_id);
    expect(fixtureA.created.sku.spec_values).toEqual({});
    expect(fixtureA.invalid.price.unit_price).toBe("0");

    const gateway = new FakeGateway();
    await expect(runSupplierPurchasableProductSmoke(CONFIG, gateway)).resolves
      .toEqual({
        created: true,
        replay_idempotent: true,
        conflict_rejected: true,
        rollback_clean: true,
      });
    expect(gateway.calls.map((call) => call.operation)).toEqual([
      "snapshot-before",
      "begin",
      "command",
      "snapshot-created",
      "catalog",
      "command",
      "conflict",
      "series-before",
      "command",
      "series-after",
      "residual-invalid",
      "rollback",
      "snapshot-after",
      "residual-rollback",
      "close",
    ]);
    const commands = gateway.calls.filter((call) =>
      call.operation === "command"
    );
    expect(commands[1]?.request).toBe(commands[0]?.request);
    expect(commands[1]?.bytes).toBe(commands[0]?.bytes);
    const conflict = gateway.calls.find((call) =>
      call.operation === "conflict"
    )?.request;
    expect(conflict?.idempotency_key).toBe(
      commands[0]?.request?.idempotency_key,
    );
    expect(conflict?.price).not.toEqual(commands[0]?.request?.price);
    const scopes = gateway.calls.flatMap((call) =>
      call.scope ? [call.scope] : []
    );
    expect(scopes).toHaveLength(2);
    expect(scopes[0]?.productIds).toHaveLength(1);
    expect(scopes[1]?.productIds).toHaveLength(2);
    expect(scopes[0]?.newPriceListId).toBeNull();
    expect(scopes[0]?.newPriceItemId).toBeNull();
    for (const scope of scopes) {
      expect(scope.tenantId).toBe(ENV.SUPPLIER_PURCHASABLE_SMOKE_TENANT_ID);
      expect(scope.tenantSupplierId).toBe(
        ENV.SUPPLIER_PURCHASABLE_SMOKE_TENANT_SUPPLIER_ID,
      );
      expect(scope.supplierId).toBe(ENV.SUPPLIER_PURCHASABLE_SMOKE_SUPPLIER_ID);
      expect(scope.actorUserId).toBe(ENV.SUPPLIER_PURCHASABLE_SMOKE_ACTOR_USER_ID);
      expect(scope.limit).toBe(1);
      expect(scope.parentKeys[0]).toMatch(
        /^supplier-purchasable-product:[0-9a-f]{32}$/,
      );
    }
    expect(scopes[1]).toMatchObject({
      newPriceListId: PRICE_LIST_ID,
      newPriceItemId: PRICE_ITEM_ID,
    });
  });

  test("proves both an existing and absent published baseline are unchanged", async () => {
    const absent = new FakeGateway();
    absent.baseline = null;
    await expect(runSupplierPurchasableProductSmoke(CONFIG, absent)).resolves
      .toMatchObject({ rollback_clean: true });

    const changed = new FakeGateway();
    changed.after = { ...BASELINE, row_version: BASELINE.row_version + 1 };
    await expect(runSupplierPurchasableProductSmoke(CONFIG, changed)).rejects
      .toThrow("SMOKE_PUBLISHED_BASELINE_CHANGED");
    expect(changed.calls.at(-1)?.operation).toBe("close");
    expect(changed.calls.some((call) =>
      call.operation === "residual-rollback"
    )).toBe(false);
  });

  test("rejects strict record, input, catalog, and price-list mutations", async () => {
    const mutations: ((result: CommandResult) => void)[] = [
      (result) => Reflect.set(result.product, "product_code", "TP-0000000000000000"),
      (result) => Reflect.set(result.product, "status", "draft"),
      (result) => Reflect.set(result.product, "acting_tenant_id", BASELINE_ID),
      (result) => Reflect.set(result.sku, "purchase_unit_id", BASELINE_ID),
      (result) => Reflect.set(result.sku, "batch_managed", true),
      (result) => Reflect.set(result.price, "unit_price", "888.88"),
      (result) => Reflect.set(result.catalog_item, "unit_price", "777.77"),
      (result) => Reflect.set(result.product, "unexpected", true),
    ];
    for (const mutate of mutations) {
      const gateway = new FakeGateway();
      gateway.mutateResult = mutate;
      await expect(runSupplierPurchasableProductSmoke(CONFIG, gateway)).rejects
        .toThrow();
      expect(gateway.calls.at(-1)?.operation).toBe("close");
    }
    const priceListMutation = new FakeGateway();
    priceListMutation.mutateCreatedSnapshot = (snapshot) => {
      snapshot.currency = "USD";
    };
    await expect(runSupplierPurchasableProductSmoke(CONFIG, priceListMutation))
      .rejects.toThrow("SMOKE_PUBLISHED_PRICE_LIST_INVALID");
  });

  test("never emits four true when residual or command evidence fails", async () => {
    for (const dirtyAt of ["invalid", "rollback"] as const) {
      const gateway = new FakeGateway();
      gateway.dirtyAt = dirtyAt;
      await expect(runSupplierPurchasableProductSmoke(CONFIG, gateway)).rejects
        .toThrow("SMOKE_RESIDUAL_ROWS_FOUND");
      expect(gateway.calls.at(-1)?.operation).toBe("close");
    }
    const failed = new FakeGateway();
    failed.failAt = "command";
    await expect(runSupplierPurchasableProductSmoke(CONFIG, failed)).rejects
      .toBeTruthy();
    expect(failed.calls.map((call) => call.operation)).toEqual([
      "snapshot-before",
      "begin",
      "command",
      "rollback",
      "close",
    ]);
  });

  test("rejects unknown price series pollution from the invalid command", async () => {
    const gateway = new FakeGateway();
    gateway.polluteInvalidSeries = true;
    await expect(runSupplierPurchasableProductSmoke(CONFIG, gateway)).rejects
      .toThrow("SMOKE_INVALID_PRICE_SERIES_CHANGED");
  });

  test("ignores historical events for the pre-existing published list", async () => {
    const gateway = new FakeGateway();
    gateway.existingBaselineEvent = true;
    await expect(runSupplierPurchasableProductSmoke(CONFIG, gateway)).resolves
      .toMatchObject({ rollback_clean: true });
  });
});
