import { describe, expect, mock, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { DouyinReleaseReadiness } from "@gooes/domain";

import {
  parseDouyinReleaseReadinessArgs,
  runDouyinReleaseReadinessCli,
} from "./douyin-release-readiness";

const TENANT_ID = "11111111-1111-4111-8111-111111111111";

const readyResult: DouyinReleaseReadiness = {
  ready: true,
  checked_at: "2026-08-20T10:00:00.000+08:00",
  tenant: { id: TENANT_ID, name: "固始晴天装饰工程有限公司" },
  blockers: [],
  warnings: [],
  metrics: {
    published_project_count: 6,
    required_host_count: 3,
  },
};

const blockedResult: DouyinReleaseReadiness = {
  ...readyResult,
  ready: false,
  blockers: [
    {
      severity: "blocker",
      code: "SMS_UNAVAILABLE",
      message: "短信验证码服务不可用",
      details: {},
    },
  ],
};

describe("douyin release readiness CLI", () => {
  test("requires exactly one tenant id argument", () => {
    expect(parseDouyinReleaseReadinessArgs([
      "bun",
      "douyin-release-readiness.ts",
      "--tenant-id",
      TENANT_ID,
    ])).toEqual({ ok: true, tenantId: TENANT_ID });

    expect(parseDouyinReleaseReadinessArgs([
      "bun",
      "douyin-release-readiness.ts",
    ])).toEqual({
      ok: false,
      message: "Usage: bun src/scripts/douyin-release-readiness.ts --tenant-id <uuid>",
    });

    expect(parseDouyinReleaseReadinessArgs([
      "bun",
      "douyin-release-readiness.ts",
      "--tenant-id",
      TENANT_ID,
      "--tenant-id",
      TENANT_ID,
    ])).toEqual({
      ok: false,
      message: "Usage: bun src/scripts/douyin-release-readiness.ts --tenant-id <uuid>",
    });
  });

  test("prints sanitized JSON and returns exit code 0 when ready", async () => {
    const write = mock((value: string) => {
      expect(typeof value).toBe("string");
    });
    const code = await runDouyinReleaseReadinessCli({
      argv: ["bun", "script", "--tenant-id", TENANT_ID],
      env: { DOUYIN_RELEASE_REQUIRED_HOSTS: "douyin,douyin_lite,toutiao" },
      service: {
        evaluateTenant: mock(async () => readyResult),
      },
      write,
    });

    expect(code).toBe(0);
    const calls = write.mock.calls as unknown as Array<[string]>;
    const output = JSON.parse(calls[0]?.[0] ?? "{}");
    expect(output.status).toBe("ready");
    expect(output.tenant).toEqual(readyResult.tenant);
    expect(output.metrics.required_host_count).toBe(3);
    expect(JSON.stringify(output)).not.toMatch(/13800138000|service-role|secret/i);
  });

  test("returns exit code 2 when blockers remain", async () => {
    const write = mock((value: string) => {
      expect(typeof value).toBe("string");
    });
    const code = await runDouyinReleaseReadinessCli({
      argv: ["bun", "script", "--tenant-id", TENANT_ID],
      env: {},
      service: {
        evaluateTenant: mock(async () => blockedResult),
      },
      write,
    });

    expect(code).toBe(2);
    const calls = write.mock.calls as unknown as Array<[string]>;
    const output = JSON.parse(calls[0]?.[0] ?? "{}");
    expect(output.status).toBe("blocked");
    expect(output.blockers).toEqual([
      {
        code: "SMS_UNAVAILABLE",
        message: "短信验证码服务不可用",
        details: {},
      },
    ]);
  });

  test("returns exit code 1 for operational errors without raw details", async () => {
    const write = mock((value: string) => {
      expect(typeof value).toBe("string");
    });
    const code = await runDouyinReleaseReadinessCli({
      argv: ["bun", "script", "--tenant-id", TENANT_ID],
      env: {},
      service: {
        evaluateTenant: mock(async () => {
          throw new Error("database password=secret failed");
        }),
      },
      write,
    });

    expect(code).toBe(1);
    const calls = write.mock.calls as unknown as Array<[string]>;
    const output = JSON.parse(calls[0]?.[0] ?? "{}");
    expect(output).toEqual({
      status: "error",
      message: "抖音提审就绪检查执行失败",
    });
  });

  test("is exposed through the bounded root package script", () => {
    const packageJson = JSON.parse(readFileSync(
      resolve(import.meta.dir, "../../../../package.json"),
      "utf8",
    )) as { scripts?: Record<string, string> };

    expect(packageJson.scripts?.["douyin:release-readiness"]).toBe(
      "cd apps/api && bun --env-file=.env src/scripts/douyin-release-readiness.ts",
    );
  });
});
