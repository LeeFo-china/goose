# 抖音开发环境九项凭证安全交接 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不经聊天传递秘密、不重启、不部署、不配置回调的前提下，交付并验证一套可由用户在本机 Terminal 隐藏输入、向固定开发服务器原子写入九项 `DOUYIN_*` 配置的工具，并完成 A01 人工执行交接。

**Architecture:** Bash 3.2 本机入口只负责真实 TTY、OpenSSL、SSH/SCP 和清理；TypeScript 核心从 `apps/api` 工作目录运行并直接复用 `loadDouyinMiniappConfig`；远端 Bash 应用器固定主机身份和目标路径，在目录 FD 上加锁，以备份为快照构造同文件系统候选，再执行原子替换和有条件原子回滚。测试使用 Bun、真实临时目录、source-only Shell 函数和命令适配器，不引入依赖。

**Tech Stack:** Bash 3.2、Bun 1.3.2、TypeScript、Bun Test、OpenSSL 3.6.2、OpenSSH、GNU coreutils/util-linux、Docker Compose 2.40.3、现有 Zod/API 配置契约

---

## 固定边界与文件职责

| 文件 | 动作 | 单一职责 |
| --- | --- | --- |
| `scripts/ops/douyin-dev-env.test.ts` | Create | 验证 TypeScript payload 契约、本机入口契约和远端文件事务 |
| `scripts/ops/douyin-dev-env.ts` | Create | 解析受保护 payload，复用 API 配置契约并只输出脱敏元数据 |
| `scripts/ops/apply-douyin-dev-env-remote.sh` | Create | 固定远端边界、加锁、备份、候选、原子替换、回滚和清理 |
| `scripts/ops/configure-douyin-dev-env.sh` | Create | 真实 TTY 隐藏输入、随机生成、校验、确认、SCP/SSH 和本机清理 |
| `docs/operations/evidence/2026-07-20-douyin-dev-e2e.md` | Preserve until A01 | 代码提交不得暂存；真实 A01 完成后才追加脱敏证据 |

实施期间不得修改 `apps/api/src/services/douyin-miniapp/config.ts`、任何 migration、部署配置或 `orange`。如果真实控制台值不满足已批准的保守字符集，工具必须在上传前失败；不能放宽规则、转义后继续或要求用户把值发到聊天。

从仓库根直接执行 `bun scripts/ops/douyin-dev-env.ts` 无法解析 API 内部 `@/` 别名。所有 CLI 与测试命令必须使用已验证的 API cwd 形式：

```bash
(cd apps/api && bun ../../scripts/ops/douyin-dev-env.ts ...)
bun test --cwd apps/api ../../scripts/ops/douyin-dev-env.test.ts
```

## Task 1：冻结代码、工具和远端只读基线

**Files:**
- Read: `docs/superpowers/specs/2026-07-20-douyin-dev-env-handoff-design.md`
- Read: `apps/api/src/services/douyin-miniapp/config.ts`
- Preserve unstaged: `docs/operations/evidence/2026-07-20-douyin-dev-e2e.md`

- [ ] **Step 1：确认隔离工作树和唯一既有改动**

Run:

```bash
pwd
git branch --show-current
git rev-parse HEAD
git status --short
```

Expected:

- cwd 为 `/Users/leefo/Public/work/gooes/.worktrees/douyin-decoration-miniapp`；
- branch 为 `feature/douyin-decoration-miniapp`；
- HEAD 包含本计划提交；
- 唯一既有未提交文件是 ` M docs/operations/evidence/2026-07-20-douyin-dev-e2e.md`。

- [ ] **Step 2：确认本机工具版本和 API cwd 导入**

Run:

```bash
/bin/bash --version | sed -n '1p'
bun --version
openssl version
(cd apps/api && bun -e 'import { loadDouyinMiniappConfig } from "./src/services/douyin-miniapp/config.ts"; console.log(typeof loadDouyinMiniappConfig)')
```

Expected:

- Bash 为 `3.2.57`；
- Bun 为 `1.3.2`；
- OpenSSL 为 `3.6.2`；
- 最后一行精确为 `function`。

- [ ] **Step 3：运行现有配置契约基线**

Run:

```bash
bun test --cwd apps/api src/services/douyin-miniapp/config.test.ts
bun run api:typecheck
```

Expected: 两条命令退出码均为 `0`。失败时先使用 `systematic-debugging` 定位，不能开始新测试。

- [ ] **Step 4：只读复核远端身份和工具，不读取值**

Run:

```bash
ssh -o BatchMode=yes -o ConnectTimeout=10 gooes-dev '
  set -eu
  test "$(hostname)" = "VM-0-11-ubuntu"
  test "$(id -un)" = "ubuntu"
  for tool in bash env hostname id flock mktemp install stat awk grep mv cp rm rmdir \
    sha256sum cmp date od tail wc docker; do
    command -v "$tool" >/dev/null
  done
  test -d /opt/gooes-dev/docker
  test ! -L /opt/gooes-dev/docker
  test -f /opt/gooes-dev/docker/.env.dev.api
  test ! -L /opt/gooes-dev/docker/.env.dev.api
  test "$(stat -c %a /opt/gooes-dev/docker/.env.dev.api)" = "600"
  test "$(stat -c %U:%G /opt/gooes-dev/docker/.env.dev.api)" = "ubuntu:ubuntu"
  awk -F= "\$1 ~ /^DOUYIN_/ { found=1 } END { exit found }" \
    /opt/gooes-dev/docker/.env.dev.api
  test "$(docker inspect --format "{{.State.Status}}" gooes-api-dev)" = "running"
  test "$(docker inspect --format "{{if .State.Health}}{{.State.Health.Status}}{{end}}" gooes-api-dev)" = "healthy"
  printf "douyin-a01-readonly-preflight=true\n"
'
```

Expected: 只输出 `douyin-a01-readonly-preflight=true`；不创建备份或临时文件。

## Task 2：TypeScript payload 与脱敏 CLI

**Files:**
- Create: `scripts/ops/douyin-dev-env.test.ts`
- Create: `scripts/ops/douyin-dev-env.ts`

- [ ] **Step 1：先写 payload 和 CLI 失败测试**

Create `scripts/ops/douyin-dev-env.test.ts` with these imports and fixtures:

```ts
import { afterEach, describe, expect, test } from "bun:test";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DOUYIN_ENV_KEYS,
  DouyinDevEnvError,
  type DouyinEnvKey,
  validateDouyinDevEnvPayload,
} from "./douyin-dev-env";

const API_CWD = join(import.meta.dir, "../../apps/api");
const SECRET_SENTINELS = [
  "component-secret-sentinel",
  "0123456789abcdef0123456789abcdef",
  Buffer.alloc(32, 0x41).toString("base64").slice(0, -1),
  "template-secret-sentinel",
  Buffer.alloc(32, 0x42).toString("base64"),
  "c".repeat(64),
] as const;

const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function validValues(): Record<DouyinEnvKey, string> {
  return {
    DOUYIN_COMPONENT_APP_ID: "tt-component-abc123",
    DOUYIN_COMPONENT_APP_SECRET: SECRET_SENTINELS[0],
    DOUYIN_COMPONENT_MESSAGE_TOKEN: SECRET_SENTINELS[1],
    DOUYIN_COMPONENT_MESSAGE_AES_KEY: SECRET_SENTINELS[2],
    DOUYIN_TEMPLATE_APP_ID: "tt-template-xyz789",
    DOUYIN_TEMPLATE_APP_SECRET: SECRET_SENTINELS[3],
    DOUYIN_CREDENTIAL_KEYS_JSON: JSON.stringify({ v1: SECRET_SENTINELS[4] }),
    DOUYIN_CREDENTIAL_ACTIVE_KEY_VERSION: "v1",
    DOUYIN_SUBJECT_HASH_KEY: SECRET_SENTINELS[5],
  };
}

function payload(
  values: Readonly<Record<DouyinEnvKey, string>> = validValues(),
  keys: readonly DouyinEnvKey[] = DOUYIN_ENV_KEYS,
): Buffer {
  return Buffer.from(`${keys.map((key) => `${key}=${values[key]}`).join("\n")}\n`);
}

function replaceValue(key: DouyinEnvKey, value: string): Buffer {
  return payload({ ...validValues(), [key]: value });
}

function captureValidationError(input: Buffer): DouyinDevEnvError {
  let caught: unknown;
  try {
    validateDouyinDevEnvPayload(input);
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(DouyinDevEnvError);
  return caught as DouyinDevEnvError;
}

function createPayloadFile(contents: Buffer = payload(), mode = 0o600): string {
  const root = mkdtempSync(join(tmpdir(), "gooes-douyin-env-test-"));
  temporaryRoots.push(root);
  const path = join(root, "payload.env");
  writeFileSync(path, contents, { mode });
  chmodSync(path, mode);
  return path;
}

function runCli(path: string): ReturnType<typeof Bun.spawnSync> {
  return Bun.spawnSync([
    "bun",
    "../../scripts/ops/douyin-dev-env.ts",
    "validate",
    "--payload",
    path,
  ], {
    cwd: API_CWD,
    stdout: "pipe",
    stderr: "pipe",
  });
}
```

Add the complete payload matrix:

