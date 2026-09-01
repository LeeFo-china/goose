import { dirname, isAbsolute, join, resolve } from "node:path";

import {
  deriveSupplierPurchasableSkuDevelopmentDatabaseUrl,
  parseSupplierPurchasableSkuDevelopmentDatabaseUrl,
} from "./supplier-purchasable-sku-development-database";

type SupplierPurchasableSkuDevelopmentDatabaseCommandMode =
  | "target"
  | "migration-list"
  | "migration-dry-run"
  | "migration-apply";

type SupplierPurchasableSkuMigrationMode = Exclude<
  SupplierPurchasableSkuDevelopmentDatabaseCommandMode,
  "target"
>;

type SupplierPurchasableSkuSupabaseResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

type SupplierPurchasableSkuDevelopmentDatabaseCommandCliOptions = {
  mode: string | undefined;
  env: Record<string, string | undefined>;
  runSupabase(
    mode: SupplierPurchasableSkuMigrationMode,
    databaseUrl: string,
  ): Promise<SupplierPurchasableSkuSupabaseResult>;
  writeOutput(message: string): void;
  writeError(message: string): void;
};

const DIRECT_DATABASE_URL = "SUPABASE_DB_DIRECT_URL";
const REMOTE_DEVELOPMENT_POSTGRES_HOST = "api-dev.goodcms.cn";
const ROOT_ENVIRONMENT_LOADED =
  "SUPPLIER_PURCHASABLE_SKU_ROOT_ENVIRONMENT_LOADED";
const TARGET_FAILURE_CODE = "SUPPLIER_PURCHASABLE_SKU_DEV_TARGET_FAILED";
const MIGRATION_FAILURE_CODE = "SUPPLIER_PURCHASABLE_SKU_DEV_MIGRATION_FAILED";

function isMode(
  value: string | undefined,
): value is SupplierPurchasableSkuDevelopmentDatabaseCommandMode {
  return value === "target" || value === "migration-list" ||
    value === "migration-dry-run" || value === "migration-apply";
}

export function resolveSupplierPurchasableSkuRootEnvironmentPath(
  gitCommonDirectory: string,
  cwd: string,
): string {
  const absoluteGitCommonDirectory = isAbsolute(gitCommonDirectory)
    ? gitCommonDirectory
    : resolve(cwd, gitCommonDirectory);
  return join(dirname(absoluteGitCommonDirectory), ".env");
}

function sanitizeOutput(output: string, databaseUrl: string): string {
  const parsed = new URL(databaseUrl);
  const sensitiveValues = [
    databaseUrl,
    decodeURIComponent(parsed.username),
    decodeURIComponent(parsed.password),
    parsed.username,
    parsed.password,
  ].filter((value) => value.length > 0);
  let sanitized = output.replace(
    /postgres(?:ql)?:\/\/[^\s]+/gi,
    "[REDACTED_DATABASE_URL]",
  );
  for (const value of sensitiveValues) {
    sanitized = sanitized.replaceAll(value, "***");
  }
  return sanitized.trim();
}

function resolveTarget(env: Record<string, string | undefined>) {
  const databaseUrl = deriveSupplierPurchasableSkuDevelopmentDatabaseUrl(
    env[DIRECT_DATABASE_URL] ?? "",
    DIRECT_DATABASE_URL,
  );
  const { connection } = parseSupplierPurchasableSkuDevelopmentDatabaseUrl(
    databaseUrl,
    DIRECT_DATABASE_URL,
  );
  if (connection.hostname !== REMOTE_DEVELOPMENT_POSTGRES_HOST) {
    throw new Error("DEVELOPMENT_DATABASE_TARGET_INVALID");
  }
  return {
    connection,
    summary: {
      database_host: connection.hostname,
      database: connection.database,
      tls: new URL(connection.url).searchParams.get("sslmode"),
    },
  };
}

export async function runSupplierPurchasableSkuDevelopmentDatabaseCommandCli(
  options: SupplierPurchasableSkuDevelopmentDatabaseCommandCliOptions,
): Promise<0 | 1> {
  if (!isMode(options.mode)) {
    options.writeError(TARGET_FAILURE_CODE);
    return 1;
  }

  let target: ReturnType<typeof resolveTarget>;
  try {
    target = resolveTarget(options.env);
  } catch {
    options.writeError(TARGET_FAILURE_CODE);
    return 1;
  }

  if (options.mode === "target") {
    options.writeOutput(JSON.stringify(target.summary));
    return 0;
  }

  try {
    const result = await options.runSupabase(options.mode, target.connection.url);
    const stdout = sanitizeOutput(result.stdout, target.connection.url);
    const stderr = sanitizeOutput(result.stderr, target.connection.url);
    if (stdout) options.writeOutput(stdout);
    if (stderr) options.writeError(stderr);
    if (result.exitCode !== 0) {
      options.writeError(MIGRATION_FAILURE_CODE);
      return 1;
    }
    return 0;
  } catch {
    options.writeError(MIGRATION_FAILURE_CODE);
    return 1;
  }
}

function supabaseCommand(
  mode: SupplierPurchasableSkuMigrationMode,
  databaseUrl: string,
): string[] {
  const command = ["pnpm", "dlx", "supabase@2.99.0"];
  switch (mode) {
    case "migration-list":
      return [...command, "migration", "list", "--db-url", databaseUrl];
    case "migration-dry-run":
      return [...command, "db", "push", "--dry-run", "--db-url", databaseUrl];
    case "migration-apply":
      return [...command, "db", "push", "--yes", "--db-url", databaseUrl];
  }
}

async function runSupabase(
  mode: SupplierPurchasableSkuMigrationMode,
  databaseUrl: string,
): Promise<SupplierPurchasableSkuSupabaseResult> {
  const result = Bun.spawnSync(supabaseCommand(mode, databaseUrl), {
    env: process.env,
    stdout: "pipe",
    stderr: "pipe",
  });
  return {
    exitCode: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  };
}

function rerunWithRootEnvironment(): number {
  const gitCommonDirectoryResult = Bun.spawnSync(
    ["git", "rev-parse", "--git-common-dir"],
    { stdout: "pipe", stderr: "pipe" },
  );
  if (!gitCommonDirectoryResult.success) return 1;
  const gitCommonDirectory = gitCommonDirectoryResult.stdout.toString().trim();
  const envPath = resolveSupplierPurchasableSkuRootEnvironmentPath(
    gitCommonDirectory,
    process.cwd(),
  );
  const childEnvironment: Record<string, string | undefined> = {
    ...process.env,
    [ROOT_ENVIRONMENT_LOADED]: "1",
  };
  delete childEnvironment[DIRECT_DATABASE_URL];
  const result = Bun.spawnSync([
    process.execPath,
    `--env-file=${envPath}`,
    import.meta.path,
    ...process.argv.slice(2),
  ], {
    env: childEnvironment,
    stdout: "inherit",
    stderr: "inherit",
  });
  return result.exitCode;
}

if (import.meta.main) {
  if (process.env[ROOT_ENVIRONMENT_LOADED] !== "1") {
    process.exitCode = rerunWithRootEnvironment();
  } else {
    void runSupplierPurchasableSkuDevelopmentDatabaseCommandCli({
      mode: process.argv[2],
      env: process.env,
      runSupabase,
      writeOutput: console.log,
      writeError: console.error,
    }).then((exitCode) => {
      process.exitCode = exitCode;
    });
  }
}
