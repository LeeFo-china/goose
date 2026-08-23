import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  comparePlatformSnapshots,
  createRedactedEnvRecord,
  renderPlatformConfigMarkdown,
  type EnvironmentPlatformSnapshot,
  type PlatformConfigComparison,
  type PlatformRuntimeSnapshot,
  type RedactedPlatformConfigRecord,
  type RedactedSystemSettingRecord,
} from "./platform-config-audit-core";
import {
  buildRemoteAuditCommand,
  getEnvironmentDefinition,
  type PlatformAuditEnvironment,
} from "./platform-config-audit-remote";

export { buildRemoteAuditCommand } from "./platform-config-audit-remote";

export interface CommandRunnerInput {
  readonly environment: PlatformAuditEnvironment;
  readonly host: string;
  readonly command: string;
}

export interface CommandRunnerOutput {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

export type CommandRunner = (
  input: CommandRunnerInput,
) => Promise<CommandRunnerOutput>;

export interface PlatformAuditCliResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly reportJsonPath?: string;
  readonly reportMarkdownPath?: string;
}

export type PlatformConfigComparisonResult =
  | { readonly comparison: PlatformConfigComparison }
  | { readonly error: PlatformAuditCliResult };

interface PlatformAuditCliDependencies {
  readonly commandRunner?: CommandRunner;
  readonly now?: () => Date;
  readonly reportRoot?: string;
}

interface ParsedArgs {
  readonly from: "dev";
  readonly to: "production";
  readonly reportRoot: string;
}

const DEFAULT_REPORT_ROOT = "reports/platform-config-audit";
const JSON_SPACE = 2;
const REPORT_FILE_MODE = 0o600;
const REPORT_DIR_MODE = 0o700;
const PLATFORM_AUDIT_USAGE_INVALID = "PLATFORM_CONFIG_AUDIT_USAGE_INVALID";
const PLATFORM_AUDIT_REMOTE_FAILED = "PLATFORM_CONFIG_AUDIT_REMOTE_FAILED";
const PLATFORM_AUDIT_REMOTE_INVALID = "PLATFORM_CONFIG_AUDIT_REMOTE_INVALID";

export async function runPlatformConfigAuditCli(
  args: readonly string[],
  dependencies: PlatformAuditCliDependencies = {},
): Promise<PlatformAuditCliResult> {
  const parsed = parseArgs(args, dependencies.reportRoot ?? DEFAULT_REPORT_ROOT);
  if (!parsed) {
    return {
      exitCode: 1,
      stdout: "",
      stderr: `${PLATFORM_AUDIT_USAGE_INVALID}\n`,
    };
  }

  const runner = dependencies.commandRunner ?? defaultCommandRunner;
  const now = dependencies.now ?? (() => new Date());
  const comparisonResult = await collectPlatformConfigComparison(runner, now);
  if ("error" in comparisonResult) {
    return comparisonResult.error;
  }
  const comparison = comparisonResult.comparison;
  const timestamp = formatShanghaiTimestamp(now());
  const reportJsonPath = join(
    parsed.reportRoot,
    `platform-config-audit-${timestamp}.json`,
  );
  const reportMarkdownPath = join(
    parsed.reportRoot,
    `platform-config-audit-${timestamp}.md`,
  );

  mkdirSync(parsed.reportRoot, { recursive: true, mode: REPORT_DIR_MODE });
  writeFileSync(
    reportJsonPath,
    `${JSON.stringify(comparison, null, JSON_SPACE)}\n`,
    { mode: REPORT_FILE_MODE },
  );
  writeFileSync(reportMarkdownPath, renderPlatformConfigMarkdown(comparison), {
    mode: REPORT_FILE_MODE,
  });

  return {
    exitCode: 0,
    stdout: [
      "PLATFORM_CONFIG_AUDIT_COMPLETE",
      `json=${reportJsonPath}`,
      `markdown=${reportMarkdownPath}`,
      summarizeComparison(comparison),
      "",
    ].join("\n"),
    stderr: "",
    reportJsonPath,
    reportMarkdownPath,
  };
}

export async function collectPlatformConfigComparison(
  runner: CommandRunner = defaultCommandRunner,
  now: () => Date = () => new Date(),
): Promise<PlatformConfigComparisonResult> {
  const devResult = await collectSnapshot("dev", runner);
  if ("error" in devResult) {
    return devResult;
  }

  const productionResult = await collectSnapshot("production", runner);
  if ("error" in productionResult) {
    return productionResult;
  }

  return {
    comparison: comparePlatformSnapshots(
      devResult.snapshot,
      productionResult.snapshot,
      now().toISOString(),
    ),
  };
}

async function collectSnapshot(
  environment: PlatformAuditEnvironment,
  runner: CommandRunner,
): Promise<
  | { readonly snapshot: EnvironmentPlatformSnapshot }
  | { readonly error: PlatformAuditCliResult }
> {
  const definition = getEnvironmentDefinition(environment);
  const command = buildRemoteAuditCommand(environment);
  const result = await runner({
    environment,
    host: definition.host,
    command,
  });

  if (result.exitCode !== 0) {
    return {
      error: {
        exitCode: 2,
        stdout: "",
        stderr: `${PLATFORM_AUDIT_REMOTE_FAILED}:${environment}:${result.stderr.trim()}\n`,
      },
    };
  }

  try {
    return { snapshot: normalizeSnapshot(JSON.parse(result.stdout)) };
  } catch {
    return {
      error: {
        exitCode: 3,
        stdout: "",
        stderr: `${PLATFORM_AUDIT_REMOTE_INVALID}:${environment}\n`,
      },
    };
  }
}