```ts
describe("douyin dev env payload", () => {
  test("accepts exactly nine ordered values and returns only redacted metadata", () => {
    const metadata = validateDouyinDevEnvPayload(payload());
    expect(metadata).toEqual({
      environment: "development",
      nineKeysValid: true,
      componentAppIdTail: "abc123",
      componentAppIdShort: false,
      templateAppIdTail: "xyz789",
      templateAppIdShort: false,
      activeKeyVersion: "v1",
    });

    const serialized = JSON.stringify(metadata);
    for (const secret of SECRET_SENTINELS) {
      expect(serialized).not.toContain(secret);
    }
    expect(serialized).not.toContain("tt-component-abc123");
    expect(serialized).not.toContain("tt-template-xyz789");
  });

  test("returns no AppID characters when an ID is shorter than seven characters", () => {
    const metadata = validateDouyinDevEnvPayload(payload({
      ...validValues(),
      DOUYIN_COMPONENT_APP_ID: "short",
      DOUYIN_TEMPLATE_APP_ID: "tiny",
    }));
    expect(metadata.componentAppIdTail).toBeNull();
    expect(metadata.componentAppIdShort).toBe(true);
    expect(metadata.templateAppIdTail).toBeNull();
    expect(metadata.templateAppIdShort).toBe(true);
  });

  test("rejects malformed payload framing without exposing values", () => {
    const lines = payload().toString("utf8").trimEnd().split("\n");
    const nulPayload = Buffer.from(payload());
    const sentinelIndex = nulPayload.indexOf("component-secret-sentinel");
    expect(sentinelIndex).toBeGreaterThanOrEqual(0);
    nulPayload[sentinelIndex] = 0;
    const firstLine = lines[0] ?? "";
    const cases: Array<readonly [string, Buffer]> = [
      ["missing", Buffer.from(`${lines.slice(0, -1).join("\n")}\n`)],
      ["duplicate", Buffer.from(`${[firstLine, ...lines.slice(0, 8)].join("\n")}\n`)],
      ["unknown", Buffer.from(`${["DOUYIN_UNKNOWN=x", ...lines.slice(1)].join("\n")}\n`)],
      ["empty", Buffer.from(`${[`${DOUYIN_ENV_KEYS[0]}=`, ...lines.slice(1)].join("\n")}\n`)],
      ["wrong-order", payload(validValues(), [DOUYIN_ENV_KEYS[1], DOUYIN_ENV_KEYS[0], ...DOUYIN_ENV_KEYS.slice(2)])],
      ["cr", Buffer.from(payload().toString("utf8").replace("\n", "\r\n"))],
      ["nul", nulPayload],
      ["no-final-lf", Buffer.from(payload().toString("utf8").slice(0, -1))],
      ["extra", Buffer.from(`${payload().toString("utf8")}EXTRA=x\n`)],
    ];

    for (const [name, candidate] of cases) {
      const error = captureValidationError(candidate);
      expect(error.code, name).toBe("DOUYIN_DEV_ENV_PAYLOAD_INVALID");
      for (const secret of SECRET_SENTINELS) {
        expect(`${error.name}:${error.code}:${error.message}`).not.toContain(secret);
      }
    }
  });

  test("rejects values outside the handoff contract", () => {
    const cases: Buffer[] = [
      replaceValue("DOUYIN_COMPONENT_APP_ID", " tt-component-abc123"),
      replaceValue("DOUYIN_COMPONENT_APP_SECRET", "unsafe$value"),
      replaceValue("DOUYIN_COMPONENT_APP_SECRET", "a".repeat(513)),
      replaceValue("DOUYIN_COMPONENT_MESSAGE_TOKEN", "a".repeat(31)),
      replaceValue("DOUYIN_COMPONENT_MESSAGE_AES_KEY", Buffer.alloc(31).toString("base64").replace(/=+$/, "")),
      replaceValue("DOUYIN_CREDENTIAL_KEYS_JSON", JSON.stringify({ v2: SECRET_SENTINELS[4] })),
      replaceValue("DOUYIN_CREDENTIAL_ACTIVE_KEY_VERSION", "v2"),
      replaceValue("DOUYIN_SUBJECT_HASH_KEY", "c".repeat(63)),
    ];
    for (const candidate of cases) {
      expect(() => validateDouyinDevEnvPayload(candidate)).toThrow(DouyinDevEnvError);
    }
  });
});

describe("douyin dev env CLI", () => {
  test("validates a mode-600 regular file from the API cwd", () => {
    const result = runCli(createPayloadFile());
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout.toString())).toMatchObject({
      nineKeysValid: true,
      activeKeyVersion: "v1",
    });
    expect(result.stderr.toString()).toBe("");
  });

  test("rejects wrong mode and symlink inputs with stable redacted errors", () => {
    const wrongMode = createPayloadFile(payload(), 0o644);
    const link = `${wrongMode}.link`;
    symlinkSync(wrongMode, link);
    for (const path of [wrongMode, link]) {
      const result = runCli(path);
      expect(result.exitCode).toBe(2);
      expect(result.stderr.toString()).toBe("DOUYIN_DEV_ENV_FILE_INVALID\n");
      for (const secret of SECRET_SENTINELS) {
        expect(result.stdout.toString()).not.toContain(secret);
        expect(result.stderr.toString()).not.toContain(secret);
      }
    }
    expect(lstatSync(wrongMode).isFile()).toBe(true);
    expect(readFileSync(wrongMode)).toEqual(payload());
  });
});
```

- [ ] **Step 2：运行红灯并确认是缺少模块**

Run:

```bash
bun test --cwd apps/api ../../scripts/ops/douyin-dev-env.test.ts
```

Expected: FAIL，原因是 `./douyin-dev-env` 不存在；不能接受 API alias 错误或测试语法错误。

- [ ] **Step 3：实现严格 parser、真实配置复用和 CLI**

Create `scripts/ops/douyin-dev-env.ts` with these exported contracts:

```ts
import { lstatSync, readFileSync } from "node:fs";
import { loadDouyinMiniappConfig } from "../../apps/api/src/services/douyin-miniapp/config";

export const DOUYIN_ENV_KEYS = [
  "DOUYIN_COMPONENT_APP_ID",
  "DOUYIN_COMPONENT_APP_SECRET",
  "DOUYIN_COMPONENT_MESSAGE_TOKEN",
  "DOUYIN_COMPONENT_MESSAGE_AES_KEY",
  "DOUYIN_TEMPLATE_APP_ID",
  "DOUYIN_TEMPLATE_APP_SECRET",
  "DOUYIN_CREDENTIAL_KEYS_JSON",
  "DOUYIN_CREDENTIAL_ACTIVE_KEY_VERSION",
  "DOUYIN_SUBJECT_HASH_KEY",
] as const;

export type DouyinEnvKey = (typeof DOUYIN_ENV_KEYS)[number];

type DouyinDevEnvErrorCode =
  | "DOUYIN_DEV_ENV_PAYLOAD_INVALID"
  | "DOUYIN_DEV_ENV_INPUT_INVALID"
  | "DOUYIN_DEV_ENV_CONFIG_INVALID"
  | "DOUYIN_DEV_ENV_FILE_INVALID"
  | "DOUYIN_DEV_ENV_USAGE_INVALID";

export interface DouyinDevEnvMetadata {
  readonly environment: "development";
  readonly nineKeysValid: true;
  readonly componentAppIdTail: string | null;
  readonly componentAppIdShort: boolean;
  readonly templateAppIdTail: string | null;
  readonly templateAppIdShort: boolean;
  readonly activeKeyVersion: "v1";
}

export class DouyinDevEnvError extends Error {
  readonly code: DouyinDevEnvErrorCode;

  constructor(code: DouyinDevEnvErrorCode) {
    super(code);
    this.name = "DouyinDevEnvError";
    this.code = code;
  }
}

const CONSOLE_KEYS = [
  "DOUYIN_COMPONENT_APP_ID",
  "DOUYIN_COMPONENT_APP_SECRET",
  "DOUYIN_TEMPLATE_APP_ID",
  "DOUYIN_TEMPLATE_APP_SECRET",
] as const satisfies readonly DouyinEnvKey[];
const SAFE_CONSOLE_VALUE = /^[A-Za-z0-9._~+/=-]+$/;
const MESSAGE_TOKEN = /^[a-f0-9]{32}$/;
const SUBJECT_HASH_KEY = /^[a-f0-9]{64}$/;

function fail(code: DouyinDevEnvErrorCode): never {
  throw new DouyinDevEnvError(code);
}

function parsePayload(input: Uint8Array): Record<DouyinEnvKey, string> {
  const raw = Buffer.from(input);
  if (
    raw.length === 0
    || raw.at(-1) !== 0x0a
    || raw.includes(0x00)
    || raw.includes(0x0d)
  ) {
    fail("DOUYIN_DEV_ENV_PAYLOAD_INVALID");
  }

  const lines = raw.toString("utf8").split("\n");
  lines.pop();
  if (lines.length !== DOUYIN_ENV_KEYS.length) {
    fail("DOUYIN_DEV_ENV_PAYLOAD_INVALID");
  }

  const entries: Array<readonly [DouyinEnvKey, string]> = [];
  for (const [index, expectedKey] of DOUYIN_ENV_KEYS.entries()) {
    const line = lines[index];
    if (line === undefined) fail("DOUYIN_DEV_ENV_PAYLOAD_INVALID");
    const separator = line.indexOf("=");
    const key = separator < 0 ? "" : line.slice(0, separator);
    const value = separator < 0 ? "" : line.slice(separator + 1);
    if (key !== expectedKey || value.length === 0) {
      fail("DOUYIN_DEV_ENV_PAYLOAD_INVALID");
    }
    entries.push([expectedKey, value]);
  }
  return Object.fromEntries(entries) as Record<DouyinEnvKey, string>;
}

function validateHandoffShape(values: Readonly<Record<DouyinEnvKey, string>>): void {
  for (const key of CONSOLE_KEYS) {
    const value = values[key];
    if (value.trim() !== value || !SAFE_CONSOLE_VALUE.test(value)) {
      fail("DOUYIN_DEV_ENV_INPUT_INVALID");
    }
  }
  if (
    !MESSAGE_TOKEN.test(values.DOUYIN_COMPONENT_MESSAGE_TOKEN)
    || !SUBJECT_HASH_KEY.test(values.DOUYIN_SUBJECT_HASH_KEY)
    || values.DOUYIN_CREDENTIAL_ACTIVE_KEY_VERSION !== "v1"
  ) {
    fail("DOUYIN_DEV_ENV_CONFIG_INVALID");
  }

  let decoded: unknown;
  try {
    decoded = JSON.parse(values.DOUYIN_CREDENTIAL_KEYS_JSON);
  } catch {
    fail("DOUYIN_DEV_ENV_CONFIG_INVALID");
  }
  if (
    decoded === null
    || typeof decoded !== "object"
    || Array.isArray(decoded)
  ) {
    fail("DOUYIN_DEV_ENV_CONFIG_INVALID");
  }
  const entries = Object.entries(decoded);
  const entry = entries[0];
  if (
    entries.length !== 1
    || entry === undefined
    || entry[0] !== "v1"
    || typeof entry[1] !== "string"
    || JSON.stringify({ v1: entry[1] }) !== values.DOUYIN_CREDENTIAL_KEYS_JSON
  ) {
    fail("DOUYIN_DEV_ENV_CONFIG_INVALID");
  }
}

function redactAppId(value: string): {
  readonly tail: string | null;
  readonly isShort: boolean;
} {
  return value.length < 7
    ? { tail: null, isShort: true }
    : { tail: value.slice(-6), isShort: false };
}

export function validateDouyinDevEnvPayload(input: Uint8Array): DouyinDevEnvMetadata {
  const values = parsePayload(input);
  validateHandoffShape(values);
  try {
    loadDouyinMiniappConfig(values);
  } catch {
    fail("DOUYIN_DEV_ENV_CONFIG_INVALID");
  }

  const component = redactAppId(values.DOUYIN_COMPONENT_APP_ID);
  const template = redactAppId(values.DOUYIN_TEMPLATE_APP_ID);
  return {
    environment: "development",
    nineKeysValid: true,
    componentAppIdTail: component.tail,
    componentAppIdShort: component.isShort,
    templateAppIdTail: template.tail,
    templateAppIdShort: template.isShort,
    activeKeyVersion: "v1",
  };
}

function validatePayloadFile(path: string): DouyinDevEnvMetadata {
  let stat: ReturnType<typeof lstatSync>;
  try {
    stat = lstatSync(path);
  } catch {
    fail("DOUYIN_DEV_ENV_FILE_INVALID");
  }
  if (
    !stat.isFile()
    || stat.isSymbolicLink()
    || (stat.mode & 0o777) !== 0o600
  ) {
    fail("DOUYIN_DEV_ENV_FILE_INVALID");
  }
  return validateDouyinDevEnvPayload(readFileSync(path));
}

export function runDouyinDevEnvCli(args: readonly string[]): number {
  try {
    if (args.length !== 3 || args[0] !== "validate" || args[1] !== "--payload") {
      fail("DOUYIN_DEV_ENV_USAGE_INVALID");
    }
    process.stdout.write(`${JSON.stringify(validatePayloadFile(args[2] ?? ""))}\n`);
    return 0;
  } catch (error) {
    const code = error instanceof DouyinDevEnvError
      ? error.code
      : "DOUYIN_DEV_ENV_CONFIG_INVALID";
    process.stderr.write(`${code}\n`);
    return code === "DOUYIN_DEV_ENV_FILE_INVALID" ? 2 : 1;
  }
}

if (import.meta.main) {
  process.exit(runDouyinDevEnvCli(process.argv.slice(2)));
}
```

Do not import `process.env`, print caught error messages, or expose parsed values.

- [ ] **Step 4：运行绿灯和真实 API 契约**

Run:

```bash
bun test --cwd apps/api ../../scripts/ops/douyin-dev-env.test.ts
bun test --cwd apps/api src/services/douyin-miniapp/config.test.ts
```

Expected: 全部 PASS，stderr 无警告。

