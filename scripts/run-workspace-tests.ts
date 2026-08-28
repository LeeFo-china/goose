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

const USAGE = "用法: bun scripts/run-workspace-tests.ts --stable|--all";

export function discoverRootContractTests(repoRoot: string): readonly string[] {
  return readdirSync(join(repoRoot, "scripts"), { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".test.ts"))
    .map((entry) => `./scripts/${entry.name}`)
    .sort();
}

export function buildTestSuites(
  mode: TestMode,
  configuration: SuiteConfiguration,
): TestSuite[] {
  const rootContractTests = [...configuration.rootContractTests].sort();

  if (rootContractTests.length === 0) {
    throw new Error("未发现根目录契约测试");
  }

  const releaseContracts: TestSuite = {
    name: "release-contracts",
    cwd: configuration.repoRoot,
    targets: rootContractTests,
  };
  // Bun filters by path substring; "./" prevents directory targets from matching ancestors or E2E.
  const domain: TestSuite = {
    name: "domain",
    cwd: join(configuration.repoRoot, "packages/domain"),
    targets: ["./src"],
  };

  if (mode === "stable") {
    return [
      releaseContracts,
      domain,
      {
        name: "api-route-capabilities",
        cwd: join(configuration.repoRoot, "apps/api"),
        targets: ["./src/services/tenant-service-capability-map.test.ts"],
      },
      {
        name: "web",
        cwd: join(configuration.repoRoot, "apps/web"),
        targets: ["./tests"],
      },
    ];
  }

  return [
    releaseContracts,
    domain,
    {
      name: "api",
      cwd: join(configuration.repoRoot, "apps/api"),
      targets: ["./src"],
    },
    {
      name: "admin",
      cwd: join(configuration.repoRoot, "apps/admin"),
      targets: ["./app", "./components", "./lib", "./tests"],
    },
    {
      name: "web",
      cwd: join(configuration.repoRoot, "apps/web"),
      targets: ["./tests", "./components"],
    },
  ];
}

function parseMode(args: readonly string[]): TestMode {
  if (args.length !== 1 || (args[0] !== "--stable" && args[0] !== "--all")) {
    throw new Error(USAGE);
  }

  return args[0] === "--stable" ? "stable" : "all";
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function runTestSuites(
  suites: readonly TestSuite[],
  dependencies: ExecutionDependencies,
): Promise<number> {
  const results: Array<{ suite: TestSuite; exitCode: number }> = [];

  for (const suite of suites) {
    dependencies.log(`\n=== ${suite.name} ===`);

    try {
      const exitCode = await dependencies.execute(suite);
      results.push({ suite, exitCode });
    } catch (error) {
      dependencies.error(`${suite.name} 启动失败: ${getErrorMessage(error)}`);
      results.push({ suite, exitCode: 1 });
    }
  }

  dependencies.log("\n=== 测试汇总 ===");
  for (const { suite, exitCode } of results) {
    dependencies.log(
      exitCode === 0
        ? `${suite.name}: PASS`
        : `${suite.name}: FAIL (${exitCode})`,
    );
  }

  return results.every(({ exitCode }) => exitCode === 0) ? 0 : 1;
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
  repoRoot: string = REPOSITORY_ROOT,
): Promise<number> {
  let mode: TestMode;

  try {
    mode = parseMode(args);
  } catch (error) {
    dependencies.error(getErrorMessage(error));
    return 2;
  }

  let suites: TestSuite[];

  try {
    const rootContractTests = dependencies.discoverRootContractTests(repoRoot);
    suites = buildTestSuites(mode, { repoRoot, rootContractTests });
  } catch (error) {
    dependencies.error(`测试配置无效: ${getErrorMessage(error)}`);
    return 2;
  }

  return runTestSuites(suites, dependencies);
}

if (import.meta.main) {
  process.exit(await runCli(process.argv.slice(2)));
}
