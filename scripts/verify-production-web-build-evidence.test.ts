import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const verifierPath = new URL(
  "./verify-production-web-build-evidence.mjs",
  import.meta.url,
).pathname;
const sha = "a".repeat(40);
const tag = "v2026.07.16.1";
const imageBase = "useccr.ccs.tencentyun.com/america_goose";
const image = `${imageBase}/goose-web:run-123-${sha}`;
const digest = `sha256:${"b".repeat(64)}`;
const roots: string[] = [];

interface EvidenceFixture {
  buildRun: Record<string, unknown>;
  expected: {
    image: string;
    runId: string;
    sha: string;
    tag: string;
  };
  manifest: Record<string, unknown>;
  plan: Record<string, unknown>;
}

const fixture: EvidenceFixture = {
  buildRun: {
    id: 123,
    event: "workflow_dispatch",
    conclusion: "success",
    head_sha: sha,
    head_branch: tag,
  },
  expected: {
    image,
    runId: "123",
    sha,
    tag,
  },
  manifest: {
    service: "web",
    build_run_id: 123,
    target_environment: "production",
    commit_sha: sha,
    image,
    digest,
  },
  plan: {
    schema_version: 1,
    workflow_run_id: 123,
    target_environment: "production",
    commit_sha: sha,
    build_services: ["web"],
    deploy_services: ["web"],
    no_op: false,
  },
};

function cloneFixture(): EvidenceFixture {
  return structuredClone(fixture);
}

function runVerifier(evidence: EvidenceFixture) {
  const root = mkdtempSync(join(tmpdir(), "production-web-build-evidence-"));
  const buildRunPath = join(root, "build-run.json");
  const planPath = join(root, "build-plan.json");
  const manifestPath = join(root, "image-manifest-web.json");
  roots.push(root);
  writeFileSync(buildRunPath, JSON.stringify(evidence.buildRun));
  writeFileSync(planPath, JSON.stringify(evidence.plan));
  writeFileSync(manifestPath, JSON.stringify(evidence.manifest));

  return Bun.spawnSync([
    "node",
    verifierPath,
    buildRunPath,
    planPath,
    manifestPath,
    evidence.expected.runId,
    evidence.expected.sha,
    evidence.expected.tag,
    evidence.expected.image,
  ]);
}

function expectRejected(
  override: (evidence: EvidenceFixture) => void,
  message: string,
) {
  const evidence = cloneFixture();
  override(evidence);
  const result = runVerifier(evidence);

  expect(result.exitCode).toBe(1);
  expect(result.stderr.toString("utf8")).toContain(message);
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { force: true, recursive: true });
});

describe("production Web build evidence verifier", () => {
  test("accepts typed standalone production Web build evidence", () => {
    const result = runVerifier(cloneFixture());

    expect(result.exitCode).toBe(0);
    expect(result.stderr.toString("utf8")).toBe("");
    expect(JSON.parse(result.stdout.toString("utf8"))).toEqual({
      schema_version: 1,
      build_run_id: 123,
      target_environment: "production",
      commit_sha: sha,
      tag,
      service: "web",
      image,
      digest,
    });
  });

  test("rejects mutable SHA evidence even when manifest and expected image agree", () => {
    expectRejected(
      (evidence) => {
        evidence.expected.image = `${imageBase}/goose-web:${sha}`;
        evidence.manifest.image = evidence.expected.image;
      },
      "invalid expected run image",
    );
  });

  test("rejects a registry pair change after the Web build", () => {
    expectRejected(
      (evidence) => {
        evidence.expected.image = `ccr.ccs.tencentyun.com/gooes-goodcms/goose-web:run-123-${sha}`;
      },
      "manifest image mismatch",
    );
  });

  test("rejects an unapproved Web registry even when expected and manifest agree", () => {
    expectRejected(
      (evidence) => {
        const unsupportedImage = `registry.example.com/other/goose-web:run-123-${sha}`;
        evidence.expected.image = unsupportedImage;
        evidence.manifest.image = unsupportedImage;
      },
      "invalid expected run image",
    );
  });

  test.each([
    ["build run ID", (evidence: EvidenceFixture) => { evidence.buildRun.id = 124; }, "build run ID mismatch"],
    ["build run event", (evidence: EvidenceFixture) => { evidence.buildRun.event = "push"; }, "build run event mismatch"],
    ["build run conclusion", (evidence: EvidenceFixture) => { evidence.buildRun.conclusion = "failure"; }, "build run conclusion mismatch"],
    ["build run SHA", (evidence: EvidenceFixture) => { evidence.buildRun.head_sha = "c".repeat(40); }, "build run SHA mismatch"],
    ["build run Tag", (evidence: EvidenceFixture) => { evidence.buildRun.head_branch = "v2026.07.16.2"; }, "build run Tag mismatch"],
    ["expected release Tag", (evidence: EvidenceFixture) => { evidence.expected.tag = "main"; }, "invalid expected release Tag"],
    ["plan schema", (evidence: EvidenceFixture) => { evidence.plan.schema_version = 2; }, "unsupported plan schema"],
    ["plan run ID", (evidence: EvidenceFixture) => { evidence.plan.workflow_run_id = 124; }, "plan workflow run mismatch"],
    ["string no-op", (evidence: EvidenceFixture) => { evidence.plan.no_op = "false"; }, "production plan must not be a no-op"],
    ["build services", (evidence: EvidenceFixture) => { evidence.plan.build_services = ["api", "web"]; }, "plan build services mismatch"],
    ["deploy services", (evidence: EvidenceFixture) => { evidence.plan.deploy_services = ["web", "admin"]; }, "plan deploy services mismatch"],
    ["manifest service", (evidence: EvidenceFixture) => { evidence.manifest.service = "admin"; }, "manifest service mismatch"],
    ["manifest build run", (evidence: EvidenceFixture) => { evidence.manifest.build_run_id = 124; }, "manifest build run mismatch"],
    ["manifest environment", (evidence: EvidenceFixture) => { evidence.manifest.target_environment = "development"; }, "manifest environment mismatch"],
    ["manifest SHA", (evidence: EvidenceFixture) => { evidence.manifest.commit_sha = "c".repeat(40); }, "manifest commit SHA mismatch"],
    ["manifest image", (evidence: EvidenceFixture) => { evidence.manifest.image = `${image}-other`; }, "manifest image mismatch"],
    ["manifest digest", (evidence: EvidenceFixture) => { evidence.manifest.digest = "sha256:bad"; }, "invalid manifest digest"],
  ])("rejects invalid %s evidence", (_name, override, message) => {
    expectRejected(override, message);
  });
});
