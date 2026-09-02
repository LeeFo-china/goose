import { dirname, isAbsolute, join, resolve } from "node:path";

import {
  deriveSupplierPurchasableSkuDevelopmentDatabaseUrl,
  parseSupplierPurchasableSkuDevelopmentDatabaseUrl,
} from "./supplier-purchasable-sku-development-database";

type SupplierPurchasableSkuDevelopmentDatabaseCommandMode =
  | "target"
  | "migration-list"
  | "migration-dry-run"
  | "migration-apply"
  | "gen-types";

type SupplierPurchasableSkuSupabaseMode = Exclude<
  SupplierPurchasableSkuDevelopmentDatabaseCommandMode,
  "target"
>;

type SupplierPurchasableSkuSupabaseResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut?: boolean;
};

type SupplierPurchasableSkuDevelopmentDatabaseCommandCliOptions = {
  mode: string | undefined;
  env: Record<string, string | undefined>;
  runSupabase(
    mode: SupplierPurchasableSkuSupabaseMode,
    databaseUrl: string,
  ): Promise<SupplierPurchasableSkuSupabaseResult>;
  writeOutput(message: string): void;
  writeError(message: string): void;
};

type SupplierPurchasableSkuSupabaseSpawn = (
  command: string[],
  options: { stdout: "pipe"; stderr: "pipe" },
) => {
  exited: Promise<number>;
  stdout: ReadableStream<Uint8Array>;
  stderr: ReadableStream<Uint8Array>;
  kill(signal?: number | NodeJS.Signals): void;
};

type SupplierPurchasableSkuCommandTimeouts = {
  timeoutMs?: number;
  terminationGraceMs?: number;
};

const DIRECT_DATABASE_URL = "SUPABASE_DB_DIRECT_URL";
const REMOTE_DEVELOPMENT_POSTGRES_HOST = "api-dev.goodcms.cn";
const ROOT_ENVIRONMENT_LOADED =
  "SUPPLIER_PURCHASABLE_SKU_ROOT_ENVIRONMENT_LOADED";
const TARGET_FAILURE_CODE = "SUPPLIER_PURCHASABLE_SKU_DEV_TARGET_FAILED";
const MIGRATION_FAILURE_CODE = "SUPPLIER_PURCHASABLE_SKU_DEV_MIGRATION_FAILED";
const TYPE_GENERATION_FAILURE_CODE =
  "SUPPLIER_PURCHASABLE_SKU_DEV_TYPE_GENERATION_FAILED";
const COMMAND_TIMEOUT_MS = 10 * 60 * 1_000;
const TERMINATION_GRACE_MS = 5_000;

function isMode(
  value: string | undefined,
): value is SupplierPurchasableSkuDevelopmentDatabaseCommandMode {
  return value === "target" || value === "migration-list" ||
    value === "migration-dry-run" || value === "migration-apply" ||
    value === "gen-types";
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

function containsDatabaseSecret(output: string, databaseUrl: string): boolean {
  const parsed = new URL(databaseUrl);
  const sensitiveValues = [
    databaseUrl,
    decodeURIComponent(parsed.username),
    decodeURIComponent(parsed.password),
    parsed.username,
    parsed.password,
  ].filter((value) => value.length > 0);
  return /postgres(?:ql)?:\/\/[^\s]+/i.test(output) ||
    sensitiveValues.some((value) => output.includes(value));
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
): Promise<number> {
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
    const stderr = sanitizeOutput(result.stderr, target.connection.url);
    if (stderr) options.writeError(stderr);
    if (options.mode === "gen-types") {
      if (result.exitCode !== 0) {
        options.writeError(TYPE_GENERATION_FAILURE_CODE);
        return 1;
      }
      if (containsDatabaseSecret(result.stdout, target.connection.url)) {
        options.writeError(TYPE_GENERATION_FAILURE_CODE);
        return 1;
      }
      options.writeOutput(result.stdout);
      return 0;
    }
    const stdout = sanitizeOutput(result.stdout, target.connection.url);
    if (stdout) options.writeOutput(stdout);
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
  mode: SupplierPurchasableSkuSupabaseMode,
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
    case "gen-types":
      return [
        ...command,
        "gen",
        "types",
        "typescript",
        "--db-url",
        databaseUrl,
        "--schema",
        "public,graphql_public",
      ];
  }
}

export function runSupplierPurchasableSkuSupabaseCommand(
  mode: SupplierPurchasableSkuSupabaseMode,
  databaseUrl: string,
  spawn: SupplierPurchasableSkuSupabaseSpawn,
  timeouts: SupplierPurchasableSkuCommandTimeouts = {},
): Promise<SupplierPurchasableSkuSupabaseResult> {
  return runBoundedPipedCommand(
    supabaseCommand(mode, databaseUrl),
    spawn,
    timeouts,
  );
}

