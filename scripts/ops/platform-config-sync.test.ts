import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  createPlatformConfigSyncPlan,
  renderPlatformConfigSyncMarkdown,
} from "./platform-config-sync-plan";
import {
  runPlatformConfigSyncCli,
  type PlatformConfigSyncApplyRunner,
  type PlatformConfigSyncCommandRunner,
} from "./platform-config-sync";
import {
  buildRemoteEnvFileKeyApplyCommand,
  buildRemoteEnvValueReadCommand,
  WECHAT_MINI_APPLY_KEY,
} from "./platform-config-sync-apply";
import {
  createRedactedEnvRecord,
  type EnvironmentPlatformSnapshot,
  type PlatformConfigComparison,
} from "./platform-config-audit-core";

const RAW_OCR_SECRET = "raw-ocr-secret-sentinel";
const RAW_WECHAT_SECRET = "raw-wechat-mini-secret-sentinel";
const tempRoots = new Set<string>();

beforeEach(() => {
  tempRoots.clear();
});

afterEach(() => {
  for (const root of tempRoots) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("platform config sync dry-run plan", () => {
  test("plans only target allowlisted syncable keys", () => {
    const plan = createPlatformConfigSyncPlan(comparisonFixture(), "ocr");

    expect(plan.target).toBe("ocr");
    expect(plan.mode).toBe("dry_run");
    expect(plan.denied).toContainEqual({
      key: "OCR_RESULT_ENCRYPTION_KEY",
      class: "ENV_SPECIFIC",
      reason: "environment_specific_not_syncable",
      dev: expect.objectContaining({ present: true }),
      production: expect.objectContaining({ present: true }),
    });
    expect(plan.actions).toContainEqual({
      key: "TENCENT_OCR_SECRET_ID",
      class: "MUST_MATCH",
      action: "would_sync",
      reason: "target_missing",
      dev: expect.objectContaining({ present: true }),
      production: null,
    });
    expect(plan.actions).toContainEqual({
      key: "TENCENT_OCR_REGION",
      class: "MUST_MATCH",
      action: "already_match",
      reason: "target_matches_source",
      dev: expect.objectContaining({ present: true }),
      production: expect.objectContaining({ present: true }),
    });
    expect(JSON.stringify(plan)).not.toContain(RAW_OCR_SECRET);
  });

  test("denies environment-specific keys for the matching target", () => {
    const plan = createPlatformConfigSyncPlan(comparisonFixture(), "sms");

    expect(plan.denied).toContainEqual({
      key: "SMS_CHARGE_ENABLED",
      class: "ENV_SPECIFIC",
      reason: "environment_specific_not_syncable",
      dev: expect.objectContaining({ present: true }),
      production: expect.objectContaining({ present: true }),
    });
  });

  test("marks discovered matching target keys outside allowlist for review", () => {
    const plan = createPlatformConfigSyncPlan(comparisonFixture(), "wechat-mini");

    expect(plan.review_required).toContainEqual({
      key: "WECHAT_VIRTUAL_PAYMENT_MESSAGE_TOKEN",
      class: "MUST_MATCH",
      reason: "not_in_target_allowlist",
      dev: expect.objectContaining({ present: true }),
      production: expect.objectContaining({ present: true }),
    });
  });

  test("renders markdown without raw values", () => {
    const markdown = renderPlatformConfigSyncMarkdown(
      createPlatformConfigSyncPlan(comparisonFixture(), "ocr"),
    );

    expect(markdown).toContain("## Would sync");
    expect(markdown).toContain("OCR_RESULT_ENCRYPTION_KEY");
    expect(markdown).toContain("TENCENT_OCR_SECRET_ID");
    expect(markdown).not.toContain("SMS_CHARGE_ENABLED");
    expect(markdown).not.toContain(RAW_OCR_SECRET);
  });
});

describe("platform config sync CLI", () => {
  test("rejects apply mode outside the supported wechat mini target", async () => {
    const result = await runPlatformConfigSyncCli(
      ["--from", "dev", "--to", "production", "--target", "ocr", "--apply"],
      {
        commandRunner: failingRunner,
        now: fixedDate,
        reportRoot: tempReportRoot(),
      },
    );

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("PLATFORM_CONFIG_SYNC_APPLY_TARGET_UNSUPPORTED");
  });

  test("applies the missing wechat mini session key with redacted reports", async () => {
    const reportRoot = tempReportRoot();
    let productionHasWechatKey = false;
    const applied: string[] = [];
    const runner: PlatformConfigSyncCommandRunner = async ({ environment }) => ({
      exitCode: 0,
      stdout: `${JSON.stringify(
        environment === "dev"
          ? snapshot("dev", wechatDevRecords())
          : snapshot(
              "production",
              productionHasWechatKey ? wechatProductionAfterRecords() : [],
            ),
      )}\n`,
      stderr: "",
    });
    const applyRunner: PlatformConfigSyncApplyRunner = async ({ key, expectedSha256 }) => {
      applied.push(key);
      productionHasWechatKey = true;
      return {
        key,
        source: {
          byte_length: Buffer.byteLength(RAW_WECHAT_SECRET, "utf8"),
          sha256: expectedSha256,
        },
        production_before: null,
        production_after: createRedactedEnvRecord(key, RAW_WECHAT_SECRET),
        backup_path: "/opt/supabase/docker/.env.api.backup-platform-config-20260823105000",
        restart_required: true,
      };
    };

    const result = await runPlatformConfigSyncCli(
      [
        "--from",
        "dev",
        "--to",
        "production",
        "--target",
        "wechat-mini",
        "--apply",
        "--report-root",
        reportRoot,
      ],
      {
        commandRunner: runner,
        applyRunner,
        now: fixedDate,
        reportRoot,
      },
    );

    expect(result.exitCode).toBe(0);
    expect(applied).toEqual([WECHAT_MINI_APPLY_KEY]);
    expect(result.stdout).toContain("PLATFORM_CONFIG_SYNC_APPLY_COMPLETE");
    expect(result.stdout).toContain("restart_required=true");

    const json = readFileSync(result.reportJsonPath, "utf8");
    const markdown = readFileSync(result.reportMarkdownPath, "utf8");
    expect(json).toContain('"mode": "apply"');
    expect(json).toContain('"verified": true');
    expect(markdown).toContain("PLATFORM CONFIG SYNC APPLY");
    expect(`${result.stdout}\n${json}\n${markdown}`).not.toContain(RAW_WECHAT_SECRET);
  });

  test("refuses unsafe wechat mini apply plans before remote writes", async () => {
    const applied: string[] = [];
    const result = await runPlatformConfigSyncCli(
      [
        "--from",
        "dev",
        "--to",
        "production",
        "--target",
        "wechat-mini",
        "--apply",
        "--report-root",
        tempReportRoot(),
      ],
      {
        commandRunner: async ({ environment }) => ({
          exitCode: 0,
          stdout: `${JSON.stringify(
            environment === "dev"
              ? snapshot("dev", [
                  createRedactedEnvRecord(WECHAT_MINI_APPLY_KEY, RAW_WECHAT_SECRET),
                  createRedactedEnvRecord("WECHAT_APPID", "dev-appid"),
                ])
              : snapshot("production", []),
          )}\n`,
          stderr: "",
        }),
        applyRunner: async ({ key }) => {
          applied.push(key);
          throw new Error("must not apply unsafe plans");
        },
        now: fixedDate,
      },
    );

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("PLATFORM_CONFIG_SYNC_APPLY_PLAN_UNSAFE");
    expect(applied).toEqual([]);
  });

  test("writes redacted dry-run reports and exits zero when changes are planned", async () => {
    const reportRoot = tempReportRoot();
    const runner: PlatformConfigSyncCommandRunner = async ({ environment }) => ({
      exitCode: 0,
      stdout: `${JSON.stringify(
        environment === "dev"
          ? snapshot("dev", comparisonFixture().env.map((row) => row.dev).filter(Boolean))
          : snapshot(
              "production",
              comparisonFixture().env.map((row) => row.production).filter(Boolean),
            ),
      )}\n`,
      stderr: "",
    });

    const result = await runPlatformConfigSyncCli(
      [
        "--from",
        "dev",
        "--to",
        "production",
        "--target",
        "ocr",
        "--dry-run",
        "--report-root",
        reportRoot,
      ],
      {
        commandRunner: runner,
        now: fixedDate,
        reportRoot,
      },
    );

    expect(result.exitCode).toBe(0);
    expect(result.reportJsonPath).toBe(
      join(reportRoot, "platform-config-sync-ocr-20260823-104200.json"),
    );
    expect(result.reportMarkdownPath).toBe(
      join(reportRoot, "platform-config-sync-ocr-20260823-104200.md"),
    );

    const json = readFileSync(result.reportJsonPath, "utf8");
    const markdown = readFileSync(result.reportMarkdownPath, "utf8");
    expect(json).toContain('"action": "would_sync"');
    expect(markdown).toContain("PLATFORM CONFIG SYNC DRY-RUN");
    expect(`${json}\n${markdown}`).not.toContain(RAW_OCR_SECRET);
    expect(statSync(result.reportJsonPath).mode & 0o777).toBe(0o600);
    expect(statSync(result.reportMarkdownPath).mode & 0o777).toBe(0o600);
  });
});

describe("platform config sync remote commands", () => {
  test("builds scoped commands for reading and applying only the approved key", () => {
    const readCommand = buildRemoteEnvValueReadCommand("dev", WECHAT_MINI_APPLY_KEY);
    const applyCommand = buildRemoteEnvFileKeyApplyCommand(
      "production",
      WECHAT_MINI_APPLY_KEY,
    );

    expect(readCommand).toContain("/opt/gooes-dev/docker/.env.dev.api");
    expect(readCommand).toContain("WECHAT_MINI_SESSION_ENCRYPTION_KEY_V1");
    expect(readCommand).not.toContain("/opt/supabase/docker/.env.api");
    expect(applyCommand).toContain("/opt/supabase/docker/.env.api");
    expect(applyCommand).toContain("backup-platform-config");
    expect(applyCommand).toContain("os.replace");
    expect(`${readCommand}\n${applyCommand}`).not.toContain(RAW_WECHAT_SECRET);
  });
});

function comparisonFixture(): PlatformConfigComparison {
  const dev = snapshot("dev", [
    createRedactedEnvRecord("OCR_RESULT_ENCRYPTION_KEY", RAW_OCR_SECRET),
    createRedactedEnvRecord("TENCENT_OCR_SECRET_ID", "dev-secret-id"),
    createRedactedEnvRecord("TENCENT_OCR_REGION", "ap-guangzhou"),
    createRedactedEnvRecord("SMS_CHARGE_ENABLED", "false"),
    createRedactedEnvRecord("WECHAT_VIRTUAL_PAYMENT_MESSAGE_TOKEN", "token-a"),
  ]);
  const production = snapshot("production", [
    createRedactedEnvRecord("OCR_RESULT_ENCRYPTION_KEY", "different"),
    createRedactedEnvRecord("TENCENT_OCR_REGION", "ap-guangzhou"),
    createRedactedEnvRecord("SMS_CHARGE_ENABLED", "true"),
    createRedactedEnvRecord("WECHAT_VIRTUAL_PAYMENT_MESSAGE_TOKEN", "token-b"),
  ]);

  return {
    generated_at: "2026-08-23T10:42:00.000+08:00",
    source: "dev",
    target: "production",
    env: [
      ...dev.env.map((devRecord) => ({
        key: devRecord.key,
        class: devRecord.class,
        status: "unknown" as const,
        dev: devRecord,
        production:
          production.env.find((record) => record.key === devRecord.key) ?? null,
      })),
      ...production.env
        .filter((record) => !dev.env.some((devRecord) => devRecord.key === record.key))
        .map((productionRecord) => ({
          key: productionRecord.key,
          class: productionRecord.class,
          status: "unknown" as const,
          dev: null,
          production: productionRecord,
        })),
    ],
    runtime: {
      dev: dev.runtime,
      production: production.runtime,
    },
  };
}

function snapshot(
  environment: "dev" | "production",
  env: readonly NonNullable<PlatformConfigComparison["env"][number]["dev"]>[],
): EnvironmentPlatformSnapshot {
  return {
    environment,
    env,
    runtime: {
      douyin_component: {
        row_exists: true,
        status: "active",
        has_ticket: true,
        has_access_token: true,
        access_token_valid: true,
        appid_tail: "1dcd67",
      },
      douyin_template_installation: {
        row_exists: true,
        installation_kind: "template_development",
        authorization_status: "active",
        has_tenant: true,
        has_access_token: false,
        has_refresh_token: false,
        appid_tail: "341b01",
      },
      douyin_template: {
        latest_template_version: "0.1.4",
        has_current_template: true,
      },
      system_settings: [],
    },
  };
}

function tempReportRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "gooes-platform-config-sync-"));
  tempRoots.add(root);
  return root;
}

function wechatDevRecords() {
  return [
    createRedactedEnvRecord(WECHAT_MINI_APPLY_KEY, RAW_WECHAT_SECRET),
  ];
}

function wechatProductionAfterRecords() {
  return [
    createRedactedEnvRecord(WECHAT_MINI_APPLY_KEY, RAW_WECHAT_SECRET),
  ];
}

function fixedDate(): Date {
  return new Date("2026-08-23T10:42:00.000+08:00");
}

const failingRunner: PlatformConfigSyncCommandRunner = async () => ({
  exitCode: 99,
  stdout: "",
  stderr: "should not run",
});