- [ ] **Step 5：提交 TypeScript 核心**

```bash
git add scripts/ops/douyin-dev-env.ts scripts/ops/douyin-dev-env.test.ts
git diff --cached --check
git commit -m "feat(douyin): 增加开发凭证校验核心"
```

Expected: 提交只包含这两个文件；证据文件仍未暂存。

## Task 3：远端成功事务、备份和重跑替换

**Files:**
- Modify: `scripts/ops/douyin-dev-env.test.ts`
- Create: `scripts/ops/apply-douyin-dev-env-remote.sh`

- [ ] **Step 1：增加真实临时目录的成功路径测试**

Replace the `node:fs` import with the exact accumulated set, then add:

```ts
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";

const REMOTE_SCRIPT = join(import.meta.dir, "apply-douyin-dev-env-remote.sh");

function localIdentity(): string {
  const user = Bun.spawnSync(["id", "-un"]).stdout.toString().trim();
  const group = Bun.spawnSync(["id", "-gn"]).stdout.toString().trim();
  return `${user}:${group}`;
}

function runRemoteTransaction(input: {
  readonly targetContents: Buffer;
  readonly payloadContents?: Buffer;
  readonly overrides?: string;
  readonly expectedPayloadHash?: string;
}): {
  readonly root: string;
  readonly target: string;
  readonly payloadPath: string;
  readonly original: Buffer;
  readonly result: ReturnType<typeof Bun.spawnSync>;
} {
  const root = mkdtempSync(join(tmpdir(), "gooes-douyin-remote-test-"));
  temporaryRoots.push(root);
  const targetDir = join(root, "opt/gooes-dev/docker");
  const binDir = join(root, "bin");
  mkdirSync(targetDir, { recursive: true });
  mkdirSync(binDir);
  const target = join(targetDir, ".env.dev.api");
  const payloadPath = join(targetDir, ".douyin-env-upload.ABC123");
  const payloadContents = input.payloadContents ?? payload();
  writeFileSync(target, input.targetContents, { mode: 0o600 });
  writeFileSync(payloadPath, payloadContents, { mode: 0o600 });
  chmodSync(target, 0o600);
  chmodSync(payloadPath, 0o600);
  writeFileSync(join(binDir, "flock"), "#!/usr/bin/env bash\nexit 0\n", { mode: 0o755 });
  writeFileSync(
    join(binDir, "docker"),
    "#!/usr/bin/env bash\nprintf 'fixed-id|fixed-start|fixed-image|healthy\\n'\n",
    { mode: 0o755 },
  );

  const digest = input.expectedPayloadHash ?? new Bun.CryptoHasher("sha256")
    .update(payloadContents)
    .digest("hex");
  const command = `
set -euo pipefail
DOUYIN_DEV_ENV_SOURCE_ONLY=1
source "$REMOTE_SCRIPT"
${input.overrides ?? ""}
apply_douyin_env_transaction \
  "$TARGET_DIR" "$TARGET_FILE" "$PAYLOAD_FILE" \
  "$EXPECTED_OWNER" "gooes-api-dev" "$EXPECTED_PAYLOAD_SHA"
`;
  const result = Bun.spawnSync(["/bin/bash", "-c", command], {
    env: {
      ...process.env,
      PATH: `${binDir}:${process.env.PATH ?? ""}`,
      REMOTE_SCRIPT,
      TARGET_DIR: targetDir,
      TARGET_FILE: target,
      PAYLOAD_FILE: payloadPath,
      EXPECTED_OWNER: localIdentity(),
      EXPECTED_PAYLOAD_SHA: digest,
    },
    stdout: "pipe",
    stderr: "pipe",
  });
  return { root, target, payloadPath, original: input.targetContents, result };
}

function backups(root: string): string[] {
  const directory = join(root, "opt/gooes-dev/docker");
  return readdirSync(directory)
    .filter((name) => /^\.env\.dev\.api\.backup-[0-9]{14}$/.test(name))
    .map((name) => join(directory, name));
}

function onlyBackup(root: string): string {
  const paths = backups(root);
  expect(paths).toHaveLength(1);
  return paths[0] ?? join(root, "missing-backup");
}

describe("remote douyin env transaction success", () => {
  test("adds nine keys, preserves non-target content, and keeps an exact backup", () => {
    const original = Buffer.from("SUPABASE_URL=https://dev.invalid\nJWT_SECRET=existing\n");
    const context = runRemoteTransaction({ targetContents: original });
    expect(context.result.exitCode).toBe(0);
    expect(readFileSync(context.target)).toEqual(Buffer.concat([original, payload()]));
    expect(existsSync(context.payloadPath)).toBe(false);
    expect(statSync(context.target).mode & 0o777).toBe(0o600);
    const backupPath = onlyBackup(context.root);
    expect(readFileSync(backupPath)).toEqual(original);
    expect(statSync(backupPath).mode & 0o777).toBe(0o600);
    expect(context.result.stdout.toString()).toContain("nine_keys_valid=true");
    expect(context.result.stdout.toString()).toContain("remote_cleanup=true");
    for (const secret of SECRET_SENTINELS) {
      expect(context.result.stdout.toString()).not.toContain(secret);
      expect(context.result.stderr.toString()).not.toContain(secret);
    }
  });

  test("replaces one existing copy of every key without accumulating duplicates", () => {
    const old = payload({
      ...validValues(),
      DOUYIN_COMPONENT_APP_SECRET: "old-component-secret",
      DOUYIN_TEMPLATE_APP_SECRET: "old-template-secret",
    });
    const original = Buffer.concat([Buffer.from("BASE=value\n"), old]);
    const context = runRemoteTransaction({ targetContents: original });
    expect(context.result.exitCode).toBe(0);
    const installed = readFileSync(context.target, "utf8");
    for (const key of DOUYIN_ENV_KEYS) {
      expect(installed.match(new RegExp(`^${key}=`, "gm"))).toHaveLength(1);
    }
    expect(installed).not.toContain("old-component-secret");
    expect(installed).not.toContain("old-template-secret");
    expect(readFileSync(onlyBackup(context.root))).toEqual(original);
  });

  test("adds the single permitted LF separator when the original has none", () => {
    const original = Buffer.from("BASE=value");
    const context = runRemoteTransaction({ targetContents: original });
    expect(context.result.exitCode).toBe(0);
    expect(readFileSync(context.target)).toEqual(Buffer.concat([
      Buffer.from("BASE=value\n"),
      payload(),
    ]));
    expect(readFileSync(onlyBackup(context.root))).toEqual(original);
  });

  test("preserves complex non-target records byte-for-byte", () => {
    const original = Buffer.from(
      "# keep this comment\n\nSPACED = value with spaces\nUNICODE=装修平台\nEQUALS=a=b=c\n",
    );
    const context = runRemoteTransaction({ targetContents: original });
    expect(context.result.exitCode).toBe(0);
    expect(readFileSync(context.target)).toEqual(Buffer.concat([original, payload()]));
    expect(readFileSync(onlyBackup(context.root))).toEqual(original);
  });

  test("does not delete a pre-existing colliding backup", () => {
    const context = runRemoteTransaction({
      targetContents: Buffer.from("BASE=value\n"),
      overrides: `
backup_timestamp() { printf "20990101010101"; }
collision="$TARGET_FILE.backup-20990101010101"
printf "KEEP_EXISTING_BACKUP\\n" >"$collision"
chmod 600 "$collision"
`,
    });
    expect(context.result.exitCode).not.toBe(0);
    expect(context.result.stderr.toString()).toContain("REMOTE_BACKUP_FAILED");
    expect(readFileSync(
      `${context.target}.backup-20990101010101`,
      "utf8",
    )).toBe("KEEP_EXISTING_BACKUP\n");
  });
});

function expectRedactedFailure(
  context: ReturnType<typeof runRemoteTransaction>,
  code: string,
): void {
  expect(context.result.exitCode).not.toBe(0);
  expect(context.result.stderr.toString()).toContain(code);
  for (const secret of SECRET_SENTINELS) {
    expect(context.result.stdout.toString()).not.toContain(secret);
    expect(context.result.stderr.toString()).not.toContain(secret);
  }
}

describe("remote douyin env transaction baseline rejection", () => {
  test("rejects wrong digest, malformed payload, duplicate keys, and unknown DOUYIN keys", () => {
    const original = Buffer.from("BASE=value\n");
    const cases: Array<readonly [
      ReturnType<typeof runRemoteTransaction>,
      string,
    ]> = [
      [runRemoteTransaction({
        targetContents: original,
        expectedPayloadHash: "0".repeat(64),
      }), "REMOTE_PAYLOAD_INVALID"],
      [runRemoteTransaction({
        targetContents: original,
        payloadContents: Buffer.from("BROKEN=value\n"),
      }), "REMOTE_PAYLOAD_INVALID"],
      [runRemoteTransaction({
        targetContents: Buffer.from(
          "DOUYIN_COMPONENT_APP_ID=first\nDOUYIN_COMPONENT_APP_ID=second\n",
        ),
      }), "REMOTE_TARGET_STATE_INVALID"],
      [runRemoteTransaction({
        targetContents: Buffer.from("DOUYIN_UNAPPROVED_KEY=value\n"),
      }), "REMOTE_TARGET_STATE_INVALID"],
    ];
    for (const [context, code] of cases) {
      expectRedactedFailure(context, code);
      expect(readFileSync(context.target)).toEqual(context.original);
    }
  });

  test("rejects symlink, wrong-mode, and wrong-owner inputs", () => {
    for (const overrides of [
      'real="$TARGET_FILE.real"; mv "$TARGET_FILE" "$real"; ln -s "$real" "$TARGET_FILE"',
      'real="$PAYLOAD_FILE.real"; mv "$PAYLOAD_FILE" "$real"; ln -s "$real" "$PAYLOAD_FILE"',
      'chmod 644 "$TARGET_FILE"',
      'chmod 644 "$PAYLOAD_FILE"',
      'file_owner() { printf "wrong:owner"; }',
    ]) {
      const context = runRemoteTransaction({
        targetContents: Buffer.from("BASE=value\n"),
        overrides,
      });
      expect(context.result.exitCode).not.toBe(0);
      expect(readFileSync(context.target)).toEqual(context.original);
    }
  });

  test("turns exact cleanup failure into a redacted nonzero result", () => {
    const context = runRemoteTransaction({
      targetContents: Buffer.from("BASE=value\n"),
      overrides: `remove_temp_path() {
  [[ -z "$1" || (! -e "$1" && ! -L "$1") ]] && return 0
  [[ "$1" = "$PAYLOAD_FILE" ]] && return 1
  command rm "$1"
}`,
    });
    expectRedactedFailure(context, "CLEANUP_FAILED");
    expect(context.result.stderr.toString()).toContain("target_may_be_updated=true");
    expect(lstatSync(context.payloadPath).isFile()).toBe(true);
  });
});
```

- [ ] **Step 2：运行红灯并确认远端脚本缺失**

Run:

```bash
bun test --cwd apps/api ../../scripts/ops/douyin-dev-env.test.ts \
  -t "remote douyin env transaction (success|baseline rejection)"
```

Expected: FAIL，所有新用例都因 `apply-douyin-dev-env-remote.sh` 不存在而失败。

- [ ] **Step 3：实现成功事务的基础函数**

Create `scripts/ops/apply-douyin-dev-env-remote.sh` with strict mode, the exact nine-key array, and these portable helpers:

