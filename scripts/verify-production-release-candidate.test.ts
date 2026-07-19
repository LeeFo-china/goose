import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { verifyProductionReleaseCandidate } from "./verify-production-release-candidate.mjs";

const sha = "a".repeat(40);
const imageBase = "useccr.ccs.tencentyun.com/america_goose";
interface ImageManifestFixture {
  build_run_id: number;
  commit_sha: string;
  digest: string;
  image: string;
  service: string;
  target_environment: string;
}
const candidate = {
  schema_version: 1,
  build_run_id: 123,
  tag: "v2026.07.13.1",
  commit_sha: sha,
  requested_services: ["api", "cos-reconcile-worker"],
  build_services: ["api"],
  target_environment: "production",
  build_plan_artifact: "production-build-plan",
};
const plan = {
  schema_version: 1,
  workflow_run_id: 123,
  commit_sha: sha,
  target_environment: "production",
  build_services: ["api"],
  deploy_services: ["api", "cos-reconcile-worker"],
  no_op: false,
};
const manifests: Record<string, ImageManifestFixture> = {
  api: {
    service: "api",
    build_run_id: 123,
    commit_sha: sha,
    target_environment: "production",
    image: `${imageBase}/goose-api:run-123-${sha}`,
    digest: `sha256:${"b".repeat(64)}`,
  },
};
const expected = {
  imageBase,
  runId: 123,
  sha,
  services: ["api", "cos-reconcile-worker"],
};
const roots: string[] = [];

function cloneEvidence() {
  return {
    candidate: structuredClone(candidate),
    expected: structuredClone(expected),
    manifests: structuredClone(manifests),
    plan: structuredClone(plan),
  };
}

function allServiceEvidence() {
  const evidence = cloneEvidence();
  evidence.candidate.requested_services = [
    "api",
    "admin",
    "social-video-worker",
    "cos-reconcile-worker",
    "billing-reconcile-worker",
  ];
  evidence.candidate.build_services = ["api", "admin", "social-video-worker"];
  evidence.expected.services = structuredClone(evidence.candidate.requested_services);
  evidence.plan.build_services = structuredClone(evidence.candidate.build_services);
  evidence.plan.deploy_services = structuredClone(evidence.candidate.requested_services);
  evidence.manifests.admin = {
    service: "admin",
    build_run_id: 123,
    commit_sha: sha,
    target_environment: "production",
    image: `${imageBase}/goose-admin:run-123-${sha}`,
    digest: `sha256:${"c".repeat(64)}`,
  };
  evidence.manifests["social-video-worker"] = {
    service: "social-video-worker",
    build_run_id: 123,
    commit_sha: sha,
    target_environment: "production",
    image: `${imageBase}/goose-social-video-worker:run-123-${sha}`,
    digest: `sha256:${"d".repeat(64)}`,
  };
  return evidence;
}

function expectRejected(
  override: (evidence: ReturnType<typeof cloneEvidence>) => void,
  message: string,
) {
  const evidence = cloneEvidence();
  override(evidence);

  expect(() =>
    verifyProductionReleaseCandidate(
      evidence.candidate,
      evidence.plan,
      evidence.manifests,
      evidence.expected,
    )
  ).toThrow(message);
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { force: true, recursive: true });
});

