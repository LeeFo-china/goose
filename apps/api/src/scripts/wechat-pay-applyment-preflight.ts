import { Errors } from "@/errors/error-factory";
import {
  runWechatPayApplymentPreflight,
  type WechatPayApplymentPreflightReport,
} from "@/services/wechat-pay-applyment-preflight";

export {
  createWechatPayApplymentPreflightService,
  runWechatPayApplymentPreflight,
  type WechatPayApplymentPreflightBlocker,
  type WechatPayApplymentPreflightReport,
} from "@/services/wechat-pay-applyment-preflight";

export function parseWechatPayApplymentPreflightArgs(argv: string[]): {
  applymentId: string;
} {
  let applymentId: string | null = null;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--") continue;
    if (argument === "--applyment-id") {
      if (applymentId !== null) {
        throw Errors.badRequest("--applyment-id 只能提供一次");
      }
      applymentId = argv[index + 1] ?? null;
      index += 1;
      continue;
    }
    if (argument?.startsWith("--applyment-id=")) {
      if (applymentId !== null) {
        throw Errors.badRequest("--applyment-id 只能提供一次");
      }
      applymentId = argument.slice("--applyment-id=".length);
      continue;
    }
    throw Errors.badRequest("仅支持 --applyment-id 参数");
  }
  if (!applymentId || !isUuid(applymentId)) {
    throw Errors.badRequest("--applyment-id 必须是 UUID");
  }
  return { applymentId };
}

export async function runWechatPayApplymentPreflightCommand(
  argv: string[],
  runner: (
    applymentId: string,
  ) => Promise<WechatPayApplymentPreflightReport> =
    runWechatPayApplymentPreflight,
): Promise<WechatPayApplymentPreflightReport> {
  let applymentId: string;
  try {
    applymentId = parseWechatPayApplymentPreflightArgs(argv).applymentId;
  } catch {
    return {
      ready: false,
      blockers: [{ code: "PREFLIGHT_ARGUMENT_INVALID" }],
    };
  }
  try {
    return await runner(applymentId);
  } catch {
    return {
      ready: false,
      blockers: [{ code: "PREFLIGHT_INTERNAL_ERROR" }],
    };
  }
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    .test(value);
}

async function main() {
  const report = await runWechatPayApplymentPreflightCommand(
    process.argv.slice(2),
  );
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.ready) process.exitCode = 1;
}

if (import.meta.main) void main();
