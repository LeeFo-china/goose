import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  collectPlatformConfigComparison,
  type CommandRunner,
} from "./platform-config-audit";
import {
  createPlatformConfigSyncPlan,
  isPlatformConfigSyncTarget,
  renderPlatformConfigSyncMarkdown,
  type PlatformConfigSyncTarget,
} from "./platform-config-sync-plan";
import {
  applyWechatMiniSessionKey,
  WECHAT_MINI_APPLY_KEY,
  type PlatformConfigSyncApplyInput,
  type PlatformConfigSyncApplyResult,
} from "./platform-config-sync-apply";
import type { RedactedPlatformConfigRecord } from "./platform-config-audit-core";

export type PlatformConfigSyncCommandRunner = CommandRunner;
export type PlatformConfigSyncApplyRunner = (
  input: PlatformConfigSyncApplyInput,
) => Promise<PlatformConfigSyncApplyResult>;

export interface PlatformConfigSyncCliResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly reportJsonPath?: string;
  readonly reportMarkdownPath?: string;
}

interface PlatformConfigSyncCliDependencies {
  readonly commandRunner?: CommandRunner;
  readonly applyRunner?: PlatformConfigSyncApplyRunner;
  readonly now?: () => Date;
  readonly reportRoot?: string;
}

interface ParsedArgs {
  readonly from: "dev";
  readonly to: "production";
  readonly target: PlatformConfigSyncTarget;
  readonly reportRoot: string;
  readonly mode: "dry_run" | "apply";
}

const DEFAULT_REPORT_ROOT = "reports/platform-config-sync";
const REPORT_DIR_MODE = 0o700;
const REPORT_FILE_MODE = 0o600;
const JSON_SPACE = 2;
const USAGE_INVALID = "PLATFORM_CONFIG_SYNC_USAGE_INVALID";
const APPLY_TARGET_UNSUPPORTED = "PLATFORM_CONFIG_SYNC_APPLY_TARGET_UNSUPPORTED";
const APPLY_PLAN_UNSAFE = "PLATFORM_CONFIG_SYNC_APPLY_PLAN_UNSAFE";
const APPLY_FAILED = "PLATFORM_CONFIG_SYNC_APPLY_FAILED";

export async function runPlatformConfigSyncCli(
  args: readonly string[],
  dependencies: PlatformConfigSyncCliDependencies = {},
): Promise<PlatformConfigSyncCliResult> {
  const parsed = parseArgs(args, dependencies.reportRoot ?? DEFAULT_REPORT_ROOT);
  if (!parsed) {
    return {
      exitCode: 1,
      stdout: "",
      stderr: `${USAGE_INVALID}\n`,
    };
  }
  if (parsed.mode === "apply" && parsed.target !== "wechat-mini") {
    return {
      exitCode: 1,
      stdout: "",
      stderr: `${APPLY_TARGET_UNSUPPORTED}\n`,
    };
  }

  const now = dependencies.now ?? (() => new Date());
  const comparisonResult = await collectPlatformConfigComparison(
    dependencies.commandRunner,
    now,
  );
  if ("error" in comparisonResult) {
    return comparisonResult.error;
  }

  const plan = createPlatformConfigSyncPlan(
    comparisonResult.comparison,
    parsed.target,
  );
  const timestamp = formatShanghaiTimestamp(now());
  if (parsed.mode === "apply") {
    return runApply({
      plan,
      reportRoot: parsed.reportRoot,
      timestamp,
      applyRunner: dependencies.applyRunner ?? applyWechatMiniSessionKey,
      now,
      commandRunner: dependencies.commandRunner,
    });
  }

  const reportJsonPath = join(
    parsed.reportRoot,
    `platform-config-sync-${parsed.target}-${timestamp}.json`,
  );
  const reportMarkdownPath = join(
    parsed.reportRoot,
    `platform-config-sync-${parsed.target}-${timestamp}.md`,
  );

  mkdirSync(parsed.reportRoot, { recursive: true, mode: REPORT_DIR_MODE });
  writeFileSync(reportJsonPath, `${JSON.stringify(plan, null, JSON_SPACE)}\n`, {
    mode: REPORT_FILE_MODE,
  });
  writeFileSync(reportMarkdownPath, renderPlatformConfigSyncMarkdown(plan), {
    mode: REPORT_FILE_MODE,
  });

  return {
    exitCode: 0,
    stdout: [
      "PLATFORM_CONFIG_SYNC_DRY_RUN_COMPLETE",
      `target=${plan.target}`,
      `json=${reportJsonPath}`,
      `markdown=${reportMarkdownPath}`,
      summarizePlan(plan),
      "",
    ].join("\n"),
    stderr: "",
    reportJsonPath,
    reportMarkdownPath,
  };
}

function parseArgs(
  args: readonly string[],
  defaultReportRoot: string,
): ParsedArgs | null {
  let from: string | null = null;
  let to: string | null = null;
  let target: string | null = null;
  let reportRoot = defaultReportRoot;
  let dryRun = false;
  let apply = false;

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
    if (arg === "--target" && value) {
      target = value;
      index += 1;
      continue;
    }
    if (arg === "--report-root" && value) {
      reportRoot = value;
      index += 1;
      continue;
    }
    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (arg === "--apply") {
      apply = true;
      continue;
    }
    return null;
  }

  if (from !== "dev" || to !== "production" || !target || dryRun === apply) {
    return null;
  }
  if (!isPlatformConfigSyncTarget(target)) {
    return null;
  }

  return {
    from: "dev",
    to: "production",
    target,
    reportRoot,
    mode: apply ? "apply" : "dry_run",
  };
}

