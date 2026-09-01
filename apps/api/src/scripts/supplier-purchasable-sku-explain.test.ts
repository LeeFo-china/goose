import { describe, expect, test } from "bun:test";

import {
  SUPPLIER_PURCHASABLE_SKU_EXPLAIN_QUERY_NAMES,
  assertSupplierPurchasableSkuExplainPlan,
  parseSupplierPurchasableSkuExplainPlan,
  runSupplierPurchasableSkuExplain,
  runSupplierPurchasableSkuExplainCli,
  resolveExplainConfig,
} from "./supplier-purchasable-sku-explain";
import { DirectSupplierPurchasableSkuExplainGateway } from
  "./supplier-purchasable-sku-explain-database";

const DATABASE_URL =
  "postgresql://fixture-user:fixture-password@api-dev.goodcms.cn:5432/postgres?sslmode=require";

function explainRows(plan: Record<string, unknown>) {
  return [{
    "QUERY PLAN": [{
      Plan: plan,
      "Planning Time": 0.1,
      "Execution Time": 0.2,
    }],
  }];
}

function indexedPlanFor(
  name: typeof SUPPLIER_PURCHASABLE_SKU_EXPLAIN_QUERY_NAMES[number],
): Record<string, unknown> {
  const item = {
    "Node Type": "Index Scan",
    "Relation Name": "supplier_price_list_items",
    "Index Name": `${name}_item_idx`,
    "Shared Hit Blocks": 2,
    "Shared Read Blocks": 1,
  };
  if (name === "targetCurrentItem" || name === "setBasedCopy") return item;
  return {
    "Node Type": "Nested Loop",
    Plans: [{
      "Node Type": "Index Scan",
      "Relation Name": "supplier_price_lists",
      "Index Name": `${name}_list_idx`,
      "Shared Hit Blocks": 1,
    }, item],
  };
}

