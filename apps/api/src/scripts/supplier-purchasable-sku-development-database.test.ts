import { afterEach, describe, expect, test } from "bun:test";

import {
  createSupplierPurchasableSkuDatabaseOptions,
  parseSupplierPurchasableSkuDevelopmentDatabaseUrl,
} from "./supplier-purchasable-sku-development-database";

const VARIABLE_NAME = "TEST_SUPPLIER_PURCHASABLE_SKU_DB_URL";
const ENVIRONMENT_KEYS = [
  "DATABASE_URL",
  "PGDATABASE",
  "PGHOST",
  "PGPASSWORD",
  "PGPORT",
  "PGUSER",
] as const;
const originalEnvironment = new Map(
  ENVIRONMENT_KEYS.map((key) => [key, process.env[key]]),
);

function setHostileDatabaseEnvironment(): void {
  Object.assign(process.env, {
    DATABASE_URL:
      "postgresql://ambient-user:ambient-password@localhost:6543/ambient?path=%2Ftmp%2Fhostile.sock",
    PGDATABASE: "ambient-database",
    PGHOST: "ambient-host.invalid",
    PGPASSWORD: "ambient-password",
    PGPORT: "6543",
    PGUSER: "ambient-user",
  });
}

afterEach(() => {
  for (const [key, value] of originalEnvironment) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("supplier purchasable SKU development database", () => {
  test("normalizes a complete remote URL without exposing ambient routing", () => {
    const parsed = parseSupplierPurchasableSkuDevelopmentDatabaseUrl(
      "postgresql://fixture-user:fixture-password@api-dev.goodcms.cn:5432/postgres?sslmode=require",
      VARIABLE_NAME,
    );

    expect(parsed.connection.url).toBe(
      "postgresql://fixture-user:fixture-password@api-dev.goodcms.cn:5432/postgres?sslmode=require",
    );
  });

  test("keeps Bun SQL pinned to the validated local endpoint under hostile ambient env", async () => {
    setHostileDatabaseEnvironment();
    const { connection } =
      parseSupplierPurchasableSkuDevelopmentDatabaseUrl(
        "postgresql://requested-user:requested-password@127.0.0.1:5432/requested-database",
        VARIABLE_NAME,
      );

    expect(connection.url).toBe(
      "postgresql://requested-user:requested-password@127.0.0.1:5432/requested-database",
    );
    const database = new Bun.SQL(
      createSupplierPurchasableSkuDatabaseOptions(connection, 1),
    );
    try {
      const options = database.options as typeof database.options & {
        query?: string;
        sslMode?: number;
      };
      expect(options).toMatchObject({
        adapter: "postgres",
        hostname: "127.0.0.1",
        port: 5432,
        database: "requested-database",
        username: "requested-user",
        password: "requested-password",
        sslMode: 0,
      });
      expect(JSON.stringify(options)).not.toContain("ambient");
      expect(options.query).not.toContain("path");
      expect(options.query).not.toContain("hostile.sock");
    } finally {
      await database.close({ timeout: 0 });
    }
  });

  test("keeps Bun SQL pinned to required-TLS remote dev under hostile ambient env", async () => {
    setHostileDatabaseEnvironment();
    const { connection } =
      parseSupplierPurchasableSkuDevelopmentDatabaseUrl(
        "postgresql://requested-user:requested-password@api-dev.goodcms.cn:5432/postgres?sslmode=require",
        VARIABLE_NAME,
      );
    const database = new Bun.SQL(
      createSupplierPurchasableSkuDatabaseOptions(connection, 1),
    );
    try {
      const options = database.options as typeof database.options & {
        query?: string;
        sslMode?: number;
      };
      expect(options).toMatchObject({
        hostname: "api-dev.goodcms.cn",
        port: 5432,
        database: "postgres",
        username: "requested-user",
        password: "requested-password",
        sslMode: 2,
        tls: { serverName: "api-dev.goodcms.cn" },
      });
      expect(JSON.stringify(options)).not.toContain("ambient");
      expect(options.query).not.toContain("path");
      expect(options.query).not.toContain("hostile.sock");
    } finally {
      await database.close({ timeout: 0 });
    }
  });

  test.each([
    "postgresql:///postgres",
    "postgresql://:password@localhost:5432/postgres",
    "postgresql://username@localhost:5432/postgres",
    "postgresql://username:password@localhost:5432/",
    "postgresql://username:password@localhost/postgres",
    "postgresql://username:password@localhost:0/postgres",
  ])("rejects an incomplete connection URL %s", (databaseUrl) => {
    expect(() => parseSupplierPurchasableSkuDevelopmentDatabaseUrl(
      databaseUrl,
      VARIABLE_NAME,
    )).toThrowError(
      `${VARIABLE_NAME} 必须完整包含主机、端口、数据库名、用户名和密码`,
    );
  });
});
