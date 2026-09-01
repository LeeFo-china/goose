export type SupplierPurchasableSkuSmokeConfig = {
  databaseUrl: string;
  databaseHost: string;
  redactedDatabaseUrl: string;
};

export type SupplierPurchasableSkuSmokeSummary = Record<
  | "created"
  | "edited"
  | "replayed"
  | "concurrent_conflict"
  | "future_preserved"
  | "resolver_verified"
  | "cleanup_verified",
  boolean
>;

export type SupplierPurchasableSkuSmokeEvidence = Omit<
  SupplierPurchasableSkuSmokeSummary,
  "cleanup_verified"
> & {
  concurrency: { successes: 1; conflicts: 1 };
};

export type SupplierPurchasableSkuSmokeGateway = {
  runScenarios(): Promise<SupplierPurchasableSkuSmokeEvidence>;
  cleanup(): Promise<boolean>;
  close(): Promise<void>;
};

const SMOKE_DATABASE_URL = "SUPPLIER_PURCHASABLE_SKU_SMOKE_DB_URL";

function parsePostgresUrl(value: string, missingMessage: string): URL {
  if (!value) throw new Error(missingMessage);
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${SMOKE_DATABASE_URL} 必须是 PostgreSQL URL`);
  }
  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    throw new Error(`${SMOKE_DATABASE_URL} 必须是 PostgreSQL URL`);
  }
  return parsed;
}

export function redactSupplierPurchasableSkuDatabaseUrl(value: string): string {
  const parsed = parsePostgresUrl(value, `缺少 ${SMOKE_DATABASE_URL}`);
  if (parsed.username) parsed.username = "***";
  if (parsed.password) parsed.password = "***";
  return parsed.toString();
}

export function resolveSmokeConfig(
  env: Record<string, string | undefined>,
): SupplierPurchasableSkuSmokeConfig {
  const databaseUrl = env[SMOKE_DATABASE_URL] ?? "";
  const parsed = parsePostgresUrl(databaseUrl, `缺少 ${SMOKE_DATABASE_URL}`);
  return {
    databaseUrl,
    databaseHost: parsed.hostname,
    redactedDatabaseUrl: redactSupplierPurchasableSkuDatabaseUrl(databaseUrl),
  };
}

export function createSupplierPurchasableSkuSmokeSummary():
SupplierPurchasableSkuSmokeSummary {
  return {
    created: true,
    edited: true,
    replayed: true,
    concurrent_conflict: true,
    future_preserved: true,
    resolver_verified: true,
    cleanup_verified: true,
  };
}

export async function runSupplierPurchasableSkuSmoke(
  gateway: SupplierPurchasableSkuSmokeGateway,
): Promise<{
  summary: SupplierPurchasableSkuSmokeSummary;
  concurrency: SupplierPurchasableSkuSmokeEvidence["concurrency"];
}> {
  let evidence: SupplierPurchasableSkuSmokeEvidence | undefined;
  let failure: unknown;
  try {
    evidence = await gateway.runScenarios();
  } catch (error) {
    failure = error;
  }

  let cleanupVerified = false;
  try {
    cleanupVerified = await gateway.cleanup();
  } catch {
    cleanupVerified = false;
  }
  try {
    await gateway.close();
  } catch (error) {
    failure ??= error;
  }

  if (!cleanupVerified) {
    throw new Error("SUPPLIER_PURCHASABLE_SKU_SMOKE_CLEANUP_FAILED");
  }
  if (failure !== undefined) throw failure;
  if (!evidence || Object.entries(evidence).some(([key, value]) =>
    key !== "concurrency" && value !== true
  ) || evidence.concurrency.successes !== 1 ||
    evidence.concurrency.conflicts !== 1) {
    throw new Error("SUPPLIER_PURCHASABLE_SKU_SMOKE_EVIDENCE_INVALID");
  }
  return {
    summary: createSupplierPurchasableSkuSmokeSummary(),
    concurrency: evidence.concurrency,
  };
}

type SmokeCliOptions = {
  env: Record<string, string | undefined>;
  createGateway(config: SupplierPurchasableSkuSmokeConfig):
    SupplierPurchasableSkuSmokeGateway;
  writeOutput(message: string): void;
  writeError(message: string): void;
};

export async function runSupplierPurchasableSkuSmokeCli(
  options: SmokeCliOptions,
): Promise<0 | 1> {
  try {
    const config = resolveSmokeConfig(options.env);
    const result = await runSupplierPurchasableSkuSmoke(
      options.createGateway(config),
    );
    options.writeOutput(JSON.stringify({
      database_host: config.databaseHost,
      ...result,
    }));
    return 0;
  } catch {
    options.writeError("SUPPLIER_PURCHASABLE_SKU_SMOKE_FAILED");
    return 1;
  }
}

if (import.meta.main) {
  void import("./supplier-purchasable-sku-smoke-database").then(
    ({ DirectSupplierPurchasableSkuSmokeGateway }) =>
      runSupplierPurchasableSkuSmokeCli({
        env: process.env,
        createGateway: (config) =>
          new DirectSupplierPurchasableSkuSmokeGateway(config.databaseUrl),
        writeOutput: console.log,
        writeError: console.error,
      }),
  ).then((exitCode) => {
    process.exitCode = exitCode;
  }).catch(() => {
    console.error("SUPPLIER_PURCHASABLE_SKU_SMOKE_FAILED");
    process.exitCode = 1;
  });
}