```bash
#!/usr/bin/env bash
set -euo pipefail
umask 077

DOUYIN_ENV_KEYS=(
  DOUYIN_COMPONENT_APP_ID
  DOUYIN_COMPONENT_APP_SECRET
  DOUYIN_COMPONENT_MESSAGE_TOKEN
  DOUYIN_COMPONENT_MESSAGE_AES_KEY
  DOUYIN_TEMPLATE_APP_ID
  DOUYIN_TEMPLATE_APP_SECRET
  DOUYIN_CREDENTIAL_KEYS_JSON
  DOUYIN_CREDENTIAL_ACTIVE_KEY_VERSION
  DOUYIN_SUBJECT_HASH_KEY
)

REMOTE_PAYLOAD_PATH=""
CANDIDATE_PATH=""
BEFORE_VIEW_PATH=""
AFTER_VIEW_PATH=""
TARGET_BLOCK_PATH=""
RESTORE_PATH=""
BACKUP_PATH=""
BACKUP_CREATED=false
BACKUP_VALID=false
TARGET_REPLACED=false

die() {
  printf '%s\n' "$1" >&2
  if [[ "$TARGET_REPLACED" = true ]]; then
    printf '%s\n' 'target_may_be_updated=true' >&2
  fi
  return 1
}

file_mode() {
  stat -c '%a' "$1" 2>/dev/null || stat -f '%Lp' "$1"
}

file_owner() {
  stat -c '%U:%G' "$1" 2>/dev/null || stat -f '%Su:%Sg' "$1"
}

sha256_file() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  else
    shasum -a 256 "$1" | awk '{print $1}'
  fi
}

contains_nul() {
  od -An -v -tx1 "$1" | grep -Eq '(^|[[:space:]])00([[:space:]]|$)'
}

is_douyin_key() {
  case "$1" in
    DOUYIN_COMPONENT_APP_ID|DOUYIN_COMPONENT_APP_SECRET|\
    DOUYIN_COMPONENT_MESSAGE_TOKEN|DOUYIN_COMPONENT_MESSAGE_AES_KEY|\
    DOUYIN_TEMPLATE_APP_ID|DOUYIN_TEMPLATE_APP_SECRET|\
    DOUYIN_CREDENTIAL_KEYS_JSON|DOUYIN_CREDENTIAL_ACTIVE_KEY_VERSION|\
    DOUYIN_SUBJECT_HASH_KEY) return 0 ;;
    *) return 1 ;;
  esac
}

validate_target_directory_chain() {
  local target_dir="$1"
  local path
  if [[ "$target_dir" = /opt/gooes-dev/docker ]]; then
    for path in /opt /opt/gooes-dev /opt/gooes-dev/docker; do
      [[ -d "$path" && ! -L "$path" ]] || {
        die REMOTE_TARGET_STATE_INVALID
        return 1
      }
    done
    return 0
  fi
  [[ -d "$target_dir" && ! -L "$target_dir" ]] || {
    die REMOTE_TARGET_STATE_INVALID
    return 1
  }
}

validate_secure_regular_file() {
  local path="$1"
  local expected_owner="$2"
  [[ -f "$path" && ! -L "$path" ]] || die REMOTE_TARGET_STATE_INVALID
  [[ "$(file_mode "$path")" = 600 ]] || die REMOTE_TARGET_STATE_INVALID
  [[ "$(file_owner "$path")" = "$expected_owner" ]] || die REMOTE_TARGET_STATE_INVALID
}

validate_payload_shape() {
  local payload_path="$1"
  contains_nul "$payload_path" && die REMOTE_PAYLOAD_INVALID
  LC_ALL=C grep -q $'\r' "$payload_path" && die REMOTE_PAYLOAD_INVALID
  [[ "$(tail -c 1 "$payload_path" | od -An -tx1)" = *0a* ]] \
    || die REMOTE_PAYLOAD_INVALID
  awk '
    BEGIN {
      expected[1]="DOUYIN_COMPONENT_APP_ID"
      expected[2]="DOUYIN_COMPONENT_APP_SECRET"
      expected[3]="DOUYIN_COMPONENT_MESSAGE_TOKEN"
      expected[4]="DOUYIN_COMPONENT_MESSAGE_AES_KEY"
      expected[5]="DOUYIN_TEMPLATE_APP_ID"
      expected[6]="DOUYIN_TEMPLATE_APP_SECRET"
      expected[7]="DOUYIN_CREDENTIAL_KEYS_JSON"
      expected[8]="DOUYIN_CREDENTIAL_ACTIVE_KEY_VERSION"
      expected[9]="DOUYIN_SUBJECT_HASH_KEY"
    }
    {
      separator=index($0, "=")
      key=separator > 0 ? substr($0, 1, separator - 1) : ""
      value=separator > 0 ? substr($0, separator + 1) : ""
      if (key != expected[NR] || value == "") exit 1
    }
    END { if (NR != 9) exit 1 }
  ' "$payload_path" || die REMOTE_PAYLOAD_INVALID
}

validate_target_key_state() {
  LC_ALL=C awk -F= '
    function allowed(key) {
      return key ~ /^DOUYIN_(COMPONENT_APP_ID|COMPONENT_APP_SECRET|COMPONENT_MESSAGE_TOKEN|COMPONENT_MESSAGE_AES_KEY|TEMPLATE_APP_ID|TEMPLATE_APP_SECRET|CREDENTIAL_KEYS_JSON|CREDENTIAL_ACTIVE_KEY_VERSION|SUBJECT_HASH_KEY)$/
    }
    $1 ~ /^DOUYIN_/ {
      if (!allowed($1)) exit 1
      seen[$1]++
      if (seen[$1] > 1) exit 1
    }
  ' "$1" || die REMOTE_TARGET_STATE_INVALID
}

filter_non_target() {
  LC_ALL=C awk '
    function target(key) {
      return key=="DOUYIN_COMPONENT_APP_ID" \
        || key=="DOUYIN_COMPONENT_APP_SECRET" \
        || key=="DOUYIN_COMPONENT_MESSAGE_TOKEN" \
        || key=="DOUYIN_COMPONENT_MESSAGE_AES_KEY" \
        || key=="DOUYIN_TEMPLATE_APP_ID" \
        || key=="DOUYIN_TEMPLATE_APP_SECRET" \
        || key=="DOUYIN_CREDENTIAL_KEYS_JSON" \
        || key=="DOUYIN_CREDENTIAL_ACTIVE_KEY_VERSION" \
        || key=="DOUYIN_SUBJECT_HASH_KEY"
    }
    {
      separator=index($0, "=")
      key=separator > 0 ? substr($0, 1, separator - 1) : ""
      if (!target(key)) print $0
    }
  ' "$1"
}

extract_target_block() {
  LC_ALL=C awk '
    {
      separator=index($0, "=")
      key=separator > 0 ? substr($0, 1, separator - 1) : ""
      if (key ~ /^DOUYIN_(COMPONENT_APP_ID|COMPONENT_APP_SECRET|COMPONENT_MESSAGE_TOKEN|COMPONENT_MESSAGE_AES_KEY|TEMPLATE_APP_ID|TEMPLATE_APP_SECRET|CREDENTIAL_KEYS_JSON|CREDENTIAL_ACTIVE_KEY_VERSION|SUBJECT_HASH_KEY)$/) print $0
    }
  ' "$1"
}

remove_temp_path() {
  local path="$1"
  [[ -z "$path" || (! -e "$path" && ! -L "$path") ]] || rm "$path"
}

cleanup_remote_temps() {
  local failed=0
  local path
  for path in "$REMOTE_PAYLOAD_PATH" "$CANDIDATE_PATH" "$BEFORE_VIEW_PATH" \
    "$AFTER_VIEW_PATH" "$TARGET_BLOCK_PATH" "$RESTORE_PATH"; do
    remove_temp_path "$path" || failed=1
  done
  if [[ "$BACKUP_CREATED" = true && "$BACKUP_VALID" != true ]]; then
    remove_temp_path "$BACKUP_PATH" || failed=1
  fi
  [[ "$failed" -eq 0 ]]
}

backup_timestamp() {
  date +%Y%m%d%H%M%S
}

container_snapshot() {
  docker inspect \
    --format '{{.Id}}|{{.State.StartedAt}}|{{.Config.Image}}|{{if .State.Health}}{{.State.Health.Status}}{{end}}' \
    "$1"
}

cleanup_and_exit() {
  local status=$?
  trap - EXIT HUP INT TERM
  if cleanup_remote_temps; then
    printf 'remote_cleanup=true\n'
    exit "$status"
  fi
  printf '%s\n' CLEANUP_FAILED >&2
  printf '%s\n' 'target_may_be_updated=true' >&2
  exit 74
}
```

Implement `apply_douyin_env_transaction` so it performs, in this order:

```bash
apply_douyin_env_transaction() {
  local target_dir="$1"
  local target_file="$2"
  local payload_path="$3"
  local expected_owner="$4"
  local container_name="$5"
  local expected_payload_sha="$6"
  local before_sha candidate_sha container_before container_after timestamp

  REMOTE_PAYLOAD_PATH="$payload_path"
  trap cleanup_and_exit EXIT
  trap 'exit 129' HUP
  trap 'exit 130' INT
  trap 'exit 143' TERM

  validate_target_directory_chain "$target_dir"
  validate_secure_regular_file "$target_file" "$expected_owner"
  validate_secure_regular_file "$payload_path" "$expected_owner"
  [[ "$expected_payload_sha" =~ ^[a-f0-9]{64}$ ]] || die REMOTE_PAYLOAD_INVALID
  [[ "$(sha256_file "$payload_path")" = "$expected_payload_sha" ]] \
    || die REMOTE_PAYLOAD_INVALID

  exec 9<"$target_dir"
  flock -x 9
  validate_target_directory_chain "$target_dir"
  validate_secure_regular_file "$target_file" "$expected_owner"
  validate_secure_regular_file "$payload_path" "$expected_owner"
  validate_payload_shape "$payload_path"
  validate_target_key_state "$target_file"

  before_sha="$(sha256_file "$target_file")"
  container_before="$(container_snapshot "$container_name")"
  [[ "$container_before" = *"|healthy" ]] || die REMOTE_PREFLIGHT_FAILED

  timestamp="$(backup_timestamp)"
  BACKUP_PATH="${target_file}.backup-${timestamp}"
  [[ ! -e "$BACKUP_PATH" && ! -L "$BACKUP_PATH" ]] || die REMOTE_BACKUP_FAILED
  ( set -o noclobber; : >"$BACKUP_PATH" ) || die REMOTE_BACKUP_FAILED
  BACKUP_CREATED=true
  cp -p "$target_file" "$BACKUP_PATH" || die REMOTE_BACKUP_FAILED
  validate_secure_regular_file "$BACKUP_PATH" "$expected_owner"
  [[ "$(sha256_file "$BACKUP_PATH")" = "$before_sha" ]] || die REMOTE_BACKUP_FAILED
  BACKUP_VALID=true

  CANDIDATE_PATH="$(mktemp "${target_dir}/.env.dev.api.candidate.XXXXXX")"
  BEFORE_VIEW_PATH="$(mktemp "${target_dir}/.env.dev.api.before.XXXXXX")"
  AFTER_VIEW_PATH="$(mktemp "${target_dir}/.env.dev.api.after.XXXXXX")"
  TARGET_BLOCK_PATH="$(mktemp "${target_dir}/.env.dev.api.block.XXXXXX")"
  chmod 600 "$CANDIDATE_PATH" "$BEFORE_VIEW_PATH" "$AFTER_VIEW_PATH" "$TARGET_BLOCK_PATH"
  filter_non_target "$BACKUP_PATH" >"$CANDIDATE_PATH"
  while IFS= read -r line; do
    printf '%s\n' "$line" >>"$CANDIDATE_PATH"
  done <"$payload_path"
  chmod 600 "$CANDIDATE_PATH"
  validate_secure_regular_file "$CANDIDATE_PATH" "$expected_owner"
  validate_payload_shape "$payload_path"
  validate_target_key_state "$CANDIDATE_PATH"

  filter_non_target "$BACKUP_PATH" >"$BEFORE_VIEW_PATH"
  filter_non_target "$CANDIDATE_PATH" >"$AFTER_VIEW_PATH"
  cmp -s "$BEFORE_VIEW_PATH" "$AFTER_VIEW_PATH" || die REMOTE_CANDIDATE_INVALID
  extract_target_block "$CANDIDATE_PATH" >"$TARGET_BLOCK_PATH"
  cmp -s "$payload_path" "$TARGET_BLOCK_PATH" || die REMOTE_CANDIDATE_INVALID
  [[ "$(sha256_file "$TARGET_BLOCK_PATH")" = "$expected_payload_sha" ]] \
    || die REMOTE_CANDIDATE_INVALID
  [[ "$(sha256_file "$target_file")" = "$before_sha" ]] \
    || die REMOTE_CONCURRENT_CHANGE

  candidate_sha="$(sha256_file "$CANDIDATE_PATH")"
  mv "$CANDIDATE_PATH" "$target_file"
  CANDIDATE_PATH=""
  TARGET_REPLACED=true
  validate_secure_regular_file "$target_file" "$expected_owner"
  [[ "$(sha256_file "$target_file")" = "$candidate_sha" ]] \
    || die REMOTE_APPLY_FAILED

  container_after="$(container_snapshot "$container_name")"
  [[ "$container_after" = "$container_before" ]] || die REMOTE_CONTAINER_CHANGED

  printf 'environment=development\n'
  printf 'logical_server=gooes-dev-vm-0-11\n'
  printf 'target=/opt/gooes-dev/docker/.env.dev.api\n'
  printf 'backup=%s\n' "$BACKUP_PATH"
  printf 'backup_sha256=%s\n' "$before_sha"
  printf 'nine_keys_valid=true\n'
  printf 'target_mode_600=true\n'
  printf 'target_owner_ubuntu=true\n'
  printf 'container_identity_unchanged=true\n'
}
```

