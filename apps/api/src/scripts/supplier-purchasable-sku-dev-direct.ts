import {
  deriveSupplierPurchasableSkuDevelopmentDatabaseUrl,
} from "./supplier-purchasable-sku-development-database";

type SupplierPurchasableSkuDevDirectMode = "smoke" | "explain";

type SupplierPurchasableSkuDevDirectCliOptions = {
  mode: string | undefined;
  env: Record<string, string | undefined>;
  run(mode: SupplierPurchasableSkuDevDirectMode, databaseUrl: string):
    Promise<0 | 1>;
  writeError(message: string): void;
};

const DIRECT_DATABASE_URL = "SUPABASE_DB_DIRECT_URL";
const FAILURE_CODE = "SUPPLIER_PURCHASABLE_SKU_DEV_DIRECT_FAILED";

function isMode(value: string | undefined):
  value is SupplierPurchasableSkuDevDirectMode {
  return value === "smoke" || value === "explain";
}

export async function runSupplierPurchasableSkuDevDirectCli(
  options: SupplierPurchasableSkuDevDirectCliOptions,
): Promise<0 | 1> {
  try {
    if (!isMode(options.mode)) throw new Error("DEV_DIRECT_MODE_INVALID");
    const databaseUrl = deriveSupplierPurchasableSkuDevelopmentDatabaseUrl(
      options.env[DIRECT_DATABASE_URL] ?? "",
      DIRECT_DATABASE_URL,
    );
    return await options.run(options.mode, databaseUrl);
  } catch {
    options.writeError(FAILURE_CODE);
    return 1;
  }
}

async function runCommand(
  mode: SupplierPurchasableSkuDevDirectMode,
  databaseUrl: string,
): Promise<0 | 1> {
  if (mode === "smoke") {
    const [smoke, database] = await Promise.all([
      import("./supplier-purchasable-sku-smoke"),
      import("./supplier-purchasable-sku-smoke-database"),
    ]);
    return smoke.runSupplierPurchasableSkuSmokeCli({
      env: { SUPPLIER_PURCHASABLE_SKU_SMOKE_DB_URL: databaseUrl },
      createGateway: (config) =>
        new database.DirectSupplierPurchasableSkuSmokeGateway(
          config.databaseConnection,
        ),
      writeOutput: console.log,
      writeError: console.error,
    });
  }
  const [explain, database] = await Promise.all([
    import("./supplier-purchasable-sku-explain"),
    import("./supplier-purchasable-sku-explain-database"),
  ]);
  return explain.runSupplierPurchasableSkuExplainCli({
    env: { SUPPLIER_PURCHASABLE_SKU_EXPLAIN_DB_URL: databaseUrl },
    createGateway: (config) =>
      new database.DirectSupplierPurchasableSkuExplainGateway(
        config.databaseConnection,
      ),
    writeOutput: console.log,
    writeError: console.error,
  });
}

if (import.meta.main) {
  void runSupplierPurchasableSkuDevDirectCli({
    mode: process.argv[2],
    env: process.env,
    run: runCommand,
    writeError: console.error,
  }).then((exitCode) => {
    process.exitCode = exitCode;
  });
}
