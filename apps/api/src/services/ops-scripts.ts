import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { Errors } from "@/errors/error-factory";
import { ErrorCodes } from "@/errors/error-codes";
import { opsScriptRunRepository } from "@/repositories/ops-script-runs";
import type { AuthContext } from "@/services/authorization";
import type {
  OpsScriptKey,
  OpsScriptRunListQuery,
  RunOpsScriptInput,
} from "@/schema/ops-scripts";

type OpsScriptDefinition = {
  key: OpsScriptKey;
  label: string;
  description: string;
  command: string;
  args: string[];
  timeoutMs: number;
  dangerLevel: "low" | "medium";
};

type CommandResult = {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
  durationMs: number;
};

const OUTPUT_LIMIT = 64 * 1024;
const REPO_ROOT = resolve(fileURLToPath(new URL("../../../..", import.meta.url)));

const OPS_SCRIPT_DEFINITIONS: Record<OpsScriptKey, OpsScriptDefinition> = {
  health_check: {
    key: "health_check",
    label: "健康检查",
    description: "检查 API、Admin 和服务端口状态。",
    command: "bash",
    args: ["scripts/ops/health-check.sh"],
    timeoutMs: 30_000,
    dangerLevel: "low",
  },
  system_metrics: {
    key: "system_metrics",
    label: "系统资源",
    description: "查看服务器 CPU、内存、磁盘和负载。",
    command: "bash",
    args: ["scripts/ops/system-metrics.sh"],
    timeoutMs: 5_000,
    dangerLevel: "low",
  },
  location_context_cleanup: {
    key: "location_context_cleanup",
    label: "清理定位上下文",
    description: "清理已过期且未确认的定位匹配上下文，保留已确认审计记录。",
    command: "bash",
    args: ["-lc", "cd apps/api && bun --env-file=.env src/scripts/location-context-cleanup.ts --apply"],
    timeoutMs: 30_000,
    dangerLevel: "medium",
  },
  deploy_trace: {
    key: "deploy_trace",
    label: "部署 Trace",
    description: "查看最近部署 trace 日志。",
    command: "bash",
    args: ["scripts/ops/deploy-trace.sh"],
    timeoutMs: 10_000,
    dangerLevel: "low",
  },
  deploy_notify_test: {
    key: "deploy_notify_test",
    label: "发送通知测试",
    description: "手动发送一封部署通知测试邮件。",
    command: "bash",
    args: ["scripts/ops/deploy-notify-test.sh"],
    timeoutMs: 30_000,
    dangerLevel: "medium",
  },
};

function stripAnsi(value: string) {
  return value.replace(/\u001B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, "");
}

function appendOutput(current: string, chunk: Buffer) {
  if (current.length >= OUTPUT_LIMIT) {
    return current;
  }

  return (current + chunk.toString("utf8")).slice(0, OUTPUT_LIMIT);
}

function runCommand(definition: OpsScriptDefinition): Promise<CommandResult> {
  const startedAt = Date.now();
  let stdout = "";
  let stderr = "";
  let timedOut = false;

  return new Promise((resolveCommand) => {
    const child = spawn(definition.command, definition.args, {
      cwd: REPO_ROOT,
      env: {
        ...process.env,
        DEPLOY_JOB_STATUS: "manual",
        GITHUB_WORKSPACE: REPO_ROOT,
      },
      shell: false,
    });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => {
        if (!child.killed) child.kill("SIGKILL");
      }, 1500);
    }, definition.timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      stdout = appendOutput(stdout, chunk);
    });

    child.stderr.on("data", (chunk: Buffer) => {
      stderr = appendOutput(stderr, chunk);
    });

    child.on("error", (error) => {
      stderr = appendOutput(stderr, Buffer.from(error.message));
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      resolveCommand({
        stdout: stripAnsi(stdout),
        stderr: stripAnsi(stderr),
        exitCode: code,
        timedOut,
        durationMs: Date.now() - startedAt,
      });
    });
  });
}

class OpsScriptService {
  listScripts() {
    return {
      list: Object.values(OPS_SCRIPT_DEFINITIONS).map((item) => ({
        key: item.key,
        label: item.label,
        description: item.description,
        timeout_ms: item.timeoutMs,
        danger_level: item.dangerLevel,
      })),
    };
  }

  async listRuns(query: OpsScriptRunListQuery) {
    return opsScriptRunRepository.list({
      page: query.page,
      pageSize: query.pageSize,
      scriptKey: query.script_key,
      status: query.status,
    });
  }

  async getSystemMetrics() {
    const definition = OPS_SCRIPT_DEFINITIONS.system_metrics;
    const result = await runCommand(definition);

    if (result.timedOut || result.exitCode !== 0) {
      throw Errors.business(
        500,
        "系统资源指标采集失败",
        ErrorCodes.OPS_SCRIPT_RUN_FAILED,
        {
          exit_code: result.exitCode,
          stderr: result.stderr,
          timed_out: result.timedOut,
        },
      );
    }

    try {
      return JSON.parse(result.stdout) as unknown;
    } catch (error) {
      throw Errors.business(
        500,
        "系统资源指标解析失败",
        ErrorCodes.OPS_SCRIPT_RUN_FAILED,
        error instanceof Error ? { message: error.message } : undefined,
      );
    }
  }

  async runScript(
    authContext: AuthContext,
    scriptKey: OpsScriptKey,
    input: RunOpsScriptInput,
  ) {
    const definition = OPS_SCRIPT_DEFINITIONS[scriptKey];
    if (!definition) {
      throw Errors.business(
        404,
        "脚本不存在或未开放",
        ErrorCodes.OPS_SCRIPT_NOT_FOUND,
      );
    }

    if (!existsSync(REPO_ROOT)) {
      throw Errors.business(
        500,
        "运行目录不存在",
        ErrorCodes.OPS_SCRIPT_RUN_FAILED,
      );
    }

    const run = await opsScriptRunRepository.create({
      script_key: definition.key,
      script_label: definition.label,
      executed_by_employee_id: authContext.employeeId,
      reason: input.reason?.trim() || null,
    });

    const result = await runCommand(definition);
    const status = result.timedOut
      ? "timeout"
      : result.exitCode === 0
        ? "success"
        : "failed";

    return opsScriptRunRepository.finish(run.id, {
      status,
      exit_code: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      duration_ms: result.durationMs,
    });
  }
}

export const opsScriptService = new OpsScriptService();