Add a fixed production `main`:

```bash
main() {
  local target_dir="/opt/gooes-dev/docker"
  local target_file="${target_dir}/.env.dev.api"
  local payload_path="${1:-}"
  local expected_payload_sha="${2:-}"
  local tool path

  [[ "$#" -eq 2 ]] || die REMOTE_USAGE_INVALID
  [[ "$(hostname)" = "VM-0-11-ubuntu" ]] || die REMOTE_HOST_INVALID
  [[ "$(id -un)" = "ubuntu" ]] || die REMOTE_HOST_INVALID
  for tool in bash env hostname id flock mktemp install stat awk grep mv cp rm rmdir \
    sha256sum cmp date od tail wc docker; do
    command -v "$tool" >/dev/null || die REMOTE_PREFLIGHT_FAILED
  done
  for path in /opt /opt/gooes-dev "$target_dir"; do
    [[ -d "$path" && ! -L "$path" ]] || die REMOTE_TARGET_STATE_INVALID
  done
  [[ "$payload_path" =~ ^/opt/gooes-dev/docker/\.douyin-env-upload\.[A-Za-z0-9]+$ ]] \
    || die REMOTE_PAYLOAD_INVALID
  apply_douyin_env_transaction \
    "$target_dir" "$target_file" "$payload_path" \
    "ubuntu:ubuntu" "gooes-api-dev" "$expected_payload_sha"
}

if [[ "${DOUYIN_DEV_ENV_SOURCE_ONLY:-}" != 1 ]]; then
  main "$@"
fi
```

- [ ] **Step 4：验证成功路径转绿**

Run:

```bash
bash -n scripts/ops/apply-douyin-dev-env-remote.sh
bun test --cwd apps/api ../../scripts/ops/douyin-dev-env.test.ts \
  -t "remote douyin env transaction (success|baseline rejection)"
```

Expected: 语法检查、成功事务和基础拒绝测试均 PASS。

- [ ] **Step 5：提交成功事务**

```bash
git add scripts/ops/apply-douyin-dev-env-remote.sh \
  scripts/ops/douyin-dev-env.test.ts
git diff --cached --check
git commit -m "feat(douyin): 增加远端环境原子写入"
```

## Task 4：远端拒绝、并发、回滚和清理

**Files:**
- Modify: `scripts/ops/douyin-dev-env.test.ts`
- Modify: `scripts/ops/apply-douyin-dev-env-remote.sh`

- [ ] **Step 1：先增加分类、并发和回滚测试**

Add these tests, reusing `expectRedactedFailure` from Task 3:

```ts
describe("remote douyin env transaction failures", () => {
  test("rejects target, parent, and payload symlinks", () => {
    for (const target of ["target", "directory", "payload"] as const) {
      const original = Buffer.from("BASE=value\n");
      const overrides = target === "target"
        ? 'real="$TARGET_FILE.real"; mv "$TARGET_FILE" "$real"; ln -s "$real" "$TARGET_FILE"'
        : target === "directory"
          ? 'real="$TARGET_DIR.real"; mv "$TARGET_DIR" "$real"; ln -s "$real" "$TARGET_DIR"; TARGET_FILE="$TARGET_DIR/.env.dev.api"; PAYLOAD_FILE="$TARGET_DIR/.douyin-env-upload.ABC123"'
          : 'real="$PAYLOAD_FILE.real"; mv "$PAYLOAD_FILE" "$real"; ln -s "$real" "$PAYLOAD_FILE"';
      const context = runRemoteTransaction({ targetContents: original, overrides });
      expectRedactedFailure(
        context,
        target === "payload"
          ? "REMOTE_PAYLOAD_INVALID"
          : "REMOTE_TARGET_STATE_INVALID",
      );
    }
  });

  test("rejects CR and NUL target text before replacement", () => {
    for (const overrides of [
      'printf "\\r" >>"$TARGET_FILE"',
      'printf "\\0" >>"$TARGET_FILE"',
    ]) {
      const context = runRemoteTransaction({
        targetContents: Buffer.from("BASE=value\n"),
        overrides,
      });
      expectRedactedFailure(context, "REMOTE_TARGET_STATE_INVALID");
      expect(readFileSync(context.target, "utf8")).not.toContain(
        "DOUYIN_COMPONENT_APP_ID=",
      );
    }
  });

  test("rejects an insecure payload mode before replacement", () => {
    const context = runRemoteTransaction({
      targetContents: Buffer.from("BASE=value\n"),
      overrides: 'chmod 644 "$PAYLOAD_FILE"',
    });
    expectRedactedFailure(context, "REMOTE_PAYLOAD_INVALID");
    expect(readFileSync(context.target, "utf8")).toBe("BASE=value\n");
  });

  test("leaves the target unchanged on an injected pre-move failure", () => {
    const original = Buffer.from("BASE=value\n");
    const context = runRemoteTransaction({
      targetContents: original,
      overrides: "before_atomic_move() { return 1; }",
    });
    expectRedactedFailure(context, "REMOTE_CANDIDATE_INVALID");
    expect(readFileSync(context.target)).toEqual(original);
    expect(backups(context.root)).toHaveLength(1);
  });

  test("does not overwrite a concurrent target change before mv", () => {
    const context = runRemoteTransaction({
      targetContents: Buffer.from("BASE=value\n"),
      overrides: 'before_atomic_move() { printf "EXTERNAL=change\\n" >>"$TARGET_FILE"; }',
    });
    expectRedactedFailure(context, "REMOTE_CONCURRENT_CHANGE");
    expect(readFileSync(context.target, "utf8")).toContain("EXTERNAL=change");
  });

  test("atomically restores the backup after an injected post-move failure", () => {
    const original = Buffer.from("BASE=value\n");
    const context = runRemoteTransaction({
      targetContents: original,
      overrides: "verify_post_move() { return 1; }",
    });
    expectRedactedFailure(context, "REMOTE_APPLY_FAILED");
    expect(readFileSync(context.target)).toEqual(original);
    expect(context.result.stdout.toString()).toContain("rollback_restored=true");
  });

  test("reports rollback failure without claiming restoration", () => {
    const context = runRemoteTransaction({
      targetContents: Buffer.from("BASE=value\n"),
      overrides: "verify_post_move() { return 1; }\nrestore_target_from_backup() { return 1; }",
    });
    expectRedactedFailure(context, "REMOTE_ROLLBACK_FAILED");
    expect(context.result.stdout.toString()).not.toContain("rollback_restored=true");
  });

  test("fails without rolling back when container identity changes externally", () => {
    const context = runRemoteTransaction({
      targetContents: Buffer.from("BASE=value\n"),
      overrides: `container_snapshot() {
  marker="$TARGET_DIR/.container-snapshot-seen"
  if [[ -e "$marker" ]]; then
    printf "changed-id|changed-start|fixed-image|healthy"
  else
    : >"$marker"
    printf "fixed-id|fixed-start|fixed-image|healthy"
  fi
}`,
    });
    expectRedactedFailure(context, "REMOTE_CONTAINER_CHANGED");
    expect(readFileSync(context.target, "utf8")).toContain(
      "DOUYIN_COMPONENT_APP_ID=",
    );
    expect(backups(context.root)).toHaveLength(1);
  });
});
```

- [ ] **Step 2：运行红灯并确认是缺少故障钩子/回滚**

Run:

```bash
bun test --cwd apps/api ../../scripts/ops/douyin-dev-env.test.ts \
  -t "remote douyin env transaction failures"
```

Expected: 分类、文本边界、并发、写后失败、回滚和容器变化测试均出现预期红灯；失败不能来自测试语法。

- [ ] **Step 3：增加候选前钩子、写后验证和有条件回滚**

Add defaults before `apply_douyin_env_transaction`:

```bash
before_atomic_move() {
  return 0
}

validate_target_text() {
  local target_file="$1"
  if contains_nul "$target_file"; then
    die REMOTE_TARGET_STATE_INVALID
    return 1
  fi
  if LC_ALL=C grep -q $'\r' "$target_file"; then
    die REMOTE_TARGET_STATE_INVALID
    return 1
  fi
  return 0
}

verify_post_move() {
  local target_file="$1"
  local expected_owner="$2"
  local candidate_sha="$3"
  local expected_payload_sha="$4"
  validate_secure_regular_file \
    "$target_file" "$expected_owner" REMOTE_TARGET_STATE_INVALID || return 1
  validate_target_text "$target_file" || return 1
  [[ "$(sha256_file "$target_file")" = "$candidate_sha" ]] || return 1
  validate_target_key_state "$target_file" || return 1
  [[ -n "$TARGET_BLOCK_PATH" && -f "$TARGET_BLOCK_PATH" ]] || return 1
  extract_target_block "$target_file" >"$TARGET_BLOCK_PATH" || return 1
  [[ "$(sha256_file "$TARGET_BLOCK_PATH")" = "$expected_payload_sha" ]]
}

restore_target_from_backup() {
  local target_dir="$1"
  local target_file="$2"
  local backup_path="$3"
  local expected_owner="$4"
  local before_sha="$5"
  RESTORE_PATH="$(mktemp "${target_dir}/.env.dev.api.restore.XXXXXX")"
  cp -p "$backup_path" "$RESTORE_PATH" || return 1
  chmod 600 "$RESTORE_PATH" || return 1
  validate_secure_regular_file \
    "$RESTORE_PATH" "$expected_owner" REMOTE_TARGET_STATE_INVALID || return 1
  [[ "$(sha256_file "$RESTORE_PATH")" = "$before_sha" ]] || return 1
  mv "$RESTORE_PATH" "$target_file" || return 1
  RESTORE_PATH=""
  [[ "$(sha256_file "$target_file")" = "$before_sha" ]] || return 1
  TARGET_REPLACED=false
}
```

