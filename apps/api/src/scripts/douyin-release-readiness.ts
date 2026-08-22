import type { DouyinReleaseReadiness } from "@gooes/domain";

const USAGE =
  "Usage: bun src/scripts/douyin-release-readiness.ts --tenant-id <uuid>";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type DouyinReleaseReadinessCliArgs =
  | { readonly ok: true; readonly tenantId: string }
  | { readonly ok: false; readonly message: string };

type ReadinessServicePort = {
  evaluateTenant(
    tenantId: string,
    requiredHosts: readonly string[],
  ): Promise<DouyinReleaseReadiness>;
};

type CliInput = {
  readonly argv?: readonly string[];
  readonly env?: Record<string, string | undefined>;
  readonly service?: ReadinessServicePort;
  readonly write?: (value: string) => void;
};

export function parseDouyinReleaseReadinessArgs(
  argv: readonly string[],
): DouyinReleaseReadinessCliArgs {
  const args = argv.slice(2);
  if (args.length !== 2 || args[0] !== "--tenant-id") {
    return { ok: false, message: USAGE };
  }
  const tenantId = args[1]?.trim();
  if (!tenantId || !UUID_PATTERN.test(tenantId)) {
    return { ok: false, message: USAGE };
  }
  return { ok: true, tenantId };
}

export async function runDouyinReleaseReadinessCli(
  input: CliInput = {},
): Promise<number> {
  const argv = input.argv ?? Bun.argv;
  const env = input.env ?? process.env;
  const service = input.service ?? await defaultReadinessService();
  const write = input.write ?? ((value: string) => console.log(value));
  const parsed = parseDouyinReleaseReadinessArgs(argv);
  if (!parsed.ok) {
    write(JSON.stringify({ status: "error", message: parsed.message }, null, 2));
    return 1;
  }

  try {
    const readiness = await service.evaluateTenant(
      parsed.tenantId,
      parseRequiredHosts(env.DOUYIN_RELEASE_REQUIRED_HOSTS),
    );
    write(JSON.stringify(toCliReport(readiness), null, 2));
    return readiness.ready ? 0 : 2;
  } catch {
    write(JSON.stringify({
      status: "error",
      message: "抖音提审就绪检查执行失败",
    }, null, 2));
    return 1;
  }
}

async function defaultReadinessService(): Promise<ReadinessServicePort> {
  const module = await import("@/services/douyin-release-readiness");
  return module.douyinReleaseReadinessService;
}

export function parseRequiredHosts(value: string | undefined): string[] {
  if (!value) return [];
  return Array.from(new Set(
    value
      .split(/[\n,，]/)
      .map((entry) => entry.trim())
      .filter(Boolean),
  ));
}

function toCliReport(readiness: DouyinReleaseReadiness) {
  return {
    status: readiness.ready ? "ready" : "blocked",
    ready: readiness.ready,
    checked_at: readiness.checked_at,
    tenant: readiness.tenant,
    metrics: readiness.metrics,
    blockers: readiness.blockers.map((item) => ({
      code: item.code,
      message: item.message,
      details: item.details,
    })),
    warnings: readiness.warnings.map((item) => ({
      code: item.code,
      message: item.message,
      details: item.details,
    })),
  };
}

if (import.meta.main) {
  void runDouyinReleaseReadinessCli()
    .then((code) => process.exit(code))
    .catch(() => {
      console.log(JSON.stringify({
        status: "error",
        message: "抖音提审就绪检查执行失败",
      }, null, 2));
      process.exit(1);
    });
}
