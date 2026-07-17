import { describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const buildWorkflow = readFileSync(
  new URL("../.github/workflows/build-docker-images.yml", import.meta.url),
  "utf8",
);
const autoDeployDevWorkflow = readFileSync(
  new URL("../.github/workflows/auto-deploy-dev.yml", import.meta.url),
  "utf8",
);
const deployDevWorkflow = readFileSync(
  new URL("../.github/workflows/deploy-dev.yml", import.meta.url),
  "utf8",
);
const releaseDevWorkflowUrl = new URL(
  "../.github/workflows/release-dev.yml",
  import.meta.url,
);
const releaseDevWorkflow = existsSync(releaseDevWorkflowUrl)
  ? readFileSync(releaseDevWorkflowUrl, "utf8")
  : "";
const releaseProductionWorkflowUrl = new URL(
  "../.github/workflows/release-production.yml",
  import.meta.url,
);
const releaseProductionWorkflow = existsSync(releaseProductionWorkflowUrl)
  ? readFileSync(releaseProductionWorkflowUrl, "utf8")
  : "";
const deployProductionWorkflow = readFileSync(
  new URL("../.github/workflows/deploy-docker-services.yml", import.meta.url),
  "utf8",
);
const migrateProductionWorkflow = readFileSync(
  new URL("../.github/workflows/migrate-production-database.yml", import.meta.url),
  "utf8",
);
const registryWorkflows = [
  ["build", buildWorkflow],
  ["development deploy", deployDevWorkflow],
  ["production deploy", deployProductionWorkflow],
] as const;
const apiCompose = readFileSync(
  new URL("../deploy/docker-compose.api.yml", import.meta.url),
  "utf8",
);
const adminCompose = readFileSync(
  new URL("../deploy/docker-compose.admin.yml", import.meta.url),
  "utf8",
);
const adminEnvironmentExample = readFileSync(
  new URL("../deploy/.env.admin.example", import.meta.url),
  "utf8",
);
const registryUsageBlocks = [
  [
    "build login",
    buildWorkflow,
    "Login to Tencent CCR",
    'docker login "$TENCENT_CCR_REGISTRY"',
  ],
  [
    "build image path",
    buildWorkflow,
    "Build and push image",
    'IMAGE_BASE="${TENCENT_CCR_REGISTRY}/${TENCENT_CCR_NAMESPACE}/${IMAGE_REPO}"',
  ],
  [
    "production pull login",
    buildWorkflow,
    "Login to Tencent CCR",
    'docker login "${TENCENT_CCR_REGISTRY}"',
  ],
  [
    "production pull image verification",
    buildWorkflow,
    "Pull and verify immutable images",
    'expected_image="${TENCENT_CCR_REGISTRY}/${TENCENT_CCR_NAMESPACE}/${image_repo}:run-${GITHUB_RUN_ID}-${GITHUB_SHA}"',
  ],
  [
    "development login",
    deployDevWorkflow,
    "Login to Tencent CCR",
    'docker login "${TENCENT_CCR_REGISTRY}"',
  ],
  [
    "development service image path",
    deployDevWorkflow,
    "Deploy dev services",
    'image_base="${TENCENT_CCR_REGISTRY}/${TENCENT_CCR_NAMESPACE}"',
  ],
  [
    "development Web image path",
    deployDevWorkflow,
    "Deploy gated dev web",
    'image_base="${TENCENT_CCR_REGISTRY}/${TENCENT_CCR_NAMESPACE}"',
  ],
  [
    "production service image path",
    deployProductionWorkflow,
    "Validate production release evidence",
    'image_base="${TENCENT_CCR_REGISTRY}/${TENCENT_CCR_NAMESPACE}"',
  ],
  [
    "production Web image path",
    deployProductionWorkflow,
    "Validate web deployment gate",
    'image_base="${TENCENT_CCR_REGISTRY}/${TENCENT_CCR_NAMESPACE}"',
  ],
  [
    "production login",
    deployProductionWorkflow,
    "Login to Tencent CCR",
    'docker login "$TENCENT_CCR_REGISTRY"',
  ],
] as const;
const registryKey = "TENCENT_CCR_REGISTRY";
const namespaceKey = "TENCENT_CCR_NAMESPACE";
const registryDeclaration = `${registryKey}: \${{ vars.TENCENT_CCR_REGISTRY }}`;
const namespaceDeclaration = `${namespaceKey}: \${{ vars.TENCENT_CCR_NAMESPACE }}`;
const allowedRegistryPairArm =
  "useccr.ccs.tencentyun.com:america_goose|ccr.ccs.tencentyun.com:gooes-goodcms)";

const script = new URL("./resolve-admin-release-services.mjs", import.meta.url).pathname;

function resolve(mode: string, services: string): ReturnType<typeof Bun.spawnSync> {
  return Bun.spawnSync(["node", script, mode, services], {
    stderr: "pipe",
    stdout: "pipe",
  });
}

function sliceWorkflowJob(workflow: string, job: string, nextBoundary: string): string {
  const start = workflow.indexOf(`  ${job}:`);
  const yamlBoundary = workflow.indexOf(`  ${nextBoundary}:`, start + 1);
  const markerBoundary = workflow.indexOf(nextBoundary, start + 1);
  const end = yamlBoundary >= 0 ? yamlBoundary : markerBoundary;
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return workflow.slice(start, end);
}

interface WorkflowTextContract {
  requiredFragments: readonly string[];
  orderedFragments?: readonly string[];
  forbiddenPatterns?: readonly RegExp[];
  exactLineContracts?: readonly {
    line: string;
    count: number;
    exclusivePattern?: RegExp;
  }[];
}

function validatesWorkflowTextContract(
  content: string,
  contract: WorkflowTextContract,
): boolean {
  if (!contract.requiredFragments.every((fragment) => content.includes(fragment))) {
    return false;
  }

  let previousFragmentEnd = 0;
  for (const fragment of contract.orderedFragments ?? []) {
    const fragmentStart = content.indexOf(fragment, previousFragmentEnd);
    if (fragmentStart < previousFragmentEnd) {
      return false;
    }
    previousFragmentEnd = fragmentStart + fragment.length;
  }

  const contentLines = content.split(/\r?\n/);
  for (const exactLineContract of contract.exactLineContracts ?? []) {
    const exactLineCount = contentLines.filter(
      (line) => line === exactLineContract.line,
    ).length;
    if (exactLineCount !== exactLineContract.count) {
      return false;
    }
    if (
      exactLineContract.exclusivePattern &&
      contentLines.some(
        (line) =>
          exactLineContract.exclusivePattern?.test(line) &&
          line !== exactLineContract.line,
      )
    ) {
      return false;
    }
  }

  return !(contract.forbiddenPatterns ?? []).some((pattern) => {
    return pattern.test(content);
  });
}

function swapWorkflowFragments(
  content: string,
  first: string,
  second: string,
): string {
  const placeholder = "__WORKFLOW_CONTRACT_FIRST_FRAGMENT__";
  return content
    .replace(first, placeholder)
    .replace(second, first)
    .replace(placeholder, second);
}

function sliceWorkflowStep(workflow: string, stepName: string): string {
  const start = workflow.indexOf(`      - name: ${stepName}`);
  expect(start).toBeGreaterThanOrEqual(0);
  return sliceWorkflowStepAt(workflow, start);
}

function extractWorkflowRunScript(step: string): string {
  const lines = step.split(/\r?\n/);
  const runLineIndex = lines.findIndex((line) => line.trim() === "run: |");
  expect(runLineIndex).toBeGreaterThanOrEqual(0);
  const scriptLines = lines.slice(runLineIndex + 1).filter((line) => line.length > 0);
  const indentation = Math.min(
    ...scriptLines.map((line) => line.match(/^\s*/)?.[0].length ?? 0),
  );
  return scriptLines.map((line) => line.slice(indentation)).join("\n");
}

function extractShellFunction(script: string, functionName: string): string {
  const lines = script.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === `${functionName}() {`);
  const end = lines.findIndex((line, index) => index > start && line.trim() === "}");

  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return lines.slice(start, end + 1).join("\n");
}

type DigestRetryMockMode = "always-fail" | "nonzero-valid" | "succeed-fifth";