Immediately before the pre-move SHA check, call:

```bash
before_atomic_move || {
  die REMOTE_CANDIDATE_INVALID
  return 1
}
[[ "$(sha256_file "$target_file")" = "$before_sha" ]] \
  || die REMOTE_CONCURRENT_CHANGE
```

Replace the direct post-move checks with:

```bash
if ! verify_post_move \
  "$target_file" "$expected_owner" "$candidate_sha" "$expected_payload_sha"; then
  if [[ "$(sha256_file "$target_file")" != "$candidate_sha" ]]; then
    die REMOTE_CONCURRENT_CHANGE
  fi
  if ! restore_target_from_backup \
    "$target_dir" "$target_file" "$BACKUP_PATH" "$expected_owner" "$before_sha"; then
    die REMOTE_ROLLBACK_FAILED
  fi
  printf 'rollback_restored=true\n'
  die REMOTE_APPLY_FAILED
fi
```

Ensure `validate_secure_regular_file` receives a context-specific error code so symlink payloads return `REMOTE_PAYLOAD_INVALID`, while target/directory symlinks return `REMOTE_TARGET_STATE_INVALID`. The function signature becomes:

```bash
validate_secure_regular_file() {
  local path="$1"
  local expected_owner="$2"
  local error_code="$3"
  [[ -f "$path" && ! -L "$path" ]] || {
    die "$error_code"
    return 1
  }
  [[ "$(file_mode "$path")" = 600 ]] || {
    die "$error_code"
    return 1
  }
  [[ "$(file_owner "$path")" = "$expected_owner" ]] || {
    die "$error_code"
    return 1
  }
}
```

Update every call with its exact code. Do not echo paths or values on failure.

The calls inside `apply_douyin_env_transaction` must be:

```bash
validate_secure_regular_file \
  "$target_file" "$expected_owner" REMOTE_TARGET_STATE_INVALID
validate_target_text "$target_file"
validate_secure_regular_file \
  "$payload_path" "$expected_owner" REMOTE_PAYLOAD_INVALID
validate_secure_regular_file \
  "$BACKUP_PATH" "$expected_owner" REMOTE_BACKUP_FAILED
validate_secure_regular_file \
  "$CANDIDATE_PATH" "$expected_owner" REMOTE_CANDIDATE_INVALID
```

Repeat the target and payload calls after acquiring `flock`; no two-argument call may remain:

```bash
if rg -n 'validate_secure_regular_file "[^"]+" "[^"]+"$' \
  scripts/ops/apply-douyin-dev-env-remote.sh; then
  exit 1
fi
```

- [ ] **Step 4：运行全部远端测试和静态禁令**

Run:

```bash
bash -n scripts/ops/apply-douyin-dev-env-remote.sh
bun test --cwd apps/api ../../scripts/ops/douyin-dev-env.test.ts \
  -t "remote douyin env transaction"
if rg -n 'set -x|rm -rf|sed -i|sudoedit|eval|source .*env|docker (restart|stop|kill|compose)' \
  scripts/ops/apply-douyin-dev-env-remote.sh; then
  exit 1
fi
```

Expected: 所有测试 PASS，禁令扫描无输出并退出 `0`。

- [ ] **Step 5：提交远端失败保护**

```bash
git add scripts/ops/apply-douyin-dev-env-remote.sh \
  scripts/ops/douyin-dev-env.test.ts
git diff --cached --check
git commit -m "feat(douyin): 完善凭证写入回滚保护"
```

## Task 5：本机真实 TTY 隐藏交接入口

**Files:**
- Modify: `scripts/ops/douyin-dev-env.test.ts`
- Create: `scripts/ops/configure-douyin-dev-env.sh`

- [ ] **Step 1：先写固定边界和取消/成功编排测试**

Add:

```ts
const ENTRY_SCRIPT = join(import.meta.dir, "configure-douyin-dev-env.sh");

function runEntryWorkflow(overrides: string): {
  readonly root: string;
  readonly result: ReturnType<typeof Bun.spawnSync>;
} {
  const root = mkdtempSync(join(tmpdir(), "gooes-douyin-entry-test-"));
  temporaryRoots.push(root);
  const workDir = join(root, "work");
  mkdirSync(workDir);
  chmodSync(workDir, 0o700);
  const command = `
set -euo pipefail
source "$ENTRY_SCRIPT"
${overrides}
run_configure_workflow "$WORK_DIR"
`;
  const result = Bun.spawnSync(["/bin/bash", "-c", command], {
    env: {
      ...process.env,
      ENTRY_SCRIPT,
      TEST_ROOT: root,
      WORK_DIR: workDir,
    },
    stdout: "pipe",
    stderr: "pipe",
  });
  return { root, result };
}

describe("local douyin env entry", () => {
  test("hard-codes the approved host, path, TTY, and non-mutation boundary", () => {
    const source = readFileSync(ENTRY_SCRIPT, "utf8");
    expect(source).toContain('SSH_ALIAS="gooes-dev"');
    expect(source).toContain('TARGET_DIR="/opt/gooes-dev/docker"');
    expect(source).toContain('TARGET_FILE="${TARGET_DIR}/.env.dev.api"');
    expect(source).toContain("</dev/tty");
    expect(source).toContain("APPLY DOUYIN DEV ENV A01");
    expect(source).toContain("env -u DOUYIN_DEV_ENV_SOURCE_ONLY bash -s");
    expect(source).not.toMatch(/set -x|rm -rf|eval|docker (restart|stop|kill)|docker compose|gh workflow|回调/);
  });

  test("rejects production positional arguments before TTY or remote access", () => {
    const result = Bun.spawnSync(["/bin/bash", ENTRY_SCRIPT, "unexpected"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    expect(result.exitCode).not.toBe(0);
    expect(result.stdout.toString()).toBe("");
    expect(result.stderr.toString()).toBe("LOCAL_USAGE_INVALID\n");
  });

  test("cancels before upload when AppSecret confirmation differs", () => {
    const context = runEntryWorkflow(`
read_hidden_value() {
  case "$1" in
    component_app_id) printf "tt-component-abc123" ;;
    component_app_secret) printf "first-secret" ;;
    component_app_secret_confirm) printf "different-secret" ;;
    *) printf "unused" ;;
  esac
}
create_remote_upload_path() { printf "REMOTE_CALLED" >"$TEST_ROOT/remote-called"; }
`);
    expect(context.result.exitCode).not.toBe(0);
    expect(context.result.stderr.toString()).toContain("LOCAL_INPUT_INVALID");
    expect(existsSync(join(context.root, "remote-called"))).toBe(false);
    expect(context.result.stdout.toString()).not.toContain("first-secret");
    expect(context.result.stderr.toString()).not.toContain("first-secret");
  });

  test("treats TTY EOF or Ctrl-C input failure as a local cancellation", () => {
    const context = runEntryWorkflow(`
read_hidden_value() { return 1; }
create_remote_upload_path() { printf "REMOTE_CALLED" >"$TEST_ROOT/remote-called"; }
`);
    expect(context.result.exitCode).not.toBe(0);
    expect(context.result.stderr.toString()).toContain("LOCAL_INPUT_INVALID");
    expect(existsSync(join(context.root, "remote-called"))).toBe(false);
    expect(existsSync(join(context.root, "work"))).toBe(false);
  });

  test("cancels before upload when the confirmation phrase is wrong", () => {
    const context = runEntryWorkflow(`
read_hidden_value() {
  case "$1" in
    component_app_id) printf "tt-component-abc123" ;;
    component_app_secret|component_app_secret_confirm) printf "component-secret-sentinel" ;;
    template_app_id) printf "tt-template-xyz789" ;;
    template_app_secret|template_app_secret_confirm) printf "template-secret-sentinel" ;;
  esac
}
read_confirmation() { printf "NO"; }
show_confirmation_prompt() { return 0; }
create_remote_upload_path() { printf "REMOTE_CALLED" >"$TEST_ROOT/remote-called"; }
`);
    expect(context.result.exitCode).not.toBe(0);
    expect(context.result.stderr.toString()).toContain("LOCAL_CONFIRMATION_REJECTED");
    expect(existsSync(join(context.root, "remote-called"))).toBe(false);
  });

  test("builds a mode-600 validated payload and passes only path plus digest remotely", () => {
    const context = runEntryWorkflow(`
read_hidden_value() {
  case "$1" in
    component_app_id) printf "tt-component-abc123" ;;
    component_app_secret|component_app_secret_confirm) printf "component-secret-sentinel" ;;
    template_app_id) printf "tt-template-xyz789" ;;
    template_app_secret|template_app_secret_confirm) printf "template-secret-sentinel" ;;
  esac
}
read_confirmation() { printf "APPLY DOUYIN DEV ENV A01"; }
show_confirmation_prompt() { return 0; }
generate_message_token() { printf "0123456789abcdef0123456789abcdef"; }
generate_message_aes_key() { printf "QUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUE"; }
generate_credential_key() { printf "QkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkI="; }
generate_subject_hash_key() { printf "%064d" 0; }
create_remote_upload_path() { printf "/opt/gooes-dev/docker/.douyin-env-upload.ABC123"; }
copy_remote_payload() {
  test "$(file_mode "$1")" = 600
  cp "$1" "$TEST_ROOT/copied-payload"
}
run_remote_apply() {
  printf "%s\\n%s\\n" "$1" "$2" >"$TEST_ROOT/remote-args"
  printf "remote_cleanup=true\\n"
}
cleanup_remote_upload() { return 0; }
`);
    expect(context.result.exitCode).toBe(0);
    expect(readFileSync(join(context.root, "copied-payload"))).toEqual(payload({
      ...validValues(),
      DOUYIN_SUBJECT_HASH_KEY: "0".repeat(64),
    }));
    const args = readFileSync(join(context.root, "remote-args"), "utf8");
    expect(args).toMatch(/^\/opt\/gooes-dev\/docker\/\.douyin-env-upload\.[A-Za-z0-9]+\n[a-f0-9]{64}\n$/);
    for (const secret of SECRET_SENTINELS) {
      expect(context.result.stdout.toString()).not.toContain(secret);
      expect(context.result.stderr.toString()).not.toContain(secret);
    }
    expect(existsSync(join(context.root, "work"))).toBe(false);
  });

  test("cleans the exact remote upload and local workdir after upload failure", () => {
    const context = runEntryWorkflow(`
read_hidden_value() {
  case "$1" in
    component_app_id) printf "tt-component-abc123" ;;
    component_app_secret|component_app_secret_confirm) printf "component-secret-sentinel" ;;
    template_app_id) printf "tt-template-xyz789" ;;
    template_app_secret|template_app_secret_confirm) printf "template-secret-sentinel" ;;
  esac
}
read_confirmation() { printf "APPLY DOUYIN DEV ENV A01"; }
show_confirmation_prompt() { return 0; }
generate_message_token() { printf "0123456789abcdef0123456789abcdef"; }
generate_message_aes_key() { printf "QUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUE"; }
generate_credential_key() { printf "QkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkI="; }
generate_subject_hash_key() { printf "%064d" 0; }
create_remote_upload_path() { printf "/opt/gooes-dev/docker/.douyin-env-upload.ABC123"; }
copy_remote_payload() { return 1; }
cleanup_remote_upload() {
  printf "%s\\n" "$1" >"$TEST_ROOT/remote-cleanup"
}
`);
    expect(context.result.exitCode).not.toBe(0);
    expect(context.result.stderr.toString()).toContain("REMOTE_UPLOAD_FAILED");
    expect(readFileSync(join(context.root, "remote-cleanup"), "utf8")).toBe(
      "/opt/gooes-dev/docker/.douyin-env-upload.ABC123\n",
    );
    expect(existsSync(join(context.root, "work"))).toBe(false);
    for (const secret of SECRET_SENTINELS) {
      expect(context.result.stdout.toString()).not.toContain(secret);
      expect(context.result.stderr.toString()).not.toContain(secret);
    }
  });
});
```