async function defaultCommandRunner(
  input: CommandRunnerInput,
): Promise<CommandRunnerOutput> {
  const process = Bun.spawn(["ssh", input.host, "bash", "-s"], {
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  });
  process.stdin.write(input.command);
  process.stdin.end();

  const [exitCode, stdout, stderr] = await Promise.all([
    process.exited,
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
  ]);

  return { exitCode, stdout, stderr };
}

function parseArgs(args: readonly string[], reportRoot: string): ParsedArgs | null {
  let from: string | null = null;
  let to: string | null = null;
  let outputRoot = reportRoot;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const value = args[index + 1];
    if (arg === "--from" && value) {
      from = value;
      index += 1;
      continue;
    }
    if (arg === "--to" && value) {
      to = value;
      index += 1;
      continue;
    }
    if (arg === "--report-root" && value) {
      outputRoot = value;
      index += 1;
      continue;
    }
    return null;
  }

  if (from !== "dev" || to !== "production") {
    return null;
  }

  return { from: "dev", to: "production", reportRoot: outputRoot };
}

function normalizeSnapshot(input: unknown): EnvironmentPlatformSnapshot {
  if (input === null || typeof input !== "object") {
    throw new Error("snapshot invalid");
  }

  const value = input as Partial<EnvironmentPlatformSnapshot>;
  if (value.environment !== "dev" && value.environment !== "production") {
    throw new Error("snapshot environment invalid");
  }

  return {
    environment: value.environment,
    env: normalizeEnvRecords(value.env),
    runtime: normalizeRuntime(value.runtime),
  };
}

function normalizeEnvRecords(
  input: unknown,
): readonly RedactedPlatformConfigRecord[] {
  if (!Array.isArray(input)) {
    throw new Error("env invalid");
  }

  return input.map((record) => {
    if (record === null || typeof record !== "object") {
      throw new Error("env record invalid");
    }
    const value = record as Partial<RedactedPlatformConfigRecord>;
    if (typeof value.key !== "string") {
      throw new Error("env key invalid");
    }
    if (typeof value.sha256 === "string" && !/^[a-f0-9]{64}$/u.test(value.sha256)) {
      throw new Error("env sha invalid");
    }
    const classified = createRedactedEnvRecord(value.key, undefined);

    return {
      ...classified,
      class: value.class ?? classified.class,
      present: value.present === true,
      byte_length: typeof value.byte_length === "number" ? value.byte_length : 0,
      sha256: typeof value.sha256 === "string" ? value.sha256 : null,
      public_tail: typeof value.public_tail === "string" ? value.public_tail : null,
    };
  });
}

function normalizeRuntime(input: unknown): PlatformRuntimeSnapshot {
  if (input === null || typeof input !== "object") {
    throw new Error("runtime invalid");
  }
  const runtime = input as Partial<PlatformRuntimeSnapshot>;

  return {
    douyin_component: {
      row_exists: runtime.douyin_component?.row_exists === true,
      status: stringOrNull(runtime.douyin_component?.status),
      has_ticket: runtime.douyin_component?.has_ticket === true,
      has_access_token: runtime.douyin_component?.has_access_token === true,
      access_token_valid: runtime.douyin_component?.access_token_valid === true,
      appid_tail: stringOrNull(runtime.douyin_component?.appid_tail),
    },
    douyin_template_installation: {
      row_exists: runtime.douyin_template_installation?.row_exists === true,
      installation_kind: stringOrNull(
        runtime.douyin_template_installation?.installation_kind,
      ),
      authorization_status: stringOrNull(
        runtime.douyin_template_installation?.authorization_status,
      ),
      has_tenant: runtime.douyin_template_installation?.has_tenant === true,
      has_access_token:
        runtime.douyin_template_installation?.has_access_token === true,
      has_refresh_token:
        runtime.douyin_template_installation?.has_refresh_token === true,
      appid_tail: stringOrNull(runtime.douyin_template_installation?.appid_tail),
    },
    douyin_template: {
      latest_template_version: stringOrNull(
        runtime.douyin_template?.latest_template_version,
      ),
      has_current_template: runtime.douyin_template?.has_current_template === true,
    },
    system_settings: normalizeSystemSettings(runtime.system_settings),
  };
}

function normalizeSystemSettings(
  input: unknown,
): readonly RedactedSystemSettingRecord[] {
  if (!Array.isArray(input)) {
    return [];
  }

  return input.flatMap((record) => {
    if (record === null || typeof record !== "object") {
      return [];
    }
    const value = record as Partial<RedactedSystemSettingRecord>;
    if (typeof value.key !== "string") {
      return [];
    }

    return [{
      key: value.key,
      class: value.class ?? "UNKNOWN",
      present: value.present === true,
      byte_length: typeof value.byte_length === "number" ? value.byte_length : 0,
      md5: typeof value.md5 === "string" ? value.md5 : null,
    }];
  });
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function summarizeComparison(comparison: PlatformConfigComparison): string {
  const mismatchCount = comparison.env.filter((row) => row.status === "mismatch")
    .length;
  const missingCount = comparison.env.filter((row) =>
    row.status === "missing_in_production" || row.status === "missing_in_dev"
  ).length;
  const unknownCount = comparison.env.filter((row) => row.status === "unknown")
    .length;
  return `summary=mismatch:${mismatchCount},missing:${missingCount},unknown:${unknownCount}`;
}

function formatShanghaiTimestamp(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: string): string =>
    parts.find((part) => part.type === type)?.value ?? "00";

  return `${get("year")}${get("month")}${get("day")}-${get("hour")}${get("minute")}${get("second")}`;
}

if (import.meta.main) {
  const result = await runPlatformConfigAuditCli(Bun.argv.slice(2));
  if (result.stdout) {
    process.stdout.write(result.stdout);
  }
  if (result.stderr) {
    process.stderr.write(result.stderr);
  }
  process.exit(result.exitCode);
}
