# Root Test Orchestration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add reliable root-level Bun commands for the stable test gate and package-isolated all-workspace diagnostics.

**Architecture:** A focused TypeScript runner discovers only top-level release-contract tests and builds explicit workspace suites with package-local working directories. Pure suite construction and injected execution dependencies keep orchestration behavior unit-testable, while the CLI uses the installed Bun 1.3.2 `spawn` API to stream child output, continue after failures, and emit one aggregate status.

**Tech Stack:** Bun 1.3.2, TypeScript, `bun:test`, Node.js filesystem/path APIs

---

## File Map

- Create `scripts/run-workspace-tests.ts`: define modes and suites, discover root contracts, execute each suite sequentially, summarize results, and expose the CLI.
- Create `scripts/run-workspace-tests.test.ts`: lock suite boundaries, E2E exclusion, CLI validation, failure continuation, and root package script contracts.
- Modify `package.json`: expose `test` for the stable gate and `test:all` for diagnostic all-workspace execution.

### Task 1: Define the orchestration contract

**Files:**
- Create: `scripts/run-workspace-tests.test.ts`
- Test: `scripts/run-workspace-tests.test.ts`

- [ ] **Step 1: Write the failing suite and execution tests**

Create `scripts/run-workspace-tests.test.ts` with the following content. The fake repository root and injected executor keep this contract independent from the machine filesystem and child processes.

```ts
import { describe, expect, it } from "bun:test";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  buildTestSuites,
  discoverRootContractTests,
  runCli,
  runTestSuites,
  type RunnerDependencies,
  type TestMode,
  type TestSuite,
} from "./run-workspace-tests";

const repoRoot = "/repo";
const rootContractTests = [
  "./scripts/z-last.test.ts",
  "./scripts/a-first.test.ts",
];

function build(mode: TestMode): TestSuite[] {
  return buildTestSuites(mode, { repoRoot, rootContractTests });
}

describe("workspace test suite selection", () => {
  it("builds the stable gate with sorted release contracts, domain, and web", () => {
    expect(build("stable")).toEqual([
      {
        name: "release-contracts",
        cwd: repoRoot,
        targets: [
          "./scripts/a-first.test.ts",
          "./scripts/z-last.test.ts",
        ],
      },
      {
        name: "domain",
        cwd: join(repoRoot, "packages/domain"),
        targets: ["./src"],
      },
      {
        name: "web",
        cwd: join(repoRoot, "apps/web"),
        targets: ["./tests"],
      },
    ]);
  });

  it("builds all-workspace diagnostics with package-local targets", () => {
    expect(build("all")).toEqual([
      {
        name: "release-contracts",
        cwd: repoRoot,
        targets: [
          "./scripts/a-first.test.ts",
          "./scripts/z-last.test.ts",
        ],
      },
      {
        name: "domain",
        cwd: join(repoRoot, "packages/domain"),
        targets: ["./src"],
      },
      {
        name: "api",
        cwd: join(repoRoot, "apps/api"),
        targets: ["./src"],
      },
      {
        name: "admin",
        cwd: join(repoRoot, "apps/admin"),
        targets: ["./app", "./components", "./lib", "./tests"],
      },
      {
        name: "web",
        cwd: join(repoRoot, "apps/web"),
        targets: ["./tests", "./components"],
      },
    ]);
  });

  it("does not expose Playwright E2E directories to Bun test", () => {
    for (const mode of ["stable", "all"] as const) {
      const targets = build(mode).flatMap((suite) => suite.targets);
      expect(targets.some((target) => target.includes("e2e"))).toBe(false);
    }
  });

  it("discovers only sorted top-level release contract tests", () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "gooes-root-tests-"));
    try {
      mkdirSync(join(tempRoot, "scripts/nested"), { recursive: true });
      writeFileSync(join(tempRoot, "scripts/z-last.test.ts"), "");
      writeFileSync(join(tempRoot, "scripts/a-first.test.ts"), "");
      writeFileSync(join(tempRoot, "scripts/nested/a-first.test.ts"), "");
      writeFileSync(join(tempRoot, "scripts/not-a-test.ts"), "");
      writeFileSync(join(tempRoot, "scripts/nested/ignored.test.ts"), "");

      expect(discoverRootContractTests(tempRoot)).toEqual([
        "./scripts/a-first.test.ts",
        "./scripts/z-last.test.ts",
      ]);
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });
});

describe("workspace test execution", () => {
  it("continues after a failed suite and returns one aggregate failure", async () => {
    const suites: TestSuite[] = [
      { name: "first", cwd: repoRoot, targets: ["first"] },
      { name: "second", cwd: repoRoot, targets: ["second"] },
      { name: "third", cwd: repoRoot, targets: ["third"] },
    ];
    const executionOrder: string[] = [];
    const logs: string[] = [];

    const exitCode = await runTestSuites(suites, {
      execute: async (suite) => {
        executionOrder.push(suite.name);
        return suite.name === "second" ? 1 : 0;
      },
      log: (message) => logs.push(message),
      error: (message) => logs.push(message),
    });

    expect(executionOrder).toEqual(["first", "second", "third"]);
    expect(exitCode).toBe(1);
    expect(logs.some((message) => message.includes("second: FAIL"))).toBe(true);
    expect(logs.some((message) => message.includes("third: PASS"))).toBe(true);
  });

  it("rejects an invalid mode before discovery or execution", async () => {
    let discoveryCount = 0;
    let executionCount = 0;
    const dependencies: RunnerDependencies = {
      discoverRootContractTests: () => {
        discoveryCount += 1;
        return rootContractTests;
      },
      execute: async () => {
        executionCount += 1;
        return 0;
      },
      log: () => undefined,
      error: () => undefined,
    };

    expect(await runCli(["--unknown"], dependencies, repoRoot)).toBe(2);
    expect(discoveryCount).toBe(0);
    expect(executionCount).toBe(0);
  });

  it("returns configuration status 2 before execution when no contracts exist", async () => {
    let executionCount = 0;
    const dependencies: RunnerDependencies = {
      discoverRootContractTests: () => [],
      execute: async () => {
        executionCount += 1;
        return 0;
      },
      log: () => undefined,
      error: () => undefined,
    };

    expect(await runCli(["--stable"], dependencies, repoRoot)).toBe(2);
    expect(executionCount).toBe(0);
  });
});
```

