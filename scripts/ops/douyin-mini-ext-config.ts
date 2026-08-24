import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const EXT_CONFIG_PATHS = [
  "apps/douyin-mini/ext.json",
  "apps/douyin-mini/src/ext.json",
] as const;

const SAFE_VALUE_PATTERN = /^[A-Za-z0-9._~:/+-]{1,128}$/;

export interface DouyinMiniExtConfigInput {
  readonly extAppid: string;
  readonly deploymentKey: string;
}

export interface DouyinMiniExtWriteInput extends DouyinMiniExtConfigInput {
  readonly repoRoot: string;
}

export interface DouyinMiniExtJson {
  readonly extEnable: true;
  readonly extAppid: string;
  readonly ext: { readonly deployment_key: string };
}

export interface DouyinMiniExtWriteResult {
  readonly wrote: readonly string[];
  readonly extAppidTail: string;
  readonly deploymentKeyTail: string;
}

export type DouyinMiniExtCheckResult =
  | { readonly ok: true }
  | {
    readonly ok: false;
    readonly reason: "missing" | "mismatch" | "invalid";
    readonly path: string;
  };

export interface DouyinMiniExtCliOptions {
  readonly argv: readonly string[];
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly writeStdout: (value: string) => void;
  readonly writeStderr: (value: string) => void;
}

export function buildDouyinMiniExtJson(
  input: DouyinMiniExtConfigInput,
): DouyinMiniExtJson {
  const extAppid = normalizeSafeValue(input.extAppid);
  const deploymentKey = normalizeSafeValue(input.deploymentKey);
  return {
    extEnable: true,
    extAppid,
    ext: { deployment_key: deploymentKey },
  };
}

export function writeDouyinMiniExtConfig(
  input: DouyinMiniExtWriteInput,
): DouyinMiniExtWriteResult {
  const extJson = buildDouyinMiniExtJson(input);
  const content = serializeExtJson(extJson);
  for (const path of EXT_CONFIG_PATHS) {
    const absolutePath = join(input.repoRoot, path);
    mkdirSync(dirname(absolutePath), { recursive: true });
    Bun.write(absolutePath, content);
  }
  return {
    wrote: [...EXT_CONFIG_PATHS],
    extAppidTail: tail(extJson.extAppid),
    deploymentKeyTail: tail(extJson.ext.deployment_key),
  };
}

export function checkDouyinMiniExtConfig(
  input: DouyinMiniExtWriteInput,
): DouyinMiniExtCheckResult {
  let expected: string;
  try {
    expected = serializeExtJson(buildDouyinMiniExtJson(input));
  } catch {
    return { ok: false, reason: "invalid", path: EXT_CONFIG_PATHS[0] };
  }
  for (const path of EXT_CONFIG_PATHS) {
    const absolutePath = join(input.repoRoot, path);
    let actual: string;
    try {
      actual = readFileSync(absolutePath, "utf8");
    } catch {
      return { ok: false, reason: "missing", path };
    }
    if (actual !== expected) {
      return { ok: false, reason: "mismatch", path };
    }
  }
  return { ok: true };
}

export function runDouyinMiniExtConfigCli(
  options: DouyinMiniExtCliOptions,
): number {
  const parsed = parseCliArgs(options.argv);
  if (!parsed) {
    options.writeStderr("Usage: bun scripts/ops/douyin-mini-ext-config.ts <write|check> [--repo-root <path>]\n");
    return 2;
  }
  const extAppid = options.env.DOUYIN_MINIAPP_EXT_APPID;
  const deploymentKey = options.env.DOUYIN_MINIAPP_DEPLOYMENT_KEY;
  if (!extAppid || !deploymentKey) {
    options.writeStderr("DOUYIN_MINI_EXT_CONFIG_ENV_MISSING\n");
    return 2;
  }

  try {
    if (parsed.command === "write") {
      const result = writeDouyinMiniExtConfig({
        repoRoot: parsed.repoRoot,
        extAppid,
        deploymentKey,
      });
      options.writeStdout(`${JSON.stringify({ ok: true, ...result })}\n`);
      return 0;
    }

    const result = checkDouyinMiniExtConfig({
      repoRoot: parsed.repoRoot,
      extAppid,
      deploymentKey,
    });
    options.writeStdout(`${JSON.stringify(result)}\n`);
    return result.ok ? 0 : 1;
  } catch {
    options.writeStderr("DOUYIN_MINI_EXT_CONFIG_INVALID\n");
    return 1;
  }
}

function serializeExtJson(value: DouyinMiniExtJson): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function normalizeSafeValue(value: string): string {
  const normalized = value.trim();
  if (!SAFE_VALUE_PATTERN.test(normalized)) {
    throw new Error("DOUYIN_MINI_EXT_CONFIG_VALUE_INVALID");
  }
  return normalized;
}

function tail(value: string): string {
  return value.slice(-4);
}

function parseCliArgs(
  argv: readonly string[],
): { readonly command: "write" | "check"; readonly repoRoot: string } | null {
  const [command, ...rest] = argv;
  if (command !== "write" && command !== "check") return null;
  let repoRoot = defaultRepoRoot();
  for (let index = 0; index < rest.length; index += 1) {
    const item = rest[index];
    if (item !== "--repo-root") return null;
    const value = rest[index + 1];
    if (!value) return null;
    repoRoot = value;
    index += 1;
  }
  return { command, repoRoot };
}

function defaultRepoRoot(): string {
  return relative(process.cwd(), process.cwd()) === ""
    ? fileURLToPath(new URL("../../", import.meta.url)).replace(/\/$/, "")
    : process.cwd();
}

if (import.meta.main) {
  process.exit(runDouyinMiniExtConfigCli({
    argv: process.argv.slice(2),
    env: process.env,
    writeStdout: (value) => process.stdout.write(value),
    writeStderr: (value) => process.stderr.write(value),
  }));
}