- [ ] **Step 2：运行红灯并确认本机入口缺失**

Run:

```bash
bun test --cwd apps/api ../../scripts/ops/douyin-dev-env.test.ts \
  -t "local douyin env entry"
```

Expected: FAIL，原因是 `configure-douyin-dev-env.sh` 不存在。

- [ ] **Step 3：实现 Bash 3.2 入口和测试缝**

Create `scripts/ops/configure-douyin-dev-env.sh` with:

```bash
#!/usr/bin/env bash
set -euo pipefail
umask 077

SSH_ALIAS="gooes-dev"
LOGICAL_SERVER="gooes-dev-vm-0-11"
TARGET_DIR="/opt/gooes-dev/docker"
TARGET_FILE="${TARGET_DIR}/.env.dev.api"
CONFIRMATION_PHRASE="APPLY DOUYIN DEV ENV A01"
REMOTE_UPLOAD_PATH=""
LOCAL_PAYLOAD_PATH=""
LOCAL_WORK_DIR=""
REMOTE_APPLY_STARTED=false

entry_die() {
  printf '%s\n' "$1" >&2
  return 1
}

file_mode() {
  stat -f '%Lp' "$1" 2>/dev/null || stat -c '%a' "$1"
}

read_hidden_value() {
  local field="$1"
  local value
  printf '%s: ' "$field" >/dev/tty
  IFS= read -r -s value </dev/tty || return 1
  printf '\n' >/dev/tty
  printf '%s' "$value"
}

read_confirmation() {
  local value
  IFS= read -r value </dev/tty || return 1
  printf '%s' "$value"
}

show_confirmation_prompt() {
  printf 'Type exactly: %s\n' "$CONFIRMATION_PHRASE" >/dev/tty
}

generate_message_token() {
  openssl rand -hex 16
}

generate_message_aes_key() {
  local value
  value="$(openssl rand -base64 32)"
  printf '%s' "${value%=}"
}

generate_credential_key() {
  openssl rand -base64 32
}

generate_subject_hash_key() {
  openssl rand -hex 32
}

payload_sha256() {
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | awk '{print $1}'
  else
    sha256sum "$1" | awk '{print $1}'
  fi
}

validate_local_payload() {
  local repo_root="$1"
  local payload_path="$2"
  (
    cd "${repo_root}/apps/api"
    bun ../../scripts/ops/douyin-dev-env.ts validate --payload "$payload_path"
  )
}

create_remote_upload_path() {
  ssh "$SSH_ALIAS" "umask 077; mktemp '${TARGET_DIR}/.douyin-env-upload.XXXXXX'"
}

copy_remote_payload() {
  local payload_path="$1"
  local remote_path="$2"
  scp -q -p "$payload_path" "${SSH_ALIAS}:${remote_path}"
}

run_remote_apply() {
  local remote_path="$1"
  local payload_sha="$2"
  local remote_script="$3"
  ssh "$SSH_ALIAS" \
    "env -u DOUYIN_DEV_ENV_SOURCE_ONLY bash -s -- '${remote_path}' '${payload_sha}'" \
    <"$remote_script"
}

cleanup_remote_upload() {
  local remote_path="$1"
  [[ -z "$remote_path" ]] && return 0
  [[ "$remote_path" =~ ^/opt/gooes-dev/docker/\.douyin-env-upload\.[A-Za-z0-9]+$ ]] \
    || return 1
  ssh "$SSH_ALIAS" \
    "if [ -e '${remote_path}' ] || [ -L '${remote_path}' ]; then rm '${remote_path}'; fi"
}

cleanup_local_paths() {
  local failed=0
  if [[ -n "$LOCAL_PAYLOAD_PATH" && ( -e "$LOCAL_PAYLOAD_PATH" || -L "$LOCAL_PAYLOAD_PATH" ) ]]; then
    rm "$LOCAL_PAYLOAD_PATH" || failed=1
  fi
  if [[ -n "$LOCAL_WORK_DIR" && -d "$LOCAL_WORK_DIR" ]]; then
    rmdir "$LOCAL_WORK_DIR" || failed=1
  fi
  [[ "$failed" -eq 0 ]]
}

entry_cleanup_and_exit() {
  local status=$?
  local cleanup_failed=0
  trap - EXIT HUP INT TERM
  cleanup_remote_upload "$REMOTE_UPLOAD_PATH" || cleanup_failed=1
  cleanup_local_paths || cleanup_failed=1
  if [[ "$cleanup_failed" -eq 0 ]]; then
    printf 'local_cleanup=true\n'
    exit "$status"
  fi
  printf '%s\n' CLEANUP_FAILED >&2
  if [[ "$REMOTE_APPLY_STARTED" = true ]]; then
    printf '%s\n' 'target_may_be_updated=true' >&2
  fi
  exit 74
}
```

Implement the workflow with no value logging:

```bash
run_configure_workflow() {
  local work_dir="$1"
  local repo_root="${2:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
  local component_app_id component_secret component_secret_confirm
  local template_app_id template_secret template_secret_confirm
  local message_token message_aes_key credential_key subject_hash_key
  local metadata payload_sha confirmation key

  LOCAL_WORK_DIR="$work_dir"
  LOCAL_PAYLOAD_PATH="${work_dir}/douyin.env.payload"
  trap entry_cleanup_and_exit EXIT
  trap 'exit 129' HUP
  trap 'exit 130' INT
  trap 'exit 143' TERM

  [[ -d "$work_dir" && ! -L "$work_dir" ]] || entry_die LOCAL_FILE_INVALID
  [[ "$(file_mode "$work_dir")" = 700 ]] || entry_die LOCAL_FILE_INVALID

  component_app_id="$(read_hidden_value component_app_id)" \
    || entry_die LOCAL_INPUT_INVALID
  component_secret="$(read_hidden_value component_app_secret)" \
    || entry_die LOCAL_INPUT_INVALID
  component_secret_confirm="$(read_hidden_value component_app_secret_confirm)" \
    || entry_die LOCAL_INPUT_INVALID
  [[ "$component_secret" = "$component_secret_confirm" ]] \
    || entry_die LOCAL_INPUT_INVALID
  template_app_id="$(read_hidden_value template_app_id)" \
    || entry_die LOCAL_INPUT_INVALID
  template_secret="$(read_hidden_value template_app_secret)" \
    || entry_die LOCAL_INPUT_INVALID
  template_secret_confirm="$(read_hidden_value template_app_secret_confirm)" \
    || entry_die LOCAL_INPUT_INVALID
  [[ "$template_secret" = "$template_secret_confirm" ]] \
    || entry_die LOCAL_INPUT_INVALID

  message_token="$(generate_message_token)" || entry_die LOCAL_RANDOM_FAILED
  message_aes_key="$(generate_message_aes_key)" || entry_die LOCAL_RANDOM_FAILED
  credential_key="$(generate_credential_key)" || entry_die LOCAL_RANDOM_FAILED
  subject_hash_key="$(generate_subject_hash_key)" || entry_die LOCAL_RANDOM_FAILED

  (
    umask 077
    printf '%s=%s\n' DOUYIN_COMPONENT_APP_ID "$component_app_id"
    printf '%s=%s\n' DOUYIN_COMPONENT_APP_SECRET "$component_secret"
    printf '%s=%s\n' DOUYIN_COMPONENT_MESSAGE_TOKEN "$message_token"
    printf '%s=%s\n' DOUYIN_COMPONENT_MESSAGE_AES_KEY "$message_aes_key"
    printf '%s=%s\n' DOUYIN_TEMPLATE_APP_ID "$template_app_id"
    printf '%s=%s\n' DOUYIN_TEMPLATE_APP_SECRET "$template_secret"
    printf '%s={"v1":"%s"}\n' DOUYIN_CREDENTIAL_KEYS_JSON "$credential_key"
    printf '%s=%s\n' DOUYIN_CREDENTIAL_ACTIVE_KEY_VERSION v1
    printf '%s=%s\n' DOUYIN_SUBJECT_HASH_KEY "$subject_hash_key"
  ) >"$LOCAL_PAYLOAD_PATH"
  chmod 600 "$LOCAL_PAYLOAD_PATH"
  unset component_app_id component_secret component_secret_confirm
  unset template_app_id template_secret template_secret_confirm
  unset message_token message_aes_key credential_key subject_hash_key

  [[ -f "$LOCAL_PAYLOAD_PATH" && ! -L "$LOCAL_PAYLOAD_PATH" ]] \
    || entry_die LOCAL_FILE_INVALID
  [[ "$(file_mode "$LOCAL_PAYLOAD_PATH")" = 600 ]] \
    || entry_die LOCAL_FILE_INVALID
  metadata="$(validate_local_payload "$repo_root" "$LOCAL_PAYLOAD_PATH")" \
    || entry_die LOCAL_CONFIG_INVALID
  payload_sha="$(payload_sha256 "$LOCAL_PAYLOAD_PATH")" \
    || entry_die LOCAL_CONFIG_INVALID

  printf 'environment=development\n'
  printf 'logical_server=%s\n' "$LOGICAL_SERVER"
  printf 'target=%s\n' "$TARGET_FILE"
  printf 'keys=%s\n' "${#DOUYIN_ENV_KEYS[@]}"
  for key in "${DOUYIN_ENV_KEYS[@]}"; do
    printf 'key=%s\n' "$key"
  done
  printf '%s\n' 'effects=no-restart,no-deploy,no-callback'
  printf '%s\n' "$metadata"
  show_confirmation_prompt
  confirmation="$(read_confirmation)" || entry_die LOCAL_CONFIRMATION_REJECTED
  [[ "$confirmation" = "$CONFIRMATION_PHRASE" ]] \
    || entry_die LOCAL_CONFIRMATION_REJECTED

  REMOTE_UPLOAD_PATH="$(create_remote_upload_path)" \
    || entry_die REMOTE_PREFLIGHT_FAILED
  [[ "$REMOTE_UPLOAD_PATH" =~ ^/opt/gooes-dev/docker/\.douyin-env-upload\.[A-Za-z0-9]+$ ]] \
    || entry_die REMOTE_PREFLIGHT_FAILED
  copy_remote_payload "$LOCAL_PAYLOAD_PATH" "$REMOTE_UPLOAD_PATH" \
    || entry_die REMOTE_UPLOAD_FAILED
  REMOTE_APPLY_STARTED=true
  run_remote_apply \
    "$REMOTE_UPLOAD_PATH" "$payload_sha" \
    "${repo_root}/scripts/ops/apply-douyin-dev-env-remote.sh" \
    || entry_die REMOTE_APPLY_FAILED
}
```

Define the same nine-key array locally and add `main`:

