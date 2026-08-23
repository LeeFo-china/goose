import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  classifyPlatformConfigKey,
  comparePlatformSnapshots,
  createRedactedEnvRecord,
  renderPlatformConfigMarkdown,
  type EnvironmentPlatformSnapshot,
} from "./platform-config-audit-core";
import {
  buildRemoteAuditCommand,
  runPlatformConfigAuditCli,
  type CommandRunner,
} from "./platform-config-audit";

const RAW_SECRET = "raw-secret-value-sentinel";
const RAW_APP_ID = "tt1234567890abcdef";
const DISCOVERED_PLATFORM_SETTING_KEYS = [
  "SMS_CHANNEL_MODE",
  "SMS_CHARGE_ENABLED",
  "SMS_PROVIDER",
  "TENCENT_ASR_ENDPOINT",
  "TENCENT_ASR_ENGINE_MODEL_TYPE",
  "TENCENT_ASR_POLL_TIMEOUT_MS",
  "TENCENT_ASR_REGION",
  "TENCENT_ASR_RES_TEXT_FORMAT",
  "TENCENT_COS_SECRET_ID",
  "TENCENT_COS_SECRET_KEY",
  "TENCENT_IOT_VIDEO_DEFAULT_PROTOCOL",
  "TENCENT_IOT_VIDEO_ENDPOINT",
  "TENCENT_IOT_VIDEO_LIVE_STREAM_ACTION",
  "TENCENT_IOT_VIDEO_REGION",
  "TENCENT_LBS_MINIPROGRAM_KEY",
  "TENCENT_LBS_WEBSERVICE_KEY",
  "TENCENT_LBS_WEBSERVICE_SK",
  "TENCENT_LBS_WEB_JS_KEY",
  "TENCENT_OCR_DEFAULT_TENANT_DAILY_LIMIT",
  "TENCENT_OCR_ENABLED",
  "TENCENT_OCR_ENCRYPTION_ALGORITHM",
  "TENCENT_OCR_ENCRYPTION_PUBLIC_KEY_PEM",
  "TENCENT_OCR_ENDPOINT",
  "TENCENT_OCR_ID_CARD_ENCRYPTED_ENABLED",
  "TENCENT_OCR_PLATFORM_DAILY_LIMIT",
  "TENCENT_OCR_REGION",
  "TENCENT_OCR_REQUEST_TIMEOUT_MS",
  "TENCENT_OCR_RESULT_TTL_HOURS",
  "TENCENT_OCR_SECRET_ID",
  "TENCENT_OCR_SECRET_KEY",
  "TENCENT_OCR_TENANT_ONBOARDING_ENABLED",
  "TENCENT_OCR_VISITOR_CONCURRENCY_LIMIT",
  "TENCENT_OCR_VISITOR_DAILY_LIMIT",
  "TENCENT_OCR_VISITOR_GLOBAL_CONCURRENCY_LIMIT",
  "TENCENT_OCR_VISITOR_IP_WINDOW_LIMIT",
  "TENCENT_OCR_VISITOR_IP_WINDOW_SECONDS",
  "TENCENT_OCR_VISITOR_PROCESSING_LEASE_SECONDS",
  "TENCENT_SMS_ENDPOINT",
  "TENCENT_SMS_REGION",
  "TENCENT_SMS_SDK_APP_ID",
  "TENCENT_SMS_SECRET_ID",
  "TENCENT_SMS_SECRET_KEY",
  "TENCENT_SMS_SIGN_NAME",
  "TENCENT_SMS_TEMPLATE_ID_ADMIN_LOGIN",
  "TENCENT_SMS_TEMPLATE_ID_BIND_CUSTOMER",
  "TENCENT_SMS_TEMPLATE_ID_BIND_EMPLOYEE",
  "TENCENT_SMS_TEMPLATE_ID_PROJECT_ACCEPTANCE",
  "WECHAT_APPID",
  "WECHAT_MINIPROGRAM_ENV_VERSION",
  "WECHAT_MINIPROGRAM_ORIGINAL_ID",
  "WECHAT_MINIPROGRAM_QRCODE_CHECK_PATH",
  "WECHAT_PARTNER_ONBOARDING_PAGE",
  "WECHAT_PROJECT_ACCEPTANCE_PAGE",
  "WECHAT_SECRET",
  "WECHAT_SHARE_CAMPAIGN_CLAIM_VOUCHER_PAGE",
  "WECHAT_SHARE_CAMPAIGN_PAGE",
  "WECHAT_VIRTUAL_PAYMENT_MESSAGE_TOKEN",
  "WECHAT_VIRTUAL_PAYMENT_PRODUCTION_SECRET_BUNDLE",
  "WECHAT_VIRTUAL_PAYMENT_SANDBOX_SECRET_BUNDLE",
] as const;