- [ ] **Step 2: Run the contract test and verify the RED state**

Run:

```bash
bun test scripts/run-workspace-tests.test.ts
```

Expected: FAIL with `Cannot find module './run-workspace-tests'`. This confirms the contract is active before implementation.

- [ ] **Step 3: Commit the failing contract**

```bash
git add scripts/run-workspace-tests.test.ts
git commit -m "test(test): 定义根级测试编排契约"
```

### Task 2: Implement the typed Bun runner

**Files:**
- Create: `scripts/run-workspace-tests.ts`
- Test: `scripts/run-workspace-tests.test.ts`

- [ ] **Step 1: Implement suite discovery, construction, aggregation, and CLI validation**

Create `scripts/run-workspace-tests.ts` with the following content:

```ts
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export type TestMode = "stable" | "all";

export interface TestSuite {
  name: string;
  cwd: string;
  targets: string[];
}

export interface SuiteConfiguration {
  repoRoot: string;
  rootContractTests: readonly string[];
}

export interface ExecutionDependencies {
  execute(suite: TestSuite): Promise<number>;
  log(message: string): void;
  error(message: string): void;
}

export interface RunnerDependencies extends ExecutionDependencies {
  discoverRootContractTests(repoRoot: string): readonly string[];
}

export const REPOSITORY_ROOT = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
);

export function discoverRootContractTests(repoRoot: string): string[] {
  return readdirSync(join(repoRoot, "scripts"), { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".test.ts"))
    .map((entry) => `./scripts/${entry.name}`)
    .sort();
}

export function buildTestSuites(
  mode: TestMode,
  configuration: SuiteConfiguration,
): TestSuite[] {
  const { repoRoot } = configuration;
  const rootContractTests = [...configuration.rootContractTests].sort();
  if (rootContractTests.length === 0) {
    throw new Error("未发现 scripts/*.test.ts 发布契约测试");
  }

  const releaseContracts: TestSuite = {
    name: "release-contracts",
    cwd: repoRoot,
    targets: rootContractTests,
  };
  const domain: TestSuite = {
    name: "domain",
    cwd: join(repoRoot, "packages/domain"),
    targets: ["./src"],
  };

  if (mode === "stable") {
    return [
      releaseContracts,
      domain,
      {
        name: "web",
        cwd: join(repoRoot, "apps/web"),
        targets: ["./tests"],
      },
    ];
  }

  return [
    releaseContracts,
    domain,
    {
      name: "api",
      cwd: join(repoRoot, "apps/api"),
      targets: ["./src"],
    },
    {
      name: "admin",
      cwd: join(repoRoot, "apps/admin"),
      targets: ["./app", "./components", "./lib", "./tests"],
    },
    {
      name: "web",
      cwd: join(repoRoot, "apps/web"),
      targets: ["./tests", "./components"],
    },
  ];
}

export function parseMode(args: readonly string[]): TestMode {
  if (args.length === 1 && args[0] === "--stable") return "stable";
  if (args.length === 1 && args[0] === "--all") return "all";
  throw new Error("用法: bun scripts/run-workspace-tests.ts --stable|--all");
}

export async function runTestSuites(
  suites: readonly TestSuite[],
  dependencies: ExecutionDependencies,
): Promise<number> {
  const results: Array<{ name: string; exitCode: number }> = [];

  for (const suite of suites) {
    dependencies.log(`\n=== ${suite.name} ===`);
    let exitCode = 1;
    try {
      exitCode = await dependencies.execute(suite);
    } catch (error) {
      dependencies.error(
        `${suite.name} 启动失败: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
    results.push({ name: suite.name, exitCode });
  }

  dependencies.log("\n=== 测试汇总 ===");
  for (const result of results) {
    dependencies.log(
      `${result.name}: ${result.exitCode === 0 ? "PASS" : `FAIL (${result.exitCode})`}`,
    );
  }

  return results.every((result) => result.exitCode === 0) ? 0 : 1;
}