describe("production release candidate verifier", () => {
  test("accepts immutable production evidence", () => {
    const evidence = cloneEvidence();

    expect(
      verifyProductionReleaseCandidate(
        evidence.candidate,
        evidence.plan,
        evidence.manifests,
        evidence.expected,
      ),
    ).toEqual(candidate);
  });

  test("accepts release sequence zero", () => {
    const evidence = cloneEvidence();
    evidence.candidate.tag = "v2026.07.13.0";

    expect(
      verifyProductionReleaseCandidate(
        evidence.candidate,
        evidence.plan,
        evidence.manifests,
        evidence.expected,
      ),
    ).toEqual(evidence.candidate);
  });

  test("rejects candidate environment mismatch", () => {
    expectRejected(
      (evidence) => { evidence.candidate.target_environment = "development"; },
      "candidate environment mismatch",
    );
  });

  test("rejects candidate build run mismatch", () => {
    expectRejected(
      (evidence) => { evidence.candidate.build_run_id = 124; },
      "candidate build run mismatch",
    );
  });

  test("rejects candidate commit SHA mismatch", () => {
    expectRejected(
      (evidence) => { evidence.candidate.commit_sha = "c".repeat(40); },
      "candidate commit SHA mismatch",
    );
  });

  test("rejects Web in requested services", () => {
    expectRejected(
      (evidence) => { evidence.candidate.requested_services = ["web"]; },
      "unsupported requested service: web",
    );
  });

  test("rejects requested service mismatch", () => {
    expectRejected(
      (evidence) => { evidence.candidate.requested_services = ["api"]; },
      "requested services mismatch",
    );
  });

  test("rejects an empty release scope", () => {
    expectRejected(
      (evidence) => {
        evidence.candidate.requested_services = [];
        evidence.candidate.build_services = [];
        evidence.expected.services = [];
        evidence.plan.build_services = [];
        evidence.plan.deploy_services = [];
      },
      "requested services must not be empty",
    );
  });

  test("rejects missing API manifest required by COS deployment", () => {
    expectRejected(
      (evidence) => { evidence.manifests = {}; },
      "missing manifest for api",
    );
  });

  test("rejects malformed manifest digest", () => {
    expectRejected(
      (evidence) => { evidence.manifests.api.digest = "sha256:bad"; },
      "invalid manifest digest for api",
    );
  });

  test("rejects manifest build run provenance from another run", () => {
    expectRejected(
      (evidence) => { evidence.manifests.api.build_run_id = 124; },
      "manifest build run mismatch for api",
    );
  });

  test("rejects a mutable SHA image instead of run-scoped evidence", () => {
    expectRejected(
      (evidence) => {
        evidence.manifests.api.image = `${imageBase}/goose-api:${sha}`;
      },
      "manifest image mismatch for api",
    );
  });

  test("rejects registry pair changes after candidate build", () => {
    expectRejected(
      (evidence) => {
        evidence.expected.imageBase = "ccr.ccs.tencentyun.com/gooes-goodcms";
      },
      "manifest image mismatch for api",
    );
  });

  test("maps every production service to its exact run-scoped repository", () => {
    const evidence = allServiceEvidence();

    expect(
      verifyProductionReleaseCandidate(
        evidence.candidate,
        evidence.plan,
        evidence.manifests,
        evidence.expected,
      ),
    ).toEqual(evidence.candidate);

    for (const service of evidence.candidate.build_services) {
      const mutated = allServiceEvidence();
      mutated.manifests[service].image = `${imageBase}/wrong-repository:run-123-${sha}`;
      expect(() =>
        verifyProductionReleaseCandidate(
          mutated.candidate,
          mutated.plan,
          mutated.manifests,
          mutated.expected,
        )
      ).toThrow(`manifest image mismatch for ${service}`);
    }
  });

  test("rejects an invalid expected image base", () => {
    expectRejected(
      (evidence) => { evidence.expected.imageBase = `${imageBase}/goose-api`; },
      "invalid expected image base",
    );
  });

  test("rejects an unapproved but syntactically valid image base", () => {
    const unsupportedImageBase = "registry.example.com/other";
    expectRejected(
      (evidence) => {
        evidence.expected.imageBase = unsupportedImageBase;
        evidence.manifests.api.image = `${unsupportedImageBase}/goose-api:run-123-${sha}`;
      },
      "unsupported expected image base",
    );
  });

  test.each([
    ["candidate schema", (evidence: ReturnType<typeof cloneEvidence>) => {
      evidence.candidate.schema_version = 2;
    }, "unsupported candidate schema"],
    ["candidate tag", (evidence: ReturnType<typeof cloneEvidence>) => {
      evidence.candidate.tag = "latest";
    }, "invalid candidate tag"],
    ["build plan artifact", (evidence: ReturnType<typeof cloneEvidence>) => {
      evidence.candidate.build_plan_artifact = "other-build-plan";
    }, "invalid build plan artifact"],
    ["candidate build services", (evidence: ReturnType<typeof cloneEvidence>) => {
      evidence.candidate.build_services = [];
      evidence.plan.build_services = [];
    }, "candidate build services mismatch"],
    ["plan schema", (evidence: ReturnType<typeof cloneEvidence>) => {
      evidence.plan.schema_version = 2;
    }, "unsupported plan schema"],
    ["plan environment", (evidence: ReturnType<typeof cloneEvidence>) => {
      evidence.plan.target_environment = "development";
    }, "plan environment mismatch"],
    ["plan run", (evidence: ReturnType<typeof cloneEvidence>) => {
      evidence.plan.workflow_run_id = 124;
    }, "plan workflow run mismatch"],
    ["plan SHA", (evidence: ReturnType<typeof cloneEvidence>) => {
      evidence.plan.commit_sha = "c".repeat(40);
    }, "plan commit SHA mismatch"],
    ["plan no-op", (evidence: ReturnType<typeof cloneEvidence>) => {
      evidence.plan.no_op = true;
    }, "production plan must not be a no-op"],
    ["plan build services", (evidence: ReturnType<typeof cloneEvidence>) => {
      evidence.plan.build_services = ["admin"];
    }, "plan build services mismatch"],
    ["plan deploy services", (evidence: ReturnType<typeof cloneEvidence>) => {
      evidence.plan.deploy_services = ["api"];
    }, "plan deploy services mismatch"],
    ["manifest service", (evidence: ReturnType<typeof cloneEvidence>) => {
      evidence.manifests.api.service = "admin";
    }, "manifest service mismatch for api"],
    ["manifest SHA", (evidence: ReturnType<typeof cloneEvidence>) => {
      evidence.manifests.api.commit_sha = "c".repeat(40);
    }, "manifest commit SHA mismatch for api"],
    ["manifest environment", (evidence: ReturnType<typeof cloneEvidence>) => {
      evidence.manifests.api.target_environment = "development";
    }, "manifest environment mismatch for api"],
  ])("rejects invalid %s evidence", (_name, override, message) => {
    expectRejected(override, message);
  });

  test("CLI reads manifests and prints normalized candidate JSON", () => {
    const root = mkdtempSync(join(tmpdir(), "production-release-candidate-"));
    const manifestDirectory = join(root, "manifests");
    const candidatePath = join(root, "candidate.json");
    const planPath = join(root, "plan.json");
    roots.push(root);
    mkdirSync(manifestDirectory);
    writeFileSync(candidatePath, JSON.stringify(candidate));
    writeFileSync(planPath, JSON.stringify(plan));
    writeFileSync(
      join(manifestDirectory, "image-manifest-api.json"),
      JSON.stringify(manifests.api),
    );

    const result = Bun.spawnSync([
      "node",
      new URL("./verify-production-release-candidate.mjs", import.meta.url).pathname,
      candidatePath,
      planPath,
      manifestDirectory,
      "123",
      sha,
      "api,cos-reconcile-worker",
      imageBase,
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stderr.toString("utf8")).toBe("");
    expect(result.stdout.toString("utf8")).toBe(`${JSON.stringify(candidate)}\n`);
  });
});