async function runApply(input: {
  readonly plan: ReturnType<typeof createPlatformConfigSyncPlan>;
  readonly reportRoot: string;
  readonly timestamp: string;
  readonly applyRunner: PlatformConfigSyncApplyRunner;
  readonly now: () => Date;
  readonly commandRunner?: CommandRunner;
}): Promise<PlatformConfigSyncCliResult> {
  if (input.plan.target !== "wechat-mini") {
    return {
      exitCode: 1,
      stdout: "",
      stderr: `${APPLY_TARGET_UNSUPPORTED}\n`,
    };
  }

  const plannedKey = getSafeWechatMiniApplyKey(input.plan);
  if (!plannedKey) {
    return {
      exitCode: 1,
      stdout: "",
      stderr: `${APPLY_PLAN_UNSAFE}\n`,
    };
  }

  let applyResult: PlatformConfigSyncApplyResult;
  try {
    applyResult = await input.applyRunner({
      key: WECHAT_MINI_APPLY_KEY,
      expectedSha256: plannedKey.dev.sha256,
    });
  } catch {
    return {
      exitCode: 2,
      stdout: "",
      stderr: `${APPLY_FAILED}\n`,
    };
  }

  const postComparisonResult = await collectPlatformConfigComparison(
    input.commandRunner,
    input.now,
  );
  if ("error" in postComparisonResult) {
    return postComparisonResult.error;
  }
  const postPlan = createPlatformConfigSyncPlan(
    postComparisonResult.comparison,
    "wechat-mini",
  );
  const verified = postPlan.actions.some(
    (row) =>
      row.key === WECHAT_MINI_APPLY_KEY &&
      row.action === "already_match" &&
      row.dev?.sha256 === applyResult.source.sha256 &&
      row.production?.sha256 === applyResult.source.sha256,
  );
  const report = {
    generated_at: input.now().toISOString(),
    mode: "apply",
    target: input.plan.target,
    applied: applyResult,
    verified,
    restart_required: applyResult.restart_required,
    pre_plan: input.plan,
    post_plan: postPlan,
  };
  const reportJsonPath = join(
    input.reportRoot,
    `platform-config-sync-${input.plan.target}-apply-${input.timestamp}.json`,
  );
  const reportMarkdownPath = join(
    input.reportRoot,
    `platform-config-sync-${input.plan.target}-apply-${input.timestamp}.md`,
  );

  mkdirSync(input.reportRoot, { recursive: true, mode: REPORT_DIR_MODE });
  writeFileSync(reportJsonPath, `${JSON.stringify(report, null, JSON_SPACE)}\n`, {
    mode: REPORT_FILE_MODE,
  });
  writeFileSync(reportMarkdownPath, renderApplyMarkdown(report), {
    mode: REPORT_FILE_MODE,
  });

  return {
    exitCode: verified ? 0 : 2,
    stdout: [
      verified
        ? "PLATFORM_CONFIG_SYNC_APPLY_COMPLETE"
        : "PLATFORM_CONFIG_SYNC_APPLY_VERIFY_FAILED",
      `target=${input.plan.target}`,
      `key=${applyResult.key}`,
      `json=${reportJsonPath}`,
      `markdown=${reportMarkdownPath}`,
      `restart_required=${String(applyResult.restart_required)}`,
      "",
    ].join("\n"),
    stderr: "",
    reportJsonPath,
    reportMarkdownPath,
  };
}

function getSafeWechatMiniApplyKey(
  plan: ReturnType<typeof createPlatformConfigSyncPlan>,
):
  | { readonly dev: RedactedPlatformConfigRecord }
  | null {
  if (plan.review_required.length > 0) {
    return null;
  }
  const wouldSync = plan.actions.filter((row) => row.action === "would_sync");
  if (wouldSync.length !== 1) {
    return null;
  }
  const row = wouldSync[0];
  if (
    row.key !== WECHAT_MINI_APPLY_KEY ||
    row.reason !== "target_missing" ||
    !row.dev?.present ||
    row.dev.sha256 === null
  ) {
    return null;
  }
  return { dev: row.dev };
}

function renderApplyMarkdown(report: {
  readonly generated_at: string;
  readonly target: PlatformConfigSyncTarget;
  readonly applied: PlatformConfigSyncApplyResult;
  readonly verified: boolean;
  readonly restart_required: boolean;
}): string {
  return [
    "# PLATFORM CONFIG SYNC APPLY",
    "",
    `Generated at: ${report.generated_at}`,
    `Target: ${report.target}`,
    `Key: ${report.applied.key}`,
    `Source: bytes=${report.applied.source.byte_length}, sha256=${report.applied.source.sha256}`,
    `Production after: ${formatRecord(report.applied.production_after)}`,
    `Backup: ${report.applied.backup_path}`,
    `Verified by post-audit: ${String(report.verified)}`,
    `Restart required: ${String(report.restart_required)}`,
    "",
    "Values are redacted. The production API container must be recreated before the new env value is effective.",
    "",
  ].join("\n");
}

function summarizePlan(
  plan: ReturnType<typeof createPlatformConfigSyncPlan>,
): string {
  const wouldSync = plan.actions.filter((row) => row.action === "would_sync")
    .length;
  const denied = plan.denied.length;
  const review = plan.review_required.length;
  return `summary=would_sync:${wouldSync},denied:${denied},review:${review}`;
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

function formatRecord(record: RedactedPlatformConfigRecord): string {
  return `present, bytes=${record.byte_length}, sha256=${record.sha256}`;
}

if (import.meta.main) {
  const result = await runPlatformConfigSyncCli(Bun.argv.slice(2));
  if (result.stdout) {
    process.stdout.write(result.stdout);
  }
  if (result.stderr) {
    process.stderr.write(result.stderr);
  }
  process.exit(result.exitCode);
}