async function runBoundedPipedCommand(
  command: string[],
  spawn: SupplierPurchasableSkuSupabaseSpawn,
  {
    timeoutMs = COMMAND_TIMEOUT_MS,
    terminationGraceMs = TERMINATION_GRACE_MS,
  }: SupplierPurchasableSkuCommandTimeouts = {},
): Promise<SupplierPurchasableSkuSupabaseResult> {
  const child = spawn(command, {
    stdout: "pipe",
    stderr: "pipe",
  });
  const output = Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  const lifecycle = await waitForChild(
    child,
    timeoutMs,
    terminationGraceMs,
  );
  const captured = lifecycle.timedOut
    ? await settleWithin(output, terminationGraceMs)
    : { settled: true as const, value: await output };
  const [stdout, stderr] = captured.settled ? captured.value : ["", ""];

  return {
    exitCode: lifecycle.timedOut ? 124 : lifecycle.exitCode,
    stdout,
    stderr,
    ...(lifecycle.timedOut ? { timedOut: true } : {}),
  };
}

async function waitForChild(
  child: Pick<ReturnType<typeof Bun.spawn>, "exited" | "kill">,
  timeoutMs: number,
  terminationGraceMs: number,
) {
  const initial = await settleWithin(child.exited, timeoutMs);
  if (initial.settled) {
    return { exitCode: initial.value, timedOut: false as const };
  }

  child.kill("SIGTERM");
  const terminated = await settleWithin(child.exited, terminationGraceMs);
  if (!terminated.settled) {
    child.kill("SIGKILL");
    await settleWithin(child.exited, terminationGraceMs);
  }
  return { exitCode: 124, timedOut: true as const };
}

function settleWithin<T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<{ settled: true; value: T } | { settled: false }> {
  return new Promise((resolve) => {
    const timer = setTimeout(
      () => resolve({ settled: false }),
      Math.max(1, timeoutMs),
    );
    promise.then((value) => {
      clearTimeout(timer);
      resolve({ settled: true, value });
    }, () => {
      clearTimeout(timer);
      resolve({ settled: false });
    });
  });
}

async function runSupabase(
  mode: SupplierPurchasableSkuSupabaseMode,
  databaseUrl: string,
): Promise<SupplierPurchasableSkuSupabaseResult> {
  return runSupplierPurchasableSkuSupabaseCommand(
    mode,
    databaseUrl,
    (command, options) => Bun.spawn(command, {
      ...options,
      env: process.env,
    }),
  );
}

async function rerunWithRootEnvironment(): Promise<number> {
  const gitCommonDirectoryResult = await runBoundedPipedCommand(
    ["git", "rev-parse", "--git-common-dir"],
    (command, options) => Bun.spawn(command, options),
    { timeoutMs: 10_000, terminationGraceMs: 1_000 },
  );
  if (gitCommonDirectoryResult.exitCode !== 0) return 1;
  const gitCommonDirectory = gitCommonDirectoryResult.stdout.trim();
  const envPath = resolveSupplierPurchasableSkuRootEnvironmentPath(
    gitCommonDirectory,
    process.cwd(),
  );
  const childEnvironment: Record<string, string | undefined> = {
    ...process.env,
    [ROOT_ENVIRONMENT_LOADED]: "1",
  };
  delete childEnvironment[DIRECT_DATABASE_URL];
  const child = Bun.spawn([
    process.execPath,
    `--env-file=${envPath}`,
    import.meta.path,
    ...process.argv.slice(2),
  ], {
    env: childEnvironment,
    stdout: "inherit",
    stderr: "inherit",
  });
  const result = await waitForChild(
    child,
    COMMAND_TIMEOUT_MS,
    TERMINATION_GRACE_MS,
  );
  return result.timedOut ? 1 : result.exitCode;
}

if (import.meta.main) {
  if (process.env[ROOT_ENVIRONMENT_LOADED] !== "1") {
    void rerunWithRootEnvironment().then((exitCode) => {
      process.exitCode = exitCode;
    });
  } else {
    const mode = process.argv[2];
    void runSupplierPurchasableSkuDevelopmentDatabaseCommandCli({
      mode,
      env: process.env,
      runSupabase,
      writeOutput: mode === "gen-types"
        ? (message) => process.stdout.write(message)
        : console.log,
      writeError: console.error,
    }).then((exitCode) => {
      process.exitCode = exitCode;
    });
  }
}