function runDigestRetryHelper(
  step: string,
  mode: DigestRetryMockMode,
): { attempts: number; exitCode: number; stdout: string } {
  const root = mkdtempSync(join(tmpdir(), "ccr-digest-retry-"));
  const attemptsPath = join(root, "attempts");
  writeFileSync(attemptsPath, "0\n");
  const digest = `sha256:${"a".repeat(64)}`;
  const helper = extractShellFunction(
    extractWorkflowRunScript(step),
    "resolve_remote_digest",
  );
  const dockerMock = `
sleep() { :; }
docker() {
  local attempt
  attempt="$(cat "\${ATTEMPT_FILE}")"
  attempt=$((attempt + 1))
  printf '%s\\n' "\${attempt}" > "\${ATTEMPT_FILE}"
  case "\${MOCK_MODE}" in
    always-fail)
      return 42
      ;;
    nonzero-valid)
      printf 'Digest: ${digest}\\n'
      return 42
      ;;
    succeed-fifth)
      if [ "\${attempt}" -lt 5 ]; then
        return 42
      fi
      printf 'Digest: ${digest}\\n'
      return 0
      ;;
  esac
}
`;

  try {
    const result = Bun.spawnSync(
      ["bash", "-c", `${dockerMock}\n${helper}\nresolve_remote_digest test-image`],
      {
        env: {
          ...process.env,
          ATTEMPT_FILE: attemptsPath,
          MOCK_MODE: mode,
        },
        stderr: "pipe",
        stdout: "pipe",
      },
    );
    return {
      attempts: Number.parseInt(readFileSync(attemptsPath, "utf8"), 10),
      exitCode: result.exitCode,
      stdout: result.stdout.toString().trim(),
    };
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
}

function sliceWorkflowStepAt(workflow: string, start: number): string {
  const remainingWorkflow = workflow.slice(start + 1);
  const nextSiblingOffset = remainingWorkflow.search(/^      - /m);
  const end = nextSiblingOffset < 0
    ? workflow.length
    : start + 1 + nextSiblingOffset;

  expect(end).toBeGreaterThan(start);
  return workflow.slice(start, end);
}

function extractWorkflowSteps(workflow: string): string[] {
  const stepStarts: number[] = [];
  for (const match of workflow.matchAll(/^      - /gm)) {
    stepStarts.push(match.index);
  }

  return stepStarts.map((start) => sliceWorkflowStepAt(workflow, start));
}

function runProductionGuard(buildRunId: string): ReturnType<typeof Bun.spawnSync> {
  const guardScript = extractWorkflowRunScript(
    sliceWorkflowStep(deployProductionWorkflow, "Guard production runner"),
  );
  return Bun.spawnSync(["bash", "-c", guardScript], {
    env: {
      BUILD_RUN_ID: buildRunId,
      GITHUB_ENV: "/dev/null",
      GITHUB_EVENT_NAME: "workflow_dispatch",
      GITHUB_REF_NAME: "v2026.07.16.1",
      GITHUB_REF_TYPE: "tag",
      GITHUB_RUN_ID: "999",
      GITHUB_SHA: "0123456789abcdef0123456789abcdef01234567",
      INPUT_BUILT_IMAGE_SHA: "0123456789abcdef0123456789abcdef01234567",
      RELEASE_CONFIRM_TEXT: "确认部署生产环境",
      RELEASE_SERVICE: "api",
      RUNNER_NAME: "gooes-prod-vm-0-3",
      RUNNER_TEMP: "/tmp",
    },
    stderr: "pipe",
    stdout: "pipe",
  });
}

function runNonWebCandidatePreflight(
  currentWorkflowPath: string,
): ReturnType<typeof Bun.spawnSync> {
  const preflightScript = extractWorkflowRunScript(
    sliceWorkflowStep(
      deployProductionWorkflow,
      "Preflight Admin candidate metadata",
    ),
  );
  const ghMock = `
gh() {
  case "$2" in
    repos/LeeFo-china/goose/actions/runs/999)
      printf '%s\\n' '{"workflow_id":11,"event":"workflow_dispatch","head_sha":"0123456789abcdef0123456789abcdef01234567"}'
      ;;
    repos/LeeFo-china/goose/actions/workflows/11)
      printf '%s\\n' '{"path":"${currentWorkflowPath}"}'
      ;;
    *) return 1 ;;
  esac
}
`;
  return Bun.spawnSync(["bash", "-c", `${ghMock}\n${preflightScript}`], {
    env: {
      ...process.env,
      BUILD_RUN_ID: "123",
      GITHUB_EVENT_NAME: "workflow_dispatch",
      GITHUB_REF_NAME: "v2026.07.16.1",
      GITHUB_REF_TYPE: "tag",
      GITHUB_REPOSITORY: "LeeFo-china/goose",
      GITHUB_RUN_ID: "999",
      GITHUB_SHA: "0123456789abcdef0123456789abcdef01234567",
      INPUT_BUILT_IMAGE_SHA: "0123456789abcdef0123456789abcdef01234567",
      RELEASE_CONFIRM_TEXT: "确认部署生产环境",
    },
    stderr: "pipe",
    stdout: "pipe",
  });
}

function runProductionRuntimeEvidenceCheck(
  configuredImage: string,
  serviceLabel: string,
  healthStatus = "healthy",
): ReturnType<typeof Bun.spawnSync> {
  const checkScript = extractWorkflowRunScript(
    sliceWorkflowStep(deployProductionWorkflow, "Check container health"),
  );
  const dockerMock = `
docker() {
  test "$1" = inspect
  test "$2" = -f
  case "$3" in
    '{{.State.Status}}') printf '%s\\n' running ;;
    '{{if .State.Health}}{{.State.Health.Status}}{{end}}') printf '%s\\n' '${healthStatus}' ;;
    '{{.Config.Image}}') printf '%s\\n' '${configuredImage}' ;;
    '{{index .Config.Labels "com.goodcms.service"}}') printf '%s\\n' '${serviceLabel}' ;;
    '{{index .Config.Labels "org.opencontainers.image.revision"}}') printf '%s\\n' "$SOURCE_SHA" ;;
    '{{index .Config.Labels "com.goodcms.github.run_id"}}') printf '%s\\n' "$BUILD_RUN_ID" ;;
    *) return 1 ;;
  esac
}
sleep() { :; }
`;
  return Bun.spawnSync(["bash", "-c", `${dockerMock}\n${checkScript}`], {
    env: {
      ADMIN_CANDIDATE: "true",
      BUILD_RUN_ID: "123",
      DEPLOY_SERVICES: "api",
      GOOES_API_IMAGE:
        "useccr.ccs.tencentyun.com/america_goose/goose-api@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      SOURCE_SHA: "0123456789abcdef0123456789abcdef01234567",
    },
    stderr: "pipe",
    stdout: "pipe",
  });
}

function extractSensitiveRegistrySteps(workflow: string): string[] {
  const registryInterpolation =
    /\$(?:\{TENCENT_CCR_(?:REGISTRY|NAMESPACE)\}|TENCENT_CCR_(?:REGISTRY|NAMESPACE)(?![A-Za-z0-9_]))/;
  return extractWorkflowSteps(workflow).filter((step) => {
    return registryInterpolation.test(step);
  });
}

function getWorkflowStepName(step: string): string | undefined {
  return step.match(/^      - name: (.+)$/m)?.[1];
}

function getKnownRegistryUsage(
  workflow: string,
  step: string,
): string | undefined {
  const stepName = getWorkflowStepName(step);
  return registryUsageBlocks.find(([, expectedWorkflow, expectedStepName, usage]) => {
    return (
      expectedWorkflow === workflow &&
      expectedStepName === stepName &&
      step.includes(usage)
    );
  })?.[3];
}

function countYamlKey(content: string, key: string): number {
  const keyForm = `(?:"${key}"|'${key}'|${key})`;
  const keyDeclaration = new RegExp(
    `(?:^|[,{])[ \\t]*${keyForm}[ \\t]*:`,
    "gm",
  );
  return content.match(keyDeclaration)?.length ?? 0;
}

function hasUniqueWorkflowRootRegistryDeclarations(workflow: string): boolean {
  const jobsStart = workflow.indexOf("\njobs:");
  if (jobsStart < 0) return false;

  const workflowRoot = workflow.slice(0, jobsStart);
  const rootEnvStart = workflowRoot.indexOf("\nenv:\n");
  if (rootEnvStart < 0) return false;

  const rootEnv = workflowRoot.slice(rootEnvStart + 1);
  return (
    rootEnv.split("\n").includes(`  ${registryDeclaration}`) &&
    rootEnv.split("\n").includes(`  ${namespaceDeclaration}`) &&
    countYamlKey(workflow, registryKey) === 1 &&
    countYamlKey(workflow, namespaceKey) === 1
  );
}

function hasExclusiveCoupledAllowlist(allowlist: string): boolean {
  const normalizedAllowlist = allowlist
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
  const expectedAllowlist = [
    'case "${TENCENT_CCR_REGISTRY}:${TENCENT_CCR_NAMESPACE}" in',
    allowedRegistryPairArm,
    ";;",
    "*)",
    'echo "::error::Unsupported Tencent CCR registry/namespace pair."',
    "exit 1",
    ";;",
    "esac",
  ].join("\n");

  return normalizedAllowlist === expectedAllowlist;
}

function expectGuardedRegistryUsageStep(step: string, usage: string): void {
  const strictShellStart = step.indexOf("set -euo pipefail");
  const registryGuardStart = step.indexOf(
    'test -n "${TENCENT_CCR_REGISTRY}"',
  );
  const namespaceGuardStart = step.indexOf(
    'test -n "${TENCENT_CCR_NAMESPACE}"',
  );
  const allowlistStart = step.indexOf(
    'case "${TENCENT_CCR_REGISTRY}:${TENCENT_CCR_NAMESPACE}" in',
  );
  const allowlistEnd = step.indexOf("esac", allowlistStart);
  const usageStart = step.indexOf(usage);
  const allowlist = step.slice(allowlistStart, allowlistEnd + "esac".length);

  expect(step.split(usage).length - 1).toBe(1);
  expect(strictShellStart).toBeGreaterThanOrEqual(0);
  expect(registryGuardStart).toBeGreaterThan(strictShellStart);
  expect(namespaceGuardStart).toBeGreaterThan(registryGuardStart);
  expect(allowlistStart).toBeGreaterThan(namespaceGuardStart);
  expect(allowlistEnd).toBeGreaterThan(allowlistStart);
  expect(usageStart).toBeGreaterThan(allowlistEnd);
  expect(hasExclusiveCoupledAllowlist(allowlist)).toBe(true);
}

describe("Tencent CCR registry configuration", () => {
  test("rejects registry declarations scoped only to a workflow job", () => {
    const jobScopedRegistryFixture = [
      "name: Malformed registry workflow",
      "jobs:",
      "  build:",
      "    env:",
      `      ${registryDeclaration}`,
      `      ${namespaceDeclaration}`,
      "    runs-on: ubuntu-latest",
    ].join("\n");

    expect(hasUniqueWorkflowRootRegistryDeclarations(jobScopedRegistryFixture)).toBe(
      false,
    );
  });

  test.each([
    ["registry", registryDeclaration],
    ["namespace", namespaceDeclaration],
  ])(
    "rejects a duplicate %s declaration in job env",
    (_name, duplicateDeclaration) => {
      const jobOverrideFixture = [
        "name: Malformed registry override workflow",
        "env:",
        `  ${registryDeclaration}`,
        `  ${namespaceDeclaration}`,
        "jobs:",
        "  build:",
        "    env:",
        `      ${duplicateDeclaration}`,
        "    runs-on: ubuntu-latest",
      ].join("\n");

      expect(hasUniqueWorkflowRootRegistryDeclarations(jobOverrideFixture)).toBe(
        false,
      );
    },
  );

  test.each([
    ["registry", "TENCENT_CCR_REGISTRY: evil.example"],
    ["namespace", "TENCENT_CCR_NAMESPACE: evil_namespace"],
  ])(
    "rejects a different-value %s override in job env",
    (_name, overrideDeclaration) => {
      const differentValueOverrideFixture = [
        "name: Malformed different-value override workflow",
        "env:",
        `  ${registryDeclaration}`,
        `  ${namespaceDeclaration}`,
        "jobs:",
        "  build:",
        "    env:",
        `      ${overrideDeclaration}`,
        "    runs-on: ubuntu-latest",
      ].join("\n");

      expect(
        hasUniqueWorkflowRootRegistryDeclarations(differentValueOverrideFixture),
      ).toBe(false);
    },
  );

  test.each([
    ["double-quoted registry", '"TENCENT_CCR_REGISTRY": evil.example'],
    ["single-quoted namespace", "'TENCENT_CCR_NAMESPACE': evil_namespace"],
  ])(
    "rejects a %s override in job env",
    (_name, overrideDeclaration) => {
      const quotedOverrideFixture = [
        "name: Malformed quoted override workflow",
        "env:",
        `  ${registryDeclaration}`,
        `  ${namespaceDeclaration}`,
        "jobs:",
        "  build:",
        "    env:",
        `      ${overrideDeclaration}`,
        "    runs-on: ubuntu-latest",
      ].join("\n");

      expect(
        hasUniqueWorkflowRootRegistryDeclarations(quotedOverrideFixture),
      ).toBe(false);
    },
  );

  test("rejects a flow-map registry override after root env", () => {
    const flowMapOverrideFixture = [
      "name: Malformed flow-map override workflow",
      "env:",
      `  ${registryDeclaration}`,
      `  ${namespaceDeclaration}`,
      "jobs:",
      "  build:",
      "    env: { TENCENT_CCR_REGISTRY: evil.example }",
      "    runs-on: ubuntu-latest",
    ].join("\n");

    expect(hasUniqueWorkflowRootRegistryDeclarations(flowMapOverrideFixture)).toBe(
      false,
    );
  });

  test("ends a named step before an unnamed sibling run step", () => {
    const unnamedSiblingStepFixture = [
      "jobs:",
      "  validate:",
      "    steps:",
      "      - name: Guard registry",
      "        run: |",
      "          set -euo pipefail",
      '          test -n "${TENCENT_CCR_REGISTRY}"',
      '          test -n "${TENCENT_CCR_NAMESPACE}"',
      '          case "${TENCENT_CCR_REGISTRY}:${TENCENT_CCR_NAMESPACE}" in',
      `            ${allowedRegistryPairArm}`,
      "              ;;",
      "            *)",
      '              echo "::error::Unsupported Tencent CCR registry/namespace pair."',
      "              exit 1",
      "              ;;",
      "          esac",
      "      - run: |",
      '          image_base="${TENCENT_CCR_REGISTRY}/${TENCENT_CCR_NAMESPACE}"',
      "      - name: Finish",
      "        run: echo done",
    ].join("\n");

    const guardStep = sliceWorkflowStep(
      unnamedSiblingStepFixture,
      "Guard registry",
    );
    expect(guardStep).not.toContain('image_base="${TENCENT_CCR_REGISTRY}');
    expect(extractSensitiveRegistrySteps(unnamedSiblingStepFixture)).toHaveLength(2);
  });

  test("discovers a direct registry image interpolation as sensitive", () => {
    const directImageInterpolationFixture = [
      "jobs:",
      "  pull:",
      "    steps:",
      "      - name: Pull direct image",
      "        run: |",
      "          set -euo pipefail",
      '          docker pull "${TENCENT_CCR_REGISTRY}/${TENCENT_CCR_NAMESPACE}/goose-api:main"',
      "      - name: Finish",
      "        run: echo done",
    ].join("\n");

    const sensitiveSteps = extractSensitiveRegistrySteps(
      directImageInterpolationFixture,
    );
    expect(sensitiveSteps).toHaveLength(1);
    expect(
      getKnownRegistryUsage(directImageInterpolationFixture, sensitiveSteps[0]),
    ).toBeUndefined();
    expect(countYamlKey(directImageInterpolationFixture, registryKey)).toBe(0);
    expect(countYamlKey(directImageInterpolationFixture, namespaceKey)).toBe(0);
  });

  test("discovers direct bare registry login and image usage as sensitive", () => {
    const bareRegistryUsageFixture = [
      "jobs:",
      "  pull:",
      "    steps:",
      "      - name: Pull bare-variable image",
      "        run: |",
      "          set -euo pipefail",
      "          docker login \"$TENCENT_CCR_REGISTRY\"",
      "          docker pull \"$TENCENT_CCR_REGISTRY/$TENCENT_CCR_NAMESPACE/goose-api:main\"",
      "      - name: Finish",
      "        run: echo done",
    ].join("\n");

    const sensitiveSteps = extractSensitiveRegistrySteps(bareRegistryUsageFixture);
    expect(sensitiveSteps).toHaveLength(1);
    expect(
      getKnownRegistryUsage(bareRegistryUsageFixture, sensitiveSteps[0]),
    ).toBeUndefined();
  });

  test("ignores partial variable names and GitHub expressions", () => {
    const nonShellRegistryReferenceFixture = [
      "jobs:",
      "  inspect:",
      "    steps:",
      "      - name: Inspect unrelated values",
      "        run: |",
      "          set -euo pipefail",
      "          echo \"$TENCENT_CCR_REGISTRY_BACKUP\"",
      "          echo \"$TENCENT_CCR_NAMESPACE_SUFFIX\"",
      "          echo '${{ vars.TENCENT_CCR_REGISTRY }}'",
      "          echo '${{ vars.TENCENT_CCR_NAMESPACE }}'",
      "      - name: Finish",
      "        run: echo done",
    ].join("\n");

    expect(extractSensitiveRegistrySteps(nonShellRegistryReferenceFixture)).toHaveLength(
      0,
    );
  });

  test("rejects an additional registry success arm", () => {
    const additionalSuccessArmFixture = [
      'case "${TENCENT_CCR_REGISTRY}:${TENCENT_CCR_NAMESPACE}" in',
      `  ${allowedRegistryPairArm}`,
      "    ;;",
      "  evil.example:america_goose)",
      "    ;;",
      "  *)",
      '    echo "::error::Unsupported Tencent CCR registry/namespace pair."',
      "    exit 1",
      "    ;;",
      "esac",
    ].join("\n");

    expect(hasExclusiveCoupledAllowlist(additionalSuccessArmFixture)).toBe(false);
  });

  test.each(registryWorkflows)(
    "%s workflow reads the registry and namespace from repository variables",
    (_name, workflow) => {
      expect(hasUniqueWorkflowRootRegistryDeclarations(workflow)).toBe(true);
      expect(workflow).not.toContain(
        "TENCENT_CCR_REGISTRY: ccr.ccs.tencentyun.com",
      );
      expect(workflow).not.toContain("/${{ vars.TENCENT_CCR_NAMESPACE }}");
    },
  );

  test("tracks every registry credential and image-path usage", () => {
    expect(registryUsageBlocks).toHaveLength(10);
    expect(registryWorkflows.reduce((count, [, workflow]) => {
      return count + extractSensitiveRegistrySteps(workflow).length;
    }, 0)).toBe(10);
  });

  test("validates every extracted sensitive registry step", () => {
    const sensitiveSteps = registryWorkflows.flatMap(([, workflow]) => {
      return extractSensitiveRegistrySteps(workflow).map((step) => ({
        step,
        workflow,
      }));
    });

    expect(sensitiveSteps).toHaveLength(10);
    expect(registryUsageBlocks).toHaveLength(10);
    for (const { step, workflow } of sensitiveSteps) {
      const knownUsage = getKnownRegistryUsage(workflow, step);
      expect(knownUsage).toBeDefined();
      if (knownUsage === undefined) continue;
      expectGuardedRegistryUsageStep(step, knownUsage);
    }
  });

  test("keeps API images fail-closed and migrates the social worker default", () => {
    expect(apiCompose).toContain(
      "  gooes-api:\n    image: ${GOOES_API_IMAGE:?set GOOES_API_IMAGE}",
    );
    expect(apiCompose).toContain(
      "  gooes-cos-reconcile-worker:\n    image: ${GOOES_API_IMAGE:?set GOOES_API_IMAGE}",
    );
    expect(apiCompose).not.toContain("GOOES_API_IMAGE:-");
    expect(apiCompose).toContain(
      "  gooes-social-video-worker:\n    image: ${GOOES_SOCIAL_VIDEO_WORKER_IMAGE:-useccr.ccs.tencentyun.com/america_goose/goose-social-video-worker:main}",
    );
  });

  test("uses exact Tencent CCR US defaults for tracked Admin configuration", () => {
    expect(adminCompose).toContain(
      "  gooes-admin:\n    image: ${GOOES_ADMIN_IMAGE:-useccr.ccs.tencentyun.com/america_goose/goose-admin:main}",
    );
    expect(adminEnvironmentExample).toContain(
      "GOOES_ADMIN_IMAGE=useccr.ccs.tencentyun.com/america_goose/goose-admin:main",
    );
  });
});

describe("admin release service resolver", () => {
  test.each([
    ["requested", "all", "api,admin,social-video-worker,cos-reconcile-worker"],
    ["build", "all", "api,admin,social-video-worker"],
    ["requested", "cos-reconcile-worker", "cos-reconcile-worker"],
    ["build", "cos-reconcile-worker", "api"],
    ["requested", "admin,api,admin", "api,admin"],
    ["requested", " admin, api, admin ", "api,admin"],
  ])("resolves %s services %s in dependency order", (mode, services, expected) => {
    const result = resolve(mode, services);

    expect(result.exitCode).toBe(0);
    expect(result.stderr.toString("utf8")).toBe("");
    expect(result.stdout.toString("utf8").trim()).toBe(expected);
  });

  test.each([
    ["requested", "web"],
    ["requested", ""],
    ["deploy", "api"],
  ])("rejects invalid input %s %s", (mode, services) => {
    const result = resolve(mode, services);

    expect(result.exitCode).toBe(1);
    expect(result.stdout.toString("utf8")).toBe("");
    expect(result.stderr.toString("utf8").trim().length).toBeGreaterThan(0);
  });
});

describe("production migration precheck workflow", () => {
  test("publishes a structured JSON artifact for Admin migration comparison", () => {
    expect(migrateProductionWorkflow).toContain("migration-precheck.json");
    expect(migrateProductionWorkflow).toContain("production-migration-precheck");
    expect(migrateProductionWorkflow).toContain("uses: actions/upload-artifact@v6");
    expect(migrateProductionWorkflow).toContain("pending_count: ($pending_count | tonumber)");
    expect(migrateProductionWorkflow).toContain("pending_versions: ($pending_versions | split(\" \")");
    expect(migrateProductionWorkflow).toContain("workflow_run_id: ($workflow_run_id | tonumber)");
  });
});

describe("reusable build workflow", () => {
  const validationRerunGuardStepName = "Reject workflow re-runs";
  const buildRerunGuardStepName = "Reject build job re-runs";
  const validationRerunGuardMarker =
    `      - name: ${validationRerunGuardStepName}`;
  const buildRerunGuardMarker = `      - name: ${buildRerunGuardStepName}`;
  const checkoutMarker = "      - uses: actions/checkout@v6";
  const buildCheckoutMarker = "      - name: Checkout repository";
  const resolveMarker = "      - name: Resolve build plan";
  const rerunGuardTestLine = '          if ! test "${GITHUB_RUN_ATTEMPT}" = 1; then';
  const rerunGuardError =
    "Workflow re-runs are forbidden because they can overwrite immutable image evidence. Start a new workflow dispatch/run; do not use Re-run jobs or Re-run all jobs.";

  function satisfiesRerunAttemptContract(workflow: string): boolean {
    const validationJobStart = workflow.indexOf("  validate-request:");
    const buildJobStart = workflow.indexOf("  build:", validationJobStart + 1);
    const productionPullJobStart = workflow.indexOf(
      "  verify-production-pull:",
      buildJobStart + 1,
    );
    if (
      validationJobStart < 0 ||
      buildJobStart <= validationJobStart ||
      productionPullJobStart <= buildJobStart
    ) {
      return false;
    }

    const validationJob = workflow.slice(validationJobStart, buildJobStart);
    const validationGuardStart = validationJob.indexOf(
      validationRerunGuardMarker,
    );
    const validationCheckoutStart = validationJob.indexOf(checkoutMarker);
    const resolveStart = validationJob.indexOf(resolveMarker);
    if (
      validationGuardStart < 0 ||
      validationCheckoutStart <= validationGuardStart ||
      resolveStart <= validationCheckoutStart
    ) {
      return false;
    }

    const validationGuardEndCandidates = [
      validationCheckoutStart,
      resolveStart,
    ].filter((index) => index > validationGuardStart);
    const validationGuardEnd = Math.min(...validationGuardEndCandidates);
    const validationGuardStep = validationJob.slice(
      validationGuardStart,
      validationGuardEnd,
    );

    const buildJob = workflow.slice(buildJobStart, productionPullJobStart);
    const buildStepsStart = buildJob.indexOf("    steps:");
    const buildGuardStart = buildJob.indexOf(buildRerunGuardMarker);
    const firstBuildStepStart = buildJob.indexOf("      - ", buildStepsStart);
    const buildCheckoutStart = buildJob.indexOf(buildCheckoutMarker);
    if (
      buildStepsStart < 0 ||
      buildGuardStart !== firstBuildStepStart ||
      buildCheckoutStart <= buildGuardStart
    ) {
      return false;
    }
    const buildGuardStep = buildJob.slice(buildGuardStart, buildCheckoutStart);

    const isValidGuardStep = (guardStep: string): boolean =>
      guardStep.includes("          set -euo pipefail") &&
      guardStep.includes(rerunGuardTestLine) &&
      guardStep.includes(rerunGuardError) &&
      !guardStep.includes("        if:");

    return (
      isValidGuardStep(validationGuardStep) &&
      isValidGuardStep(buildGuardStep) &&
      (validationJob.match(/GITHUB_RUN_ATTEMPT/g) ?? []).length === 1 &&
      (buildJob.match(/GITHUB_RUN_ATTEMPT/g) ?? []).length === 1
    );
  }

  const productionTagRegexLine =
    '[[ "${GITHUB_REF_NAME}" =~ ^v[0-9]{4}\\.[0-9]{2}\\.[0-9]{2}\\.[0-9]+$ ]]';
  const productionBuildPlanStart = [
    "            jq -n \\",
    '              --arg target_environment "${TARGET_ENVIRONMENT}" \\',
  ].join("\n");
  const productionValidationRequiredFragments = [
    'TARGET_ENVIRONMENT="${REQUESTED_TARGET_ENVIRONMENT}"',
    'if [ "${TARGET_ENVIRONMENT}" = production ]; then',
    'test "${GITHUB_REF_TYPE}" = tag',
    productionTagRegexLine,
    'RAW_BUILD_SERVICES="$(node scripts/resolve-web-deployment.mjs build "${REQUESTED_SERVICE}")"',
    productionBuildPlanStart,
  ] as const;
  const productionValidationOrderedFragments = [
    'TARGET_ENVIRONMENT="${REQUESTED_TARGET_ENVIRONMENT}"',
    'if [ "${TARGET_ENVIRONMENT}" = production ]; then',
    'test "${GITHUB_REF_TYPE}" = tag',
    productionTagRegexLine,
    "            fi",
    'RAW_BUILD_SERVICES="$(node scripts/resolve-web-deployment.mjs build "${REQUESTED_SERVICE}")"',
    productionBuildPlanStart,
  ] as const;
  const productionMatrixBoundaryOrderedFragments = [
    'if [ "${TARGET_ENVIRONMENT}" = production ]; then',
    productionTagRegexLine,
    "\n  build:",
    "      - name: Login to Tencent CCR",
    '          push_image "$SHA_IMAGE"',
    "\n  verify-production-pull:",
  ] as const;
  const productionPullJobStepOrderedFragments = [
    "      - name: Guard production pull verification",
    "      - name: Download immutable production evidence",
    "      - name: Login to Tencent CCR",
    "      - name: Pull and verify immutable images",
  ] as const;
  const productionPullJobRequiredFragments = [
    "    needs: [validate-request, build]",
    "    if: ${{ needs.validate-request.outputs.target_environment == 'production' && needs.validate-request.outputs.no_op != 'true' && needs.build.result == 'success' }}",
    "    runs-on: [self-hosted, Linux, X64, gooes-prod-deploy]",
    "    environment: production",
    "    timeout-minutes: 30",
    "      BUILD_SERVICES: ${{ needs.validate-request.outputs.build_services }}",
    ...productionPullJobStepOrderedFragments,
  ] as const;
  const productionPullGuardRequiredFragments = [
    "          set -euo pipefail",
    "          docker buildx version",
    '          test "${RUNNER_NAME}" = "gooes-prod-vm-0-3"',
    '          test "${GITHUB_REF_TYPE}" = tag',
    `          ${productionTagRegexLine}`,
    '          [[ "${GITHUB_SHA}" =~ ^[a-f0-9]{40}$ ]]',
    '          test -n "${BUILD_SERVICES}"',
  ] as const;
  const productionPullEvidenceRequiredFragments = [
    "          GH_TOKEN: ${{ github.token }}",
    "          set -euo pipefail",
    '          evidence_dir="${RUNNER_TEMP}/production-pull-${GITHUB_RUN_ID}"',
    '          rm -rf "${evidence_dir}"',
    '          mkdir -p "${evidence_dir}"',
    '          gh run download "${GITHUB_RUN_ID}" -n production-build-plan -D "${evidence_dir}"',
    '            gh run download "${GITHUB_RUN_ID}" -n "image-manifest-${service}" -D "${evidence_dir}"',
    '          test "$(jq -r \'.target_environment\' "${evidence_dir}/build-plan.json")" = production',
    '          test "$(jq -r \'.commit_sha\' "${evidence_dir}/build-plan.json")" = "${GITHUB_SHA}"',
    '          test "$(jq -r \'.build_services | join(" ")\' "${evidence_dir}/build-plan.json")" = "${BUILD_SERVICES}"',
    '          echo "PULL_EVIDENCE_DIR=${evidence_dir}" >> "${GITHUB_ENV}"',
  ] as const;
  const productionPullLoginRequiredFragments = [
    "          TENCENT_CCR_USERNAME: ${{ secrets.TENCENT_CCR_USERNAME }}",
    "          TENCENT_CCR_PASSWORD: ${{ secrets.TENCENT_CCR_PASSWORD }}",
    "          set -euo pipefail",
    '          test -n "${TENCENT_CCR_USERNAME}"',
    '          test -n "${TENCENT_CCR_PASSWORD}"',
    '          test -n "${TENCENT_CCR_REGISTRY}"',
    '          test -n "${TENCENT_CCR_NAMESPACE}"',
    '          case "${TENCENT_CCR_REGISTRY}:${TENCENT_CCR_NAMESPACE}" in',
    `            ${allowedRegistryPairArm}`,
    "          for attempt in 1 2 3 4 5; do",
    '            if printf \'%s\' "${TENCENT_CCR_PASSWORD}" | docker login "${TENCENT_CCR_REGISTRY}" \\',
    '              -u "${TENCENT_CCR_USERNAME}" --password-stdin; then',
    "            sleep $((attempt * 5))",
    "          done\n          exit 1",
  ] as const;
  const absentImageCleanupBlock = [
    '            if ! docker image inspect "${expected_digest_ref}" >/dev/null 2>&1; then',
    '              cleanup_images+=("${expected_digest_ref}")',
    "            fi",
  ].join("\n");
  const canonicalCleanupImageRemovalLine =
    '              docker image rm "${image}" >/dev/null 2>&1 || true';
  const cleanupFunctionBlock = [
    "          cleanup() {",
    '            for image in "${cleanup_images[@]}"; do',
    canonicalCleanupImageRemovalLine,
    "            done",
    "          }",
  ].join("\n");
  const manifestDigestLine =
    "            digest=\"$(jq -er '.digest | select(type == \"string\" and test(\"^sha256:[a-f0-9]{64}$\"))' \"${manifest}\")\"";
  const remoteDigestResolutionLine =
    '            remote_digest="$(resolve_remote_digest "${expected_image}")"';
  const remoteDigestRegexLine =
    '            [[ "${remote_digest}" =~ ^sha256:[a-f0-9]{64}$ ]]';
  const remoteDigestComparisonLine =
    '            test "${remote_digest}" = "${digest}"';
  const expectedDigestRefLine =
    '            expected_digest_ref="${TENCENT_CCR_REGISTRY}/${TENCENT_CCR_NAMESPACE}/${image_repo}@${digest}"';
  const immutablePullLine = '            docker pull "${expected_digest_ref}"';
  const revisionInspectLine =
    "            revision=\"$(docker image inspect -f '{{index .Config.Labels \"org.opencontainers.image.revision\"}}' \"${expected_digest_ref}\")\"";
  const runIdInspectLine =
    "            run_id=\"$(docker image inspect -f '{{index .Config.Labels \"com.goodcms.github.run_id\"}}' \"${expected_digest_ref}\")\"";
  const repoDigestsInspectLine =
    "            repo_digests=\"$(docker image inspect -f '{{json .RepoDigests}}' \"${expected_digest_ref}\")\"";
  const repoDigestsAssertionLine =
    "            jq -e --arg expected \"${expected_digest_ref}\" 'index($expected) != null' <<< \"${repo_digests}\" >/dev/null";
  const productionPullImageRequiredFragments = [
    "          set -euo pipefail",
    '          test -n "${TENCENT_CCR_REGISTRY}"',
    '          test -n "${TENCENT_CCR_NAMESPACE}"',
    '          case "${TENCENT_CCR_REGISTRY}:${TENCENT_CCR_NAMESPACE}" in',
    `            ${allowedRegistryPairArm}`,
    "          cleanup_images=()",
    cleanupFunctionBlock,
    "          trap cleanup EXIT",
    "              api) image_repo=goose-api ;;",
    "              admin) image_repo=goose-admin ;;",
    "              web) image_repo=goose-web ;;",
    "              social-video-worker) image_repo=goose-social-video-worker ;;",
    '              *) echo "Unsupported build service: ${service}"; exit 1 ;;',
    '            manifest="${PULL_EVIDENCE_DIR}/image-manifest-${service}.json"',
    '            test "$(jq -r \'.service\' "${manifest}")" = "${service}"',
    '            test "$(jq -r \'.commit_sha\' "${manifest}")" = "${GITHUB_SHA}"',
    '            test "$(jq -r \'.target_environment\' "${manifest}")" = production',
    '            test "$(jq -er \'.build_run_id | select(type == "number" and . > 0 and (floor == .))\' "${manifest}")" = "${GITHUB_RUN_ID}"',
    '            expected_image="${TENCENT_CCR_REGISTRY}/${TENCENT_CCR_NAMESPACE}/${image_repo}:run-${GITHUB_RUN_ID}-${GITHUB_SHA}"',
    '            test "$(jq -r \'.image\' "${manifest}")" = "${expected_image}"',
    manifestDigestLine,
    remoteDigestResolutionLine,
    remoteDigestRegexLine,
    remoteDigestComparisonLine,
    expectedDigestRefLine,
    absentImageCleanupBlock,
    immutablePullLine,
    revisionInspectLine,
    '            test "${revision}" = "${GITHUB_SHA}"',
    runIdInspectLine,
    '            test "${run_id}" = "${GITHUB_RUN_ID}"',
    repoDigestsInspectLine,
    repoDigestsAssertionLine,
  ] as const;
  const productionPullImageOrderedFragments = [
    '            manifest="${PULL_EVIDENCE_DIR}/image-manifest-${service}.json"',
    '            test "$(jq -r \'.service\' "${manifest}")" = "${service}"',
    '            test "$(jq -r \'.commit_sha\' "${manifest}")" = "${GITHUB_SHA}"',
    '            test "$(jq -r \'.target_environment\' "${manifest}")" = production',
    '            test "$(jq -er \'.build_run_id | select(type == "number" and . > 0 and (floor == .))\' "${manifest}")" = "${GITHUB_RUN_ID}"',
    '            expected_image="${TENCENT_CCR_REGISTRY}/${TENCENT_CCR_NAMESPACE}/${image_repo}:run-${GITHUB_RUN_ID}-${GITHUB_SHA}"',
    '            test "$(jq -r \'.image\' "${manifest}")" = "${expected_image}"',
    manifestDigestLine,
    remoteDigestResolutionLine,
    remoteDigestRegexLine,
    remoteDigestComparisonLine,
    expectedDigestRefLine,
    absentImageCleanupBlock,
    immutablePullLine,
    revisionInspectLine,
    '            test "${revision}" = "${GITHUB_SHA}"',
    runIdInspectLine,
    '            test "${run_id}" = "${GITHUB_RUN_ID}"',
    repoDigestsInspectLine,
    repoDigestsAssertionLine,
  ] as const;
  const productionPullImageForbiddenPatterns = [
    /cleanup_images\+=\("\$\{expected_image\}"\)/,
    /docker pull[^\n]*"\$\{expected_image\}"/,
    /docker tag[^\n]*"\$\{expected_image\}"/,
    /docker image tag[^\n]*"\$\{expected_image\}"/,
    /docker image rm[^\n]*"\$\{expected_image\}"/,
    /docker rmi[^\n]*"\$\{expected_image\}"/,
    /docker image inspect[^\n]*"\$\{expected_image\}"/,
  ] as const;
  const mutableShaTagOperationFixtures = [
    'docker tag "${expected_digest_ref}" "${expected_image}"',
    'docker image tag "${expected_digest_ref}" "${expected_image}"',
    'docker image rm "${expected_image}"',
    'docker rmi "${expected_image}"',
    'docker pull "${expected_image}"',
  ] as const;
  const productionPullForbiddenPatterns = [
    /\bdocker\s+compose\b/i,
    /\bdocker\s+(?:run|start|stop|restart)\b/i,
    /\bsystemctl(?:\s|$)/i,
    /\bnginx(?:\s|$)/i,
  ] as const;

  test("exposes stable inputs, outputs, and environment-specific build plans", () => {
    expect(buildWorkflow).toContain("push:\n    branches: [main]");
    expect(buildWorkflow).toContain("workflow_dispatch:");
    expect(buildWorkflow).toContain("workflow_call:");
    expect(buildWorkflow).toContain(
      "target_environment:\n        required: true\n        type: string",
    );
    expect(buildWorkflow).toContain("service:\n        required: true\n        type: string");
    expect(buildWorkflow).toContain(
      "      build_services:\n        value: ${{ jobs.validate-request.outputs.build_services }}",
    );
    expect(buildWorkflow).toContain(
      "      deploy_services:\n        value: ${{ jobs.validate-request.outputs.deploy_services }}",
    );
    expect(buildWorkflow).toContain(
      "      no_op:\n        value: ${{ jobs.validate-request.outputs.no_op }}",
    );
    expect(buildWorkflow).toContain(
      "      target_environment:\n        value: ${{ jobs.validate-request.outputs.target_environment }}",
    );
    expect(buildWorkflow).toContain("inputs.target_environment");
    expect(buildWorkflow).toContain("inputs.service");
    expect(buildWorkflow).toContain(
      "name: ${{ steps.resolve.outputs.target_environment == 'production' && 'production-build-plan' || 'dev-build-plan' }}",
    );
  });

  test("guards both complete workflow re-runs and isolated build job re-runs before writes", () => {
    expect(satisfiesRerunAttemptContract(buildWorkflow)).toBe(true);

    const validationGuardStep = sliceWorkflowStep(
      buildWorkflow,
      validationRerunGuardStepName,
    );
    const buildGuardStart = buildWorkflow.indexOf(buildRerunGuardMarker);
    expect(buildGuardStart).toBeGreaterThanOrEqual(0);
    if (buildGuardStart < 0) {
      return;
    }
    const buildGuardStep = sliceWorkflowStepAt(buildWorkflow, buildGuardStart);

    for (const deletedGuard of [validationGuardStep, buildGuardStep]) {
      const mutatedWorkflow = buildWorkflow.replace(deletedGuard, "");
      expect(mutatedWorkflow).not.toBe(buildWorkflow);
      expect(satisfiesRerunAttemptContract(mutatedWorkflow)).toBe(false);
    }

    const attemptTwoAllowed = buildWorkflow.replace(
      rerunGuardTestLine,
      '          if ! test "${GITHUB_RUN_ATTEMPT}" -ge 1; then',
    );
    expect(attemptTwoAllowed).not.toBe(buildWorkflow);
    expect(satisfiesRerunAttemptContract(attemptTwoAllowed)).toBe(false);

    const guardAfterResolve = buildWorkflow
      .replace(validationGuardStep, "")
      .replace(resolveMarker, `${resolveMarker}\n${validationGuardStep}`);
    expect(guardAfterResolve).not.toBe(buildWorkflow);
    expect(satisfiesRerunAttemptContract(guardAfterResolve)).toBe(false);

    for (const laterStepName of ["Checkout repository", "Login to Tencent CCR"]) {
      const laterStep = sliceWorkflowStep(buildWorkflow, laterStepName);
      const movedBuildGuard = buildWorkflow
        .replace(buildGuardStep, "")
        .replace(laterStep, `${laterStep}${buildGuardStep}`);
      expect(movedBuildGuard).not.toBe(buildWorkflow);
      expect(satisfiesRerunAttemptContract(movedBuildGuard)).toBe(false);
    }
  });

  test("limits the job-level re-run guard to the image-writing build job", () => {
    const validationJob = sliceWorkflowJob(
      buildWorkflow,
      "validate-request",
      "build",
    );
    const buildJob = sliceWorkflowJob(
      buildWorkflow,
      "build",
      "verify-production-pull",
    );
    const productionPullJob = buildWorkflow.slice(
      buildWorkflow.indexOf("  verify-production-pull:"),
    );

    expect(validationJob).toContain(validationRerunGuardMarker);
    expect(buildJob).not.toContain(validationRerunGuardMarker);
    expect(buildJob).toContain(buildRerunGuardMarker);
    expect(buildJob).toContain('push_image "$RUN_IMAGE"');
    expect(productionPullJob).not.toContain("GITHUB_RUN_ATTEMPT");
    expect(productionPullJob).not.toContain(buildRerunGuardMarker);
  });

  test("allows attempt one and rejects attempt two in each independently executed job", () => {
    for (const guardStepName of [
      validationRerunGuardStepName,
      buildRerunGuardStepName,
    ]) {
      const guardStart = buildWorkflow.indexOf(`      - name: ${guardStepName}`);
      expect(guardStart).toBeGreaterThanOrEqual(0);
      if (guardStart < 0) {
        continue;
      }
      const guardScript = extractWorkflowRunScript(
        sliceWorkflowStepAt(buildWorkflow, guardStart),
      );
      const runGuard = (attempt: string): ReturnType<typeof Bun.spawnSync> =>
        Bun.spawnSync(["bash", "-c", guardScript], {
          env: { GITHUB_RUN_ATTEMPT: attempt },
          stderr: "pipe",
          stdout: "pipe",
        });

      expect(runGuard("1").exitCode).toBe(0);
      const rejectedRerun = runGuard("2");
      expect(rejectedRerun.exitCode).not.toBe(0);
      expect(rejectedRerun.stderr.toString()).toContain(rerunGuardError);
    }
  });

  test("distinguishes a direct push from a reusable call whose caller event is push", () => {
    expect(buildWorkflow).toContain(
      "run-name: ${{ github.event_name == 'push' && inputs.target_environment == '' && inputs.service == '' && 'Build development affected services' || format('Build {0} {1}', inputs.target_environment, inputs.service || 'all') }}",
    );
    expect(buildWorkflow).toContain(
      "group: ${{ github.event_name == 'push' && inputs.target_environment == '' && inputs.service == '' && 'build-docker-images-development-push' || format('build-docker-images-{0}-{1}', inputs.target_environment, inputs.service) }}",
    );
    expect(buildWorkflow).toContain(
      "cancel-in-progress: ${{ github.event_name != 'push' || inputs.target_environment != '' || inputs.service != '' }}",
    );
    expect(buildWorkflow).toContain(
      "DIRECT_PUSH: ${{ github.event_name == 'push' && inputs.target_environment == '' && inputs.service == '' }}",
    );
    expect(buildWorkflow).toContain('if [ "${DIRECT_PUSH}" = "true" ]; then');
    expect(buildWorkflow).not.toContain('if [ "${GITHUB_EVENT_NAME}" = "push" ]; then');
  });

  test("rejects production builds before service resolution and matrix push", () => {
    const validationJob = sliceWorkflowJob(buildWorkflow, "validate-request", "build");
    const buildJob = sliceWorkflowJob(
      buildWorkflow,
      "build",
      "verify-production-pull",
    );

    for (const fragment of productionValidationRequiredFragments) {
      expect(validationJob).toContain(fragment);
    }
    let previousFragmentEnd = 0;
    for (const fragment of productionValidationOrderedFragments) {
      const fragmentStart = validationJob.indexOf(fragment, previousFragmentEnd);
      expect(fragmentStart).toBeGreaterThanOrEqual(previousFragmentEnd);
      previousFragmentEnd = fragmentStart + fragment.length;
    }
    expect(buildJob).toContain("needs: validate-request");
    expect(buildJob).toContain("      - name: Login to Tencent CCR");
    expect(buildJob).toContain('          push_image "$SHA_IMAGE"');
    expect(validationJob).not.toContain("docker push");
    let previousBoundaryEnd = 0;
    for (const fragment of productionMatrixBoundaryOrderedFragments) {
      const fragmentStart = buildWorkflow.indexOf(fragment, previousBoundaryEnd);
      expect(fragmentStart).toBeGreaterThanOrEqual(previousBoundaryEnd);
      previousBoundaryEnd = fragmentStart + fragment.length;
    }
  });

  test("publishes run-scoped build evidence instead of resolving a mutable SHA tag", () => {
    const buildStep = sliceWorkflowStep(buildWorkflow, "Build and push image");

    expect(buildStep).toContain('RUN_IMAGE="${IMAGE_BASE}:run-${GITHUB_RUN_ID}-${GITHUB_SHA}"');
    expect(buildStep.match(/-t "\$RUN_IMAGE"/g)).toHaveLength(4);
    expect(buildStep).toContain('push_image "$RUN_IMAGE"');
    expect(buildStep).toContain('docker buildx imagetools inspect "${image}"');
    expect(buildStep).not.toContain('docker buildx imagetools inspect "$SHA_IMAGE"');
    expect(buildStep).toContain('--arg image "${RUN_IMAGE}"');
    expect(buildStep).toContain('--argjson build_run_id "${GITHUB_RUN_ID}"');
    expect(buildStep).toContain('build_run_id:$build_run_id');

    const sha = "a".repeat(40);
    const developmentRunImage = `registry/namespace/goose-admin:run-101-${sha}`;
    const productionRunImage = `registry/namespace/goose-admin:run-202-${sha}`;
    expect(developmentRunImage).not.toBe(productionRunImage);
    expect(developmentRunImage).toEndWith(`run-101-${sha}`);
    expect(productionRunImage).toEndWith(`run-202-${sha}`);
  });

  test("retries CCR pushes and remote digest resolution without rebuilding", () => {
    const buildStep = sliceWorkflowStep(buildWorkflow, "Build and push image");
    const pushFunctionStart = buildStep.indexOf("          push_image() {");
    const digestFunctionStart = buildStep.indexOf(
      "          resolve_remote_digest() {",
    );
    const pushFunction = buildStep.slice(
      pushFunctionStart,
      digestFunctionStart,
    );
    const digestFunction = buildStep.slice(
      digestFunctionStart,
      buildStep.indexOf("\n\n          case", digestFunctionStart),
    );

    expect(pushFunctionStart).toBeGreaterThanOrEqual(0);
    expect(digestFunctionStart).toBeGreaterThan(pushFunctionStart);
    expect(pushFunction.match(/for attempt in 1 2 3 4 5; do/g)).toHaveLength(1);
    expect(pushFunction.match(/docker push "\$\{image\}"/g)).toHaveLength(1);
    expect(buildStep.match(/^\s*(?:if )?docker push\b/gm)).toHaveLength(1);
    expect(pushFunction.trimEnd()).toEndWith("return 1\n          }");
    expect(pushFunction).not.toMatch(/\bdocker (?:build(?:\s|$)|buildx build(?:\s|$))/);
    expect(digestFunction.match(/for attempt in 1 2 3 4 5; do/g)).toHaveLength(1);
    expect(
      digestFunction.match(/docker buildx imagetools inspect "\$\{image\}"/g),
    ).toHaveLength(1);
    expect(buildStep.match(/docker buildx imagetools inspect/g)).toHaveLength(1);
    expect(digestFunction).toContain(
      '[[ "${digest}" =~ ^sha256:[a-f0-9]{64}$ ]]',
    );
    expect(digestFunction.trimEnd()).toEndWith("return 1\n          }");
    expect(digestFunction).not.toMatch(/\bdocker (?:build(?:\s|$)|buildx build(?:\s|$))/);
    expect(buildStep).toContain('push_image "$BRANCH_IMAGE"');
    expect(buildStep).toContain('push_image "$SHA_IMAGE"');
    expect(buildStep).toContain('push_image "$RUN_IMAGE"');
    expect(buildStep).toContain('digest="$(resolve_remote_digest "$RUN_IMAGE")"');
    expect(buildStep).not.toContain('\n          docker push "$BRANCH_IMAGE"');
    expect(buildStep).not.toContain('\n          docker push "$SHA_IMAGE"');
    expect(buildStep).not.toContain('\n          docker push "$RUN_IMAGE"');
    expect(buildStep.match(/\bdocker build\b/g)).toHaveLength(4);
  });

  test("retries production remote digest resolution before immutable pull", () => {
    const pullJob = sliceWorkflowJob(
      buildWorkflow,
      "verify-production-pull",
      "# End production pull verification",
    );
    const pullStep = sliceWorkflowStep(pullJob, "Pull and verify immutable images");
    const digestFunctionStart = pullStep.indexOf(
      "          resolve_remote_digest() {",
    );
    const digestFunction = pullStep.slice(
      digestFunctionStart,
      pullStep.indexOf("\n\n          cleanup_images", digestFunctionStart),
    );

    expect(digestFunctionStart).toBeGreaterThanOrEqual(0);
    expect(digestFunction.match(/for attempt in 1 2 3 4 5; do/g)).toHaveLength(1);
    expect(
      digestFunction.match(/docker buildx imagetools inspect "\$\{image\}"/g),
    ).toHaveLength(1);
    expect(pullStep.match(/docker buildx imagetools inspect/g)).toHaveLength(1);
    expect(digestFunction).toContain(
      '[[ "${digest}" =~ ^sha256:[a-f0-9]{64}$ ]]',
    );
    expect(digestFunction.trimEnd()).toEndWith("return 1\n          }");
    expect(digestFunction).not.toMatch(/\bdocker (?:build(?:\s|$)|buildx build(?:\s|$))/);
    expect(pullStep).toContain(remoteDigestResolutionLine);
    expect(pullStep).not.toContain(
      'remote_digest="$(docker buildx imagetools inspect "${expected_image}"',
    );
  });

  test("rejects a valid-looking digest when inspect exits nonzero", () => {
    const pullJob = sliceWorkflowJob(
      buildWorkflow,
      "verify-production-pull",
      "# End production pull verification",
    );
    const retrySteps = [
      sliceWorkflowStep(buildWorkflow, "Build and push image"),
      sliceWorkflowStep(pullJob, "Pull and verify immutable images"),
    ];

    for (const step of retrySteps) {
      const result = runDigestRetryHelper(step, "nonzero-valid");
      expect(result.exitCode).not.toBe(0);
      expect(result.attempts).toBe(5);
      expect(result.stdout).toBe("");
    }
  });

  test("stops digest retries on fifth success and fails after five errors", () => {
    const pullJob = sliceWorkflowJob(
      buildWorkflow,
      "verify-production-pull",
      "# End production pull verification",
    );
    const retrySteps = [
      sliceWorkflowStep(buildWorkflow, "Build and push image"),
      sliceWorkflowStep(pullJob, "Pull and verify immutable images"),
    ];
    const expectedDigest = `sha256:${"a".repeat(64)}`;

    for (const step of retrySteps) {
      const success = runDigestRetryHelper(step, "succeed-fifth");
      expect(success).toEqual({
        attempts: 5,
        exitCode: 0,
        stdout: expectedDigest,
      });

      const failure = runDigestRetryHelper(step, "always-fail");
      expect(failure.exitCode).not.toBe(0);
      expect(failure.attempts).toBe(5);
      expect(failure.stdout).toBe("");
    }
  });

  test("binds production pull verification to run-scoped image and OCI run label", () => {
    const pullJob = sliceWorkflowJob(
      buildWorkflow,
      "verify-production-pull",
      "# End production pull verification",
    );
    const pullStep = sliceWorkflowStep(pullJob, "Pull and verify immutable images");

    expect(pullStep).toContain(
      'expected_image="${TENCENT_CCR_REGISTRY}/${TENCENT_CCR_NAMESPACE}/${image_repo}:run-${GITHUB_RUN_ID}-${GITHUB_SHA}"',
    );
    expect(pullStep).toContain(
      'test "$(jq -er \'.build_run_id | select(type == "number" and . > 0 and (floor == .))\' "${manifest}")" = "${GITHUB_RUN_ID}"',
    );
    expect(pullStep).toContain(
      'run_id="$(docker image inspect -f \'{{index .Config.Labels "com.goodcms.github.run_id"}}\' "${expected_digest_ref}")"',
    );
    expect(pullStep).toContain('test "${run_id}" = "${GITHUB_RUN_ID}"');
    expect(pullStep).not.toContain('expected_image="${TENCENT_CCR_REGISTRY}/${TENCENT_CCR_NAMESPACE}/${image_repo}:${GITHUB_SHA}"');
  });

  test("locks the production pull job boundary", () => {
    const pullJob = sliceWorkflowJob(
      buildWorkflow,
      "verify-production-pull",
      "# End production pull verification",
    );

    for (const fragment of productionPullJobRequiredFragments) {
      expect(pullJob).toContain(fragment);
    }
    let previousStepEnd = 0;
    for (const fragment of productionPullJobStepOrderedFragments) {
      const fragmentStart = pullJob.indexOf(fragment, previousStepEnd);
      expect(fragmentStart).toBeGreaterThanOrEqual(previousStepEnd);
      previousStepEnd = fragmentStart + fragment.length;
    }
  });

  test("guards production pull metadata", () => {
    const pullJob = sliceWorkflowJob(
      buildWorkflow,
      "verify-production-pull",
      "# End production pull verification",
    );
    const guardStep = sliceWorkflowStep(
      pullJob,
      "Guard production pull verification",
    );

    for (const fragment of productionPullGuardRequiredFragments) {
      expect(guardStep).toContain(fragment);
    }
    expect(guardStep).not.toContain("TENCENT_CCR_REGISTRY");
    expect(guardStep).not.toContain("TENCENT_CCR_NAMESPACE");
  });

  test("downloads and validates immutable production evidence", () => {
    const pullJob = sliceWorkflowJob(
      buildWorkflow,
      "verify-production-pull",
      "# End production pull verification",
    );
    const evidenceStep = sliceWorkflowStep(
      pullJob,
      "Download immutable production evidence",
    );

    for (const fragment of productionPullEvidenceRequiredFragments) {
      expect(evidenceStep).toContain(fragment);
    }
  });

  test("logs in to Tencent CCR with guarded retries", () => {
    const pullJob = sliceWorkflowJob(
      buildWorkflow,
      "verify-production-pull",
      "# End production pull verification",
    );
    const loginStep = sliceWorkflowStep(pullJob, "Login to Tencent CCR");

    for (const fragment of productionPullLoginRequiredFragments) {
      expect(loginStep).toContain(fragment);
    }
    expect(loginStep.trimEnd()).toEndWith("done\n          exit 1");
    expectGuardedRegistryUsageStep(
      loginStep,
      'docker login "${TENCENT_CCR_REGISTRY}"',
    );
  });

  test("pulls, verifies, and cleans up immutable production images", () => {
    const pullJob = sliceWorkflowJob(
      buildWorkflow,
      "verify-production-pull",
      "# End production pull verification",
    );
    const pullStep = sliceWorkflowStep(
      pullJob,
      "Pull and verify immutable images",
    );

    for (const fragment of productionPullImageRequiredFragments) {
      expect(pullStep).toContain(fragment);
    }
    let previousFragmentEnd = 0;
    for (const fragment of productionPullImageOrderedFragments) {
      const fragmentStart = pullStep.indexOf(fragment, previousFragmentEnd);
      expect(fragmentStart).toBeGreaterThanOrEqual(previousFragmentEnd);
      previousFragmentEnd = fragmentStart + fragment.length;
    }
    expect(pullStep.split('cleanup_images+=("${expected_digest_ref}")')).toHaveLength(2);
    for (const pattern of productionPullImageForbiddenPatterns) {
      expect(pattern.test(pullStep)).toBe(false);
    }
    for (const operation of mutableShaTagOperationFixtures) {
      expect(pullStep).not.toContain(operation);
    }
    expectGuardedRegistryUsageStep(
      pullStep,
      'expected_image="${TENCENT_CCR_REGISTRY}/${TENCENT_CCR_NAMESPACE}/${image_repo}:run-${GITHUB_RUN_ID}-${GITHUB_SHA}"',
    );
  });

  test("keeps production pull verification free of deployment commands", () => {
    const pullJob = sliceWorkflowJob(
      buildWorkflow,
      "verify-production-pull",
      "# End production pull verification",
    );

    for (const pattern of productionPullForbiddenPatterns) {
      expect(pattern.test(pullJob)).toBe(false);
    }
  });

  test("rejects malformed production pull verification contracts", () => {
    const validationJob = sliceWorkflowJob(buildWorkflow, "validate-request", "build");
    const pullJob = sliceWorkflowJob(
      buildWorkflow,
      "verify-production-pull",
      "# End production pull verification",
    );
    const validationContract: WorkflowTextContract = {
      requiredFragments: productionValidationRequiredFragments,
      orderedFragments: productionValidationOrderedFragments,
    };
    const matrixBoundaryContract: WorkflowTextContract = {
      requiredFragments: productionMatrixBoundaryOrderedFragments,
      orderedFragments: productionMatrixBoundaryOrderedFragments,
    };
    const pullJobContract: WorkflowTextContract = {
      requiredFragments: productionPullJobRequiredFragments,
      orderedFragments: productionPullJobStepOrderedFragments,
      forbiddenPatterns: productionPullForbiddenPatterns,
      exactLineContracts: [
        {
          line: canonicalCleanupImageRemovalLine,
          count: 1,
          exclusivePattern: /^\s*docker image rm(?:\s|$)/,
        },
      ],
    };
    const pullImageContract: WorkflowTextContract = {
      requiredFragments: productionPullImageRequiredFragments,
      orderedFragments: productionPullImageOrderedFragments,
      forbiddenPatterns: productionPullImageForbiddenPatterns,
    };
    const contracts: readonly {
      content: string;
      contract: WorkflowTextContract;
    }[] = [
      {
        content: validationJob,
        contract: validationContract,
      },
      {
        content: buildWorkflow,
        contract: matrixBoundaryContract,
      },
      {
        content: pullJob,
        contract: pullJobContract,
      },
      {
        content: sliceWorkflowStep(pullJob, "Guard production pull verification"),
        contract: { requiredFragments: productionPullGuardRequiredFragments },
      },
      {
        content: sliceWorkflowStep(
          pullJob,
          "Download immutable production evidence",
        ),
        contract: { requiredFragments: productionPullEvidenceRequiredFragments },
      },
      {
        content: sliceWorkflowStep(pullJob, "Login to Tencent CCR"),
        contract: { requiredFragments: productionPullLoginRequiredFragments },
      },
      {
        content: sliceWorkflowStep(pullJob, "Pull and verify immutable images"),
        contract: pullImageContract,
      },
    ];

    for (const { content, contract } of contracts) {
      expect(validatesWorkflowTextContract(content, contract)).toBe(true);
      for (const fragment of contract.requiredFragments) {
        const malformedContent = content.replace(fragment, "");
        expect(malformedContent).not.toBe(content);
        expect(validatesWorkflowTextContract(malformedContent, contract)).toBe(false);
      }
    }

    const misplacedValidation = swapWorkflowFragments(
      validationJob,
      productionValidationOrderedFragments[0],
      productionValidationOrderedFragments[1],
    );
    expect(
      validatesWorkflowTextContract(misplacedValidation, validationContract),
    ).toBe(false);

    const misplacedPullStepOrder = swapWorkflowFragments(
      pullJob,
      productionPullJobStepOrderedFragments[2],
      productionPullJobStepOrderedFragments[3],
    );
    expect(
      validatesWorkflowTextContract(misplacedPullStepOrder, pullJobContract),
    ).toBe(false);

    const pullJobWithGuardCleanup = pullJob.replace(
      "          docker buildx version",
      [
        "          docker buildx version",
        "          docker image rm -f production-image:main",
      ].join("\n"),
    );
    expect(pullJobWithGuardCleanup).not.toBe(pullJob);
    expect(
      validatesWorkflowTextContract(pullJobWithGuardCleanup, pullJobContract),
    ).toBe(false);

    const pullStep = sliceWorkflowStep(
      pullJob,
      "Pull and verify immutable images",
    );
    const misplacedRemoteResolution = swapWorkflowFragments(
      pullStep,
      manifestDigestLine,
      remoteDigestResolutionLine,
    );
    expect(
      validatesWorkflowTextContract(misplacedRemoteResolution, pullImageContract),
    ).toBe(false);

    for (const mutableTagOperation of [
      'cleanup_images+=("${expected_image}")',
      'docker image inspect "${expected_image}"',
      ...mutableShaTagOperationFixtures,
    ]) {
      expect(
        validatesWorkflowTextContract(
          `${pullStep}\n            ${mutableTagOperation}`,
          pullImageContract,
        ),
      ).toBe(false);
    }

    for (const extraImageRemoval of [
      'docker image rm "${expected_digest_ref}"',
      'docker image rm -f "${expected_digest_ref}"',
    ]) {
      expect(
        validatesWorkflowTextContract(
          `${pullJob}\n            ${extraImageRemoval}`,
          pullJobContract,
        ),
      ).toBe(false);
    }

    for (const command of [
      "docker compose up -d",
      "docker run --rm busybox true",
      "docker start gooes-api",
      "docker stop gooes-api",
      "docker restart gooes-api",
      "systemctl restart gooes-api",
      "nginx -s reload",
    ]) {
      expect(
        validatesWorkflowTextContract(
          `${pullJob}\n          ${command}`,
          pullJobContract,
        ),
      ).toBe(false);
    }
  });

  test("keeps automatic development deployment bound to successful push evidence", () => {
    expect(autoDeployDevWorkflow).toContain(
      "gh run download \"${UPSTREAM_RUN_ID}\" -n dev-build-plan",
    );
    expect(autoDeployDevWorkflow).toContain(
      "github.event.workflow_run.event == 'push'",
    );
    expect(autoDeployDevWorkflow).toContain(
      "test \"$(jq -r '.event' <<< \"${run_json}\")\" = push",
    );
    expect(autoDeployDevWorkflow).toContain(
      "test \"$(jq -r '.path' <<< \"${run_json}\")\" = \".github/workflows/build-docker-images.yml\"",
    );
  });
});

describe("development orchestrator", () => {
  test("provides a development-only manual release entrypoint", () => {
    expect(releaseDevWorkflow).toContain("name: Release Dev");
    expect(releaseDevWorkflow).toContain("workflow_dispatch:");
    expect(releaseDevWorkflow).not.toContain("workflow_call:");
    expect(releaseDevWorkflow).not.toContain("\n  push:");
    expect(releaseDevWorkflow).not.toContain("workflow_run:");
    const serviceInput = releaseDevWorkflow.slice(
      releaseDevWorkflow.indexOf("      service:"),
      releaseDevWorkflow.indexOf("      operation:"),
    );
    expect(serviceInput).toContain("required: true");
    expect(serviceInput).toContain("type: string");
    expect(releaseDevWorkflow).toContain("options: [release, rollback]");
    expect(releaseDevWorkflow).toContain("reason:");
    expect(releaseDevWorkflow).toContain("contents: read");
    expect(releaseDevWorkflow).toContain("actions: read");
    expect(releaseDevWorkflow).toContain("group: admin-release-development");
    expect(releaseDevWorkflow).toContain("cancel-in-progress: false");
    expect(releaseDevWorkflow).not.toContain("gooes-prod-deploy");
    expect(releaseDevWorkflow).not.toContain("1.13.20.39");
    expect(releaseDevWorkflow).not.toContain("production");
    expect(releaseDevWorkflow).not.toContain("web");
  });

  test("prepares ordered requested and build service evidence", () => {
    expect(releaseDevWorkflow).toContain("[[ \"${GITHUB_SHA}\" =~ ^[a-f0-9]{40}$ ]]");
    expect(releaseDevWorkflow).toContain('test "$(git rev-parse HEAD)" = "${GITHUB_SHA}"');
    expect(releaseDevWorkflow).toContain(
      'node scripts/resolve-admin-release-services.mjs requested "${REQUESTED_SERVICE}"',
    );
    expect(releaseDevWorkflow).toContain(
      'node scripts/resolve-admin-release-services.mjs build "${REQUESTED_SERVICE}"',
    );
    for (const output of [
      "requested_services",
      "build_services",
      "has_api",
      "has_rest",
      "rest_matrix",
    ]) {
      expect(releaseDevWorkflow).toContain(`${output}:`);
    }
  });

  test("builds, verifies migrations, and deploys API before remaining services", () => {
    const deployApi = sliceWorkflowJob(releaseDevWorkflow, "deploy-api", "api-ready");
    const deployRest = sliceWorkflowJob(releaseDevWorkflow, "deploy-rest", "rest-ready");

    expect(releaseDevWorkflow).toContain("uses: ./.github/workflows/build-docker-images.yml");
    expect(releaseDevWorkflow).toContain("target_environment: development");
    expect(releaseDevWorkflow).toContain("uses: ./.github/workflows/verify-dev-migration-history.yml");
    expect(releaseDevWorkflow).toContain('migration_version: "20260711120000"');
    expect(releaseDevWorkflow).toContain(
      "artifact_name: auto-predeploy-migration-${{ github.sha }}",
    );
    expect(releaseDevWorkflow).toContain("max-parallel: 1");
    expect(releaseDevWorkflow.indexOf("deploy-api:")).toBeLessThan(
      releaseDevWorkflow.indexOf("deploy-rest:"),
    );
    for (const [job, service] of [
      [deployApi, "api"],
      [deployRest, "${{ matrix.service }}"],
    ]) {
      expect(job).toContain("uses: ./.github/workflows/deploy-dev.yml");
      expect(job).toContain(`service: ${service}`);
      expect(job).toContain("commit_sha: ${{ github.sha }}");
      expect(job).toContain("build_run_id: ${{ github.run_id }}");
      expect(job).toContain("expected_build_event: workflow_dispatch");
      expect(job).toContain("evidence_mode: same_run");
      expect(job).toContain(
        "expected_build_workflow_path: .github/workflows/release-dev.yml",
      );
    }
    expect(deployRest).toContain("needs: [prepare, api-ready]");
    expect(deployRest).toContain(
      "if: ${{ always() && needs.prepare.outputs.has_rest == 'true' && needs.api-ready.result == 'success' }}",
    );
    expect(deployRest).toContain("max-parallel: 1");
  });

  test("propagates required job results and reports release semantics", () => {
    expect(releaseDevWorkflow).toContain("name: Require build, migration, and API readiness");
    expect(releaseDevWorkflow).toContain("needs: [prepare, build, migration, deploy-api]");
    expect(releaseDevWorkflow).toContain("name: Require remaining services readiness");
    expect(releaseDevWorkflow).toContain("needs: [prepare, api-ready, deploy-rest]");
    expect(releaseDevWorkflow).toContain("if: ${{ always() }}");
    expect(releaseDevWorkflow).toContain("OPERATION: ${{ inputs.operation }}");
    expect(releaseDevWorkflow).toContain("REASON: ${{ inputs.reason }}");
    for (const field of [
      "Selected ref",
      "Commit SHA",
      "Requested services",
      "Build services",
      "Build",
      "Migration",
      "API deployment",
      "Remaining deployment",
      "Final outcome",
    ]) {
      expect(releaseDevWorkflow).toContain(field);
    }
    expect(releaseDevWorkflow).toContain('test "${FINAL_OUTCOME}" = success');
  });

  test("splits same-run and completed-run evidence before manifest validation", () => {
    expect(deployDevWorkflow).toContain("default: completed_run");
    expect(deployDevWorkflow).toContain(
      "default: .github/workflows/build-docker-images.yml",
    );
    const evidenceStart = deployDevWorkflow.indexOf(
      "- name: Validate immutable build evidence",
    );
    const evidenceEnd = deployDevWorkflow.indexOf(
      "- name: Validate gated dev web deployment",
      evidenceStart,
    );
    const evidence = deployDevWorkflow.slice(evidenceStart, evidenceEnd);
    const splitStart = evidence.indexOf('case "${EVIDENCE_MODE}" in');
    const sameRunStart = evidence.indexOf("same_run)", splitStart);
    const completedRunStart = evidence.indexOf("completed_run)", sameRunStart);
    const splitEnd = evidence.indexOf(
      "\n          esac\n          receipt_dir=",
      completedRunStart,
    );
    const manifestStart = evidence.indexOf('receipt_dir="${RUNNER_TEMP}', splitEnd);
    const sameRun = evidence.slice(sameRunStart, completedRunStart);
    const completedRun = evidence.slice(completedRunStart, splitEnd);
    const manifestEvidence = evidence.slice(splitEnd);

    expect(evidenceStart).toBeGreaterThanOrEqual(0);
    expect(evidenceEnd).toBeGreaterThan(evidenceStart);
    expect(splitStart).toBeGreaterThanOrEqual(0);
    expect(sameRunStart).toBeGreaterThan(splitStart);
    expect(completedRunStart).toBeGreaterThan(sameRunStart);
    expect(splitEnd).toBeGreaterThan(completedRunStart);
    expect(manifestStart).toBeGreaterThan(splitEnd);
    expect(evidence).toContain("canonical_workflow_path() {");
    expect(evidence).toContain(
      'workflow_id="$(jq -er \'.workflow_id | select(type == "number" and . > 0 and (floor == .))\' <<< "${run_json}")"',
    );
    expect(evidence).toContain('[[ "${workflow_id}" =~ ^[1-9][0-9]*$ ]]');
    expect(evidence).toContain(
      'workflow_json="$(gh api "repos/${GITHUB_REPOSITORY}/actions/workflows/${workflow_id}")"',
    );
    expect(evidence).toContain(
      'jq -er \'.path | select(type == "string" and length > 0)\' <<< "${workflow_json}"',
    );
    expect(evidence).not.toContain('.path | split("@")[0]');
    expect(evidence).not.toMatch(
      /jq[^\n]*\.path[^\n]*<<< "\$\{(?:current_)?run_json\}"/,
    );
    expect(sameRun).toContain(
      'test "${INPUT_BUILD_RUN_ID}" = "${GITHUB_RUN_ID}"',
    );
    expect(sameRun).toContain(
      'current_run_json="$(gh api "repos/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}")"',
    );
    expect(sameRun).toContain(
      'current_workflow_path="$(canonical_workflow_path "${current_run_json}")"',
    );
    expect(sameRun).toContain(
      'test "${current_workflow_path}" = "${EXPECTED_BUILD_WORKFLOW_PATH}"',
    );
    expect(sameRun).toContain(
      'test "${EXPECTED_BUILD_WORKFLOW_PATH}" = ".github/workflows/release-dev.yml"',
    );
    expect(sameRun).toContain(
      'test "$(jq -r \'.event\' <<< "${current_run_json}")" = workflow_dispatch',
    );
    expect(sameRun).toContain(
      'test "$(jq -r \'.head_sha\' <<< "${current_run_json}")" = "${SOURCE_SHA}"',
    );
    expect(sameRun).toContain('test "${EXPECTED_BUILD_EVENT}" = workflow_dispatch');

    expect(completedRun).toContain(
      'run_json="$(gh api "repos/${GITHUB_REPOSITORY}/actions/runs/${INPUT_BUILD_RUN_ID}")"',
    );
    expect(completedRun).toContain(
      'build_workflow_path="$(canonical_workflow_path "${run_json}")"',
    );
    expect(completedRun).toContain(
      'test "${build_workflow_path}" = "${EXPECTED_BUILD_WORKFLOW_PATH}"',
    );
    expect(completedRun).toContain(
      'test "${EXPECTED_BUILD_WORKFLOW_PATH}" = ".github/workflows/build-docker-images.yml"',
    );
    expect(completedRun).toContain(
      'test "$(jq -r \'.event\' <<< "${run_json}")" = "${EXPECTED_BUILD_EVENT}"',
    );
    expect(completedRun).toContain(
      'test "$(jq -r \'.conclusion\' <<< "${run_json}")" = success',
    );
    expect(completedRun).toContain(
      'test "$(jq -r \'.head_sha\' <<< "${run_json}")" = "${SOURCE_SHA}"',
    );
    expect(completedRun).toContain(
      'current_workflow_path="$(canonical_workflow_path "${current_run_json}")"',
    );
    expect(completedRun).toContain(
      'test "${current_workflow_path}" = ".github/workflows/auto-deploy-dev.yml"',
    );
    expect(completedRun).toContain(
      'test "${current_workflow_path}" = ".github/workflows/deploy-dev.yml"',
    );
    expect(evidence).toContain("*) exit 1 ;;");
    expect(manifestEvidence).toContain(
      'receipt_dir="${RUNNER_TEMP}/image-manifest-${INPUT_BUILD_RUN_ID}"',
    );
    expect(manifestEvidence).toContain(
      'test "$(jq -r \'.commit_sha\' "${manifest}")" = "${SOURCE_SHA}"',
    );
    expect(manifestEvidence).toContain(
      'test "$(jq -r \'.target_environment\' "${manifest}")" = development',
    );
    expect(manifestEvidence).toContain('^sha256:[a-f0-9]{64}$');
  });

  test("never trusts a run path that can spoof an at-sign workflow filename", () => {
    const trustedPath = ".github/workflows/release-dev.yml";
    const spoofedRunPath = `${trustedPath}@shadow.yml@main`;

    expect(spoofedRunPath.split("@")[0]).toBe(trustedPath);
    expect(spoofedRunPath).not.toBe(trustedPath);
    expect(deployDevWorkflow).not.toContain('.path | split("@")[0]');
    expect(deployDevWorkflow).toContain(
      'gh api "repos/${GITHUB_REPOSITORY}/actions/workflows/${workflow_id}"',
    );
  });

  test("keeps every automatic deployment on completed build-run evidence", () => {
    const deployApi = sliceWorkflowJob(autoDeployDevWorkflow, "deploy-api", "api-ready");
    const deployRest = sliceWorkflowJob(autoDeployDevWorkflow, "deploy-rest", "rest-ready");
    const deployWeb = sliceWorkflowJob(autoDeployDevWorkflow, "deploy-web", "summary");

    for (const [job, service] of [
      [deployApi, "api"],
      [deployRest, "${{ matrix.service }}"],
      [deployWeb, "web"],
    ]) {
      expect(job).toContain("uses: ./.github/workflows/deploy-dev.yml");
      expect(job).toContain(`service: ${service}`);
      expect(job).toContain(
        "commit_sha: ${{ needs.authorize.outputs.commit_sha }}",
      );
      expect(job).toContain(
        "build_run_id: ${{ needs.authorize.outputs.build_run_id }}",
      );
      expect(job).toContain("expected_build_event: push");
      expect(job).toContain("evidence_mode: completed_run");
      expect(job).toContain(
        "expected_build_workflow_path: .github/workflows/build-docker-images.yml",
      );
    }
    expect(deployApi).toContain("needs: [authorize, migration]");
    expect(deployRest).toContain("needs: [authorize, api-ready]");
    expect(deployRest).toContain("max-parallel: 1");
    expect(deployWeb).toContain("needs: [authorize, web-gate]");
    expect(deployWeb).toContain(
      "gate_receipt_b64: ${{ needs.web-gate.outputs.receipt_b64 }}",
    );
    expect(autoDeployDevWorkflow).toContain("types: [completed]");
    expect(autoDeployDevWorkflow).toContain("branches: [main]");
    expect(autoDeployDevWorkflow).toContain(
      "github.event.workflow_run.conclusion == 'success'",
    );
    expect(autoDeployDevWorkflow).toContain("github.event.workflow_run.event == 'push'");
  });
});

describe("production orchestrator", () => {
  test("separates candidate build and evidence-bound deployment", () => {
    const triggerEnd = releaseProductionWorkflow.indexOf("permissions:");
    const trigger = releaseProductionWorkflow.slice(0, triggerEnd);

    expect(releaseProductionWorkflow).toContain("name: Release Production");
    expect(releaseProductionWorkflow).toContain("options: [build, deploy]");
    expect(trigger).toContain("workflow_dispatch:");
    expect(trigger).not.toContain("workflow_call:");
    expect(trigger).not.toContain("workflow_run:");
    expect(trigger).not.toContain("\n  push:");
    for (const [input, nextInput] of [
      ["operation", "service"],
      ["service", "build_run_id"],
      ["confirm_text", "reason"],
    ]) {
      const start = trigger.indexOf(`      ${input}:`);
      const end = trigger.indexOf(`      ${nextInput}:`, start + 1);
      expect(start).toBeGreaterThanOrEqual(0);
      expect(end).toBeGreaterThan(start);
      expect(trigger.slice(start, end)).toContain("required: true");
    }
    expect(releaseProductionWorkflow).toContain("contents: read");
    expect(releaseProductionWorkflow).toContain("actions: read");
    expect(releaseProductionWorkflow).toContain("target_environment: production");
    expect(releaseProductionWorkflow).toContain("production-release-candidate");
    expect(releaseProductionWorkflow).toContain("production-deployment-receipt-");
    expect(releaseProductionWorkflow).toContain("verify-production-release-candidate.mjs");
    expect(releaseProductionWorkflow).toContain("confirm_text:");
    expect(releaseProductionWorkflow).toContain("cancel-in-progress: false");
    expect(releaseProductionWorkflow).toContain("format('tag-{0}', github.ref_name)");
    expect(releaseProductionWorkflow).toContain("format('candidate-{0}', inputs.build_run_id)");
    expect(releaseProductionWorkflow).not.toContain("\n    environment: production");
    expect(releaseProductionWorkflow).not.toContain("target_environment: development");
    expect(releaseProductionWorkflow).not.toContain('"web"');
  });

  test("requires exact build and deploy authorization before reusable calls", () => {
    const prepareBuild = sliceWorkflowJob(releaseProductionWorkflow, "prepare-build", "build");
    const build = sliceWorkflowJob(releaseProductionWorkflow, "build", "candidate");
    const authorize = sliceWorkflowJob(releaseProductionWorkflow, "authorize-deploy", "deploy");
    const deploy = sliceWorkflowJob(releaseProductionWorkflow, "deploy", "summary");

    expect(prepareBuild).toContain('test "${GITHUB_REF_TYPE}" = tag');
    expect(prepareBuild).toContain('test "${CONFIRM_TEXT}" = "确认构建生产候选"');
    expect(prepareBuild).toContain('[[ "${GITHUB_SHA}" =~ ^[a-f0-9]{40}$ ]]');
    expect(prepareBuild).toContain('^v[0-9]{4}\\.[0-9]{2}\\.[0-9]{2}\\.[0-9]+$');
    expect(prepareBuild).toContain("resolve-admin-release-services.mjs requested");
    expect(prepareBuild).toContain("resolve-admin-release-services.mjs build");
    expect(build).toContain("uses: ./.github/workflows/build-docker-images.yml");
    expect(build).toContain("target_environment: production");
    expect(build).toContain("service: ${{ needs.prepare-build.outputs.requested_services }}");

    expect(authorize).toContain('test "${CONFIRM_TEXT}" = "确认部署生产环境"');
    expect(authorize).toContain('[[ "${BUILD_RUN_ID}" =~ ^[1-9][0-9]*$ ]]');
    expect(authorize).toContain('[[ "${COMMIT_SHA}" =~ ^[a-f0-9]{40}$ ]]');
    expect(authorize).toContain('test "${GITHUB_SHA}" = "${COMMIT_SHA}"');
    expect(deploy).toContain("uses: ./.github/workflows/deploy-docker-services.yml");
    expect(deploy).toContain("service: ${{ needs.authorize-deploy.outputs.requested_services }}");
    expect(deploy).toContain("build_run_id: ${{ inputs.build_run_id }}");
    expect(deploy).toContain("built_image_sha: ${{ inputs.commit_sha }}");
    expect(deploy).toContain("confirm_text: 确认部署生产环境");
    expect(deploy).not.toContain("upload-artifact");
  });

  test("binds candidate and receipt evidence to the canonical workflow identity", () => {
    const candidate = sliceWorkflowJob(releaseProductionWorkflow, "candidate", "authorize-deploy");
    const authorize = sliceWorkflowJob(releaseProductionWorkflow, "authorize-deploy", "deploy");

    expect(candidate).toContain('gh run download "${GITHUB_RUN_ID}" -n production-build-plan');
    expect(candidate).toContain('gh run download "${GITHUB_RUN_ID}" -n "image-manifest-${service}"');
    expect(candidate).toContain("verify-production-release-candidate.mjs");
    expect(candidate).toContain(allowedRegistryPairArm);
    expect(candidate).toContain('image_base="${TENCENT_CCR_REGISTRY}/${TENCENT_CCR_NAMESPACE}"');
    expect(candidate).toContain('"${REQUESTED_SERVICES}" \\');
    expect(candidate).toContain('"${image_base}" \\');
    expect(candidate.indexOf(allowedRegistryPairArm)).toBeLessThan(
      candidate.indexOf("verify-production-release-candidate.mjs"),
    );
    expect(candidate).toContain("name: production-release-candidate");
    expect(candidate.indexOf("verify-production-release-candidate.mjs")).toBeLessThan(
      candidate.indexOf("name: production-release-candidate"),
    );
    expect(candidate.trimEnd()).toEndWith("retention-days: 30");

    expect(authorize).toContain("canonical_workflow_path() {");
    expect(authorize).toContain(
      'gh api "repos/${GITHUB_REPOSITORY}/actions/workflows/${workflow_id}"',
    );
    expect(authorize).toContain(
      'test "${build_workflow_path}" = ".github/workflows/release-production.yml"',
    );
    expect(authorize).not.toContain('.path | split("@")[0]');
    expect(authorize).toContain('gh run download "${BUILD_RUN_ID}" -n production-release-candidate');
    expect(authorize).toContain('gh run download "${BUILD_RUN_ID}" -n production-build-plan');
    expect(authorize).toContain('gh run download "${BUILD_RUN_ID}" -n "image-manifest-${service}"');
    expect(authorize).toContain("verify-production-release-candidate.mjs");
    expect(authorize).toContain(allowedRegistryPairArm);
    expect(authorize).toContain('image_base="${TENCENT_CCR_REGISTRY}/${TENCENT_CCR_NAMESPACE}"');
    expect(authorize).toContain('"${requested_services}" \\');
    expect(authorize).toContain('"${image_base}" \\');
    expect(authorize.indexOf(allowedRegistryPairArm)).toBeLessThan(
      authorize.indexOf("verify-production-release-candidate.mjs"),
    );
    expect(authorize).toContain(
      'test "$(jq -r ".event" <<< "${run_json}")" = workflow_dispatch',
    );
    expect(authorize).toContain(
      'test "$(jq -r ".conclusion" <<< "${run_json}")" = success',
    );
    expect(authorize).toContain(
      'test "$(jq -r ".head_sha" <<< "${run_json}")" = "${COMMIT_SHA}"',
    );
    expect(authorize).toContain('test "$(jq -r \'.tag\' "${evidence_dir}/verified-candidate.json")" = "${GITHUB_REF_NAME}"');
    expect(authorize).toContain("production-deployment-receipt-${BUILD_RUN_ID}");
    expect(authorize).toContain("expired == false");
  });

  test("revalidates candidate evidence inside the globally serialized production deploy", () => {
    const guardStart = deployProductionWorkflow.indexOf("- name: Guard production runner");
    const metadataStart = deployProductionWorkflow.indexOf("- name: Preflight Admin candidate metadata");
    const checkoutStart = deployProductionWorkflow.indexOf("- name: Checkout compose files");
    const evidenceStart = deployProductionWorkflow.indexOf("- name: Validate production release evidence");
    const dockerStart = deployProductionWorkflow.indexOf("- name: Ensure Docker daemon");
    const syncStart = deployProductionWorkflow.indexOf("- name: Sync compose fragments");
    const receiptStart = deployProductionWorkflow.indexOf("- name: Upload production deployment receipt");
    const containerHealthStart = deployProductionWorkflow.indexOf("- name: Check container health");
    const healthStart = deployProductionWorkflow.indexOf("- name: Check public endpoints and pre-cutover Web loopback");
    const guard = deployProductionWorkflow.slice(guardStart, metadataStart);
    const metadata = deployProductionWorkflow.slice(metadataStart, checkoutStart);
    const checkout = deployProductionWorkflow.slice(checkoutStart, evidenceStart);

    expect(deployProductionWorkflow).toContain("build_run_id:");
    expect(deployProductionWorkflow).toContain("group: deploy-docker-services-main");
    expect(deployProductionWorkflow).toContain("cancel-in-progress: false");
    expect(guardStart).toBeGreaterThanOrEqual(0);
    expect(metadataStart).toBeGreaterThan(guardStart);
    expect(checkoutStart).toBeGreaterThan(metadataStart);
    expect(evidenceStart).toBeGreaterThan(checkoutStart);
    expect(dockerStart).toBeGreaterThan(evidenceStart);
    expect(syncStart).toBeGreaterThan(dockerStart);
    expect(guard).toContain('SOURCE_DIR="${RUNNER_TEMP}/gooes-source-${GITHUB_RUN_ID}"');
    expect(guard).toContain('echo "SOURCE_DIR=${SOURCE_DIR}" >> "${GITHUB_ENV}"');
    for (const requiredGuard of [
      'test "${GITHUB_EVENT_NAME}" = workflow_dispatch',
      'test "${GITHUB_REF_TYPE}" = tag',
      '[[ "${GITHUB_REF_NAME}" =~ ^v[0-9]{4}\\.[0-9]{2}\\.[0-9]{2}\\.[0-9]+$ ]] || exit 1',
      '[[ "${BUILD_RUN_ID}" =~ ^[1-9][0-9]*$ ]] || exit 1',
      '[[ "${GITHUB_SHA}" =~ ^[a-f0-9]{40}$ ]] || exit 1',
      '[[ "${INPUT_BUILT_IMAGE_SHA}" =~ ^[a-f0-9]{40}$ ]] || exit 1',
      'test "${INPUT_BUILT_IMAGE_SHA}" = "${GITHUB_SHA}"',
    ]) {
      expect(guard).toContain(requiredGuard);
      expect(guard.indexOf(requiredGuard)).toBeLessThan(
        guard.indexOf('if [ "${normalized_release_service}" = web ]; then'),
      );
    }
    expect(checkout).toContain('git clone --filter=blob:none --no-checkout "https://github.com/${GITHUB_REPOSITORY}.git" "${SOURCE_DIR}"');
    expect(checkout).toContain('git -C "${SOURCE_DIR}" fetch');
    expect(checkout).toContain('git -C "${SOURCE_DIR}" clean -fdx');
    expect(deployProductionWorkflow).not.toContain("${RUNNER_WORKSPACE}/source");
    expect(metadata).not.toContain('if [ -z "${BUILD_RUN_ID}" ]; then');
    expect(metadata).toContain('[[ "${BUILD_RUN_ID}" =~ ^[1-9][0-9]*$ ]]');
    expect(metadata).toContain('[[ "${INPUT_BUILT_IMAGE_SHA}" =~ ^[a-f0-9]{40}$ ]]');
    expect(metadata).toContain('test "${INPUT_BUILT_IMAGE_SHA}" = "${GITHUB_SHA}"');
    expect(metadata).toContain("canonical_workflow_path() {");
    expect(metadata).toContain(
      'gh api "repos/${GITHUB_REPOSITORY}/actions/workflows/${workflow_id}"',
    );
    expect(metadata).toContain(
      'test "${current_workflow_path}" = ".github/workflows/release-production.yml"',
    );
    expect(metadata).toContain(
      'test "${build_workflow_path}" = ".github/workflows/release-production.yml"',
    );
    expect(metadata).toContain("production-deployment-receipt-${BUILD_RUN_ID}");
    expect(metadata).toContain("expired == false");
    expect(metadata).not.toContain("${SOURCE_DIR}");
    expect(metadata).not.toContain("${DEPLOY_DIR}");
    expect(metadata).not.toContain("docker");
    expect(deployProductionWorkflow.slice(evidenceStart, dockerStart)).toContain(
      "verify-production-release-candidate.mjs",
    );
    expect(deployProductionWorkflow.slice(evidenceStart, dockerStart)).toContain(
      "production-deployment-receipt-",
    );
    expect(deployProductionWorkflow.slice(evidenceStart, dockerStart)).toContain(
      'gh run download "${BUILD_RUN_ID}" -n production-release-candidate',
    );
    expect(deployProductionWorkflow.slice(evidenceStart, dockerStart)).toContain(
      'gh run download "${BUILD_RUN_ID}" -n production-build-plan',
    );
    expect(deployProductionWorkflow.slice(evidenceStart, dockerStart)).toContain(
      'gh run download "${BUILD_RUN_ID}" -n "image-manifest-${service}"',
    );
    const productionEvidence = deployProductionWorkflow.slice(evidenceStart, dockerStart);
    expect(productionEvidence).not.toContain('if [ -z "${BUILD_RUN_ID}" ]; then');
    expect(productionEvidence.indexOf(allowedRegistryPairArm)).toBeLessThan(
      productionEvidence.indexOf("verify-production-release-candidate.mjs"),
    );
    for (const [service, variable] of [
      ["api", "GOOES_API_IMAGE"],
      ["admin", "GOOES_ADMIN_IMAGE"],
      ["social-video-worker", "GOOES_SOCIAL_VIDEO_WORKER_IMAGE"],
    ]) {
      const shellName = service.replaceAll("-", "_");
      expect(productionEvidence).toContain(
        `${shellName}_image="$(jq -er '.image | select(type == "string" and length > 0)' "\${evidence_dir}/image-manifest-${service}.json")"`,
      );
      expect(productionEvidence).toContain(
        `${shellName}_repository="\${${shellName}_image%:*}"`,
      );
      expect(productionEvidence).toContain(
        `${variable}=\${${shellName}_repository}@\${${shellName}_digest}`,
      );
      expect(productionEvidence.indexOf("verify-production-release-candidate.mjs")).toBeLessThan(
        productionEvidence.indexOf(`${shellName}_image=`),
      );
    }
    expect(deployProductionWorkflow.slice(evidenceStart, dockerStart)).toContain(
      'test "${current_workflow_path}" = ".github/workflows/release-production.yml"',
    );
    expect(deployProductionWorkflow.slice(evidenceStart, dockerStart)).not.toContain(
      '.path | split("@")[0]',
    );
    expect(deployProductionWorkflow).not.toContain('test "${GITHUB_REF_NAME}" = "main"');
    expect(deployProductionWorkflow).toContain('test "${GITHUB_REF_TYPE}" = tag');
    expect(deployProductionWorkflow).toContain('test "${INPUT_BUILT_IMAGE_SHA}" = "${GITHUB_SHA}"');
    expect(deployProductionWorkflow).toContain('test "${RELEASE_CONFIRM_TEXT}" = "确认部署生产环境"');
    expect(deployProductionWorkflow).toContain("runs-on: [self-hosted, Linux, X64, gooes-prod-deploy]");
    expect(deployProductionWorkflow).toContain("environment: production");
    expect(deployProductionWorkflow).toContain("DEPLOY_DIR: /opt/supabase/docker");
    expect(deployProductionWorkflow).toContain('test "${RUNNER_NAME}" = "gooes-prod-vm-0-3"');
    expect(containerHealthStart).toBeGreaterThan(dockerStart);
    expect(deployProductionWorkflow.slice(containerHealthStart, healthStart)).toContain(
      'test "${revision}" = "${SOURCE_SHA}"',
    );
    expect(deployProductionWorkflow.slice(containerHealthStart, healthStart)).toContain(
      'test "${run_id}" = "${BUILD_RUN_ID}"',
    );
    expect(deployProductionWorkflow.slice(containerHealthStart, healthStart)).toContain(
      'test "${configured_image}" = "${expected_image}"',
    );
    expect(deployProductionWorkflow.slice(containerHealthStart, healthStart)).toContain(
      'test "${service_label}" = "${expected_service_label}"',
    );
    expect(receiptStart).toBeGreaterThan(healthStart);
    expect(deployProductionWorkflow.slice(receiptStart)).toContain("uses: actions/upload-artifact@v6");
    expect(deployProductionWorkflow.slice(receiptStart)).toContain(
      "production-deployment-receipt-${{ env.BUILD_RUN_ID }}",
    );
    expect(deployProductionWorkflow.slice(receiptStart + 1)).not.toContain("\n      - name:");
    for (const field of [
      "schema_version: 1",
      "build_run_id: $build_run_id",
      "deploy_run_id: $deploy_run_id",
      "tag: $tag",
      "commit_sha: $commit_sha",
      "services: ($services | split(\",\"))",
      "completed_at: $completed_at",
    ]) {
      expect(deployProductionWorkflow).toContain(field);
    }
  });

  test("rejects an empty build run ID instead of falling back to main", () => {
    expect(runProductionGuard("").exitCode).not.toBe(0);
  });

  test("rejects direct non-Web dispatch outside the release-production caller", () => {
    expect(
      runNonWebCandidatePreflight(
        ".github/workflows/deploy-docker-services.yml",
      ).exitCode,
    ).not.toBe(0);
  });

  test("binds production runtime evidence to the selected digest and service label", () => {
    const expectedImage =
      "useccr.ccs.tencentyun.com/america_goose/goose-api@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

    expect(runProductionRuntimeEvidenceCheck(expectedImage, "api").exitCode).toBe(0);
    expect(
      runProductionRuntimeEvidenceCheck(
        "useccr.ccs.tencentyun.com/america_goose/goose-api@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        "api",
      ).exitCode,
    ).not.toBe(0);
    expect(runProductionRuntimeEvidenceCheck(expectedImage, "admin").exitCode).not.toBe(0);
    expect(runProductionRuntimeEvidenceCheck(expectedImage, "api", "").exitCode).not.toBe(0);
    expect(
      runProductionRuntimeEvidenceCheck(expectedImage, "api", "unhealthy").exitCode,
    ).not.toBe(0);

    const runtimeCheck = sliceWorkflowStep(
      deployProductionWorkflow,
      "Check container health",
    );
    for (const mapping of [
      'check_runtime_evidence api gooes-api "${GOOES_API_IMAGE}" api',
      'check_runtime_evidence admin gooes-admin "${GOOES_ADMIN_IMAGE}" admin',
      'check_runtime_evidence social-video-worker gooes-social-video-worker "${GOOES_SOCIAL_VIDEO_WORKER_IMAGE}" social-video-worker',
      'check_runtime_evidence cos-reconcile-worker gooes-cos-reconcile-worker "${GOOES_API_IMAGE}" api',
      'check_runtime_evidence web gooes-web "${GOOES_WEB_IMAGE}" web',
    ]) {
      expect(runtimeCheck).toContain(mapping);
    }
  });

  test("isolates direct production Web deployment behind standalone build and wrapper gate evidence", () => {
    const triggerEnd = deployProductionWorkflow.indexOf("permissions:");
    const trigger = deployProductionWorkflow.slice(0, triggerEnd);
    const dispatchStart = trigger.indexOf("  workflow_dispatch:");
    const dispatch = trigger.slice(dispatchStart);
    const builtImageInputStart = dispatch.indexOf("      built_image_sha:");
    const buildRunInputStart = dispatch.indexOf("      build_run_id:");
    const confirmInputStart = dispatch.indexOf("      confirm_text:");
    const guardStart = deployProductionWorkflow.indexOf("- name: Guard production runner");
    const metadataStart = deployProductionWorkflow.indexOf("- name: Preflight Admin candidate metadata");
    const checkoutStart = deployProductionWorkflow.indexOf("- name: Checkout compose files");
    const evidenceStart = deployProductionWorkflow.indexOf("- name: Validate production release evidence");
    const dockerStart = deployProductionWorkflow.indexOf("- name: Ensure Docker daemon");
    const webGateStart = deployProductionWorkflow.indexOf("- name: Validate web deployment gate");
    const syncStart = deployProductionWorkflow.indexOf("- name: Sync compose fragments", webGateStart);
    const loginStart = deployProductionWorkflow.indexOf("- name: Login to Tencent CCR", syncStart);
    const receiptStart = deployProductionWorkflow.indexOf("- name: Create production deployment receipt");
    const uploadStart = deployProductionWorkflow.indexOf("- name: Upload production deployment receipt");
    const loopbackStart = deployProductionWorkflow.indexOf("- name: Check public endpoints and pre-cutover Web loopback");
    const rollbackStart = deployProductionWorkflow.indexOf("- name: Roll back production web");
    const guard = deployProductionWorkflow.slice(guardStart, metadataStart);
    const metadata = deployProductionWorkflow.slice(metadataStart, checkoutStart);
    const evidence = deployProductionWorkflow.slice(evidenceStart, dockerStart);
    const webGate = deployProductionWorkflow.slice(webGateStart, syncStart);
    const syncCompose = deployProductionWorkflow.slice(syncStart, loginStart);
    const receipt = deployProductionWorkflow.slice(receiptStart, uploadStart);
    const upload = deployProductionWorkflow.slice(uploadStart);
    const loopback = deployProductionWorkflow.slice(loopbackStart, rollbackStart);
    const webSyncStart = syncCompose.indexOf('if [ "${WEB_DIRECT_DEPLOY:-false}" = true ]; then');
    const nonWebSyncStart = syncCompose.indexOf("\n          else\n", webSyncStart);
    const webSync = syncCompose.slice(webSyncStart, nonWebSyncStart);
    const nonWebSync = syncCompose.slice(nonWebSyncStart);

    expect(dispatchStart).toBeGreaterThanOrEqual(0);
    expect(builtImageInputStart).toBeGreaterThanOrEqual(0);
    expect(buildRunInputStart).toBeGreaterThan(builtImageInputStart);
    expect(confirmInputStart).toBeGreaterThan(buildRunInputStart);
    expect(dispatch).toContain("built_image_sha:");
    expect(dispatch).toContain("Standalone production Web build commit SHA evidence");
    expect(dispatch).toContain("build_run_id:");
    expect(dispatch).toContain("Successful standalone production Web build workflow run ID");
    expect(dispatch.slice(builtImageInputStart, buildRunInputStart)).toContain("required: false");
    expect(dispatch.slice(buildRunInputStart, confirmInputStart)).toContain("required: false");
    expect(deployProductionWorkflow).toContain(
      "BUILD_RUN_ID: ${{ inputs.build_run_id || github.event.inputs.build_run_id || '' }}",
    );

    expect(guard).toContain(
      "INPUT_BUILT_IMAGE_SHA: ${{ inputs.built_image_sha || github.event.inputs.built_image_sha || '' }}",
    );
    expect(guard).toContain('normalized_release_service="${RELEASE_SERVICE//[[:space:]]/}"');
    expect(guard).toContain('if [ "${normalized_release_service}" = web ]; then');
    expect(guard).toContain('test "${GITHUB_EVENT_NAME}" = workflow_dispatch');
    expect(guard).toContain('test "${GITHUB_REF_TYPE}" = tag');
    expect(guard).toContain('[[ "${BUILD_RUN_ID}" =~ ^[1-9][0-9]*$ ]]');
    expect(guard).toContain('[[ "${INPUT_BUILT_IMAGE_SHA}" =~ ^[a-f0-9]{40}$ ]]');
    expect(guard).toContain('test "${INPUT_BUILT_IMAGE_SHA}" = "${GITHUB_SHA}"');
    expect(guard).toContain('test "${RELEASE_CONFIRM_TEXT}" = "确认部署生产环境"');
    expect(guard).toContain('echo "WEB_DIRECT_DEPLOY=true" >> "${GITHUB_ENV}"');
    expect(guard).toContain('echo "ADMIN_CANDIDATE=false" >> "${GITHUB_ENV}"');

    expect(metadata.slice(0, metadata.indexOf("run: |"))).toContain(
      "if: ${{ env.WEB_DIRECT_DEPLOY != 'true' }}",
    );
    expect(evidence.slice(0, evidence.indexOf("run: |"))).toContain(
      "if: ${{ env.WEB_DIRECT_DEPLOY != 'true' }}",
    );
    expect(metadata).toContain(
      'test "${current_workflow_path}" = ".github/workflows/release-production.yml"',
    );
    expect(evidence).toContain('gh run download "${BUILD_RUN_ID}" -n production-release-candidate');
    expect(evidence).toContain('echo "ADMIN_CANDIDATE=true" >> "${GITHUB_ENV}"');

    expect(webGate).toContain('test "${WEB_DIRECT_DEPLOY:-false}" = true');
    expect(webGate).toContain('test "${INPUT_BUILT_IMAGE_SHA}" = "${SOURCE_SHA}"');
    expect(webGate).toContain('[[ "${BUILD_RUN_ID}" =~ ^[1-9][0-9]*$ ]]');
    expect(webGate.slice(0, webGate.indexOf("run: |"))).toContain(
      "GH_REPO: ${{ github.repository }}",
    );
    expect(webGate).toContain("canonical_workflow_path() {");
    expect(webGate).toContain(
      'test "${current_workflow_path}" = ".github/workflows/deploy-docker-services.yml"',
    );
    expect(webGate).toContain('test "$(jq -r \'.event\' <<< "${current_run_json}")" = workflow_dispatch');
    expect(webGate).toContain('test "$(jq -r \'.head_sha\' <<< "${current_run_json}")" = "${SOURCE_SHA}"');
    expect(webGate).toContain('test "$(jq -r \'.head_branch\' <<< "${current_run_json}")" = "${GITHUB_REF_NAME}"');
    expect(webGate).toContain(
      'test "${build_workflow_path}" = ".github/workflows/build-docker-images.yml"',
    );
    expect(webGate).toContain('gh run download "${BUILD_RUN_ID}" -n production-build-plan');
    expect(webGate).toContain('gh run download "${BUILD_RUN_ID}" -n image-manifest-web');
    expect(webGate).toContain('printf \'%s\\n\' "${build_run_json}" > "${evidence_dir}/build-run.json"');
    expect(webGate).toContain("verify-production-web-build-evidence.mjs");
    expect(webGate.indexOf(allowedRegistryPairArm)).toBeLessThan(
      webGate.indexOf("verify-production-web-build-evidence.mjs"),
    );
    expect(webGate).toContain(
      '"${BUILD_RUN_ID}" "${SOURCE_SHA}" "${GITHUB_REF_NAME}" "${expected_web_image}"',
    );
    expect(webGate).toContain(
      'expected_web_image="${image_base}/goose-web:run-${BUILD_RUN_ID}-${SOURCE_SHA}"',
    );
    expect(webGate).toContain('> "${evidence_dir}/verified-web-build.json"');
    expect(webGate).toContain(
      'web_digest="$(jq -er \'.digest\' "${evidence_dir}/verified-web-build.json")"',
    );
    expect(webGate).toContain(
      'verified_web_image="$(jq -er \'.image\' "${evidence_dir}/verified-web-build.json")"',
    );
    expect(webGate).toContain('web_repository="${verified_web_image%:*}"');
    expect(webGate).toContain('receipt_name="production-deployment-receipt-${BUILD_RUN_ID}"');
    expect(webGate).toContain('test "${receipt_count}" = 0');
    expect(webGate).toContain(
      'test "${gate_workflow_path}" = ".github/workflows/verify-production-web-deployment-gate.yml"',
    );
    expect(webGate).toContain('test "$(jq -r \'.event\' <<< "${gate_run_json}")" = workflow_dispatch');
    expect(webGate).toContain('test "$(jq -r \'.conclusion\' <<< "${gate_run_json}")" = success');
    expect(webGate).toContain('test "$(jq -r \'.head_sha\' <<< "${gate_run_json}")" = "${SOURCE_SHA}"');
    expect(webGate).toContain('test "$(jq -r \'.head_branch\' <<< "${gate_run_json}")" = "${GITHUB_REF_NAME}"');
    expect(webGate).toContain(
      '"${receipt_dir}/web-deployment-gate-receipt.json" production "${SOURCE_SHA}" 20260711120000',
    );
    expect(webGate).toContain('test -n "${INPUT_WEB_SMOKE_CONTENT_PATH}"');
    expect(webGate).toContain("validate-web-smoke-content-path.mjs");
    expect(webGate).toContain(allowedRegistryPairArm);
    expect(webGate).toContain('GOOES_WEB_IMAGE=${web_repository}@${web_digest}');
    expect(webGate).not.toContain('GOOES_WEB_IMAGE=${image_base}/goose-web:${SOURCE_SHA}');

    expect(webSyncStart).toBeGreaterThanOrEqual(0);
    expect(nonWebSyncStart).toBeGreaterThan(webSyncStart);
    expect(webSync).toContain('test "${DEPLOY_SERVICES}" = web');
    expect(webSync).toContain('docker-compose.web.yml.bak.github-actions-${GITHUB_RUN_ID}');
    expect(webSync).toContain('sudo install -m 0644 deploy/docker-compose.web.yml');
    expect(webSync).not.toContain("docker-compose.api.yml");
    expect(webSync).not.toContain("docker-compose.admin.yml");
    expect(nonWebSync).toContain('test "${DEPLOY_SERVICES}" != web');
    expect(nonWebSync).toContain('test "${ADMIN_CANDIDATE:-false}" = true');
    expect(nonWebSync).toContain('docker-compose.api.yml.bak.github-actions-${GITHUB_RUN_ID}');
    expect(nonWebSync).toContain('docker-compose.admin.yml.bak.github-actions-${GITHUB_RUN_ID}');
    expect(nonWebSync).toContain('sudo install -m 0644 deploy/docker-compose.api.yml');
    expect(nonWebSync).toContain('sudo install -m 0644 deploy/docker-compose.admin.yml');
    expect(nonWebSync).not.toContain("docker-compose.web.yml");

    for (const stepName of ["Pull latest images", "Recreate services"]) {
      const deploymentStep = sliceWorkflowStep(
        deployProductionWorkflow,
        stepName,
      );
      expect(deploymentStep).toContain(
        'test "${ADMIN_CANDIDATE:-false}" = true',
      );
      expect(deploymentStep).toContain('test "${DEPLOY_SERVICES}" != web');
    }

    expect(receipt).toContain("if: ${{ success() && env.BUILD_RUN_ID != '' }}");
    expect(receipt).toContain('if [ "${WEB_DIRECT_DEPLOY:-false}" = true ]; then');
    expect(receipt).toContain('test "${DEPLOY_SERVICES}" = web');
    expect(receipt).toContain('test "${ADMIN_CANDIDATE}" = true');
    expect(upload).toContain("if: ${{ success() && env.BUILD_RUN_ID != '' }}");
    expect(upload).toContain("production-deployment-receipt-${{ env.BUILD_RUN_ID }}");
    expect(loopbackStart).toBeGreaterThan(syncStart);
    expect(rollbackStart).toBeGreaterThan(loopbackStart);
    expect(loopback).toContain('echo "WEB_DEPLOY_STAGE=container_ready_for_manual_cutover"');
    expect(loopback).toContain("This workflow does not install or reload production Nginx");
    expect(deployProductionWorkflow).not.toMatch(/(?:sudo\s+)?nginx\s+-t/);
    expect(deployProductionWorkflow).not.toMatch(/systemctl\s+reload\s+nginx/);
    expect(deployProductionWorkflow).not.toContain("/etc/nginx");
  });

  test("pins Admin candidate images to verified manifest digests instead of mutable SHA tags", () => {
    const evidenceStart = deployProductionWorkflow.indexOf("- name: Validate production release evidence");
    const dockerStart = deployProductionWorkflow.indexOf("- name: Ensure Docker daemon");
    const evidence = deployProductionWorkflow.slice(evidenceStart, dockerStart);
    const shellVariable = (name: string) => `\${${name}}`;

    expect(evidenceStart).toBeGreaterThanOrEqual(0);
    expect(dockerStart).toBeGreaterThan(evidenceStart);
    for (const [service, variable] of [
      ["api", "GOOES_API_IMAGE"],
      ["admin", "GOOES_ADMIN_IMAGE"],
      ["social-video-worker", "GOOES_SOCIAL_VIDEO_WORKER_IMAGE"],
    ]) {
      const digestVariable = `${service.replaceAll("-", "_")}_digest`;
      expect(evidence).toContain(
        `${digestVariable}="$(jq -er '.digest | select(type == "string" and test("^sha256:[a-f0-9]{64}$"))' "${shellVariable("evidence_dir")}/image-manifest-${service}.json")"`,
      );
      const imageVariable = `${service.replaceAll("-", "_")}_image`;
      const repositoryVariable = `${service.replaceAll("-", "_")}_repository`;
      expect(evidence).toContain(
        `${imageVariable}="$(jq -er '.image | select(type == "string" and length > 0)' "${shellVariable("evidence_dir")}/image-manifest-${service}.json")"`,
      );
      expect(evidence).toContain(
        `${repositoryVariable}="${shellVariable(`${imageVariable}%:*`)}"`,
      );
      expect(evidence).toContain(
        `${variable}=${shellVariable(repositoryVariable)}@${shellVariable(digestVariable)}`,
      );
      expect(evidence).not.toContain(
        `${variable}=${shellVariable("image_base")}/goose-${service}:${shellVariable("GITHUB_SHA")}`,
      );
    }
    expect(evidence).toContain("GOOES_API_IMAGE=${api_repository}@${api_digest}");

    const repository = "ccr.example/gooes/goose-api";
    const sha = "a".repeat(40);
    const candidateDigest = `sha256:${"b".repeat(64)}`;
    const overwrittenDigest = `sha256:${"c".repeat(64)}`;
    const mutableShaTag = `${repository}:${sha}`;
    const candidateReference = `${repository}@${candidateDigest}`;
    const shaTagRegistryBefore = new Map([[mutableShaTag, candidateDigest]]);
    const shaTagRegistryAfter = new Map([[mutableShaTag, overwrittenDigest]]);
    const deploymentReferenceBeforeOverwrite = candidateReference;
    const deploymentReferenceAfterOverwrite = candidateReference;

    expect(`${repository}:${sha}`).toBe(mutableShaTag);
    expect(shaTagRegistryBefore.get(mutableShaTag)).not.toBe(
      shaTagRegistryAfter.get(mutableShaTag),
    );
    expect(deploymentReferenceAfterOverwrite).toBe(deploymentReferenceBeforeOverwrite);
    expect(candidateReference).toBe(`${repository}@${candidateDigest}`);
    expect(candidateReference).not.toContain(mutableShaTag);
  });
});