describe("supplier purchasable SKU EXPLAIN command", () => {
  test("requires its explicit database URL", () => {
    expect(() => resolveExplainConfig({})).toThrowError(
      "缺少 SUPPLIER_PURCHASABLE_SKU_EXPLAIN_DB_URL",
    );
  });

  test("redacts credentials while retaining the database host", () => {
    const config = resolveExplainConfig({
      SUPPLIER_PURCHASABLE_SKU_EXPLAIN_DB_URL: DATABASE_URL,
    });

    expect(config.databaseHost).toBe("api-dev.goodcms.cn");
    expect(config.databaseConnection).toEqual({
      adapter: "postgres",
      hostname: "api-dev.goodcms.cn",
      port: 5432,
      database: "postgres",
      username: "fixture-user",
      password: "fixture-password",
      tls: true,
      url: DATABASE_URL,
    });
    expect(config).not.toHaveProperty("databaseUrl");
    expect(config.redactedDatabaseUrl).toBe(
      "postgresql://***:***@api-dev.goodcms.cn:5432/postgres?sslmode=require",
    );
  });

  test.each([
    "api.goodcms.cn",
    "api-dev.goodcms.cn.attacker.invalid",
    "unknown-db.internal",
  ])("rejects non-development database host %s", (host) => {
    expect(() => resolveExplainConfig({
      SUPPLIER_PURCHASABLE_SKU_EXPLAIN_DB_URL:
        `postgresql://fixture:fixture@${host}:5432/postgres`,
    })).toThrowError(
      "SUPPLIER_PURCHASABLE_SKU_EXPLAIN_DB_URL 仅允许连接开发数据库主机",
    );
  });

  test("accepts an explicitly allowlisted local database host", () => {
    expect(resolveExplainConfig({
      SUPPLIER_PURCHASABLE_SKU_EXPLAIN_DB_URL:
        "postgresql://fixture:fixture@localhost:5432/postgres",
    }).databaseHost).toBe("localhost");
  });

  test.each([
    "postgresql://fixture:fixture@api-dev.goodcms.cn:5432/postgres",
    "postgresql://fixture:fixture@api-dev.goodcms.cn:5432/postgres?sslmode=disable",
    "postgresql://fixture:fixture@api-dev.goodcms.cn:5432/postgres?sslmode=prefer",
  ])("rejects missing or insecure remote TLS %s", (databaseUrl) => {
    expect(() => resolveExplainConfig({
      SUPPLIER_PURCHASABLE_SKU_EXPLAIN_DB_URL: databaseUrl,
    })).toThrowError(
      "SUPPLIER_PURCHASABLE_SKU_EXPLAIN_DB_URL 远程开发数据库必须显式使用安全 sslmode",
    );
  });

  test.each([
    ["path", "%2Ftmp%2Fpostgres"],
    ["application_name", "task8"],
  ])("rejects non-allowlisted query parameter %s", (key, value) => {
    expect(() => resolveExplainConfig({
      SUPPLIER_PURCHASABLE_SKU_EXPLAIN_DB_URL:
        `${DATABASE_URL}&${key}=${value}`,
    })).toThrowError(
      `SUPPLIER_PURCHASABLE_SKU_EXPLAIN_DB_URL 不允许数据库 URL 查询参数 ${key}`,
    );
  });

  test("keeps EXPLAIN query predicates aligned with the migration", async () => {
    const source = (await Bun.file(new URL(
      "./supplier-purchasable-sku-explain-database.ts",
      import.meta.url,
    )).text()).toLowerCase();
    const migration = (await Bun.file(new URL(
      "../../../../supabase/migrations/20260901130000_create_supplier_purchasable_sku_command.sql",
      import.meta.url,
    )).text()).toLowerCase();
    const section = (text: string, start: string, end: string) => {
      const startIndex = text.indexOf(start);
      const endIndex = text.indexOf(end, startIndex + start.length);
      expect(startIndex).toBeGreaterThanOrEqual(0);
      expect(endIndex).toBeGreaterThan(startIndex);
      return text.slice(startIndex, endIndex);
    };
    const query = (name: string, next: string) => section(
      source,
      `case "${name}":`,
      `case "${next}":`,
    );
    const currentDefault = query("currentdefault", "earliestfuture");
    const earliestFuture = query("earliestfuture", "targetcurrentitem");
    const targetCurrentItem = query("targetcurrentitem", "setbasedcopy");
    const setBasedCopy = source.slice(source.indexOf('case "setbasedcopy":'));
    const migrationCurrent = section(
      migration,
      "select price_list.*\n    into v_current_price_list",
      "v_source_price_list := v_current_price_list",
    );
    const migrationFuture = section(
      migration,
      "select price_list.*\n    into v_future_price_list",
      "if v_current_price_list.id is not null then",
    );
    const migrationTargetItem = section(
      migration,
      "select item.*\n      into v_current_price_item",
      "end if;",
    );
    const migrationSetCopy = section(
      migration,
      "-- v2 already copies in one insert ... select",
      "if exists (",
    );
    const futurePredicates = [
      "price_list.tenant_id =",
      "price_list.tenant_supplier_id =",
      "price_list.supplier_id =",
      "upper(btrim(price_list.price_list_code)) = 'default'",
      "price_list.scope_type = 'default'",
      "price_list.currency = 'cny'",
      "price_list.lifecycle_status = 'published'",
      "price_list.effective_from >",
      "item.supplier_product_id =",
      "item.supplier_sku_id =",
    ];
    for (const predicate of [
      ...futurePredicates.filter((predicate) =>
        !predicate.includes("effective_from >")
      ),
      "price_list.effective_from <=",
      "price_list.effective_until is null",
      "price_list.effective_until >",
    ]) {
      expect(currentDefault).toContain(predicate);
      expect(migrationCurrent).toContain(predicate);
    }
    for (const predicate of futurePredicates) {
      expect(earliestFuture).toContain(predicate);
      expect(migrationFuture).toContain(predicate);
    }
    expect(targetCurrentItem).not.toContain("where item.id =");
    for (const predicate of [
      "item.supplier_price_list_id =",
      "item.tenant_id =",
      "item.supplier_id =",
      "item.supplier_product_id =",
      "item.supplier_sku_id =",
    ]) {
      expect(targetCurrentItem).toContain(predicate);
      expect(migrationTargetItem).toContain(predicate);
    }
    for (const predicate of [
      "source_item.supplier_price_list_id =",
      "source_item.tenant_id =",
      "source_item.supplier_id =",
      "target_item.supplier_price_list_id =",
      "target_item.tenant_id =",
      "target_item.supplier_id =",
      "target_item.supplier_sku_id = source_item.supplier_sku_id",
    ]) {
      expect(setBasedCopy).toContain(predicate);
      expect(migrationSetCopy).toContain(predicate);
    }
    expect(setBasedCopy).toContain(
      "select gen_random_uuid(), ${this.fixture.tenantid}::uuid",
    );
    expect(setBasedCopy).toContain(
      "${this.fixture.supplierid}::uuid, ${this.copytargetlistid}::uuid",
    );
    expect(migrationSetCopy).toContain(
      "gen_random_uuid(), p_tenant_id, p_supplier_id, v_price_list_id",
    );
  });

  test("recursively rejects scoped price-list sequential scans", () => {
    const parsed = parseSupplierPurchasableSkuExplainPlan(explainRows({
      "Node Type": "Nested Loop",
      Plans: [{
        "Node Type": "Bitmap Heap Scan",
        "Relation Name": "supplier_price_list_items",
        Plans: [{
          "Node Type": "Seq Scan",
          "Relation Name": "supplier_price_lists",
          Alias: "price_list",
          Filter: "tenant_id = fixture_tenant_id",
        }],
      }],
    }));

    expect(() => assertSupplierPurchasableSkuExplainPlan(
      parsed,
      "currentDefault",
    ))
      .toThrowError("supplier_price_lists scoped Seq Scan");
  });

  test.each([
    ["empty result", { "Node Type": "Result" }],
    ["unrelated index", {
      "Node Type": "Index Scan",
      "Relation Name": "users",
      "Index Name": "users_pkey",
    }],
  ])("rejects %s without target relation evidence", (_label, plan) => {
    const parsed = parseSupplierPurchasableSkuExplainPlan(explainRows(plan));
    expect(() => assertSupplierPurchasableSkuExplainPlan(
      parsed,
      "targetCurrentItem",
    )).toThrowError(
      "targetCurrentItem requires indexed supplier_price_list_items access",
    );
  });

  test("requires both list and item indexed access for resolution plans", () => {
    const parsed = parseSupplierPurchasableSkuExplainPlan(explainRows({
      "Node Type": "Index Scan",
      "Relation Name": "supplier_price_lists",
      "Index Name": "supplier_price_lists_scope_idx",
    }));
    expect(() => assertSupplierPurchasableSkuExplainPlan(
      parsed,
      "earliestFuture",
    )).toThrowError(
      "earliestFuture requires indexed supplier_price_list_items access",
    );
  });

  test("accepts recursive index plans and records buffers", () => {
    const parsed = parseSupplierPurchasableSkuExplainPlan(explainRows({
      "Node Type": "Nested Loop",
      "Shared Hit Blocks": 7,
      "Shared Read Blocks": 2,
      Plans: [
        {
          "Node Type": "Index Scan",
          "Relation Name": "supplier_price_lists",
          "Index Name": "supplier_price_lists_scope_idx",
          "Index Cond": "tenant_id = fixture_tenant_id",
          "Shared Hit Blocks": 3,
        },
        {
          "Node Type": "Index Only Scan",
          "Relation Name": "supplier_price_list_items",
          "Index Name": "supplier_price_list_items_scope_idx",
          "Index Cond": "supplier_sku_id = fixture_sku_id",
          "Shared Hit Blocks": 4,
          "Shared Read Blocks": 2,
        },
      ],
    }));

    expect(assertSupplierPurchasableSkuExplainPlan(
      parsed,
      "currentDefault",
    )).toBe(true);
    expect(parsed.indexNames).toEqual([
      "supplier_price_lists_scope_idx",
      "supplier_price_list_items_scope_idx",
    ]);
    expect(parsed.buffers).toEqual({ sharedHit: 14, sharedRead: 4 });
    expect(parsed.hasRuntimeEvidence).toBe(true);
    expect(parsed.relationAccesses).toEqual({
      supplier_price_lists: {
        indexNames: ["supplier_price_lists_scope_idx"],
        nodeTypes: ["Index Scan"],
      },
      supplier_price_list_items: {
        indexNames: ["supplier_price_list_items_scope_idx"],
        nodeTypes: ["Index Only Scan"],
      },
    });
  });

  test("releases a reserved connection and bounded-closes after rollback rejects", async () => {
    const calls: Array<string | { close: unknown }> = [];
    const gateway = Object.create(
      DirectSupplierPurchasableSkuExplainGateway.prototype,
    ) as DirectSupplierPurchasableSkuExplainGateway;
    const reserved = Object.assign(
      () => ({
        async simple() {
          calls.push("rollback");
          throw new Error("rollback failed");
        },
      }),
      { release: () => calls.push("release") },
    );
    const database = Object.assign(
      () => { throw new Error("unexpected query"); },
      {
        async close(options?: unknown) {
          calls.push({ close: options });
        },
      },
    );
    Object.assign(gateway, { reserved, database });

    await expect(gateway.close()).rejects.toThrow("rollback failed");
    expect(calls).toEqual([
      "rollback",
      "release",
      { close: { timeout: 5 } },
    ]);
  });

  test("applies bounded pool and server timeouts to every database connection", async () => {
    const config = resolveExplainConfig({
      SUPPLIER_PURCHASABLE_SKU_EXPLAIN_DB_URL: DATABASE_URL,
    });
    const gateway = new DirectSupplierPurchasableSkuExplainGateway(
      config.databaseConnection,
    );
    const database = (gateway as unknown as { database: Bun.SQL }).database;
    const options = database.options as typeof database.options & {
      query?: string;
      sslMode?: number;
    };
    expect(options).toMatchObject({
      adapter: "postgres",
      hostname: "api-dev.goodcms.cn",
      tls: { serverName: "api-dev.goodcms.cn" },
      max: 1,
      prepare: false,
      connectionTimeout: 10_000,
    });
    expect(options.idleTimeout).toBeUndefined();
    expect(options.maxLifetime).toBeUndefined();
    expect(options.query).toContain("statement_timeout\u000030s\u0000");
    expect(options.query).toContain("lock_timeout\u000010s\u0000");
    expect(options.sslMode).toBe(2);
    await database.close({ timeout: 0 });

    const smokeSource = await Bun.file(new URL(
      "./supplier-purchasable-sku-smoke-database.ts",
      import.meta.url,
    )).text();
    const explainSource = await Bun.file(new URL(
      "./supplier-purchasable-sku-explain-database.ts",
      import.meta.url,
    )).text();
    for (const source of [smokeSource, explainSource]) {
      expect(source).toContain(
        "createSupplierPurchasableSkuDatabaseOptions",
      );
      expect(source).toContain(
        ".close(SUPPLIER_PURCHASABLE_SKU_CLOSE_OPTIONS)",
      );
    }
  });

  test("is import-safe and exposes the exact package command", async () => {
    const source = await Bun.file(
      new URL("./supplier-purchasable-sku-explain.ts", import.meta.url),
    ).text();
    const packageJson = await Bun.file(
      new URL("../../package.json", import.meta.url),
    ).json() as { scripts?: Record<string, string> };

    expect(source).toContain("if (import.meta.main)");
    expect(packageJson.scripts?.["supplier:purchasable-sku:explain"])
      .toBe("bun src/scripts/supplier-purchasable-sku-explain.ts");
  });

  test("runs exactly four fixed plans and summarizes indexes and buffers", async () => {
    const calls: string[] = [];
    const summary = await runSupplierPurchasableSkuExplain({
      async explain(name) {
        calls.push(name);
        return explainRows(indexedPlanFor(name));
      },
      async close() {
        calls.push("close");
      },
    });

    expect(calls).toEqual([
      ...SUPPLIER_PURCHASABLE_SKU_EXPLAIN_QUERY_NAMES,
      "close",
    ]);
    expect(summary.query_count).toBe(4);
    expect(summary.n_plus_one).toBe(false);
    expect(summary.indexes.currentDefault).toEqual([
      "currentDefault_list_idx",
      "currentDefault_item_idx",
    ]);
    expect(summary.buffers.setBasedCopy).toEqual({
      sharedHit: 2,
      sharedRead: 1,
    });
  });

  test("CLI output is sanitized and failures expose only a stable code", async () => {
    const output: string[] = [];
    const errors: string[] = [];
    const createGateway = () => ({
      async explain(name: typeof SUPPLIER_PURCHASABLE_SKU_EXPLAIN_QUERY_NAMES[number]) {
        return explainRows(indexedPlanFor(name));
      },
      async close() {},
    });
    expect(await runSupplierPurchasableSkuExplainCli({
      env: { SUPPLIER_PURCHASABLE_SKU_EXPLAIN_DB_URL: DATABASE_URL },
      createGateway,
      writeOutput: (message) => output.push(message),
      writeError: (message) => errors.push(message),
    })).toBe(0);
    expect(JSON.parse(output[0]!).database_host).toBe("api-dev.goodcms.cn");
    expect(output[0]).not.toContain("fixture-user");
    expect(output[0]).not.toContain("fixture-password");

    expect(await runSupplierPurchasableSkuExplainCli({
      env: { SUPPLIER_PURCHASABLE_SKU_EXPLAIN_DB_URL: DATABASE_URL },
      createGateway: () => ({
        async explain() {
          throw new Error("sensitive-plan-failure");
        },
        async close() {},
      }),
      writeOutput: () => {},
      writeError: (message) => errors.push(message),
    })).toBe(1);
    expect(errors).toEqual(["SUPPLIER_PURCHASABLE_SKU_EXPLAIN_FAILED"]);
  });
});
