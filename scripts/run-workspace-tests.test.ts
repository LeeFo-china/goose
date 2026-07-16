import { describe, expect, it } from "bun:test";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  buildTestSuites,
  discoverRootContractTests,
  REPOSITORY_ROOT,
  runCli,
  runTestSuites,
  type RunnerDependencies,
  type TestMode,
  type TestSuite,
} from "./run-workspace-tests";

const repoRoot = "/repo";
const rootContractTests = [
  "scripts/z-last.test.ts",
  "scripts/a-first.test.ts",
];

describe("buildTestSuites", () => {
  it("builds the stable suite in deterministic order", () => {
    expect(buildTestSuites("stable", { repoRoot, rootContractTests })).toEqual([
      {
        name: "release-contracts",
        cwd: repoRoot,
        targets: ["scripts/a-first.test.ts", "scripts/z-last.test.ts"],
      },
      {
        name: "domain",
        cwd: join(repoRoot, "packages/domain"),
        targets: ["src"],
      },
      {
        name: "web",
        cwd: join(repoRoot, "apps/web"),
        targets: ["tests"],
      },
    ]);
  });

  it("builds the all suite in deterministic order", () => {
    expect(buildTestSuites("all", { repoRoot, rootContractTests })).toEqual([
      {
        name: "release-contracts",
        cwd: repoRoot,
        targets: ["scripts/a-first.test.ts", "scripts/z-last.test.ts"],
      },
      {
        name: "domain",
        cwd: join(repoRoot, "packages/domain"),
        targets: ["src"],
      },
      {
        name: "api",
        cwd: join(repoRoot, "apps/api"),
        targets: ["src"],
      },
      {
        name: "admin",
        cwd: join(repoRoot, "apps/admin"),
        targets: ["app", "components", "lib", "tests"],
      },
      {
        name: "web",
        cwd: join(repoRoot, "apps/web"),
        targets: ["tests", "components"],
      },
    ]);
  });

  it("keeps e2e targets out of stable and all modes", () => {
    const modes: TestMode[] = ["stable", "all"];

    for (const mode of modes) {
      const targets = buildTestSuites(mode, { repoRoot, rootContractTests })
        .flatMap((suite) => suite.targets);

      for (const target of targets) {
        expect(target.split(/[\\/]/).includes("e2e")).toBe(false);
      }
    }
  });
});

describe("discoverRootContractTests", () => {
  it("returns only sorted top-level script tests", () => {
    const temporaryRoot = mkdtempSync(
      join(tmpdir(), "gooes-root-contract-tests-"),
    );
    const scriptsDirectory = join(temporaryRoot, "scripts");

    try {
      mkdirSync(join(scriptsDirectory, "nested"), { recursive: true });
      mkdirSync(join(scriptsDirectory, "directory.test.ts"));
      writeFileSync(join(scriptsDirectory, "z-last.test.ts"), "");
      writeFileSync(join(scriptsDirectory, "a-first.test.ts"), "");
      writeFileSync(join(scriptsDirectory, "notes.ts"), "");
      writeFileSync(join(scriptsDirectory, "nested", "ignored.test.ts"), "");

      expect(discoverRootContractTests(temporaryRoot)).toEqual([
        "scripts/a-first.test.ts",
        "scripts/z-last.test.ts",
      ]);
    } finally {
      rmSync(temporaryRoot, { force: true, recursive: true });
    }
  });
});

describe("runTestSuites", () => {
  it("runs every suite in order and aggregates failures", async () => {
    const suites: TestSuite[] = [
      { name: "first", cwd: repoRoot, targets: ["first"] },
      { name: "second", cwd: repoRoot, targets: ["second"] },
      { name: "third", cwd: repoRoot, targets: ["third"] },
    ];
    const executionOrder: string[] = [];
    const logs: string[] = [];

    expect(await runTestSuites(suites, {
      execute: async (suite) => {
        executionOrder.push(suite.name);
        return suite.name === "second" ? 7 : 0;
      },
      log: (message) => logs.push(message),
      error: (message) => logs.push(message),
    })).toBe(1);
    expect(executionOrder).toEqual(["first", "second", "third"]);
    expect(logs.join("\n")).toContain("second: FAIL");
    expect(logs.join("\n")).toContain("third: PASS");
  });

  it("continues after a suite fails to start", async () => {
    const suites: TestSuite[] = [
      { name: "first", cwd: repoRoot, targets: ["first"] },
      { name: "second", cwd: repoRoot, targets: ["second"] },
    ];
    const executionOrder: string[] = [];
    const messages: string[] = [];

    expect(await runTestSuites(suites, {
      execute: async (suite) => {
        executionOrder.push(suite.name);
        if (suite.name === "first") {
          throw new Error("spawn failed");
        }
        return 0;
      },
      log: (message) => messages.push(message),
      error: (message) => messages.push(message),
    })).toBe(1);
    expect(executionOrder).toEqual(["first", "second"]);
    expect(messages.join("\n")).toContain("first 启动失败: spawn failed");
    expect(messages.join("\n")).toContain("first: FAIL (1)");
    expect(messages.join("\n")).toContain("second: PASS");
  });
});

describe("runCli", () => {
  it("discovers and executes stable suites in order", async () => {
    const executionOrder: string[] = [];
    const dependencies: RunnerDependencies = {
      discoverRootContractTests: () => rootContractTests,
      execute: async (suite) => {
        executionOrder.push(suite.name);
        return 0;
      },
      log: () => {},
      error: () => undefined,
    };

    expect(await runCli(["--stable"], dependencies, repoRoot)).toBe(0);
    expect(executionOrder).toEqual(["release-contracts", "domain", "web"]);
  });

  it("rejects an unknown mode before discovery or execution", async () => {
    let discoverCalled = false;
    let executeCalled = false;
    const dependencies: RunnerDependencies = {
      discoverRootContractTests: () => {
        discoverCalled = true;
        return rootContractTests;
      },
      execute: async () => {
        executeCalled = true;
        return 0;
      },
      log: () => {},
      error: () => undefined,
    };

    expect(await runCli(["--unknown"], dependencies, repoRoot)).toBe(2);
    expect(discoverCalled).toBe(false);
    expect(executeCalled).toBe(false);
  });

  it("rejects an empty root contract suite before execution", async () => {
    let discoveryCalls = 0;
    let executeCalled = false;
    const dependencies: RunnerDependencies = {
      discoverRootContractTests: () => {
        discoveryCalls += 1;
        return [];
      },
      execute: async () => {
        executeCalled = true;
        return 0;
      },
      log: () => {},
      error: () => undefined,
    };

    expect(await runCli(["--stable"], dependencies, repoRoot)).toBe(2);
    expect(discoveryCalls).toBe(1);
    expect(executeCalled).toBe(false);
  });
});

describe("root package scripts", () => {
  it("exposes stable and all workspace test commands", () => {
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