const tempRoots = new Set<string>();

beforeEach(() => {
  tempRoots.clear();
});

afterEach(() => {
  for (const root of tempRoots) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("platform config key classification", () => {
  test("classifies known and unknown platform keys", () => {
    expect(classifyPlatformConfigKey("DOUYIN_COMPONENT_APP_ID")).toBe(
      "MUST_MATCH",
    );
    expect(
      classifyPlatformConfigKey("DOUYIN_TENANT_AUTHORIZATION_REDIRECT_URI"),
    ).toBe("ENV_SPECIFIC");
    expect(classifyPlatformConfigKey("DOUYIN_COMPONENT_ACCESS_TOKEN")).toBe(
      "RUNTIME_STATE",
    );
    expect(classifyPlatformConfigKey("WECHAT_MINI_SESSION_ENCRYPTION_KEY_V1"))
      .toBe("MUST_MATCH");
    expect(classifyPlatformConfigKey("TENCENT_COS_SECRET_ID")).toBe(
      "MUST_MATCH",
    );
    expect(classifyPlatformConfigKey("TENCENT_UNCLASSIFIED_KEY")).toBe(
      "UNKNOWN",
    );
  });

  test("classifies all platform keys discovered by the current audit", () => {
    for (const key of DISCOVERED_PLATFORM_SETTING_KEYS) {
      expect(classifyPlatformConfigKey(key), key).not.toBe("UNKNOWN");
    }
  });
});

describe("platform config redaction", () => {
  test("records only length, hash, presence, and safe app id tail", () => {
    const record = createRedactedEnvRecord(
      "DOUYIN_COMPONENT_APP_ID",
      RAW_APP_ID,
    );

    expect(record).toEqual({
      key: "DOUYIN_COMPONENT_APP_ID",
      class: "MUST_MATCH",
      present: true,
      byte_length: RAW_APP_ID.length,
      sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      public_tail: "abcdef",
    });
    expect(JSON.stringify(record)).not.toContain(RAW_APP_ID);
  });

  test("does not embed raw secret values in comparison or markdown", () => {
    const dev = snapshot("dev", [
      createRedactedEnvRecord("DOUYIN_COMPONENT_APP_SECRET", RAW_SECRET),
      createRedactedEnvRecord("DOUYIN_TEMPLATE_APP_ID", RAW_APP_ID),
      createRedactedEnvRecord(
        "DOUYIN_TENANT_AUTHORIZATION_REDIRECT_URI",
        "https://dev.example.test/callback",
      ),
    ]);
    const production = snapshot("production", [
      createRedactedEnvRecord("DOUYIN_COMPONENT_APP_SECRET", "different"),
      createRedactedEnvRecord("DOUYIN_TEMPLATE_APP_ID", RAW_APP_ID),
      createRedactedEnvRecord(
        "DOUYIN_TENANT_AUTHORIZATION_REDIRECT_URI",
        "https://www.example.test/callback",
      ),
    ]);

    const comparison = comparePlatformSnapshots(dev, production);
    const markdown = renderPlatformConfigMarkdown(comparison);
    const combined = `${JSON.stringify(comparison)}\n${markdown}`;

    expect(comparison.env.find((row) => row.key === "DOUYIN_COMPONENT_APP_SECRET"))
      .toMatchObject({ status: "mismatch", class: "MUST_MATCH" });
    expect(
      comparison.env.find(
        (row) => row.key === "DOUYIN_TENANT_AUTHORIZATION_REDIRECT_URI",
      ),
    ).toMatchObject({ status: "expected_difference", class: "ENV_SPECIFIC" });
    expect(combined).not.toContain(RAW_SECRET);
    expect(combined).not.toContain("dev.example.test");
    expect(combined).not.toContain("www.example.test");
  });
});

describe("remote audit command construction", () => {
  test("builds read-only remote commands", () => {
    const command = buildRemoteAuditCommand("dev");

    expect(command).toContain("readonly TARGET_ENV_FILE=");
    expect(command).toContain("'ON_ERROR_STOP=1'");
    expect(command).toContain("WECHAT_VIRTUAL_PAYMENT_PRODUCTION_SECRET_BUNDLE");
    expect(command).toContain("SMS_CHANNEL_MODE");
    expect(command).toContain("SELECT");
    expect(command).not.toMatch(
      /\b(UPDATE|INSERT|DELETE|TRUNCATE|DROP|ALTER|CREATE|CALL)\b/i,
    );
    expect(command).not.toMatch(/docker\s+(restart|compose|rm|stop|kill)/i);
  });
});

describe("platform config audit CLI", () => {
  test("rejects invalid arguments", async () => {
    const result = await runPlatformConfigAuditCli(["--from", "dev"], {
      commandRunner: failingRunner,
      now: fixedDate,
      reportRoot: tempReportRoot(),
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("PLATFORM_CONFIG_AUDIT_USAGE_INVALID");
  });

  test("writes redacted JSON and markdown reports while returning zero for drift", async () => {
    const reportRoot = tempReportRoot();
    const commands: string[] = [];
    const runner: CommandRunner = async ({ command }) => {
      commands.push(command);
      if (commands.length === 1) {
        return {
          exitCode: 0,
          stdout: `${JSON.stringify(remoteSnapshot("dev", RAW_SECRET))}\n`,
          stderr: "",
        };
      }

      return {
        exitCode: 0,
        stdout: `${JSON.stringify(remoteSnapshot("production", "different"))}\n`,
        stderr: "",
      };
    };

    const result = await runPlatformConfigAuditCli(
      ["--from", "dev", "--to", "production", "--report-root", reportRoot],
      {
        commandRunner: runner,
        now: fixedDate,
        reportRoot,
      },
    );

    expect(result.exitCode).toBe(0);
    expect(result.reportJsonPath).toBe(
      join(reportRoot, "platform-config-audit-20260823-081530.json"),
    );
    expect(result.reportMarkdownPath).toBe(
      join(reportRoot, "platform-config-audit-20260823-081530.md"),
    );

    const json = readFileSync(result.reportJsonPath, "utf8");
    const markdown = readFileSync(result.reportMarkdownPath, "utf8");
    expect(json).toContain('"status": "mismatch"');
    expect(markdown).toContain("DOUYIN_COMPONENT_APP_SECRET");
    expect(`${json}\n${markdown}`).not.toContain(RAW_SECRET);
    expect(`${json}\n${markdown}`).not.toContain("different");
    expect(statSync(result.reportJsonPath).mode & 0o777).toBe(0o600);
    expect(statSync(result.reportMarkdownPath).mode & 0o777).toBe(0o600);
    expect(commands).toHaveLength(2);
  });
});

function snapshot(
  name: "dev" | "production",
  env: EnvironmentPlatformSnapshot["env"],
): EnvironmentPlatformSnapshot {
  return {
    environment: name,
    env,
    runtime: {
      douyin_component: {
        row_exists: true,
        status: "active",
        has_ticket: true,
        has_access_token: true,
        access_token_valid: true,
        appid_tail: "abcdef",
      },
      douyin_template_installation: {
        row_exists: true,
        installation_kind: "template_development",
        authorization_status: "active",
        has_tenant: true,
        has_access_token: true,
        has_refresh_token: true,
        appid_tail: "abcdef",
      },
      douyin_template: {
        latest_template_version: "0.1.4",
        has_current_template: false,
      },
      system_settings: [],
    },
  };
}

function remoteSnapshot(
  name: "dev" | "production",
  secret: string,
): EnvironmentPlatformSnapshot {
  return snapshot(name, [
    createRedactedEnvRecord("DOUYIN_COMPONENT_APP_SECRET", secret),
    createRedactedEnvRecord("DOUYIN_TEMPLATE_APP_ID", RAW_APP_ID),
  ]);
}

function tempReportRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "gooes-platform-config-audit-"));
  tempRoots.add(root);
  expect(existsSync(root)).toBe(true);
  return root;
}

function fixedDate(): Date {
  return new Date("2026-08-23T08:15:30.000+08:00");
}

const failingRunner: CommandRunner = async () => ({
  exitCode: 99,
  stdout: "",
  stderr: "should not run",
});