async function executeSuite(suite: TestSuite): Promise<number> {
  const child = Bun.spawn(["bun", "test", ...suite.targets], {
    cwd: suite.cwd,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  return child.exited;
}

const defaultDependencies: RunnerDependencies = {
  discoverRootContractTests,
  execute: executeSuite,
  log: console.log,
  error: console.error,
};

export async function runCli(
  args: readonly string[],
  dependencies: RunnerDependencies = defaultDependencies,
  repoRoot = REPOSITORY_ROOT,
): Promise<number> {
  let mode: TestMode;
  try {
    mode = parseMode(args);
  } catch (error) {
    dependencies.error(error instanceof Error ? error.message : String(error));
    return 2;
  }

  let suites: TestSuite[];
  try {
    suites = buildTestSuites(mode, {
      repoRoot,
      rootContractTests: dependencies.discoverRootContractTests(repoRoot),
    });
  } catch (error) {
    dependencies.error(
      `测试配置无效: ${error instanceof Error ? error.message : String(error)}`,
    );
    return 2;
  }

  return runTestSuites(suites, dependencies);
}

if (import.meta.main) {
  process.exit(await runCli(process.argv.slice(2)));
}
```

The direct `throw new Error()` calls are limited to this non-HTTP developer CLI. They do not cross an API controller/service boundary and therefore do not bypass `error-factory.ts` response handling.

- [ ] **Step 2: Run the focused contract and verify the GREEN state**

Run:

```bash
bun test scripts/run-workspace-tests.test.ts
```

Expected: 7 tests pass and 0 fail.

- [ ] **Step 3: Verify invalid CLI input returns configuration status 2**

Run:

```bash
bun scripts/run-workspace-tests.ts --unknown
```

Expected: prints the usage line and exits with status `2` without starting a test suite.

- [ ] **Step 4: Commit the runner**

```bash
git add scripts/run-workspace-tests.ts
git commit -m "feat(test): 增加工作区测试编排器"
```

### Task 3: Expose stable and diagnostic root commands

**Files:**
- Modify: `scripts/run-workspace-tests.test.ts`
- Modify: `package.json`
- Test: `scripts/run-workspace-tests.test.ts`

- [ ] **Step 1: Add a failing root package-script contract**

Add `readFileSync` to the existing `node:fs` import in `scripts/run-workspace-tests.test.ts`:

```ts
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
```

Add `REPOSITORY_ROOT` to the existing import from `./run-workspace-tests`:

```ts
import {
  REPOSITORY_ROOT,
  buildTestSuites,
  runCli,
  runTestSuites,
  type RunnerDependencies,
  type TestMode,
  type TestSuite,
} from "./run-workspace-tests";
```

Append this contract to the file:

```ts
describe("root package scripts", () => {
  it("maps stable and diagnostic commands to explicit runner modes", () => {
    const packageJson = JSON.parse(
      readFileSync(join(REPOSITORY_ROOT, "package.json"), "utf8"),
    ) as { scripts?: Record<string, string> };

    expect(packageJson.scripts?.test).toBe(
      "bun scripts/run-workspace-tests.ts --stable",
    );
    expect(packageJson.scripts?.["test:all"]).toBe(
      "bun scripts/run-workspace-tests.ts --all",
    );
  });
});
```

- [ ] **Step 2: Run the contract and verify the missing scripts fail**

Run:

```bash
bun test scripts/run-workspace-tests.test.ts
```

Expected: 7 tests pass and the `root package scripts` test fails because both script values are `undefined`.

- [ ] **Step 3: Add the root scripts**

In the root `package.json`, add these entries at the beginning of the existing `scripts` object:

```json
"test": "bun scripts/run-workspace-tests.ts --stable",
"test:all": "bun scripts/run-workspace-tests.ts --all",
```

The resulting beginning of the object must be:

```json
"scripts": {
  "test": "bun scripts/run-workspace-tests.ts --stable",
  "test:all": "bun scripts/run-workspace-tests.ts --all",
  "dev": "bun run api:dev",
```

- [ ] **Step 4: Run the focused contract and verify all cases pass**

Run:

```bash
bun test scripts/run-workspace-tests.test.ts
```

Expected: 10 tests pass and 0 fail.

- [ ] **Step 5: Commit the root commands**

```bash
git add package.json scripts/run-workspace-tests.test.ts
git commit -m "chore(test): 增加根级测试命令"
```

### Task 4: Verify stable gating and diagnostic behavior

**Files:**
- Verify: `scripts/run-workspace-tests.ts`
- Verify: `scripts/run-workspace-tests.test.ts`
- Verify: `package.json`

- [ ] **Step 1: Run the focused runner contract from the repository root**

Run:

```bash
bun test scripts/run-workspace-tests.test.ts
```

Expected: 10 tests pass, 0 fail, and no child workspace test process starts.

- [ ] **Step 2: Run the stable root gate**

Run:

```bash
bun run test
```

Expected: exit status `0`. The final summary contains `release-contracts: PASS`, `domain: PASS`, and `web: PASS`; no Playwright E2E spec is collected.

- [ ] **Step 3: Run all-workspace diagnostics**

Run:

```bash
bun run test:all
```

Expected on the current baseline: exit status `1`. The runner still reaches all five suites and prints a final summary. `release-contracts`, `domain`, and `web` pass; current API and Admin debt is reported as failed. No `e2e` directory is collected.

- [ ] **Step 4: Check formatting and scope**

Run each command independently:

```bash
git diff --check
```

```bash
git status --short
```

```bash
git diff --name-only 9e3da81d...HEAD
```

Expected: `git diff --check` has no output; the worktree is clean after the four implementation commits; changed paths are limited to the design/plan docs, `package.json`, and the two runner files. `bun.lock` and `pnpm-lock.yaml` are unchanged.

- [ ] **Step 5: Request a code review focused on orchestration correctness**

Ask the reviewer to check these concrete invariants:

```text
1. Every Bun suite runs with its package-local cwd.
2. Stable mode includes only release contracts, Domain, and Web tests.
3. All mode includes API/Admin diagnostics and does not collect Playwright E2E.
4. A child failure cannot stop subsequent suites, but forces aggregate exit status 1.
5. Invalid mode/configuration exits 2 before child execution.
6. No dependency, lockfile, business code, or deployment workflow changed.
```

- [ ] **Step 6: Apply only substantiated review fixes and repeat verification**

For every accepted review fix, add or adjust a focused test first, run:

```bash
bun test scripts/run-workspace-tests.test.ts
```

Then repeat `bun run test`, `bun run test:all`, and `git diff --check`. If a review fix changes tracked files, commit it with a Conventional Commit message describing that concrete correction.