```bash
DOUYIN_ENV_KEYS=(
  DOUYIN_COMPONENT_APP_ID
  DOUYIN_COMPONENT_APP_SECRET
  DOUYIN_COMPONENT_MESSAGE_TOKEN
  DOUYIN_COMPONENT_MESSAGE_AES_KEY
  DOUYIN_TEMPLATE_APP_ID
  DOUYIN_TEMPLATE_APP_SECRET
  DOUYIN_CREDENTIAL_KEYS_JSON
  DOUYIN_CREDENTIAL_ACTIVE_KEY_VERSION
  DOUYIN_SUBJECT_HASH_KEY
)

main() {
  local repo_root work_dir tool
  [[ "$#" -eq 0 ]] || entry_die LOCAL_USAGE_INVALID
  for tool in bun openssl ssh scp mktemp chmod stat awk shasum dirname rm rmdir; do
    command -v "$tool" >/dev/null || entry_die LOCAL_PREFLIGHT_FAILED
  done
  [[ -r /dev/tty && -w /dev/tty ]] || entry_die LOCAL_TTY_REQUIRED
  repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
  work_dir="$(umask 077; mktemp -d "${TMPDIR:-/tmp}/gooes-douyin-env.XXXXXX")"
  run_configure_workflow "$work_dir" "$repo_root"
}

if [[ "${BASH_SOURCE[0]}" = "$0" ]]; then
  main "$@"
fi
```

Do not make the test source-only path reachable through a production environment variable. Keep all remote target constants immutable in the direct `main`.

- [ ] **Step 4：修正测试适配器后运行绿灯**

Run:

```bash
/bin/bash -n scripts/ops/configure-douyin-dev-env.sh
/bin/bash -n scripts/ops/apply-douyin-dev-env-remote.sh
bun test --cwd apps/api ../../scripts/ops/douyin-dev-env.test.ts
```

Expected: 全部 PASS。确认成功测试的 `root` 在 helper 返回后可读取测试产物，生产 workflow 退出时只清理它自己创建的 payload/workdir。

- [ ] **Step 5：执行真实 OpenSSL 形状检查但不打印值**

Run:

```bash
token="$(openssl rand -hex 16)"
aes="$(openssl rand -base64 32)"
aes="${aes%=}"
credential="$(openssl rand -base64 32)"
subject="$(openssl rand -hex 32)"
test "${#token}" -eq 32
test "${#aes}" -eq 43
test "${#credential}" -eq 44
test "${#subject}" -eq 64
unset token aes credential subject
printf 'openssl-douyin-shapes=true\n'
```

Expected: 只输出 `openssl-douyin-shapes=true`。

- [ ] **Step 6：提交本机入口**

```bash
git add scripts/ops/configure-douyin-dev-env.sh \
  scripts/ops/douyin-dev-env.test.ts
git diff --cached --check
git commit -m "feat(douyin): 增加开发凭证隐藏交接入口"
```

## Task 6：完整软件门禁与实施验收

**Files:**
- Verify only: the four `scripts/ops/douyin-dev-env*` / `apply-douyin-dev-env-remote.sh` files
- Preserve unstaged: `docs/operations/evidence/2026-07-20-douyin-dev-e2e.md`

- [ ] **Step 1：运行目标工具的全部检查**

Run:

```bash
/bin/bash -n scripts/ops/configure-douyin-dev-env.sh
/bin/bash -n scripts/ops/apply-douyin-dev-env-remote.sh
bun test --cwd apps/api ../../scripts/ops/douyin-dev-env.test.ts
bun test --cwd apps/api src/services/douyin-miniapp/config.test.ts
```

Expected: 全部退出 `0`，没有警告或跳过。

- [ ] **Step 2：运行项目门禁**

Run:

```bash
bun run douyin-mini:check
bun run api:check
bun run test
```

Expected: 三条命令全部退出 `0`。新 ops 测试不在稳定根测试自动发现目录中，因此第一步的显式运行不可省略。

- [ ] **Step 3：运行安全、范围和差异扫描**

Run:

```bash
git diff --check
if rg -n 'set -x|rm -rf|sed -i|sudoedit|eval|docker (restart|stop|kill)|docker compose|gh workflow' \
  scripts/ops/configure-douyin-dev-env.sh \
  scripts/ops/apply-douyin-dev-env-remote.sh; then
  exit 1
fi
if rg -n 'DOUYIN_(COMPONENT_APP_SECRET|TEMPLATE_APP_SECRET|COMPONENT_MESSAGE_TOKEN|COMPONENT_MESSAGE_AES_KEY|CREDENTIAL_KEYS_JSON|SUBJECT_HASH_KEY)=[^"$]' \
  scripts/ops/configure-douyin-dev-env.sh \
  scripts/ops/apply-douyin-dev-env-remote.sh; then
  exit 1
fi
git status --short
```

Expected:

- 两个禁令扫描无输出；
- `git diff --check` 退出 `0`；
- 所有实现提交完成后，唯一未提交改动仍是证据文件；
- 没有修改 migration、部署配置或 `orange`。

- [ ] **Step 4：固定待执行 SHA 和只读远端基线**

Run:

```bash
FULL_SHA="$(git rev-parse HEAD)"
test "${#FULL_SHA}" -eq 40
test "$(git status --short)" = " M docs/operations/evidence/2026-07-20-douyin-dev-e2e.md"
printf 'implementation_sha=%s\n' "$FULL_SHA"
ssh gooes-dev '
  test "$(stat -c %a /opt/gooes-dev/docker/.env.dev.api)" = 600
  test "$(stat -c %U:%G /opt/gooes-dev/docker/.env.dev.api)" = ubuntu:ubuntu
  docker inspect --format "container_state={{.State.Status}} container_health={{if .State.Health}}{{.State.Health.Status}}{{end}}" gooes-api-dev
'
```

Expected: 输出完整实施 SHA、`running / healthy`，不输出任何环境值。

## Task 7：用户执行 A01 与脱敏证据核验

**External state:**
- Write: `gooes-dev-vm-0-11:/opt/gooes-dev/docker/.env.dev.api`
- Create and retain: one `.env.dev.api.backup-YYYYMMDDHHMMSS`
- No restart, deployment, callback, database, audit, or publish

- [ ] **Step 1：显示已经获批的精确动作边界**

Before execution, restate:

```text
A01 / development
logical server: gooes-dev-vm-0-11
SSH alias: gooes-dev
target: /opt/gooes-dev/docker/.env.dev.api
effect: generate five development secrets and atomically update exactly nine DOUYIN_* keys
non-effects: no restart, no deploy, no callback, no database, no audit, no publish
recovery: retained timestamp backup; restoring it and restarting/deploying remain separately authorized actions
```

The existing authorization text is exact for this action. If target, host, key set, or effect changes, stop and obtain a new authorization.

- [ ] **Step 2：用户在自己的 Terminal 执行单一命令**

User runs from the isolated worktree:

```bash
bash scripts/ops/configure-douyin-dev-env.sh
```

Expected interaction:

1. four console values are hidden;
2. each AppSecret is entered twice;
3. no value is echoed;
4. summary shows only fixed target, AppID tails/short flags, key count and non-effects;
5. user types `APPLY DOUYIN DEV ENV A01`;
6. command exits `0` and prints the allowed booleans, backup path/hash and cleanup results.

The user may paste the program's non-sensitive result lines into chat, but must not paste any prompt input or environment-file content.

- [ ] **Step 3：只读复核远端结果，不读取值**

Run only after the user's command exits:

```bash
ssh gooes-dev '
  set -eu
  target=/opt/gooes-dev/docker/.env.dev.api
  test -f "$target"
  test ! -L "$target"
  test "$(stat -c %a "$target")" = 600
  test "$(stat -c %U:%G "$target")" = ubuntu:ubuntu
  awk -F= "
    BEGIN {
      required[\"DOUYIN_COMPONENT_APP_ID\"]=1
      required[\"DOUYIN_COMPONENT_APP_SECRET\"]=1
      required[\"DOUYIN_COMPONENT_MESSAGE_TOKEN\"]=1
      required[\"DOUYIN_COMPONENT_MESSAGE_AES_KEY\"]=1
      required[\"DOUYIN_TEMPLATE_APP_ID\"]=1
      required[\"DOUYIN_TEMPLATE_APP_SECRET\"]=1
      required[\"DOUYIN_CREDENTIAL_KEYS_JSON\"]=1
      required[\"DOUYIN_CREDENTIAL_ACTIVE_KEY_VERSION\"]=1
      required[\"DOUYIN_SUBJECT_HASH_KEY\"]=1
    }
    \$1 ~ /^DOUYIN_/ {
      if (!(\$1 in required)) exit 1
      seen[\$1]++
    }
    END {
      for (key in required) if (seen[key] != 1) exit 1
      print \"nine_keys_valid=true\"
    }
  " "$target"
  test "$(docker inspect --format "{{.State.Status}}" gooes-api-dev)" = running
  test "$(docker inspect --format "{{if .State.Health}}{{.State.Health.Status}}{{end}}" gooes-api-dev)" = healthy
  printf "target_mode_600=true\n"
  printf "target_owner_ubuntu=true\n"
  printf "container_healthy=true\n"
'
```

Expected: only four boolean lines; no values.

Use the two non-sensitive `backup=` and `backup_sha256=` lines printed by the tool to verify the retained backup without exposing file contents:

```bash
IFS= read -r -p 'Paste the exact backup= line: ' backup_line
IFS= read -r -p 'Paste the exact backup_sha256= line: ' backup_sha_line
backup_path="${backup_line#backup=}"
backup_sha="${backup_sha_line#backup_sha256=}"
test "$backup_line" = "backup=${backup_path}"
test "$backup_sha_line" = "backup_sha256=${backup_sha}"
printf '%s\n' "$backup_path" \
  | rg -q '^/opt/gooes-dev/docker/\.env\.dev\.api\.backup-[0-9]{14}$'
printf '%s\n' "$backup_sha" | rg -q '^[a-f0-9]{64}$'
remote_backup_sha="$(ssh gooes-dev \
  "test -f '${backup_path}' && test ! -L '${backup_path}' && \
   test \"\$(stat -c %a '${backup_path}')\" = 600 && \
   test \"\$(stat -c %U:%G '${backup_path}')\" = ubuntu:ubuntu && \
   sha256sum '${backup_path}' | awk '{print \$1}'")"
test "$remote_backup_sha" = "$backup_sha"
printf 'backup_retained=true\n'
unset backup_line backup_sha_line backup_path backup_sha remote_backup_sha
```

Expected: only `backup_retained=true`. The path is validated against the fixed directory and timestamp form before interpolation into SSH.

- [ ] **Step 4：把真实非敏感结果写入证据文件**

Use `apply_patch` to update A01's row and the Task 6 evidence section with the actual execution time, implementation SHA, authorization quote reference, AppID tails, backup path/hash, nine-key/mode/owner/container/cleanup booleans. Do not invent unavailable values and do not include any complete AppID, Secret, Token, AES Key, keyring, subject key, Ticket or environment-file hash-to-value mapping.

Then verify the evidence diff separately:

```bash
git diff --check
git diff -- docs/operations/evidence/2026-07-20-douyin-dev-e2e.md
git status --short
```

Expected: evidence contains only the approved non-sensitive schema. Keep it out of all implementation commits; review it before deciding whether to create a separate `docs(douyin): 记录 A01 开发配置证据` commit.

- [ ] **Step 5：停在 A01，不借用授权继续 A02**

Report A01 result and the exact implementation SHA. Do not push the branch, trigger deployment, configure callbacks or proceed to A02 until its own action-time authorization is obtained.

## 最终完成判据

This plan is complete only when:

- every new production function was preceded by a failing test and the red failure reason was observed;
- the four approved implementation files exist and no unapproved file changed;
- target ops tests, API config tests, API checks, miniapp checks and stable root tests all pass;
- production scripts pass the secret/destructive-command scans;
- user-run A01 exits `0`;
- remote read-only verification proves exactly nine keys, `600`, `ubuntu:ubuntu`, retained backup and a healthy unchanged container identity;
- evidence contains only observed non-sensitive metadata;
- no restart, deployment, callback, database write, audit or publication occurred.
