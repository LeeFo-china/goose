import { describe, expect, test } from "bun:test";

const ROOT_DIRECT_URL =
  "postgresql://fixture-user:fixture-password@api-dev.goodcms.cn:5432/postgres";

describe("supplier purchasable SKU dev direct command", () => {
  test("derives required TLS in memory and never writes the URL", async () => {
    const { runSupplierPurchasableSkuDevDirectCli } = await import(
      "./supplier-purchasable-sku-dev-direct"
    );
    const calls: unknown[] = [];

    const exitCode = await runSupplierPurchasableSkuDevDirectCli({
      mode: "smoke",
      env: { SUPABASE_DB_DIRECT_URL: ROOT_DIRECT_URL },
      run: async (mode, databaseUrl) => {
        calls.push({ mode, databaseUrl });
        return 0;
      },
      writeError: (message) => calls.push({ error: message }),
    });

    expect(exitCode).toBe(0);
    expect(calls).toEqual([{
      mode: "smoke",
      databaseUrl: `${ROOT_DIRECT_URL}?sslmode=require`,
    }]);
  });

  test("fails closed with a stable error and no URL disclosure", async () => {
    const { runSupplierPurchasableSkuDevDirectCli } = await import(
      "./supplier-purchasable-sku-dev-direct"
    );
    const errors: string[] = [];

    const exitCode = await runSupplierPurchasableSkuDevDirectCli({
      mode: "explain",
      env: {
        SUPABASE_DB_DIRECT_URL:
          "postgresql://secret:secret@api.goodcms.cn:5432/postgres",
      },
      run: async () => 0,
      writeError: (message) => errors.push(message),
    });

    expect(exitCode).toBe(1);
    expect(errors).toEqual([
      "SUPPLIER_PURCHASABLE_SKU_DEV_DIRECT_FAILED",
    ]);
    expect(errors.join(" ")).not.toContain("secret");
    expect(errors.join(" ")).not.toContain("api.goodcms.cn");
  });

  test("prints only the sanitized exact development target", async () => {
    const { runSupplierPurchasableSkuDevelopmentDatabaseCommandCli } =
      await import("./supplier-purchasable-sku-development-database-command");
    const output: string[] = [];
    const errors: string[] = [];

    const exitCode = await runSupplierPurchasableSkuDevelopmentDatabaseCommandCli({
      mode: "target",
      env: { SUPABASE_DB_DIRECT_URL: ROOT_DIRECT_URL },
      runSupabase: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
      writeOutput: (message) => output.push(message),
      writeError: (message) => errors.push(message),
    });

    expect(exitCode).toBe(0);
    expect(errors).toEqual([]);
    expect(output).toEqual([JSON.stringify({
      database_host: "api-dev.goodcms.cn",
      database: "postgres",
      tls: "require",
    })]);
    expect(output.join(" ")).not.toContain("fixture-user");
    expect(output.join(" ")).not.toContain("fixture-password");
    expect(output.join(" ")).not.toContain("postgresql://");
  });

  test.each([
    "postgresql://fixture:fixture@api.goodcms.cn:5432/postgres",
    "postgresql://fixture:fixture@unknown-db.internal:5432/postgres",
    "postgresql://fixture:fixture@api-dev.goodcms.cn:5432/wrong-database",
  ])("target command rejects unsafe database %s without disclosure", async (url) => {
    const { runSupplierPurchasableSkuDevelopmentDatabaseCommandCli } =
      await import("./supplier-purchasable-sku-development-database-command");
    const output: string[] = [];
    const errors: string[] = [];
    let migrationCalls = 0;

    const exitCode = await runSupplierPurchasableSkuDevelopmentDatabaseCommandCli({
      mode: "target",
      env: { SUPABASE_DB_DIRECT_URL: url },
      runSupabase: async () => {
        migrationCalls += 1;
        return { exitCode: 0, stdout: "", stderr: "" };
      },
      writeOutput: (message) => output.push(message),
      writeError: (message) => errors.push(message),
    });

    expect(exitCode).toBe(1);
    expect(output).toEqual([]);
    expect(errors).toEqual([
      "SUPPLIER_PURCHASABLE_SKU_DEV_TARGET_FAILED",
    ]);
    expect(errors.join(" ")).not.toContain(url);
    expect(migrationCalls).toBe(0);
  });

  test("migration command uses normalized TLS and redacts subprocess output", async () => {
    const { runSupplierPurchasableSkuDevelopmentDatabaseCommandCli } =
      await import("./supplier-purchasable-sku-development-database-command");
    const output: string[] = [];
    const errors: string[] = [];
    const calls: unknown[] = [];

    const exitCode = await runSupplierPurchasableSkuDevelopmentDatabaseCommandCli({
      mode: "migration-list",
      env: { SUPABASE_DB_DIRECT_URL: ROOT_DIRECT_URL },
      runSupabase: async (mode, databaseUrl) => {
        calls.push({ mode, databaseUrl });
        return {
          exitCode: 0,
          stdout: `connected ${databaseUrl}`,
          stderr: "",
        };
      },
      writeOutput: (message) => output.push(message),
      writeError: (message) => errors.push(message),
    });

    expect(exitCode).toBe(0);
    expect(calls).toEqual([{
      mode: "migration-list",
      databaseUrl: `${ROOT_DIRECT_URL}?sslmode=require`,
    }]);
    expect(errors).toEqual([]);
    expect(output.join(" ")).toContain("[REDACTED_DATABASE_URL]");
    expect(output.join(" ")).not.toContain("fixture-user");
    expect(output.join(" ")).not.toContain("fixture-password");
  });

  test("type generation builds the exact Supabase argv with normalized TLS", async () => {
    const { runSupplierPurchasableSkuSupabaseCommand } = await import(
      "./supplier-purchasable-sku-development-database-command"
    );
    const calls: unknown[] = [];
    const normalizedUrl = `${ROOT_DIRECT_URL}?sslmode=require`;

    await runSupplierPurchasableSkuSupabaseCommand(
      "gen-types",
      normalizedUrl,
      (command, options) => {
        calls.push({ command, options });
        return { exitCode: 0, stdout: "", stderr: "" };
      },
    );

    expect(calls).toEqual([{
      command: [
        "pnpm",
        "dlx",
        "supabase@2.99.0",
        "gen",
        "types",
        "typescript",
        "--db-url",
        normalizedUrl,
        "--schema",
        "public,graphql_public",
      ],
      options: {
        stdout: "pipe",
        stderr: "pipe",
      },
    }]);
  });

  test("type generation writes only pure types to stdout", async () => {
    const { runSupplierPurchasableSkuDevelopmentDatabaseCommandCli } =
      await import("./supplier-purchasable-sku-development-database-command");
    const output: string[] = [];
    const errors: string[] = [];
    const calls: unknown[] = [];
    const types = "export type Database = {\n  public: unknown;\n};\n";

    const exitCode = await runSupplierPurchasableSkuDevelopmentDatabaseCommandCli({
      mode: "gen-types",
      env: { SUPABASE_DB_DIRECT_URL: ROOT_DIRECT_URL },
      runSupabase: async (mode, databaseUrl) => {
        calls.push({ mode, databaseUrl });
        return { exitCode: 0, stdout: types, stderr: "generated types\n" };
      },
      writeOutput: (message) => output.push(message),
      writeError: (message) => errors.push(message),
    });

    expect(exitCode).toBe(0);
    expect(calls).toEqual([{
      mode: "gen-types",
      databaseUrl: `${ROOT_DIRECT_URL}?sslmode=require`,
    }]);
    expect(output).toEqual([types]);
    expect(errors).toEqual(["generated types"]);
  });

  test("type generation failure emits no partial types or credentials", async () => {
    const { runSupplierPurchasableSkuDevelopmentDatabaseCommandCli } =
      await import("./supplier-purchasable-sku-development-database-command");
    const output: string[] = [];
    const errors: string[] = [];

    const exitCode = await runSupplierPurchasableSkuDevelopmentDatabaseCommandCli({
      mode: "gen-types",
      env: { SUPABASE_DB_DIRECT_URL: ROOT_DIRECT_URL },
      runSupabase: async (_mode, databaseUrl) => ({
        exitCode: 23,
        stdout: `partial types from ${databaseUrl}`,
        stderr: `failed for ${databaseUrl}`,
      }),
      writeOutput: (message) => output.push(message),
      writeError: (message) => errors.push(message),
    });

    expect(exitCode).toBe(23);
    expect(output).toEqual([]);
    expect(errors).toEqual([
      "failed for [REDACTED_DATABASE_URL]",
      "SUPPLIER_PURCHASABLE_SKU_DEV_TYPE_GENERATION_FAILED",
    ]);
    expect(errors.join(" ")).not.toContain("fixture-user");
    expect(errors.join(" ")).not.toContain("fixture-password");
    expect(errors.join(" ")).not.toContain("postgresql://");
  });

  test("resolves root env from normal and linked git common directories", async () => {
    const { resolveSupplierPurchasableSkuRootEnvironmentPath } = await import(
      "./supplier-purchasable-sku-development-database-command"
    );

    expect(resolveSupplierPurchasableSkuRootEnvironmentPath(
      ".git",
      "/workspace/gooes",
    )).toBe("/workspace/gooes/.env");
    expect(resolveSupplierPurchasableSkuRootEnvironmentPath(
      "/workspace/gooes/.git",
      "/workspace/gooes/.worktrees/feature",
    )).toBe("/workspace/gooes/.env");
  });

  test("checks in working package and Task 8/9 commands", async () => {
    const packageJson = await Bun.file(
      new URL("../../package.json", import.meta.url),
    ).json() as { scripts?: Record<string, string> };
    const plan = await Bun.file(new URL(
      "../../../../docs/superpowers/plans/2026-09-01-supplier-sku-inline-price.md",
      import.meta.url,
    )).text();
    const rootPackageJson = await Bun.file(
      new URL("../../../../package.json", import.meta.url),
    ).json() as { scripts?: Record<string, string> };
    const task8And9 = plan.slice(plan.indexOf("## Task 8:"));

    expect(packageJson.scripts?.[
      "supplier:purchasable-sku:smoke:dev-direct"
    ]).toBe("bun src/scripts/supplier-purchasable-sku-dev-direct.ts smoke");
    expect(packageJson.scripts?.[
      "supplier:purchasable-sku:explain:dev-direct"
    ]).toBe("bun src/scripts/supplier-purchasable-sku-dev-direct.ts explain");
    expect(plan).toContain("supplier:purchasable-sku:smoke:dev-direct");
    expect(plan).toContain("supplier:purchasable-sku:explain:dev-direct");
    expect(rootPackageJson.scripts?.[
      "supplier:purchasable-sku:target:dev-direct"
    ]).toBe(
      "bun apps/api/src/scripts/supplier-purchasable-sku-development-database-command.ts target",
    );
    expect(rootPackageJson.scripts?.[
      "supplier:purchasable-sku:migration:list:dev-direct"
    ]).toBe(
      "bun apps/api/src/scripts/supplier-purchasable-sku-development-database-command.ts migration-list",
    );
    expect(rootPackageJson.scripts?.[
      "supplier:purchasable-sku:db:gen-types:dev-direct"
    ]).toBe(
      "bun apps/api/src/scripts/supplier-purchasable-sku-development-database-command.ts gen-types",
    );
    expect(task8And9).toContain(
      "src/repositories/supplier-purchasable-skus-save.test.ts",
    );
    expect(task8And9).toContain(
      "src/services/supplier-purchasable-skus-write.test.ts",
    );
    expect(task8And9).toContain(
      'REPO_ROOT="$(git rev-parse --show-toplevel)"',
    );
    expect(task8And9).toContain(
      "supplier:purchasable-sku:target:dev-direct &&",
    );
    expect(task8And9).toContain(
      "bun run supplier:purchasable-sku:db:gen-types:dev-direct >",
    );
    expect(task8And9).not.toContain(
      'pnpm dlx supabase@2.99.0 gen types typescript \\\n+      --db-url "$SUPABASE_DB_DIRECT_URL"',
    );
    expect(task8And9).not.toContain("cd apps/api &&");
    expect(plan).not.toContain(
      'SUPPLIER_PURCHASABLE_SKU_SMOKE_DB_URL="$SUPABASE_DB_DIRECT_URL"',
    );
    expect(plan).not.toContain(
      'SUPPLIER_PURCHASABLE_SKU_EXPLAIN_DB_URL="$SUPABASE_DB_DIRECT_URL"',
    );
  });
});
